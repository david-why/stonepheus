import {
  createRequest,
  getRequestByBackend,
  getRequestByFrontend,
  getUserBySlackId,
  setRequestResolvedByBackend,
  setUserShown,
} from './database'
import { getEnv } from './env'
import { getProjectInfo } from './scrape'
import { getVerifiedData } from './signature'
import {
  addReaction,
  chatUnfurl,
  getConversationMembers,
  getUserInfo,
  postMessage,
} from './slack'
import { getFileBlocks } from './utils'

const { PORT, FRONTEND_CHANNEL_ID, BACKEND_CHANNEL_ID, SLACK_APP_ID } = getEnv()

const RESOLVED_EMOJI = 'stonepheus-resolved'

async function handleEvent(event: SlackEvent) {
  if (
    event.type === 'message' &&
    (!event.subtype || ['file_share'].includes(event.subtype))
  ) {
    if (event.channel === FRONTEND_CHANNEL_ID && !event.thread_ts) {
      await handleNewTicket(event)
    } else if (
      event.channel === FRONTEND_CHANNEL_ID &&
      event.app_id !== SLACK_APP_ID
    ) {
      await handleFrontendReply(event)
    } else if (
      event.channel === BACKEND_CHANNEL_ID &&
      event.app_id !== SLACK_APP_ID
    ) {
      await handleBackendReply(event)
    }
  } else if (event.type === 'link_shared') {
    if (event.source === 'composer') return
    console.log(event)
    const result: Record<string, { blocks: SlackBlock[] }> = {}
    for (const { url } of event.links) {
      const match = /\/(?:review\/projects|armory)\/([0-9]+)$/.exec(url)
      if (match) {
        const id = parseInt(match[1]!)
        const project = await getProjectInfo(id)
        if (project) {
          const safeTitle = project.title.replace(/[*<>|]/, '')
          const contextElements: SlackTextObject[] = [
            {
              type: 'plain_text',
              text: `Week ${project.week}`,
            },
            {
              type: 'plain_text',
              text: project.timeText,
            },
          ]
          if (project.demoUrl) {
            contextElements.push({
              type: 'mrkdwn',
              text: `<${project.demoUrl}|Demo>`,
            })
          }
          if (project.repoUrl) {
            contextElements.push({
              type: 'mrkdwn',
              text: `<${project.repoUrl}|Repo>`,
            })
          }
          const blocks: SlackBlock[] = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${safeTitle}*`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: project.description,
              },
            },
            {
              type: 'context',
              elements: contextElements,
            },
          ]
          if (project.screenshotUrl) {
            blocks.splice(2, 0, {
              type: 'image',
              alt_text: 'Project screenshot',
              image_url: project.screenshotUrl,
            })
          }
          result[url] = { blocks }
        }
      }
    }
    console.log(result)
    if (Object.keys(result).length) {
      await chatUnfurl({
        channel: event.channel,
        ts: event.message_ts,
        unfurls: result,
      })
    }
  }
}

async function handleNewTicket(event: SlackMessageEvent) {
  const frontendTs = event.ts
  const ticketAuthor = await getUserInfo(event.user)
  const messageBlocks = event.blocks ?? [{ type: 'markdown', text: event.text }]
  const { ts: backendTs } = await postMessage({
    channel: BACKEND_CHANNEL_ID,
    username: ticketAuthor.profile.display_name,
    icon_url:
      ticketAuthor.profile.image_original ||
      ticketAuthor.profile.image_1024 ||
      ticketAuthor.profile.image_512,
    blocks: messageBlocks.concat(await getFileBlocks(event.files ?? [])),
  })
  await Promise.all([
    createRequest({
      frontend_ts: frontendTs,
      backend_ts: backendTs,
    }),
    postNewTicketResponse(event, backendTs),
    postNewTicketBackendResponse(event, backendTs),
  ])
}

async function handleFrontendReply(event: SlackMessageEvent) {
  const [request, user] = await Promise.all([
    getRequestByFrontend(event.thread_ts),
    getUserInfo(event.user),
  ])
  if (!request) {
    console.warn('message reply with unknown thread_ts', JSON.stringify(event))
    return
  }
  if (request.resolved) {
    await postMessage({
      channel: FRONTEND_CHANNEL_ID,
      thread_ts: event.thread_ts,
      markdown_text: `stonemasons won't see messages here anymore because this ticket has been marked as resolved :${RESOLVED_EMOJI}:! please make a new ticket for stonemasons to see your message!`,
      ephemeral: true,
      user: event.user,
    })
    return
  }
  const messageBlocks = event.blocks ?? [{ type: 'markdown', text: event.text }]
  await postMessage({
    channel: BACKEND_CHANNEL_ID,
    thread_ts: request.backend_ts,
    username: user.profile.display_name,
    icon_url: user.profile.image_original,
    blocks: messageBlocks.concat(await getFileBlocks(event.files ?? [])),
  })
}

async function handleBackendReply(event: SlackMessageEvent) {
  const request = await getRequestByBackend(event.thread_ts)
  if (!request) return
  if (event.text && event.text.startsWith('\\')) return
  const isShown = await checkIsUserShown(event)
  const messageBlocks = event.blocks ?? [{ type: 'markdown', text: event.text }]
  if (isShown) {
    const user = await getUserInfo(event.user)
    await postMessage({
      channel: FRONTEND_CHANNEL_ID,
      thread_ts: request.frontend_ts,
      username: user.profile.display_name,
      icon_url: user.profile.image_original,
      blocks: messageBlocks.concat(
        await getFileBlocks(event.files ?? [], true)
      ),
    })
  } else {
    await postMessage({
      channel: FRONTEND_CHANNEL_ID,
      thread_ts: request.frontend_ts,
      blocks: messageBlocks.concat(
        await getFileBlocks(event.files ?? [], true)
      ),
    })
  }
}

async function checkIsUserShown(event: SlackMessageEvent) {
  if (event.text.startsWith('++')) return true
  if (event.text.startsWith('--')) return false
  const dbUser = await getUserBySlackId(event.user)
  return dbUser?.shown ?? false
}

async function handleInteraction(interaction: SlackInteraction) {
  if (interaction.type === 'block_actions') {
    const action = interaction.actions[0]
    if (action?.action_id === 'resolve_ticket') {
      const backendTs = action.value
      await resolveTicket(backendTs, interaction.user.id)
    }
  }
}

async function handleSlashCommand(
  name: string,
  event: SlackSlashCommandRequest
) {
  switch (name) {
    case 'show':
      await handleShowCommand(event)
      break
    case 'hide':
      await handleHideCommand(event)
      break
    default:
      await respondEvent(event.response_url, { text: 'invalid command...?' })
      break
  }
}

async function handleShowCommand(event: SlackSlashCommandRequest) {
  if (!(await checkIsStonemason(event.user_id, event.response_url))) return
  await Promise.all([
    setUserShown(event.user_id, true),
    respondEvent(event.response_url, {
      text: `:white_check_mark: your name will now be shown in <#${FRONTEND_CHANNEL_ID}>!`,
    }),
  ])
}

async function handleHideCommand(event: SlackSlashCommandRequest) {
  if (!(await checkIsStonemason(event.user_id, event.response_url))) return
  await Promise.all([
    setUserShown(event.user_id, false),
    respondEvent(event.response_url, {
      text: `:white_check_mark: your name will now be hidden in <#${FRONTEND_CHANNEL_ID}>!`,
    }),
  ])
}

// util functions

async function postNewTicketResponse(
  event: SlackMessageEvent,
  backendTs: string
) {
  await postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    blocks: [
      {
        type: 'rich_text',
        elements: [
          {
            type: 'rich_text_section',
            elements: [
              {
                type: 'text',
                text: 'a stonemason will shortly be with you! in the meantime please read through the ',
              },
              {
                type: 'link',
                url: 'https://hackclub.slack.com/docs/T0266FRGM/F099PKQR3UK',
                text: 'FAQ',
              },
              {
                type: 'text',
                text: ' as many questions are answered there!',
              },
            ],
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<https://hackclub.slack.com/archives/${BACKEND_CHANNEL_ID}/${backendTs}|backend> (for stonemasons)`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'resolve_ticket',
            value: backendTs,
            text: { type: 'plain_text', text: 'close ticket' },
            style: 'primary',
          },
        ],
      },
    ],
  })
}

async function postNewTicketBackendResponse(
  event: SlackMessageEvent,
  backendTs: string
) {
  await postMessage({
    channel: BACKEND_CHANNEL_ID,
    thread_ts: backendTs,
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<https://hackclub.slack.com/archives/${FRONTEND_CHANNEL_ID}/${event.ts}|frontend>`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'resolve_ticket',
            value: backendTs,
            text: { type: 'plain_text', text: 'close ticket' },
            style: 'primary',
          },
        ],
      },
    ],
  })
}

async function resolveTicket(backendTs: string, user: string) {
  const request = await getRequestByBackend(backendTs)
  if (!request || request.resolved) return
  await Promise.all([
    setRequestResolvedByBackend(backendTs, true),
    postMessage({
      channel: FRONTEND_CHANNEL_ID,
      thread_ts: request.frontend_ts,
      markdown_text: `:yay: ticket marked as resolved by <@${user}>! if you have any further question please send it in a separate thread. stonemasons won't receive updates for messages here anymore!`,
    }),
    postMessage({
      channel: BACKEND_CHANNEL_ID,
      thread_ts: request.backend_ts,
      markdown_text: `ticket marked as resolved by <@${user}>`,
    }),
    addReaction({
      channel: FRONTEND_CHANNEL_ID,
      name: RESOLVED_EMOJI,
      timestamp: request.frontend_ts,
    }),
    addReaction({
      channel: BACKEND_CHANNEL_ID,
      name: RESOLVED_EMOJI,
      timestamp: request.backend_ts,
    }),
  ])
}

async function respondEvent(
  responseUrl: string,
  body: SlackResponseUrlPayload
) {
  await fetch(responseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function checkIsStonemason(user: string, responseUrl: string) {
  const members = await getConversationMembers({
    channel: BACKEND_CHANNEL_ID,
    limit: 999,
  })
  const isStonemason = members.members.includes(user)
  if (!isStonemason) {
    await respondEvent(responseUrl, { text: 'you are not a stonemason :(' })
  }
  return isStonemason
}

Bun.serve({
  routes: {
    '/slack/events-endpoint': async (req) => {
      const verified = await getVerifiedData(req)
      if (!verified.success) return new Response(null, { status: 500 })
      const { data: jsonData } = verified
      const data = JSON.parse(jsonData) as SlackRequest

      if (data.type === 'url_verification') {
        return new Response(data.challenge)
      } else if (data.type === 'event_callback') {
        handleEvent(data.event) // intentionally not awaited
        return new Response()
      }
      return new Response()
    },
    '/slack/interactivity-endpoint': async (req) => {
      const verified = await getVerifiedData(req)
      if (!verified.success) return new Response(null, { status: 500 })
      const { data: encodedData } = verified
      const data = JSON.parse(
        new URLSearchParams(encodedData).toJSON().payload!
      ) as SlackInteraction

      handleInteraction(data) // intentionally not awaited
      return new Response()
    },
    '/slack/command/:name': async (req) => {
      const verified = await getVerifiedData(req)
      if (!verified.success) return new Response(null, { status: 500 })
      const { data: encodedData } = verified
      const data = new URLSearchParams(
        encodedData
      ).toJSON() as unknown as SlackSlashCommandRequest

      handleSlashCommand(req.params.name, data) // intentionally not awaited
      return new Response()
    },
    '/api/projects/:id': async (req) => {
      const id = parseInt(req.params.id)
      if (isNaN(id)) {
        return Response.json({ error: 'invalid_params' }, 400)
      }
      try {
        const project = await getProjectInfo(id)
        return Response.json(project)
      } catch (e) {
        console.error('error fetching project', e)
        return Response.json({ error: 'internal_error' }, 500)
      }
    },
  },
  port: PORT,
})

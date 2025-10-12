import z from 'zod'
import { askAI, type AIResponseType } from './ai'
import {
  createRequest,
  getRequestByTs,
  setRequestAssignedUserByTs,
  setRequestResolvedByTs,
} from './database'
import { getEnv } from './env'
import { getProjectInfo } from './scrape'
import { getVerifiedData } from './signature'
import {
  addReaction,
  chatUnfurl,
  getUserInfo,
  openConversation,
  postMessage,
} from './slack'
import { getUserDisplayFields } from './utils'

const { PORT, CHANNEL_IDS: _CHANNEL_IDS, SLACK_APP_ID } = getEnv()
const CHANNEL_IDS = JSON.parse(_CHANNEL_IDS) as Record<string, string>
const { ENABLE_AI: _ENABLE_AI } = process.env
const ENABLE_AI = _ENABLE_AI === 'true' || _ENABLE_AI === '1'

const RESOLVED_EMOJI = 'stonepheus-resolved'

async function handleEvent(event: SlackEvent) {
  if (
    event.type === 'message' &&
    (!event.subtype || ['file_share'].includes(event.subtype))
  ) {
    if (event.channel in CHANNEL_IDS && !event.thread_ts) {
      await handleNewTicket(event)
    } else if (event.channel in CHANNEL_IDS && event.app_id !== SLACK_APP_ID) {
      await handleTicketReply(event)
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
  const ts = event.ts
  const backendTs = await postNewTicketBackend(event)
  await Promise.all([
    createRequest({ channel: event.channel, ts, backend_ts: backendTs }),
    postNewTicketResponse(event),
  ])
  if (ENABLE_AI) {
    await tryAIResponse(event)
  }
}

async function handleTicketReply(event: SlackMessageEvent) {
  const request = await getRequestByTs(event.channel, event.thread_ts)
  if (!request) {
    console.warn('message reply with unknown thread_ts', JSON.stringify(event))
    return
  }
  if (event.text && event.text.startsWith('?faq ')) {
    const section = event.text.substring(5).trim()
    if (section) {
      await postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts,
        text: await getFAQSection(section),
      })
    }
  }
}

async function handleInteraction(interaction: SlackInteraction) {
  if (interaction.type === 'block_actions') {
    const action = interaction.actions[0]
    if (action?.action_id === 'resolve_ticket') {
      const ts = action.value
      await resolveTicket(interaction.channel.id, ts, interaction.user.id)
    } else if (action?.action_id === 'resolve_ticket_backend') {
      const [channel, ts] = JSON.parse(action.value) as [string, string]
      await resolveTicket(channel, ts, interaction.user.id)
    } else if (
      action?.action_id.startsWith('assign_user_backend') &&
      action.selected_user
    ) {
      const [, channel, ts] = action.action_id.split('::') as [
        string,
        string,
        string
      ]
      const request = await getRequestByTs(channel, ts)
      if (request) {
        await setRequestAssignedUserByTs(channel, ts, action.selected_user)
        const {
          channel: { id: dmChannel },
        } = await openConversation({
          users: action.selected_user,
        })
        await postMessage({
          channel: dmChannel,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Hey, a ticket in <#${channel}> was assigned to you. Take a look:`,
              },
            },
            {
              type: 'rich_text',
              elements: [
                {
                  type: 'rich_text_list',
                  style: 'bullet',
                  elements: [
                    {
                      type: 'rich_text_section',
                      elements: [
                        {
                          type: 'link',
                          url: `https://hackclub.slack.com/archives/${channel}/${ts}`,
                          text: 'frontend',
                        },
                      ],
                    },
                    {
                      type: 'rich_text_section',
                      elements: [
                        {
                          type: 'link',
                          url: `https://hackclub.slack.com/archives/${CHANNEL_IDS[
                            channel
                          ]!}/${request.backend_ts}`,
                          text: 'backend',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })
      }
    }
  }
}

async function handleSlashCommand(
  name: string,
  event: SlackSlashCommandRequest
) {
  switch (name) {
    case 'ai':
      await handleAICommand(event)
      break
    case 'faq':
      await handleFAQCommand(event)
      break
    default:
      await respondEvent(event.response_url, { text: 'invalid command...?' })
      break
  }
}

async function handleAICommand(event: SlackSlashCommandRequest) {
  if (!ENABLE_AI) {
    await respondEvent(event.response_url, {
      text: `sorry, but ai isn't enabled right now :(`,
    })
  }
  if (!event.text) {
    await respondEvent(event.response_url, {
      text: `_b... but you didn't give me a question to answer!_`,
    })
    return
  }
  const response = await askAI(event.text)
  const text = response.ok
    ? `_:magic_wand: as you whisper your query into the magic portal, it turned bright, and a voice responds to you..._\n*Answer:* ${response.answer}\n\n${response.explanation}`
    : `_:magic_wand: as you whisper your query into the magic portal, it turned misty, as if the higher being is confused about your question..._\nI cannot answer because: ${response.reason}`
  await respondEvent(event.response_url, { text })
}

async function handleFAQCommand(event: SlackSlashCommandRequest) {
  if (!event.text) {
    await respondEvent(event.response_url, {
      text: `_b... but you didn't give me a section to search for!_`,
    })
    return
  }
  const text = await getFAQSection(event.text)
  await respondEvent(event.response_url, { text })
}

const FAQ_PROMPT = `\
You are a section finder assistant who helps the user find a section of the "FAQ knowledge base" provided below. The user will ask you for a single section of the FAQ, and you should answer the text in that section *verbatim* (do not change typos, punctuation, or anything else).

Your response should be a JSON object in the following structure:
{
  found: true,  // or false if the section is not found
  text: "The literal, verbatim text of that section in the FAQ, or null if found is false"
}`

const FaqSchema = z.union([
  z.object({
    found: z.literal(false),
  }),
  z.object({
    found: z.literal(true),
    text: z.string(),
  }),
])

// util functions

async function postNewTicketResponse(event: SlackMessageEvent) {
  await postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_:magic_wand: you carefully whisper your query, and as you finish, :zap: a great flash of light :zap:! and in front of you, a magical portal opened, from which a distant voice from the realm of stonemasons :siege-castle::_',
        },
      },
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
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'resolve_ticket',
            value: event.ts,
            text: { type: 'plain_text', text: 'close portal' },
            style: 'primary',
          },
        ],
      },
    ],
  })
}

async function postNewTicketBackend(event: SlackMessageEvent) {
  const blocks = event.blocks ?? [
    { type: 'section', text: { type: 'mrkdwn', text: event.text } },
  ]
  const user = await getUserInfo(event.user)
  const msg = await postMessage({
    channel: CHANNEL_IDS[event.channel]!,
    blocks,
    ...getUserDisplayFields(user),
  })
  postMessage({
    channel: msg.channel,
    thread_ts: msg.ts,
    blocks: [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<https://hackclub.slack.com/archives/${event.channel}/${event.ts}|frontend>`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'resolve_ticket_backend',
            value: JSON.stringify([event.channel, event.ts]),
            text: { type: 'plain_text', text: 'close ticket' },
            style: 'primary',
          },
          {
            type: 'users_select',
            action_id: `assign_user_backend::${event.channel}::${event.ts}`,
            placeholder: { type: 'plain_text', text: 'assign user (pings)' },
          },
        ],
      },
    ],
  })
  return msg.ts
}

async function tryAIResponse(event: SlackMessageEvent) {
  if (!event.text) return
  const response = await askAI(event.text)
  console.log(response)
  if (!response.ok) return
  await postAIResponse(
    response,
    '_:magic_wand: as you anxiously await a stonemason, you see the bright light again! this time, a robotic voice speaks to you..._\n_NOTE: please do not trust the AI response. it might be inaccurate._',
    event.channel,
    event.ts
  )
}

async function postAIResponse(
  response: AIResponseType & { ok: true },
  pretext: string,
  channel: string,
  ts: string
) {
  await postMessage({
    channel: channel,
    thread_ts: ts,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: pretext,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Answer:* ${response.answer}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: response.explanation,
        },
      },
    ],
  })
}

async function resolveTicket(channel: string, ts: string, user: string) {
  const request = await getRequestByTs(channel, ts)
  if (!request || request.resolved) return
  await Promise.all([
    setRequestResolvedByTs(channel, ts, true),
    postMessage({
      channel,
      thread_ts: ts,
      markdown_text: `_:magic_wand: as <@${user}> waves a hand, the portal dismisses, and the connection with the stonemason realm is broken..._\n:yay: ticket marked as resolved by <@${user}>! if you have any further question please send it in a separate thread. stonemasons won't receive updates for messages here anymore!`,
    }),
    addReaction({
      channel,
      name: RESOLVED_EMOJI,
      timestamp: ts,
    }),
    addReaction({
      channel: CHANNEL_IDS[channel]!,
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

async function getFAQSection(query: string) {
  const response = await askAI(query, FAQ_PROMPT, FaqSchema)
  console.log(response)
  return response.found
    ? `_:magic_wand: as you ask the librarian automaton, it raises a hand towards a distant bookshelf, and a volume makes its way to you..._\n\n${response.text}`
    : `the section you asked for was not found... :(`
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

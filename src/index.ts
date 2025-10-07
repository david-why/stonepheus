import { createRequest } from './database'
import { getEnv } from './env'
import { getVerifiedData } from './signature'
import { getUserInfo, postMessage } from './slack'

const { PORT, FRONTEND_CHANNEL_ID, BACKEND_CHANNEL_ID } = getEnv()

async function handleEvent(event: SlackEvent) {
  if (event.type === 'message' && !event.subtype) {
    if (event.channel === FRONTEND_CHANNEL_ID && !event.thread_ts) {
      await handleNewTicket(event)
    }
  }
}

async function handleNewTicket(event: SlackMessageEvent) {
  const frontendTs = event.ts
  console.log(event)
  const ticketAuthor = await getUserInfo(event.user)
  console.log(ticketAuthor)
  const messageBlocks = event.blocks ?? [{ type: 'markdown', text: event.text }]
  const { ts: backendTs } = await postMessage({
    channel: BACKEND_CHANNEL_ID,
    username: ticketAuthor.profile.display_name,
    icon_url: ticketAuthor.profile.image_original,
    blocks: messageBlocks.concat([
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `by <@${event.user}>` }],
      },
    ]),
  })
  await Promise.all([
    createRequest({
      frontend_ts: frontendTs,
      backend_ts: backendTs,
    }),
    postNewTicketResponse(event, backendTs),
  ])
}

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
  },
  port: PORT,
})

import { getEnv } from './env'
import { select } from './utils'

const { SLACK_OAUTH_TOKEN } = getEnv()

export class SlackError extends Error {
  constructor(public endpoint: string, public response: ErrorResponse) {
    super(`Slack ${endpoint} API returned error: ${response.error}`)
  }

  get error() {
    return this.response.error
  }
}

interface ErrorResponse {
  ok: false
  error: string
}

interface GetUserInfoResponse {
  ok: true
  user: {
    id: string
    team_id: string
    name: string
    deleted: boolean
    color: string
    real_name: string
    tz: string
    tz_label: string
    tz_offset: number
    locale: string
    profile: {
      avatar_hash: string
      real_name: string
      display_name: string
      real_name_normalized: string
      display_name_normalized: string
      team: string
      image_512: string
      image_1024?: string
      image_original?: string
      // and some more stuff
    }
    // and even more stuff...
  }
}

export async function getUserInfo(userId: string) {
  const res = await fetch(
    `https://slack.com/api/users.info?include_locale=true&user=${userId}`,
    {
      headers: {
        authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
      },
    }
  )
  const data = (await res.json()) as GetUserInfoResponse | ErrorResponse
  if (!data.ok) {
    throw new SlackError('users.info', data)
  }
  return data.user
}

interface PostMessageParams {
  channel: string
  markdown_text?: string
  thread_ts?: string
  blocks?: SlackBlock[]
  ephemeral?: boolean
  user?: string
  icon_url?: string
  username?: string
}

interface PostMessageResponse {
  ok: true
  channel: string
  ts: string
}

export async function postMessage(parameters: PostMessageParams) {
  const stringifiedParams = {
    ...parameters,
    blocks: parameters.blocks ? JSON.stringify(parameters.blocks) : undefined,
    ephemeral: undefined as string | undefined,
  }
  for (const key in stringifiedParams) {
    if (
      stringifiedParams[key as keyof typeof stringifiedParams] === undefined
    ) {
      delete stringifiedParams[key as keyof typeof stringifiedParams]
    }
  }
  const body = new URLSearchParams(
    stringifiedParams as Record<string, string>
  ).toString()
  const res = await fetch(
    parameters.ephemeral
      ? `https://slack.com/api/chat.postEphemeral`
      : `https://slack.com/api/chat.postMessage`,
    {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
      },
    }
  )
  const data = (await res.json()) as PostMessageResponse | ErrorResponse
  if (!data.ok) {
    console.error(data)
    throw new SlackError('chat.postMessage', data)
  }
  return data
}

interface AuthTestResponse {
  ok: true
  url: string
  team: string
  user: string
  team_id: string
  user_id: string
}

export async function authTest() {
  const res = await fetch(`https://slack.com/api/auth.test`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
    },
  })
  const data = (await res.json()) as AuthTestResponse | ErrorResponse
  if (!data.ok) {
    console.error(data)
    throw new SlackError('auth.test', data)
  }
  return data
}

interface AddReactionParams {
  channel: string
  name: string
  timestamp: string
}

interface AddReactionResponse {
  ok: true
}

export async function addReaction(params: AddReactionParams) {
  const bodyBuilder = new URLSearchParams()
  bodyBuilder.set('channel', params.channel)
  bodyBuilder.set('name', params.name)
  bodyBuilder.set('timestamp', params.timestamp)
  const res = await fetch(`https://slack.com/api/reactions.add`, {
    method: 'POST',
    body: bodyBuilder.toString(),
    headers: {
      Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  const data = (await res.json()) as AddReactionResponse | ErrorResponse
  if (!data.ok) {
    console.error(data)
    throw new SlackError('reactions.add', data)
  }
}

type RemoveReactionParams = {
  name: string
} & (
  | { channel: string; timestamp: string }
  | { file: string }
  | { file_comment: string }
)

interface RemoveReactionResponse {
  ok: true
}

export async function removeReaction(params: RemoveReactionParams) {
  const bodyBuilder = new URLSearchParams()
  bodyBuilder.set('name', params.name)
  if ('channel' in params && params.timestamp) {
    bodyBuilder.set('channel', params.channel)
    bodyBuilder.set('timestamp', params.timestamp)
  } else if ('file' in params) {
    bodyBuilder.set('file', params.file)
  } else if ('file_comment' in params) {
    bodyBuilder.set('file_comment', params.file_comment)
  } else {
    throw new Error('Params to removeReaction are invalid')
  }
  const res = await fetch(`https://slack.com/api/reactions.remove`, {
    method: 'POST',
    body: bodyBuilder.toString(),
    headers: {
      Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  const data = (await res.json()) as RemoveReactionResponse | ErrorResponse
  if (!data.ok) {
    console.error(data)
    throw new SlackError('reactions.remove', data)
  }
}

interface GetMessageParams {
  channel: string
  ts: string
}

interface GetMessageResponse {
  type: string
  user: string
  text: string
  ts: string
}

export async function getMessage(params: GetMessageParams) {
  const bodyBuilder = new URLSearchParams()
  bodyBuilder.set('channel', params.channel)
  bodyBuilder.set('inclusive', 'true')
  bodyBuilder.set('limit', '1')
  bodyBuilder.set('oldest', params.ts)
  bodyBuilder.set('ts', params.ts)
  const res = await fetch(
    `https://slack.com/api/conversations.replies?${bodyBuilder.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
      },
    }
  )
  const data = (await res.json()) as any
  if (!data.ok) {
    console.error(data)
    throw new SlackError('conversations.history', data)
  }
  return data.messages[0] as GetMessageResponse | undefined
}

interface UploadFileParams {
  file: Blob
  filename: string
  channel_id?: string
  thread_ts?: string
}

interface GetUploadURLResponse {
  ok: true
  upload_url: string
  file_id: string
}

interface CompleteUploadResponse {
  ok: true
  files: { id: string; title: string }[]
}

export async function uploadFile(params: UploadFileParams) {
  const getUrlRes = await fetch(
    'https://slack.com/api/files.getUploadURLExternal',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        length: params.file.size.toString(),
        filename: params.filename,
      }).toString(),
    }
  )
  const getUrlData = (await getUrlRes.json()) as
    | GetUploadURLResponse
    | ErrorResponse
  if (!getUrlData.ok) {
    console.error(getUrlData)
    throw new SlackError('files.getUploadURLExternal', getUrlData)
  }
  const { upload_url: uploadUrl, file_id: fileId } = getUrlData

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    body: params.file,
  })
  if (uploadRes.status !== 200) {
    const uploadText = await uploadRes.text()
    throw new Error(`Failed to upload file to Slack: ${uploadText}`)
  }

  const completePayload = new URLSearchParams({
    files: JSON.stringify([{ id: fileId }]),
  })
  if (params.channel_id) {
    completePayload.set('channel_id', params.channel_id)
  }
  if (params.thread_ts) {
    completePayload.set('thread_ts', params.thread_ts)
  }
  const completeRes = await fetch(
    'https://slack.com/api/files.completeUploadExternal',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: completePayload.toString(),
    }
  )
  const completeData = (await completeRes.json()) as
    | CompleteUploadResponse
    | ErrorResponse
  if (!completeData.ok) {
    console.error(completeData)
    throw new SlackError('files.completeUploadExternal', completeData)
  }

  return completeData
}

interface GetFileInfoParams {
  file: string
  count?: number
  cursor?: string
  limit?: number
  page?: number
}

interface GetFileInfoResponse {
  ok: true
  file: SlackFileObject
}

export async function getFileInfo(params: GetFileInfoParams) {
  const payload = new URLSearchParams({ file: params.file })
  if (params.count !== undefined) payload.set('count', params.count.toString())
  if (params.cursor) payload.set('cursor', params.cursor)
  if (params.limit !== undefined) payload.set('limit', params.limit.toString())
  if (params.page !== undefined) payload.set('page', params.page.toString())
  const res = await fetch(
    `https://slack.com/api/files.info?${payload.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
      },
    }
  )
  const data = (await res.json()) as GetFileInfoResponse | ErrorResponse
  if (!data.ok) {
    console.error(data)
    throw new SlackError('files.info', data)
  }
  return data
}

interface GetConversationMembersParams {
  channel: string
  cursor?: string
  limit?: number
}

interface GetConversationMembersResponse {
  ok: true
  members: string[]
  // response_metadata.next_cursor
}

export async function getConversationMembers(
  params: GetConversationMembersParams
) {
  const payload = new URLSearchParams({ channel: params.channel })
  if (params.cursor) payload.set('cursor', params.cursor)
  if (params.limit) payload.set('limit', params.limit.toString())
  const res = await fetch(
    `https://slack.com/api/conversations.members?${payload.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
      },
    }
  )
  const data = (await res.json()) as
    | GetConversationMembersResponse
    | ErrorResponse
  if (!data.ok) {
    console.error(data)
    throw new SlackError('conversations.members', data)
  }
  return data
}

interface ChatUnfurlParams {
  channel: string
  ts: string
  unfurls: Record<string, { blocks: SlackBlock[] }>
}

interface ChatUnfurlResponse {
  ok: true
}

export async function chatUnfurl(params: ChatUnfurlParams) {
  // const payload = select(params, 'channel', 'ts', 'unfurls')
  const payload = new URLSearchParams(select(params, 'channel', 'ts'))
  payload.set('unfurls', JSON.stringify(params.unfurls))
  const res = await fetch(
    `https://slack.com/api/chat.unfurl?${payload.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    }
  )
  const data = (await res.json()) as ChatUnfurlResponse | ErrorResponse
  if (!data.ok) {
    console.error(data)
    throw new SlackError('chat.unfurl', data)
  }
}

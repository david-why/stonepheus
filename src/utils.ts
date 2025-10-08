import { getEnv } from './env'
import { uploadFile } from './slack'

const { SLACK_OAUTH_TOKEN, BACKEND_CHANNEL_ID } = getEnv()

export function select<T, K extends keyof T>(
  obj: T,
  ...keys: K[]
): { [Key in K]: T[Key] } {
  const result = {} as { [Key in K]: T[Key] }
  for (const key of keys) {
    result[key] = obj[key]
  }
  return result
}

export async function getFileBlocks(
  files: SlackFileObject[],
  reshare: boolean = false
): Promise<SlackBlock[]> {
  if (!files.length) return []
  if (!reshare) {
    return [
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: files.map((f) => `<${f.permalink}|file>`).join(', '),
          },
        ],
      },
    ]
  }
  // ok actually reupload all the files
  await Promise.all(
    files.map((f) =>
      uploadFileHelper(f, BACKEND_CHANNEL_ID, '1759890039.345919')
    )
  )
  return []
}

async function uploadFileHelper(
  file: SlackFileObject,
  channel: string,
  threadTs: string
) {
  const blobRes = await fetch(file.url_private_download, {
    headers: {
      Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
    },
  })
  if (!blobRes.ok) {
    throw new Error(
      `Failed to download Slack file: ${blobRes.status} ${await blobRes.text()}`
    )
  }
  const blob = (await blobRes.blob()) as unknown as Blob
  await uploadFile({
    file: blob,
    filename: file.name,
    channel_id: channel,
    thread_ts: threadTs,
  })
}

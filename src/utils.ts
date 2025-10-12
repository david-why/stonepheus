import { getEnv } from './env'
import { getFileInfo, type getUserInfo, uploadFile } from './slack'
import Turndown from 'turndown'

const { SLACK_OAUTH_TOKEN } = getEnv()

const turndown = new Turndown({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  strongDelimiter: '*' as unknown as '**', // :/
  emDelimiter: '_',
  bulletListMarker: '-',
})
turndown.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: (content) => '~' + content + '~',
})

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

export function getUserDisplayFields(
  user: Awaited<ReturnType<typeof getUserInfo>>
) {
  return {
    username: user.profile.display_name || user.profile.real_name,
    icon_url:
      user.profile.image_original ||
      user.profile.image_1024 ||
      user.profile.image_512,
  }
}

export function htmlToMarkdown(html: string) {
  return (
    turndown
      .turndown(html)
      .replace(/#C[A-Z0-9]+/g, (match) => `<${match}>`)
      // ts regex is ai cuz how tf am i supposed to write that myself
      .replace(
        /!\[[^\]]+\]\(\s*https:\/\/slack-imgs\.com\/[^)]*%2F(emoji\.slack-edge\.com[^)]*|a\.slack-edge\.com%2Fproduction-standard-emoji-assets[^)]*)\s*\)/gi,
        ''
      )
  )
}

export async function getFileBlocks(
  files: SlackFileObject[],
  reshare: boolean = false
): Promise<SlackBlock[]> {
  if (!files.length) return []
  if (reshare) {
    files = await Promise.all(files.map((f) => uploadFileHelper(f)))
  }
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

async function uploadFileHelper(file: SlackFileObject) {
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
  const {
    files: [newFile],
  } = await uploadFile({
    file: blob,
    filename: file.name,
  })
  if (!newFile) {
    throw new Error('No file received in upload response')
  }
  const fileInfo = await getFileInfo({
    file: newFile.id,
  })
  return fileInfo.file
}

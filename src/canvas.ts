import { getEnv } from './env'
import { getFileInfo } from './slack'
import { parse as parseHTML } from 'node-html-parser'

const { SLACK_OAUTH_TOKEN } = getEnv()

export async function getFAQ() {
  return getCanvas('F099PKQR3UK')
}

export async function getThemeCanvas() {
  return getCanvas('F09CNGA3WRM')
}

const canvasCache: Record<string, { content: string; expires: Date }> = {}
const isFetchingCanvas: Record<string, Promise<string>> = {}

async function getCanvas(id: string) {
  if (isFetchingCanvas[id]) return isFetchingCanvas[id]
  return (isFetchingCanvas[id] = getCanvasInner(id))
}

async function getCanvasInner(id: string) {
  const cached = canvasCache[id]
  if (cached && cached.expires > new Date()) return cached.content
  if (cached) delete canvasCache[id]

  const fileInfo = await getFileInfo({ file: id })

  const html = await fetch(fileInfo.file.url_private_download, {
    headers: {
      Authorization: `Bearer ${SLACK_OAUTH_TOKEN}`,
    },
  }).then((r) => r.text())

  const content = parseHTML(html).textContent
  canvasCache[id] = { content, expires: new Date(Date.now() + 10 * 60 * 1000) }
  return content
}

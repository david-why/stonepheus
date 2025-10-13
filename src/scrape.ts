import { parse as parseHTML } from 'node-html-parser'

const { SIEGE_SESSION } = process.env

export async function getProjectInfo(id: number) {
  if (!SIEGE_SESSION) {
    return null
  }
  const res = await fetch(`https://siege.hackclub.com/armory/${id}`, {
    headers: {
      Cookie: `_siege_session=${SIEGE_SESSION}`,
    },
  })
  if (!res.ok) {
    throw new Error('Failed to get project info page')
  }
  const html = await res.text()
  const node = parseHTML(html)
  if (!node.querySelector('h1.projects-title')) {
    return null
  }
  const projectTitle = node
    .querySelector('h1.projects-title')!
    .textContent.trim()
  const titleParts = projectTitle.split(' - ')
  const title = titleParts.slice(0, titleParts.length - 1).join(' - ')
  const week = parseInt(projectTitle.split(' ').pop()!)
  const description =
    node
      .querySelector('.project-card-description')
      ?.textContent.trim()
      .replace('\r\n', ' ') || ''
  const linkNodes = node.querySelectorAll('a.project-link')
  const urls = linkNodes
    .map((n) => n.getAttribute('href') || null)
    .map((u) => (u === '#' ? null : u))
  const repoUrl = urls[0]!
  const demoUrl = urls[1]!
  const timeText = (
    node.querySelector('.project-week-time')?.textContent.trim() ?? '0h 0m'
  )
    .split(': ')
    .pop()!
  const updatedDate =
    node
      .querySelector('.project-card-updated time')
      ?.getAttribute('datetime') ?? null
  const screenshotUrl =
    node.querySelector('.project-screenshots img')?.getAttribute('src') || null

  return {
    title,
    week,
    description,
    repoUrl,
    demoUrl,
    timeText,
    updatedDate,
    screenshotUrl,
  }
}

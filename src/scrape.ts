import { parse as parseHTML } from 'node-html-parser'

const { SIEGE_SESSION } = process.env

export async function getProjectInfo(id: number) {
  const [info, api] = await Promise.all([
    getProjectInfoScrape(id),
    getProjectInfoAPI(id),
  ])
  return {
    ...api,
    description: api.description.replace('\r\n', ' '),
    week: parseInt(api.week_badge_text.substring(5)),
    screenshot_url: info?.screenshotUrl || null,
    time_text: info?.timeText,
  }
}

export async function getProjectInfoScrape(id: number) {
  if (!SIEGE_SESSION) {
    return null
  }
  const res = await fetch(`https://siege.hackclub.com/projects/${id}`, {
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

export async function getProjectInfoAPI(id: number) {
  const res = (await fetch(
    `https://siege.hackclub.com/api/public-beta/project/${id}`
  ).then((r) => r.json())) as { error: string } | APIProject
  if ('error' in res) {
    throw new Error(JSON.stringify(res))
  }
  return res
}

interface APIProject {
  id: number
  name: string
  description: string
  status:
    | 'building'
    | 'submitted'
    | 'pending_voting'
    | 'waiting_for_review'
    | 'finished'
  repo_url: string
  demo_url: string
  created_at: string
  updated_at: string
  user: { id: number; name: string; display_name: string }
  week_badge_text: `Week ${number}`
  coin_value: `${number}` | '0.0'
  is_update: boolean
}

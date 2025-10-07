import { sql } from 'bun'
import { select } from './utils'

export interface StonepheusRequest {
  id: number
  frontend_ts: string
  backend_ts: string
  resolved: boolean
}

export async function getRequestByFrontend(
  frontendTs: string
): Promise<StonepheusRequest | undefined> {
  return (
    await sql<
      StonepheusRequest[]
    >`SELECT * FROM requests WHERE frontend_ts = ${frontendTs}`
  )[0]
}

export async function getRequestByBackend(
  backendTs: string
): Promise<StonepheusRequest | undefined> {
  return (
    await sql<
      StonepheusRequest[]
    >`SELECT * FROM requests WHERE backend_ts = ${backendTs}`
  )[0]
}

export async function createRequest(
  request: Omit<StonepheusRequest, 'id' | 'resolved'>
) {
  const data = select(request, 'frontend_ts', 'backend_ts')
  await sql`INSERT INTO requests ${sql(data)}`
}

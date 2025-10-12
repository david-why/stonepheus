import { sql } from 'bun'
import { select } from './utils'

export interface StonepheusRequest {
  id: number
  channel: string
  ts: string
  backend_ts: string
  resolved: boolean
}

export interface StonepheusUser {
  slack_id: string
  shown: boolean
}

export async function getRequestByTs(
  channel: string,
  ts: string
): Promise<StonepheusRequest | undefined> {
  return (
    await sql<
      StonepheusRequest[]
    >`SELECT * FROM requests WHERE channel = ${channel} AND ts = ${ts}`
  )[0]
}

export async function createRequest(
  request: Omit<StonepheusRequest, 'id' | 'resolved'>
) {
  const data: typeof request = select(request, 'channel', 'ts', 'backend_ts')
  await sql`INSERT INTO requests ${sql(data)}`
}

export async function setRequestResolvedByTs(
  channel: string,
  ts: string,
  resolved: boolean = true
) {
  await sql`UPDATE requests SET resolved = ${resolved} WHERE channel = ${channel} AND ts = ${ts}`
}

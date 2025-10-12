import { sql } from 'bun'
import { select } from './utils'

export interface StonepheusRequest {
  id: number
  ts: string
  resolved: boolean
}

export interface StonepheusUser {
  slack_id: string
  shown: boolean
}

export async function getRequestByTs(
  ts: string
): Promise<StonepheusRequest | undefined> {
  return (
    await sql<StonepheusRequest[]>`SELECT * FROM requests WHERE ts = ${ts}`
  )[0]
}

export async function createRequest(
  request: Omit<StonepheusRequest, 'id' | 'resolved'>
) {
  const data = select(request, 'ts')
  await sql`INSERT INTO requests ${sql(data)}`
}

export async function setRequestResolvedByTs(
  ts: string,
  resolved: boolean = true
) {
  await sql`UPDATE requests SET resolved = ${resolved} WHERE ts = ${ts}`
}

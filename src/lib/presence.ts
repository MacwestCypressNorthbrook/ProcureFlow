import { execute, query } from '@/lib/db'
import type { Stage } from '@/lib/workflow'

/**
 * "Someone is working on this" — advisory presence on a requisition.
 *
 * Cost model (Neon bills awake time, see the neon-cost-optimizer notes): there
 * is NO timer anywhere. A presence row is written when a stage holder opens a
 * requisition and refreshed only when they interact with it, throttled on the
 * client to once per REFRESH window. Those writes ride on activity that already
 * woke the database, so presence adds no wake-ups of its own. Readers do not
 * poll either: the page shows who is here when it renders, and re-checks when
 * the tab regains focus.
 *
 * A row counts as live while `last_seen_at` is within PRESENCE_TTL_MINUTES. Someone
 * who walks away stops refreshing and drops off by themselves — no cleanup job.
 *
 * Every read and write tolerates the table being absent (migration 023 not yet
 * applied): presence then simply shows nobody.
 */

/** How long after the last activity a person still counts as "on it". */
export const PRESENCE_TTL_MINUTES = 10

/** Client-side throttle between activity refreshes, in ms. Must be well under the TTL. */
export const PRESENCE_REFRESH_MS = 4 * 60 * 1000

export interface PresentUser {
  user_id: string
  name: string
  stage: string
  started_at: string
  last_seen_at: string
}

const missingTable = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01'

/** Record (or refresh) that this user has the requisition open at this stage. */
export async function touchPresence(requestId: string, userId: string, stage: Stage): Promise<void> {
  try {
    await execute(
      `WITH up AS (
         INSERT INTO public.request_presence (request_id, user_id, stage)
         VALUES ($1, $2, $3)
         ON CONFLICT (request_id, user_id)
         DO UPDATE SET last_seen_at = now(),
                       stage = EXCLUDED.stage,
                       -- A new session after the old one lapsed starts the clock again.
                       started_at = CASE
                         WHEN public.request_presence.last_seen_at < now() - make_interval(mins => $4)
                           THEN now()
                         ELSE public.request_presence.started_at
                       END
       )
       -- Opportunistic prune, so the table never needs a cleanup job.
       DELETE FROM public.request_presence WHERE last_seen_at < now() - interval '1 day'`,
      [requestId, userId, stage, PRESENCE_TTL_MINUTES]
    )
  } catch (err) {
    if (!missingTable(err)) console.error('touchPresence failed:', err)
  }
}

/** The user has left the requisition — drop their row straight away. */
export async function releasePresence(requestId: string, userId: string): Promise<void> {
  try {
    await execute(`DELETE FROM public.request_presence WHERE request_id = $1 AND user_id = $2`, [requestId, userId])
  } catch (err) {
    if (!missingTable(err)) console.error('releasePresence failed:', err)
  }
}

/**
 * Who else is live on these requisitions, at the given stage(s).
 *
 * Filtering by stage matters: a requester looking at their own requisition is
 * not "working on it" — only people who hold the stage it sits at are.
 */
export async function getPresence(
  requestIds: string[],
  stages: string[],
  excludeUserId: string
): Promise<Map<string, PresentUser[]>> {
  const byRequest = new Map<string, PresentUser[]>()
  if (requestIds.length === 0 || stages.length === 0) return byRequest
  try {
    const rows = await query<PresentUser & { request_id: string }>(
      `SELECT p.request_id, p.user_id, COALESCE(u.name, u.email) AS name, p.stage,
              p.started_at::text AS started_at, p.last_seen_at::text AS last_seen_at
         FROM public.request_presence p
         JOIN public.users u ON u.id = p.user_id
        WHERE p.request_id = ANY($1::uuid[])
          AND p.stage = ANY($2::text[])
          AND p.user_id <> $3
          AND p.last_seen_at >= now() - make_interval(mins => $4)
        ORDER BY p.started_at ASC`,
      [requestIds, stages, excludeUserId, PRESENCE_TTL_MINUTES]
    )
    for (const { request_id, ...user } of rows) {
      const list = byRequest.get(request_id) ?? []
      list.push(user)
      byRequest.set(request_id, list)
    }
  } catch (err) {
    if (!missingTable(err)) console.error('getPresence failed:', err)
  }
  return byRequest
}

/**
 * Attach "open by" names to queue rows, for the queue's badge.
 *
 * Kept out of the queue SQL itself so a missing table (or any presence error)
 * can never empty a reviewer's queue.
 */
export async function withPresence<T extends { id: string }>(
  rows: T[],
  stages: string[],
  viewerId: string
): Promise<Array<T & { open_by?: string[] }>> {
  const presence = await getPresence(rows.map((r) => r.id), stages, viewerId)
  if (presence.size === 0) return rows
  return rows.map((r) => {
    const people = presence.get(r.id)
    return people ? { ...r, open_by: people.map((p) => p.name) } : r
  })
}

import { queryOne } from '@/lib/db'
import { getUserFromSession } from '@/lib/auth/server'
import { canActAt, currentStage } from '@/lib/workflow'
import { getPresence, releasePresence, touchPresence } from '@/lib/presence'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

/**
 * Presence on a requisition — called only on user activity, never on a timer.
 *
 * POST {}                → "I am on this": record/refresh, and return who else is.
 * POST { release: true } → "I have left": drop my row (sent with keepalive /
 *                          sendBeacon as the page goes away).
 *
 * Only people who hold the stage the requisition sits at are recorded; anyone
 * else gets the list of who is on it but leaves no trace themselves.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const limit = await rateLimit(`presence:${user.id}`, { max: 60, windowSeconds: 60 })
  if (!limit.ok) return tooManyRequests('Too many presence updates.', limit.retryAfter)

  const { id } = await params
  let body: { release?: boolean } = {}
  try {
    // sendBeacon posts text/plain; parse leniently.
    const text = await request.text()
    body = text ? JSON.parse(text) : {}
  } catch {
    body = {}
  }

  if (body.release) {
    await releasePresence(id, user.id)
    return NextResponse.json({ success: true })
  }

  const row = await queryOne<{ status: string; sent_back_to: string | null }>(
    `SELECT status, sent_back_to FROM public.requests WHERE id = $1`,
    [id]
  )
  if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const stage = currentStage(row.status, row.sent_back_to)
  // Closed, or with the requester: nobody to coordinate with.
  if (!stage || stage === 'requester') return NextResponse.json({ stage, others: [] })

  if (canActAt(user.role, stage)) await touchPresence(id, user.id, stage)

  const others = (await getPresence([id], [stage], user.id)).get(id) ?? []
  return NextResponse.json({
    stage,
    others: others.map((o) => ({ name: o.name, startedAt: o.started_at, lastSeenAt: o.last_seen_at })),
  })
}

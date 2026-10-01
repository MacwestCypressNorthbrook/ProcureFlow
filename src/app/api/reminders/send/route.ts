import { NextResponse } from 'next/server'
import { dispatchPendingReminders, dispatchEmailDigests, dispatchStageDigests } from '@/lib/notifications'
import { pruneRateLimits } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // Allow authorization via Bearer CRON_SECRET or session
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  // A missing secret must fail closed: without this, an unset CRON_SECRET left
  // the dispatch endpoint open to anyone who found the URL.
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured; reminder dispatch is disabled.' },
      { status: 503 }
    )
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 })
  }

  const result = await dispatchPendingReminders()

  // Each role's daily or weekly email digest rides the same cron: it no-ops
  // until a role's configured day and hour (Admin → Notifications), and sends
  // at most once per day even then.
  const digests = await dispatchEmailDigests()

  // Each downstream stage's approved batch, sent once the approvals settle.
  // How soon that is after a reviewer finishes is bounded by this cron's own
  // interval, so it wants to run every few minutes.
  const stageDigests = await dispatchStageDigests()

  // Housekeeping rides along with the cron that already runs: rate-limit
  // counters are only meaningful for an hour, so anything older is dead weight.
  await pruneRateLimits()

  return NextResponse.json({
    success: true,
    processed: result.processed,
    emailDigests: digests.sent,
    stageDigests: stageDigests.sent,
  })
}

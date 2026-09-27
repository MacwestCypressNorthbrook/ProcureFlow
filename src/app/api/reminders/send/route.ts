import { NextResponse } from 'next/server'
import { dispatchPendingReminders, dispatchLeadDigest } from '@/lib/notifications'
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

  // The weekly Lead digest rides the same cron: it no-ops on every day except
  // the one configured in the admin panel, and at most once per day even then.
  const digest = await dispatchLeadDigest()

  // Housekeeping rides along with the cron that already runs: rate-limit
  // counters are only meaningful for an hour, so anything older is dead weight.
  await pruneRateLimits()

  return NextResponse.json({ success: true, processed: result.processed, leadDigest: digest })
}

import { NextResponse } from 'next/server'
import { runDispatch } from '@/lib/dispatch'
import { isCronTickDue } from '@/lib/cron-window'

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

  // Most ticks return here without a single query, so the database can
  // suspend between runs. `?force=1` runs now regardless (manual dispatch).
  const force = new URL(request.url).searchParams.get('force') === '1'
  if (!force && !isCronTickDue()) {
    return NextResponse.json({ success: true, skipped: true })
  }

  const result = await runDispatch()
  if (!result.ran) {
    // Another run (an active user's poll, or a cron overlap) holds the lease.
    return NextResponse.json({ success: true, skipped: true, reason: 'dispatch already running' })
  }

  return NextResponse.json({
    success: true,
    processed: result.processed,
    emailDigests: result.emailDigests,
    stageDigests: result.stageDigests,
  })
}

import { NextResponse } from 'next/server'
import { dispatchPendingReminders } from '@/lib/notifications'

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
  return NextResponse.json({ success: true, processed: result.processed })
}

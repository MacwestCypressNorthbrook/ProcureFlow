import { NextResponse, after } from 'next/server'
import { getUserFromSession } from '@/lib/auth/server'
import { piggybackDispatch } from '@/lib/dispatch'
import { clearUserNotifications, getUserNotifications, markNotificationAsRead } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getUserFromSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const notifications = await getUserNotifications(user.id)

  // The database is awake for this poll anyway; send whatever is due now
  // rather than waking it again later from the cron.
  after(piggybackDispatch)

  return NextResponse.json({ data: notifications })
}

export async function POST(request: Request) {
  const user = await getUserFromSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await request.json().catch(() => ({}))
  if (!id) {
    return NextResponse.json({ error: 'Notification ID required' }, { status: 400 })
  }

  await markNotificationAsRead(id, user.id)
  return NextResponse.json({ success: true })
}

export async function DELETE() {
  const user = await getUserFromSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await clearUserNotifications(user.id)
  return NextResponse.json({ success: true })
}

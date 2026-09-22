import { NextResponse } from 'next/server'
import { getUserFromSession } from '@/lib/auth/server'
import { getUserNotifications, markNotificationAsRead } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getUserFromSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const notifications = await getUserNotifications(user.id)
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

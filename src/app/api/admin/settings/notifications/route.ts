import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/auth-guard'
import { getNotificationSettings, setNotificationSettings } from '@/lib/notification-settings'

export async function GET() {
  const guard = await requireCapability('admin:preferences')
  if (guard.error) return guard.error

  const { roles } = await getNotificationSettings()
  return NextResponse.json({ data: { roles } })
}

export async function PUT(request: Request) {
  const guard = await requireCapability('admin:preferences')
  if (guard.error) return guard.error

  let body: { roles?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { roles } = await setNotificationSettings(body, guard.user.id)
  return NextResponse.json({ data: { roles } })
}

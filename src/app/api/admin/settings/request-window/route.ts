import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/auth-guard'
import { getRequestWindowSettings, setRequestWindowSettings } from '@/lib/settings'

export async function GET() {
  const guard = await requireCapability('admin:preferences')
  if (guard.error) return guard.error

  const data = await getRequestWindowSettings()
  return NextResponse.json({ data })
}

export async function PUT(request: Request) {
  const guard = await requireCapability('admin:preferences')
  if (guard.error) return guard.error

  let body: { blockedDays?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data = await setRequestWindowSettings(body.blockedDays, guard.user.id)
  return NextResponse.json({ data })
}

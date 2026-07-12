import { NextResponse } from 'next/server'
import { getUserProfileByAuthId } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const authId = request.headers.get('X-Auth-Id')
  if (!authId) {
    return NextResponse.json({ error: 'Missing X-Auth-Id header' }, { status: 400 })
  }

  const profile = await getUserProfileByAuthId(authId)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json(profile)
}

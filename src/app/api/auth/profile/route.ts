import { NextResponse } from 'next/server'
import { getUserFromSession } from '@/lib/auth/server'

export const dynamic = 'force-dynamic'

/**
 * The signed-in user's own profile, including the role from `public.users`.
 * Resolved from the session cookie — never from a client-supplied id.
 */
export async function GET() {
  const profile = await getUserFromSession()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(profile)
}

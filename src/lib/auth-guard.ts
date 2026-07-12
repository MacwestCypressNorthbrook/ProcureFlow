import { getUserFromSession, type ResolvedUser } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function requireRole(...allowedRoles: string[]): Promise<
  { user: ResolvedUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getUserFromSession()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!allowedRoles.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 }) }
  }
  return { user }
}

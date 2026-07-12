import { createClient, getUserFromSession } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const ASSIGNABLE_ROLES = ['minta', 'mintah', 'sam', 'finance', 'admin', 'superuser']

// Update a user's role. Only superusers/admins may do this.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const user = await getUserFromSession()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!['superuser', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 })
  }

  let body: { id?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { id, role } = body
  if (!id || !role || !ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'A valid user id and role are required' }, { status: 400 })
  }

  const { error } = await supabase.from('users').update({ role }).eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

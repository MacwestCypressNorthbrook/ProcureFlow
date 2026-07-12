import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const guard = await requireRole('minta', 'admin', 'superuser')
  if (guard.error) return guard.error

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('requests')
    .insert({
      purpose: body.purpose,
      description: body.description,
      estimated_quantity: body.estimated_quantity,
      estimated_unit_rate: body.estimated_unit_rate,
      guest_name: body.guest_name,
      guest_email: body.guest_email,
      created_by: guard.user.id,
      status: 'new',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

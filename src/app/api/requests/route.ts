import { createClient, getUserFromSession } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  const supabase = await createClient()
  const user = await getUserFromSession()

  const { data, error } = await supabase
    .from('requests')
    .insert({
      purpose: body.purpose,
      description: body.description,
      estimated_quantity: body.estimated_quantity,
      estimated_unit_rate: body.estimated_unit_rate,
      guest_name: body.guest_name,
      guest_email: body.guest_email,
      created_by: user?.id ?? null,
      status: 'new',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

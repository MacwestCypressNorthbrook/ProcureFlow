import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole('minta', 'admin', 'superuser', 'sam', 'finance')
  if (guard.error) return guard.error

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('requests')
    .select('*, requestor:users!requests_created_by_fkey(id, name, email, role)')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireRole('minta', 'admin', 'superuser')
  if (guard.error) return guard.error

  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('requests')
    .select('id, created_by, status')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (existing.created_by !== guard.user.id) {
    return NextResponse.json({ error: 'Only the owner can update this request' }, { status: 403 })
  }

  if (!['new', 'reviewing'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Can only update requests with status "new" or "reviewing"' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('requests')
    .update({
      purpose: body.purpose,
      description: body.description,
      estimated_quantity: body.estimated_quantity,
      estimated_unit_rate: body.estimated_unit_rate,
      guest_name: body.guest_name,
      guest_email: body.guest_email,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole('minta', 'admin', 'superuser')
  if (guard.error) return guard.error

  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('requests')
    .select('id, created_by, status')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (existing.created_by !== guard.user.id) {
    return NextResponse.json({ error: 'Only the owner can delete this request' }, { status: 403 })
  }

  if (existing.status !== 'new') {
    return NextResponse.json(
      { error: 'Can only delete requests with status "new"' },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('requests').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

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

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      requestor:users!purchase_orders_created_by_fkey(id, name, email, role),
      approver:users!purchase_orders_sam_approved_by_fkey(id, name, email, role),
      payer:users!purchase_orders_paid_by_fkey(id, name, email, role)
    `)
    .eq('id', id)
    .single()

  if (poError || !po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const { data: auditTrail } = await supabase
    .from('po_audit_trail')
    .select('*')
    .eq('po_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ data: { ...po, audit_trail: auditTrail ?? [] } })
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
    .from('purchase_orders')
    .select('id, created_by, status')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  if (existing.created_by !== guard.user.id) {
    return NextResponse.json({ error: 'Only the creator can update this PO' }, { status: 403 })
  }

  if (!['pending_sam', 'revision_required'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Can only update POs with status "pending_sam" or "revision_required"' },
      { status: 400 }
    )
  }

  const updateFields: Record<string, unknown> = {}
  if (body.purpose !== undefined) updateFields.purpose = body.purpose
  if (body.description !== undefined) updateFields.description = body.description
  if (body.quantity !== undefined) updateFields.quantity = body.quantity
  if (body.unit_rate !== undefined) updateFields.unit_rate = body.unit_rate
  if (body.total_amount !== undefined) updateFields.total_amount = body.total_amount
  if (body.file_path !== undefined) updateFields.file_path = body.file_path
  if (body.file_name !== undefined) updateFields.file_name = body.file_name

  if (existing.status === 'revision_required') {
    updateFields.status = 'pending_sam'
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updateFields)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data })
}

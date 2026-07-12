import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole('mintah', 'admin', 'superuser')
  if (guard.error) return guard.error

  const supabase = await createClient()

  const { data: req, error: reqError } = await supabase
    .from('requests')
    .select('*')
    .eq('id', id)
    .single()

  if (reqError || !req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      request_id: req.id,
      purpose: req.purpose,
      description: req.description,
      quantity: req.estimated_quantity,
      unit_rate: req.estimated_unit_rate,
      total_amount: req.estimated_quantity && req.estimated_unit_rate
        ? req.estimated_quantity * req.estimated_unit_rate
        : null,
      created_by: guard.user.id,
      status: 'pending_sam',
    })
    .select()
    .single()

  if (poError) {
    return NextResponse.json({ error: poError.message }, { status: 400 })
  }

  await supabase
    .from('requests')
    .update({ status: 'converted' })
    .eq('id', id)

  await supabase.from('po_audit_trail').insert({
    po_id: po.id,
    action: 'created',
    performed_by: guard.user.id,
    notes: 'PO created from request',
  })

  return NextResponse.json({ data: po }, { status: 201 })
}

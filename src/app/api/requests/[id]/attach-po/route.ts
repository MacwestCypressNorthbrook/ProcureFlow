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

  const body = await request.json()

  if (!body.po_number || !body.file_name || !body.file_url) {
    return NextResponse.json(
      { error: 'po_number, file_name, and file_url are required' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  const { data: req, error: reqError } = await supabase
    .from('requests')
    .select('*')
    .eq('id', id)
    .single()

  if (reqError || !req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (req.status !== 'reviewing') {
    return NextResponse.json(
      { error: 'Request must be in "reviewing" status to attach a PO' },
      { status: 400 }
    )
  }

  const descriptionWithPoNumber = `[PO#: ${body.po_number}] ${req.description || ''}`.trim()

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      request_id: req.id,
      purpose: req.purpose,
      description: descriptionWithPoNumber,
      quantity: req.estimated_quantity,
      unit_rate: req.estimated_unit_rate,
      total_amount: req.estimated_quantity && req.estimated_unit_rate
        ? req.estimated_quantity * req.estimated_unit_rate
        : null,
      file_name: body.file_name,
      file_path: body.file_url,
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

  await supabase.from('po_attachments').insert({
    po_id: po.id,
    file_name: body.file_name,
    file_url: body.file_url,
    uploaded_by: guard.user.id,
  })

  await supabase.from('po_audit_trail').insert({
    po_id: po.id,
    action: 'created',
    performed_by: guard.user.id,
    notes: `PO ${body.po_number} attached from external procurement system`,
  })

  return NextResponse.json({ success: true, po_id: po.id }, { status: 201 })
}

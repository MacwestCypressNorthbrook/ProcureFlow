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

  // Optional overrides / uploaded document from the Create-PO form.
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    /* no body — convert straight from the request */
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

  const quantity = body.quantity !== undefined ? (body.quantity as number | null) : req.estimated_quantity
  const unitRate = body.unit_rate !== undefined ? (body.unit_rate as number | null) : req.estimated_unit_rate
  const fileName = typeof body.file_name === 'string' && body.file_name.trim() ? body.file_name.trim() : null
  const fileUrl = typeof body.file_url === 'string' && body.file_url.trim() ? body.file_url.trim() : null

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      request_id: req.id,
      purpose: typeof body.purpose === 'string' && body.purpose.trim() ? body.purpose.trim() : req.purpose,
      description: typeof body.description === 'string' ? body.description : req.description,
      quantity,
      unit_rate: unitRate,
      total_amount: quantity && unitRate ? quantity * unitRate : null,
      file_name: fileName,
      file_path: fileUrl,
      created_by: guard.user.id,
      status: 'pending_sam',
    })
    .select()
    .single()

  if (poError) {
    return NextResponse.json({ error: poError.message }, { status: 400 })
  }

  await supabase.from('requests').update({ status: 'converted' }).eq('id', id)

  if (fileName && fileUrl) {
    await supabase.from('po_attachments').insert({
      po_id: po.id,
      file_name: fileName,
      file_url: fileUrl,
      uploaded_by: guard.user.id,
    })
  }

  await supabase.from('po_audit_trail').insert({
    po_id: po.id,
    action: 'created',
    performed_by: guard.user.id,
    notes: 'PO created from request',
  })

  return NextResponse.json({ data: po }, { status: 201 })
}

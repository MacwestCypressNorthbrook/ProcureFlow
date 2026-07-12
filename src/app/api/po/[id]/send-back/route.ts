import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireRole('sam', 'admin', 'superuser')
  if (guard.error) return guard.error

  if (!body.reason || !body.reason.trim()) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from('purchase_orders')
    .select('id, status, request_id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  if (existing.status !== 'pending_sam') {
    return NextResponse.json(
      { error: 'Can only send back POs with status "pending_sam"' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'revision_required',
      sam_rejection_reason: body.reason.trim(),
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from('po_audit_trail').insert({
    po_id: id,
    action: 'sent_back_by_sam',
    performed_by: guard.user.id,
    notes: body.reason.trim(),
  })

  if (existing.request_id) {
    await supabase
      .from('requests')
      .update({
        status: 'reviewing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.request_id)
  }

  return NextResponse.json({ success: true })
}

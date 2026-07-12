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

  const supabase = await createClient()

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'revision_required',
      sam_rejection_reason: body.reason,
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from('po_audit_trail').insert({
    po_id: id,
    action: 'rejected_by_sam',
    performed_by: guard.user.id,
    notes: body.reason,
  })

  return NextResponse.json({ success: true })
}

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole('finance', 'admin', 'superuser')
  if (guard.error) return guard.error

  const supabase = await createClient()

  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'completed',
      paid_by: guard.user.id,
      paid_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from('po_audit_trail').insert({
    po_id: id,
    action: 'payment_completed',
    performed_by: guard.user.id,
    notes: 'Payment marked as completed',
  })

  return NextResponse.json({ success: true })
}

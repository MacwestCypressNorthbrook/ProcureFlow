import { queryOne, execute } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import type { PurchaseOrder } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireCapability('po:approve')
  if (guard.error) return guard.error

  const reason = body.reason || 'Rejection requested'

  const po = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  await execute(
    `UPDATE public.purchase_orders
     SET status = 'rejected',
         rejection_reason = $1,
         sam_rejection_reason = $1,
         updated_at = now()
     WHERE id = $2`,
    [reason, id]
  )

  await execute(
    `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [id, 'rejected', guard.user.id, reason]
  )

  if (po.created_by) {
    await createNotification({
      userId: po.created_by,
      title: 'Purchase Order Rejected',
      message: `Purchase order "${po.purpose}" was rejected: ${reason}`,
      type: 'warning',
      target: { type: 'po', id },
      sendEmailAlert: true,
    })
  }

  return NextResponse.json({ success: true })
}

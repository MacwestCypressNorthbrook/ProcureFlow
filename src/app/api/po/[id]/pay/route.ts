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
  const guard = await requireCapability('po:pay')
  if (guard.error) return guard.error

  const po = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  await execute(
    `UPDATE public.purchase_orders
     SET status = 'paid',
         paid_by = $1,
         paid_at = now(),
         updated_at = now()
     WHERE id = $2`,
    [guard.user.id, id]
  )

  // Payment closes the requisition behind it.
  if (po.request_id) {
    await execute(
      `UPDATE public.requests
          SET status = 'completed', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
        WHERE id = $1`,
      [po.request_id]
    )
    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by)
       VALUES ($1, $2, 'finance', 'paid', $3)`,
      [po.request_id, id, guard.user.id]
    )
  }

  await execute(
    `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [id, 'paid', guard.user.id, 'Payment processed and completed']
  )

  if (po.created_by) {
    await createNotification({
      userId: po.created_by,
      title: 'Payment Completed',
      message: `Payment for Purchase Order "${po.purpose}" has been recorded as completed.`,
      type: 'success',
      target: { type: 'po', id },
      sendEmailAlert: true,
    })
  }

  return NextResponse.json({ success: true })
}

import { query, queryOne } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import type { PurchaseOrder } from '@/lib/types'

/** Statuses a purchase order cannot be rejected from: paid, final, or already closed. */
const CLOSED = ['partially_paid', 'paid', 'approved', 'rejected', 'cancelled']

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

  if (CLOSED.includes(po.status)) {
    return NextResponse.json(
      { error: `This purchase order is already ${po.status.replace(/_/g, ' ')}.` },
      { status: 409 }
    )
  }

  // One statement, guarded on status, so a double-click cannot reject twice and
  // the PO trail and the requisition's own history never disagree. Rejecting
  // the PO closes the requisition too, as rejecting at any stage does.
  const rejected = await query<{ id: string }>(
    `WITH po AS (
       UPDATE public.purchase_orders
          SET status = 'rejected',
              rejection_reason = $2,
              sam_rejection_reason = $2,
              updated_at = now()
        WHERE id = $1 AND status <> ALL($4::text[])
        RETURNING id, request_id
     ), audit AS (
       INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
       SELECT id, 'rejected', $3, $2 FROM po
     ), req AS (
       UPDATE public.requests
          SET status = 'rejected', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
        WHERE id IN (SELECT request_id FROM po)
     ), approval AS (
       INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       SELECT request_id, id, 'cost_control', 'rejected', $3, $2 FROM po WHERE request_id IS NOT NULL
     )
     SELECT id FROM po`,
    [id, reason, guard.user.id, CLOSED]
  )

  if (rejected.length === 0) {
    return NextResponse.json({ error: 'This purchase order was just actioned by someone else.' }, { status: 409 })
  }

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

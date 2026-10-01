import { query, queryOne } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { NextResponse } from 'next/server'
import type { PurchaseOrder, User } from '@/lib/types'

/** Statuses past Cost Control's approval — approving again would rewind them. */
const ALREADY_DECIDED = ['pending_finance', 'partially_paid', 'paid', 'approved', 'rejected', 'cancelled']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('po:approve')
  if (guard.error) return guard.error

  const po = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  if (ALREADY_DECIDED.includes(po.status)) {
    return NextResponse.json(
      { error: `This purchase order is already ${po.status.replace(/_/g, ' ')}.` },
      { status: 409 }
    )
  }

  // One statement, so the approval, its audit entry and the requisition's move
  // to Finance commit together. The status guard sits on the UPDATE itself: a
  // double-click's second request matches no row and records nothing.
  // Cost Control's approval hands the requisition to Finance.
  const approved = await query<{ id: string }>(
    `WITH po AS (
       UPDATE public.purchase_orders
          SET status = 'pending_finance',
              approved_by = $2,
              approved_at = now(),
              sam_approved_by = $2,
              sam_approved_at = now(),
              updated_at = now()
        WHERE id = $1 AND status <> ALL($3::text[])
        RETURNING id, request_id
     ), audit AS (
       INSERT INTO public.po_audit_trail (po_id, action, performed_by)
       SELECT id, 'approved', $2 FROM po
     ), req AS (
       UPDATE public.requests
          SET status = 'pending_finance', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
        WHERE id IN (SELECT request_id FROM po)
     ), approval AS (
       INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by)
       SELECT request_id, id, 'cost_control', 'approved', $2 FROM po WHERE request_id IS NOT NULL
     )
     SELECT id FROM po`,
    [id, guard.user.id, ALREADY_DECIDED]
  )

  if (approved.length === 0) {
    return NextResponse.json({ error: 'This purchase order was just actioned by someone else.' }, { status: 409 })
  }

  // Notify creator
  if (po.created_by) {
    await createNotification({
      userId: po.created_by,
      title: 'Purchase Order Approved',
      message: `Purchase Order "${po.purpose}" has been approved.`,
      type: 'success',
      target: { type: 'po', id },
      sendEmailAlert: true,
    })

    await dispatchWorkflowEmail({
      eventType: 'po_approved',
      poId: id,
      requestId: po.request_id || undefined,
      recipientUserId: po.created_by,
      performerId: guard.user.id,
    })
  }

  // Notify Finance team for disbursement
  try {
    const financeUsers = await query<User>(
      `SELECT id, email, name FROM public.users WHERE role IN ('finance', 'administrator', 'super_user')`
    )
    for (const fUser of financeUsers) {
      await createNotification({
        userId: fUser.id,
        title: 'PO Ready for Payment',
        message: `Purchase order "${po.purpose}" is approved and pending payment review.`,
        type: 'approval',
        target: { type: 'po', id },
      })
    }
  } catch (err) {
    console.error('Error notifying finance:', err)
  }

  return NextResponse.json({ success: true })
}

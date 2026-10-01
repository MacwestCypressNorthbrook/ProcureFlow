import { query, queryOne } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { NextResponse } from 'next/server'
import type { PurchaseOrder } from '@/lib/types'

/** Statuses with nothing left to revise: paid, final, closed, or already sent back. */
const CLOSED = ['partially_paid', 'paid', 'approved', 'rejected', 'cancelled', 'sent_back']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireCapability('po:approve')
  if (guard.error) return guard.error

  if (!body.reason || !body.reason.trim()) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  const reason = body.reason.trim()

  const existing = await queryOne<PurchaseOrder>(
    `SELECT id, status, request_id, purpose, created_by
     FROM public.purchase_orders
     WHERE id = $1
     LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  if (CLOSED.includes(existing.status)) {
    return NextResponse.json(
      { error: `This purchase order is already ${existing.status.replace(/_/g, ' ')}.` },
      { status: 409 }
    )
  }

  // One statement, guarded on status, so the send-back, its audit entry and the
  // requisition's return to the Administrator commit together — and a
  // double-click's second request matches no row and records nothing.
  const sentBack = await query<{ id: string }>(
    `WITH po AS (
       UPDATE public.purchase_orders
          SET status = 'sent_back',
              rejection_reason = $2,
              sam_rejection_reason = $2,
              updated_at = now()
        WHERE id = $1 AND status <> ALL($4::text[])
        RETURNING id, request_id
     ), audit AS (
       INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
       SELECT id, 'sent_back', $3, $2 FROM po
     ), req AS (
       UPDATE public.requests
          SET status = 'sent_back',
              sent_back_to = 'admin',
              return_to_stage = 'cost_control',
              updated_at = now()
        WHERE id IN (SELECT request_id FROM po)
     ), approval AS (
       INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       SELECT request_id, id, 'cost_control', 'sent_back', $3, $2 FROM po WHERE request_id IS NOT NULL
     )
     SELECT id FROM po`,
    [id, reason, guard.user.id, CLOSED]
  )

  if (sentBack.length === 0) {
    return NextResponse.json({ error: 'This purchase order was just actioned by someone else.' }, { status: 409 })
  }

  if (existing.created_by) {
    await createNotification({
      userId: existing.created_by,
      title: 'PO Sent Back for Revision',
      message: `Purchase Order "${existing.purpose}" was sent back: ${reason}`,
      type: 'warning',
      target: { type: 'po', id },
      sendEmailAlert: true,
    })

    await dispatchWorkflowEmail({
      eventType: 'po_sent_back',
      poId: id,
      requestId: existing.request_id || undefined,
      recipientUserId: existing.created_by,
      performerId: guard.user.id,
      comments: reason,
    })
  }

  return NextResponse.json({ success: true })
}

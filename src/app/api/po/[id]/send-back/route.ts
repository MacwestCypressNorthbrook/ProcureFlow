import { queryOne, execute } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
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

  await execute(
    `UPDATE public.purchase_orders
     SET status = 'sent_back',
         rejection_reason = $1,
         sam_rejection_reason = $1,
         updated_at = now()
     WHERE id = $2`,
    [reason, id]
  )

  await execute(
    `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [id, 'sent_back', guard.user.id, reason]
  )

  if (existing.request_id) {
    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, 'cost_control', 'sent_back', $3, $4)`,
      [existing.request_id, id, guard.user.id, reason]
    )
  }

  if (existing.request_id) {
    await execute(
      `UPDATE public.requests
       SET status = 'sent_back',
           sent_back_to = 'admin',
           return_to_stage = 'cost_control',
           updated_at = now()
       WHERE id = $1`,
      [existing.request_id]
    )
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

import { queryOne, execute } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { recordPayment, paymentSummary } from '@/lib/payments'
import { NextResponse } from 'next/server'
import type { PurchaseOrder } from '@/lib/types'

/**
 * Record a payment — in full, or an instalment.
 *
 * A part-paid requisition deliberately stays with Finance so the balance keeps
 * showing in their queue; it only completes once the purchase order is settled.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let body: { amount?: number | string; reference?: string; note?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* an empty body means "settle the balance" */
  }

  const total = Number(po.total_amount) || 0
  // No amount given: pay off whatever is left, which is the common case.
  const requested =
    body.amount === undefined || body.amount === null || body.amount === ''
      ? null
      : Number(body.amount)

  const { getPaymentPosition } = await import('@/lib/payments')
  const before = await getPaymentPosition(id, total)
  const amount = requested ?? before.outstanding

  const result = await recordPayment(id, total, guard.user.id, amount, {
    reference: body.reference,
    note: body.note,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { position, settled } = result

  if (po.request_id) {
    if (settled) {
      await execute(
        `UPDATE public.requests
            SET status = 'completed', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
          WHERE id = $1`,
        [po.request_id]
      )
    }

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, 'finance', 'paid', $3, $4)`,
      [
        po.request_id,
        id,
        guard.user.id,
        settled
          ? `Paid in full — ${paymentSummary(position)}.`
          : `Part payment — ${paymentSummary(position)}, ${new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(position.outstanding)} outstanding.`,
      ]
    )

    // The requester hears about every instalment, not just the last one.
    const requester = await queryOne<{ created_by: string | null; purpose: string }>(
      `SELECT created_by, purpose FROM public.requests WHERE id = $1`,
      [po.request_id]
    )
    if (requester?.created_by) {
      await createNotification({
        userId: requester.created_by,
        title: settled ? 'Requisition paid' : 'Part payment made',
        message: settled
          ? `"${requester.purpose}" has been paid in full (${paymentSummary(position)}) and closed.`
          : `"${requester.purpose}" received a part payment. ${paymentSummary(position)} paid, ${new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(position.outstanding)} still outstanding.`,
        type: settled ? 'success' : 'info',
        link: `/minta/requests/${po.request_id}`,
        sendEmailAlert: true,
      })

      if (settled) {
        await dispatchWorkflowEmail({
          eventType: 'payment_complete',
          requestId: po.request_id,
          poId: id,
          recipientUserId: requester.created_by,
          performerId: guard.user.id,
        })
      }
    }
  }

  return NextResponse.json({ success: true, ...position, settled })
}

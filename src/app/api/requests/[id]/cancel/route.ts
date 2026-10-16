import { query, queryOne, transaction } from '@/lib/db'
import { poAuditStatement } from '@/lib/audit'
import { getUserFromSession } from '@/lib/auth/server'
import { cancelModeFor } from '@/lib/cancellation'
import { currentStage } from '@/lib/workflow'
import { notifyRequisitionParties } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import type { Request as DbRequest } from '@/lib/types'

const MIN_REASON = 10

/**
 * Cancel a requisition, or void one that was already completed.
 *
 * The status is `cancelled` either way; the trail records which it was. A
 * reason is mandatory because the requisition leaves every queue and its
 * purchase orders are cancelled with it — the people who were waiting on it
 * deserve to know why. Anything already paid is refused: that needs a refund
 * handled outside the app, not a status flip.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params

  let body: { reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const reason = body.reason?.trim() ?? ''
  if (reason.length < MIN_REASON) {
    return NextResponse.json(
      { error: `Give a reason of at least ${MIN_REASON} characters — it is recorded on the requisition.` },
      { status: 400 }
    )
  }

  const existing = await queryOne<DbRequest & { sent_back_to: string | null }>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const isOwner = existing.created_by
    ? existing.created_by === user.id
    : existing.guest_email === user.email
  const mode = cancelModeFor(user.role, existing.status, isOwner)
  if (!mode) {
    return NextResponse.json(
      {
        error:
          existing.status === 'cancelled' || existing.status === 'rejected'
            ? 'This requisition has already ended.'
            : 'You cannot cancel this requisition.',
      },
      { status: 403 }
    )
  }

  const pos = await query<{ id: string; status: string }>(
    `SELECT id, status FROM public.purchase_orders WHERE request_id = $1 ORDER BY created_at DESC`,
    [id]
  )

  const paid = await queryOne<{ paid: string }>(
    `SELECT COALESCE(SUM(p.amount), 0)::numeric AS paid
       FROM public.po_payments p
       JOIN public.purchase_orders po ON po.id = p.po_id
      WHERE po.request_id = $1`,
    [id]
  )
  if (Number(paid?.paid ?? 0) > 0 || pos.some((p) => p.status === 'paid' || p.status === 'partially_paid')) {
    return NextResponse.json(
      { error: 'A payment has already been recorded against this requisition. It cannot be cancelled — reverse the payment with Finance first.' },
      { status: 409 }
    )
  }

  const action = mode === 'void' ? 'voided' : 'cancelled'
  const stage = currentStage(existing.status, existing.sent_back_to) ?? 'admin'
  const live = pos.filter((p) => p.status !== 'cancelled' && p.status !== 'rejected')

  await transaction([
    [
      `UPDATE public.requests
          SET status = 'cancelled', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
        WHERE id = $1`,
      [id],
    ],
    ...live.flatMap(
      (po) =>
        [
          [
            `UPDATE public.purchase_orders SET status = 'cancelled', updated_at = now() WHERE id = $1`,
            [po.id],
          ],
          poAuditStatement(po.id, action, user.id, reason),
        ] as [string, unknown[]][]
    ),
    [
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, pos[0]?.id ?? null, stage, action, user.id, reason],
    ],
  ])

  await notifyRequisitionParties(id, {
    title: mode === 'void' ? 'Requisition voided' : 'Requisition cancelled',
    message: `"${existing.purpose}" was ${action} by ${user.name || user.email}. Reason: ${reason}`,
    type: 'warning',
    sendEmailAlert: true,
    excludeUserId: user.id,
  })

  return NextResponse.json({ success: true, status: 'cancelled', mode })
}

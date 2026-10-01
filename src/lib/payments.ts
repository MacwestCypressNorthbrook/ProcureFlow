import { query, queryOne, transaction } from '@/lib/db'
import { poAuditStatement } from '@/lib/audit'
import type { PoPayment } from '@/lib/types'

export interface PaymentPosition {
  total: number
  paid: number
  outstanding: number
  settled: boolean
}

/**
 * What a purchase order has been paid so far.
 *
 * The ledger in `po_payments` is the truth; `purchase_orders.paid_at` only
 * marks the moment the last instalment cleared the balance.
 */
export async function getPaymentPosition(poId: string, total: number): Promise<PaymentPosition> {
  const row = await queryOne<{ paid: string }>(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS paid FROM public.po_payments WHERE po_id = $1`,
    [poId]
  )
  const paid = Number(row?.paid) || 0
  const poTotal = Number(total) || 0
  // Rounded to the pesewa so floating-point dust never leaves a PO one
  // hundredth short of settled.
  const outstanding = Math.max(0, Math.round((poTotal - paid) * 100) / 100)
  return { total: poTotal, paid, outstanding, settled: poTotal > 0 && outstanding === 0 }
}

export async function listPayments(poId: string): Promise<Array<PoPayment & { paid_by_name: string | null }>> {
  return await query<PoPayment & { paid_by_name: string | null }>(
    `SELECT p.*, u.name AS paid_by_name
       FROM public.po_payments p
       LEFT JOIN public.users u ON u.id = p.paid_by
      WHERE p.po_id = $1
      ORDER BY p.paid_at DESC`,
    [poId]
  )
}

export type RecordPaymentResult =
  | { ok: true; position: PaymentPosition; settled: boolean }
  | { ok: false; error: string; status: number }

/**
 * Record one disbursement against a purchase order.
 *
 * Refuses more than is outstanding, so an extra zero cannot overpay a vendor.
 * Returns the resulting position; the caller decides what to do with the
 * requisition, since only it knows the workflow context.
 */
export async function recordPayment(
  poId: string,
  poTotal: number,
  userId: string,
  amount: number,
  meta: { reference?: string | null; note?: string | null } = {}
): Promise<RecordPaymentResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter a payment amount greater than zero.', status: 400 }
  }

  const before = await getPaymentPosition(poId, poTotal)
  if (before.total <= 0) {
    return { ok: false, error: 'This purchase order has no value to pay against.', status: 409 }
  }
  if (before.settled) {
    return { ok: false, error: 'This purchase order is already paid in full.', status: 409 }
  }
  if (amount - before.outstanding > 0.005) {
    return {
      ok: false,
      error: `That is more than the ${before.outstanding.toFixed(2)} still outstanding on this purchase order.`,
      status: 409,
    }
  }

  // Worked out here rather than re-read after the insert, so the ledger row,
  // the status and the audit entry can all commit as one transaction.
  const paid = Math.round((before.paid + amount) * 100) / 100
  const outstanding = Math.max(0, Math.round((before.total - paid) * 100) / 100)
  const after: PaymentPosition = { total: before.total, paid, outstanding, settled: outstanding === 0 }

  const reference = meta.reference?.trim() || null
  const note = meta.note?.trim() || null
  const auditNotes = [
    `${ghs(amount)} paid — ${paymentSummary(after)}` +
      (after.settled ? ', settled in full.' : `, ${ghs(after.outstanding)} outstanding.`),
    reference && `Ref: ${reference}`,
    note,
  ]
    .filter(Boolean)
    .join(' · ')

  await transaction([
    [
      `INSERT INTO public.po_payments (po_id, amount, reference, note, paid_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [poId, amount, reference, note, userId],
    ],
    [
      `UPDATE public.purchase_orders
          SET status = $2,
              paid_by = CASE WHEN $3 THEN $4 ELSE paid_by END,
              paid_at = CASE WHEN $3 THEN now() ELSE paid_at END,
              updated_at = now()
        WHERE id = $1`,
      [poId, after.settled ? 'paid' : 'partially_paid', after.settled, userId],
    ],
    poAuditStatement(poId, after.settled ? 'paid' : 'part_paid', userId, auditNotes),
  ])

  return { ok: true, position: after, settled: after.settled }
}

const ghs = (n: number) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(n)

/** "GH₵40,000.00 of GH₵75,000.00" — the phrase used in notifications and email. */
export function paymentSummary(position: PaymentPosition): string {
  return `${ghs(position.paid)} of ${ghs(position.total)}`
}

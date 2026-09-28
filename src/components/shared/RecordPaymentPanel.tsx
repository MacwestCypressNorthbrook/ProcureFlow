'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Panel } from '@/components/shared/ui-kit'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertCircle, Banknote, Check, Loader2 } from 'lucide-react'

export interface PaymentRow {
  id: string
  amount: number
  reference: string | null
  note: string | null
  paid_at: string
  paid_by_name: string | null
}

/**
 * Finance records a disbursement here — the whole balance, or an instalment.
 *
 * The amount defaults to everything outstanding, so settling in full stays a
 * single click; typing a smaller figure makes it a part payment and leaves the
 * requisition with Finance until the balance clears.
 */
export default function RecordPaymentPanel({
  poId,
  total,
  paid,
  outstanding,
  payments,
  canPay,
}: {
  poId: string
  total: number
  paid: number
  outstanding: number
  payments: PaymentRow[]
  canPay: boolean
}) {
  const router = useRouter()
  const [amount, setAmount] = useState(outstanding > 0 ? String(outstanding) : '')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const settled = outstanding <= 0 && total > 0
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/po/${poId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reference }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not record the payment.')
        return
      }
      setReference('')
      router.refresh()
    } catch {
      setError('Network error — the payment was not recorded.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Payment" icon={<Banknote size={16} />}>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(paid)} <span className="font-normal text-muted-foreground">of {formatCurrency(total)}</span>
          </p>
          {settled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check size={11} /> Paid in full
            </span>
          ) : paid > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Part-paid
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Unpaid
            </span>
          )}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${settled ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {!settled && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{formatCurrency(outstanding)}</span> still
            outstanding.
          </p>
        )}

        {payments.length > 0 && (
          <ul className="space-y-1.5 border-t border-border pt-3">
            {payments.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0">
                  <span className="font-semibold tabular-nums text-foreground">{formatCurrency(Number(p.amount))}</span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {formatDate(p.paid_at)}
                    {p.paid_by_name ? ` · ${p.paid_by_name}` : ''}
                  </span>
                  {p.reference && <span className="block truncate text-muted-foreground">Ref {p.reference}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canPay && !settled && (
          <div className="space-y-2.5 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pay-amount" className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Amount (GHS)
                </label>
                <input
                  id="pay-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="pay-ref" className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Reference (optional)
                </label>
                <input
                  id="pay-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Cheque / transfer no."
                  className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {error && (
              <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                <AlertCircle size={13} className="mt-px shrink-0" /> {error}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={saving || !(Number(amount) > 0)}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Banknote size={14} />}
              {Number(amount) >= outstanding ? 'Pay in full' : 'Record part payment'}
            </button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A part payment keeps this requisition with Finance until the balance is cleared.
            </p>
          </div>
        )}
      </div>
    </Panel>
  )
}

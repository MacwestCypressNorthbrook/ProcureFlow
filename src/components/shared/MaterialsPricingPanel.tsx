'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2, Save, Tag } from 'lucide-react'
import SupplierPicker, { type SupplierOption } from '@/components/shared/SupplierPicker'
import { formatCurrency } from '@/lib/utils'

export interface PricingItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  supplier_id: string | null
  supplier_name: string | null
  remarks: string | null
}

/**
 * The materials table on a requisition review screen.
 *
 * Most stages only ever read these numbers. Supply Chain is the exception:
 * engineers often don't know a market rate or a vendor's quote at request
 * time, so this is where those prices (and, if it changed, the supplier) get
 * filled in — plus one overall discount off the subtotal, for when a vendor
 * quote comes back better than list price. Saving here recomputes the
 * requisition's total; it does not advance the requisition, that is still a
 * separate approve/send-back decision in the panel beside it.
 */
export default function MaterialsPricingPanel({
  requestId,
  items,
  suppliers,
  discountAmount,
  canEdit,
}: {
  requestId: string
  items: PricingItem[]
  suppliers: SupplierOption[]
  discountAmount: number
  canEdit: boolean
}) {
  const router = useRouter()
  const [supplierList, setSupplierList] = useState(suppliers)
  const [rows, setRows] = useState(() =>
    items.map((i) => ({
      id: i.id,
      unitPrice: i.unit_price ? String(i.unit_price) : '',
      supplierId: i.supplier_id,
    }))
  )
  const [discount, setDiscount] = useState(discountAmount > 0 ? String(discountAmount) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  const updateRow = (id: string, patch: Partial<{ unitPrice: string; supplierId: string | null }>) => {
    setDirty(true)
    setSaved(false)
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const registerSupplier = (s: SupplierOption) =>
    setSupplierList((list) =>
      list.some((x) => x.id === s.id) ? list : [...list, s].sort((a, b) => a.name.localeCompare(b.name))
    )

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const row = rows.find((r) => r.id === item.id)
        const price = Number(row?.unitPrice) || 0
        return sum + item.quantity * price
      }, 0),
    [items, rows]
  )

  const discountValue = Number(discount) || 0
  const total = Math.max(0, subtotal - discountValue)
  const missingPrices = canEdit && rows.some((r) => !(Number(r.unitPrice) > 0))

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/pricing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: rows.map((r) => ({ id: r.id, unitPrice: r.unitPrice, supplierId: r.supplierId })),
          discountAmount: discount || 0,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not save pricing.')
        return
      }
      setDirty(false)
      setSaved(true)
      router.refresh()
    } catch {
      setError('Network error — pricing was not saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {canEdit && (
        <div className="flex items-start gap-2.5 border-b border-border bg-primary/[0.03] px-4 py-3 text-xs text-muted-foreground">
          <Tag size={14} className="mt-0.5 shrink-0 text-primary" />
          <p>
            Fill in the unit price for each material as you source it, and apply a discount below if the
            vendor quoted one off. The total updates as you type — save it, then attach the invoice or quote
            in Documents before approving.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="bg-muted/50">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">Material</th>
              <th className="w-24 px-3 py-2.5">Qty</th>
              <th className="w-36 px-3 py-2.5">Unit price</th>
              <th className="w-48 px-3 py-2.5">Supplier</th>
              <th className="w-32 px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const row = rows.find((r) => r.id === item.id)
              const price = Number(row?.unitPrice) || 0
              return (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{item.description}</p>
                    {item.remarks && <p className="mt-0.5 text-xs text-muted-foreground">{item.remarks}</p>}
                  </td>
                  <td className="px-3 py-3 text-sm tabular-nums text-foreground">
                    {item.quantity} {item.unit ?? ''}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={row?.unitPrice ?? ''}
                        onChange={(e) => updateRow(item.id, { unitPrice: e.target.value })}
                        className="h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : (
                      <span className="text-sm tabular-nums text-foreground">{formatCurrency(Number(item.unit_price))}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <SupplierPicker
                        compact
                        value={row?.supplierId ?? null}
                        suppliers={supplierList}
                        onChange={(supplierId) => updateRow(item.id, { supplierId })}
                        onCreated={registerSupplier}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">{item.supplier_name ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                    <span className="inline-block pt-2.5">{formatCurrency(item.quantity * price)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Materials subtotal
              </td>
              <td className="px-4 py-2.5 text-right text-sm font-medium tabular-nums text-foreground">
                {formatCurrency(subtotal)}
              </td>
            </tr>
            <tr className="border-t border-border/60 bg-muted/30">
              <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Discount <span className="normal-case text-muted-foreground/70">(optional)</span>
              </td>
              <td className="px-4 py-2 text-right">
                {canEdit ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={discount}
                    onChange={(e) => {
                      setDirty(true)
                      setSaved(false)
                      setDiscount(e.target.value)
                    }}
                    className="h-9 w-full max-w-[9rem] rounded-lg border border-input bg-card px-2.5 text-right text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <span className="text-sm tabular-nums text-foreground">
                    {discountValue > 0 ? `− ${formatCurrency(discountValue)}` : '—'}
                  </span>
                )}
              </td>
            </tr>
            <tr className="border-t border-border bg-muted/50">
              <td colSpan={4} className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total cost
              </td>
              <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-foreground">
                {formatCurrency(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2.5 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs">
            {error ? (
              <span className="flex items-center gap-1.5 font-medium text-destructive">
                <AlertCircle size={13} /> {error}
              </span>
            ) : dirty ? (
              // Approving is a separate button, and it does not carry anything
              // typed here — so say plainly that these edits are not saved yet.
              <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                <AlertCircle size={13} /> Unsaved changes — press Save pricing, or they will be lost.
              </span>
            ) : missingPrices ? (
              <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                <AlertCircle size={13} /> Some lines still have no unit price. You cannot approve until they do.
              </span>
            ) : saved && !dirty ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <Check size={13} /> Pricing saved.
              </span>
            ) : (
              <span className="text-muted-foreground">Save before approving so the total carries forward.</span>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save pricing
          </button>
        </div>
      )}
    </div>
  )
}

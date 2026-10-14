'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, BadgeCheck, FileText, Loader2, Plus, Receipt, Trash2, Undo2 } from 'lucide-react'
import { Panel } from '@/components/shared/ui-kit'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { SupplierInvoice } from '@/lib/supplier-invoices'

export interface InvoiceSupplier {
  id: string
  name: string
  /** What this requisition's lines ask of the supplier. */
  requisitioned: number
}

export interface InvoiceDocument {
  id: string
  file_name: string
}

const field =
  'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const labelClass = 'mb-1 block text-xs font-medium text-muted-foreground'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' })

/** How an invoiced total compares with what was requisitioned, in words. */
function reconcile(requisitioned: number, invoiced: number, count: number) {
  if (count === 0) return { label: 'No invoice yet', tone: 'text-muted-foreground' }
  const diff = Math.round((invoiced - requisitioned) * 100) / 100
  if (diff === 0) return { label: 'Matches the requisition', tone: 'text-emerald-600 dark:text-emerald-400' }
  if (diff > 0) return { label: `${formatCurrency(diff)} above the requisition`, tone: 'text-destructive' }
  return { label: `${formatCurrency(-diff)} still to invoice`, tone: 'text-amber-600 dark:text-amber-400' }
}

/**
 * The supplier invoices recorded against a requisition, and the form to record
 * another. Shown to every stage; Supply Chain and Cost Control may add one from
 * the moment the requisition reaches pricing — including after it closes, which
 * is when most invoices actually arrive — and Cost Control verifies.
 */
export default function SupplierInvoicesPanel({
  requestId,
  invoices,
  suppliers,
  documents,
  canRecord,
  canVerify,
  viewerId,
  viewerIsElevated,
}: {
  requestId: string
  invoices: SupplierInvoice[]
  suppliers: InvoiceSupplier[]
  documents: InvoiceDocument[]
  canRecord: boolean
  canVerify: boolean
  viewerId: string
  viewerIsElevated: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    supplierId: suppliers.length === 1 ? suppliers[0].id : '',
    invoiceNumber: '',
    invoiceDate: today(),
    amount: '',
    attachmentId: '',
    notes: '',
  })

  /** Open the form against a document already attached to the requisition. */
  const openWith = (attachmentId: string) => {
    setForm((f) => ({ ...f, attachmentId }))
    setError('')
    setOpen(true)
  }

  const send = async (key: string, init: RequestInit, url = `/api/requests/${requestId}/invoices`) => {
    if (busy) return false
    setBusy(key)
    setError('')
    try {
      const res = await fetch(url, init)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'That could not be saved.')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Network error — nothing was saved.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const record = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await send('record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    })
    if (ok) {
      setForm((f) => ({ ...f, invoiceNumber: '', amount: '', attachmentId: '', notes: '' }))
      setOpen(false)
    }
  }

  /**
   * Attached documents that read as invoices but have no invoice record.
   *
   * Before these records existed an invoice was only ever a file, so the whole
   * backlog sits in the attachments: a PDF with a supplier, a number, a date
   * and an amount printed on its face and stored nowhere. No migration can
   * lift those out — a filename carries no amount — so the panel points at
   * them and prefills the form with the document, leaving a person to read off
   * the four figures that matter. That keeps the ledger something a human
   * asserted rather than something a script guessed.
   */
  const linked = new Set(invoices.map((i) => i.attachment_id).filter((id): id is string => Boolean(id)))
  const unrecorded =
    canRecord && suppliers.length > 0
      ? documents.filter((d) => !linked.has(d.id) && /invoice|\binv[\s._-]*\d/i.test(d.file_name))
      : []

  const rows = suppliers.map((s) => {
    const mine = invoices.filter((i) => i.supplier_id === s.id)
    const invoiced = mine.reduce((sum, i) => sum + i.amount, 0)
    return { ...s, invoiced, count: mine.length, ...reconcile(s.requisitioned, invoiced, mine.length) }
  })

  return (
    <Panel
      title="Supplier invoices"
      icon={<Receipt size={15} />}
      action={
        canRecord && suppliers.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Plus size={14} /> Record invoice
          </button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border-2 border-destructive bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        {unrecorded.length > 0 && !open && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-foreground">
              <FileText size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              {unrecorded.length === 1
                ? 'One attached document looks like an invoice but has not been recorded as one.'
                : `${unrecorded.length} attached documents look like invoices but have not been recorded as ones.`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Recording one reads its supplier, number, date and amount into the ledger, so it counts towards supplier
              spend and the same invoice cannot be paid twice.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {unrecorded.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => openWith(d.id)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Plus size={13} className="shrink-0" />
                  <span className="truncate">{d.file_name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {open && canRecord && (
          <form onSubmit={record} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Supplier</label>
              <select
                required
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className={field}
              >
                <option value="">Select the supplier who issued it…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — requisitioned {formatCurrency(s.requisitioned)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Invoice number</label>
              <input
                required
                maxLength={80}
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                placeholder="As printed on the invoice"
                className={field}
              />
            </div>
            <div>
              <label className={labelClass}>Invoice date</label>
              <input
                required
                type="date"
                max={today()}
                value={form.invoiceDate}
                onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={labelClass}>Amount (GHS)</label>
              <input
                required
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                className={`${field} tabular-nums`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Attached document (optional)</label>
              <select
                value={form.attachmentId}
                onChange={(e) => setForm({ ...form, attachmentId: e.target.value })}
                className={field}
              >
                <option value="">None — the document is not attached yet</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.file_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 xl:col-span-4">
              <label className={labelClass}>Note (optional)</label>
              <input
                maxLength={500}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={field}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                disabled={busy !== null}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy === 'record' && <Loader2 size={15} className="animate-spin" />}
                Save invoice
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Per supplier: what was asked for against what has been invoiced. */}
        <div className="divide-y divide-border/60 rounded-xl border border-border">
          {rows.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No supplier is assigned to a line yet
              {canRecord ? ' — assign one on the requisition’s lines before recording its invoice.' : '.'}
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
              <p className="min-w-0 truncate text-sm font-medium text-foreground">{r.name}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                Requisitioned {formatCurrency(r.requisitioned)} · Invoiced {formatCurrency(r.invoiced)}
              </p>
              <p className={`text-xs font-semibold ${r.tone}`}>{r.label}</p>
            </div>
          ))}
        </div>

        {invoices.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {invoices.map((i) => {
              const canRemove = canRecord && i.status !== 'verified' && (i.recorded_by === viewerId || viewerIsElevated)
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {i.invoice_number} <span className="font-normal text-muted-foreground">· {i.supplier_name}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {formatDateShort(i.invoice_date)}
                      {i.attachment_name && (
                        <span className="inline-flex items-center gap-1">
                          <FileText size={11} /> {i.attachment_name}
                        </span>
                      )}
                      {i.recorded_by_name && <span>recorded by {i.recorded_by_name}</span>}
                    </p>
                    {i.notes && <p className="mt-0.5 text-xs text-muted-foreground">{i.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(i.amount)}</span>
                    {i.status === 'verified' ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400" title={i.verified_by_name ? `Verified by ${i.verified_by_name}` : undefined}>
                        <BadgeCheck size={12} /> Verified
                      </span>
                    ) : (
                      <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Awaiting verification
                      </span>
                    )}
                    {canVerify && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          send(i.id, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ invoiceId: i.id, action: i.status === 'verified' ? 'unverify' : 'verify' }),
                          })
                        }
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        {busy === i.id ? <Loader2 size={13} className="animate-spin" /> : i.status === 'verified' ? <Undo2 size={13} /> : <BadgeCheck size={13} />}
                        {i.status === 'verified' ? 'Un-verify' : 'Verify'}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        aria-label={`Remove invoice ${i.invoice_number}`}
                        onClick={() => {
                          if (confirm(`Remove invoice ${i.invoice_number}? Only do this if it was recorded in error.`)) {
                            send(i.id, { method: 'DELETE' }, `/api/requests/${requestId}/invoices?invoiceId=${i.id}`)
                          }
                        }}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}

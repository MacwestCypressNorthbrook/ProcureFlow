'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, FileCheck2, FileText, FileUp, Loader2, Pencil, Save, Trash2, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { uploadDocument } from '@/lib/upload-client'

export interface EditablePo {
  id: string
  po_number: string | null
  vendor_name: string | null
  total_amount: number | null
  file_name: string | null
}

/**
 * Edit and Delete for one attached purchase order — the Administrator's way to
 * follow an Odoo PO that was revised, reissued or cancelled after attaching.
 */
export default function PoRowActions({
  requestId,
  po,
  isLastOnCompleted,
}: {
  requestId: string
  po: EditablePo
  /** Deleting it sends the requisition back to the Administrator's queue. */
  isLastOnCompleted: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    const warning = isLastOnCompleted
      ? `Delete PO #${po.po_number}?\n\nIt is the only purchase order on this completed requisition, so the requisition goes back to the Administrator's queue until a replacement is attached.`
      : `Delete PO #${po.po_number}? Its document is removed as well.`
    if (!confirm(warning)) return
    const reason = prompt('Reason for deleting (optional) — shown in the requisition history:') ?? ''
    setDeleting(true)
    setError(null)
    try {
      const qs = reason.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : ''
      const res = await fetch(`/api/requests/${requestId}/pos/${po.id}${qs}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'The purchase order could not be deleted.')
        return
      }
      router.refresh()
    } catch {
      setError('Network error — nothing was deleted.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Pencil size={12} /> Edit
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
        </button>
      </div>
      {error && <p role="alert" className="text-[11px] font-medium text-destructive">{error}</p>}
      {editing && (
        <EditPoDrawer requestId={requestId} po={po} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

function EditPoDrawer({ requestId, po, onClose }: { requestId: string; po: EditablePo; onClose: () => void }) {
  const router = useRouter()
  const [poNumber, setPoNumber] = useState(po.po_number ?? '')
  const [vendorName, setVendorName] = useState(po.vendor_name ?? '')
  const [amount, setAmount] = useState(po.total_amount != null ? String(po.total_amount) : '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!poNumber.trim()) {
      setError('The PO number cannot be blank.')
      return
    }
    setError(null)
    setBusy('Saving…')
    try {
      const body: Record<string, unknown> = {
        po_number: poNumber.trim(),
        vendor_name: vendorName.trim(),
        total_amount: amount.trim(),
      }
      let res: Response
      if (file) {
        const uploaded = await uploadDocument(file, {
          scope: `po-docs/${requestId}`,
          onProgress: (p) => setBusy(`Uploading — ${p}%`),
        })
        setBusy('Saving…')
        if (uploaded.viaServer || !uploaded.key) {
          const form = new FormData()
          for (const [k, v] of Object.entries(body)) form.append(k, String(v))
          form.append('file', file)
          res = await fetch(`/api/requests/${requestId}/pos/${po.id}`, { method: 'PATCH', body: form })
        } else {
          res = await fetch(`/api/requests/${requestId}/pos/${po.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...body,
              file_name: uploaded.fileName,
              file_url: uploaded.key,
              file_size: uploaded.fileSize,
              file_type: uploaded.contentType,
            }),
          })
        }
      } else {
        res = await fetch(`/api/requests/${requestId}/pos/${po.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'The purchase order could not be updated.')
        return
      }
      onClose()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Network error — nothing was changed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !busy && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col h-full bg-card border-l border-border">
        <div className="border-b border-border/80 px-6 py-5">
          <SheetHeader className="p-0 space-y-1">
            <SheetTitle className="text-lg font-bold text-foreground">Edit PO #{po.po_number}</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Correct the details to match the revised Odoo PO, or replace its PDF. Every change is recorded in the
              requisition history.
            </SheetDescription>
          </SheetHeader>
        </div>

        <form id="edit-po-form" onSubmit={save} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <fieldset disabled={Boolean(busy)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                Odoo PO Number / Reference <span className="text-destructive">*</span>
              </label>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="h-10 text-sm font-medium" />
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Supplier / Vendor</label>
                <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Committed PO Amount (GHS)</label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 text-xs font-semibold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">PO PDF document</label>
              {file ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/[0.04] p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileCheck2 size={18} className="shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground">Replaces the current document on save</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Keep the current document"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={18} className="shrink-0 text-violet-600 dark:text-violet-400" />
                    <p className="truncate text-xs font-semibold text-foreground">{po.file_name ?? 'No document'}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    <FileUp size={13} /> Re-upload
                    <input
                      type="file"
                      accept="application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const picked = e.target.files?.[0]
                        if (!picked) return
                        if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) {
                          setError('Please upload a PDF document for the Purchase Order.')
                          return
                        }
                        setError(null)
                        setFile(picked)
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </fieldset>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>

        <div className="flex flex-col items-center gap-2.5 border-t border-border/80 bg-card p-5 sm:flex-row">
          <button
            type="submit"
            form="edit-po-form"
            disabled={Boolean(busy)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-1"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {busy ?? 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

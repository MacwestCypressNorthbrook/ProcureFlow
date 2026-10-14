'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingBag,
  FileText,
  Check,
  X,
  AlertCircle,
  Loader2,
  FileCheck2,
  Building2,
  Coins,
  FileUp,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { uploadDocument } from '@/lib/upload-client'
import PoSupplierField, { type PoSupplierOption } from './PoSupplierField'

export interface AttachPODrawerProps {
  isOpen: boolean
  onClose: () => void
  requestId: string
  requestSummary: {
    purpose: string
    department?: string
    projectName?: string
    totalAmount?: number
    currency?: string
    suggestedSupplier?: string
    itemCount?: number
    requesterName?: string
    /**
     * What each supplier on the requisition is down to supply. With more than
     * one, the drawer starts with one purchase order per supplier — that is how
     * Odoo raises them.
     */
    supplierSplits?: { id?: string; name: string; amount: number }[]
    /** Every supplier on the requisition — the choices in each order's supplier picker. */
    suppliers?: PoSupplierOption[]
  }
  existingPo?: {
    po_number?: string | null
    vendor_name?: string | null
    supplier_id?: string | null
    total_amount?: number | null
    file_name?: string | null
    file_path?: string | null
  } | null
  /**
   * `complete` (the default) closes the requisition on submit. `append` adds
   * further orders to a requisition the Administrator already completed.
   */
  mode?: 'complete' | 'append'
  onSuccess?: () => void
}

interface Entry {
  key: number
  poNumber: string
  supplierId: string | null
  vendorName: string
  amount: string
  file: File | null
  /** Already on the server, so a new file is optional. */
  existingFileName: string | null
}

let nextKey = 1
const blankEntry = (vendorName = '', amount = '', supplierId: string | null = null): Entry => ({
  key: nextKey++,
  poNumber: '',
  supplierId,
  vendorName,
  amount,
  file: null,
  existingFileName: null,
})

function initialEntries({
  existingPo,
  requestSummary,
  mode,
}: Pick<AttachPODrawerProps, 'existingPo' | 'requestSummary' | 'mode'>): Entry[] {
  if (mode === 'append') {
    // Suppliers no PO covers yet — the likely reason another one is being added.
    const open = requestSummary.supplierSplits ?? []
    return open.length > 0
      ? open.map((s) => blankEntry(s.name, s.amount ? String(Math.round(s.amount * 100) / 100) : '', s.id ?? null))
      : [blankEntry()]
  }
  if (existingPo?.po_number) {
    return [
      {
        key: nextKey++,
        poNumber: existingPo.po_number,
        supplierId: existingPo.supplier_id ?? null,
        vendorName: existingPo.vendor_name || requestSummary.suggestedSupplier || '',
        amount: existingPo.total_amount != null ? String(existingPo.total_amount) : '',
        file: null,
        existingFileName: existingPo.file_path ? existingPo.file_name || 'Attached PO' : null,
      },
    ]
  }
  const splits = requestSummary.supplierSplits ?? []
  if (splits.length > 1) {
    return splits.map((s) => blankEntry(s.name, s.amount ? String(Math.round(s.amount * 100) / 100) : '', s.id ?? null))
  }
  return [
    blankEntry(
      splits[0]?.name || requestSummary.suggestedSupplier || '',
      requestSummary.totalAmount ? String(requestSummary.totalAmount) : '',
      splits[0]?.id ?? null
    ),
  ]
}

const isPdf = (file: File) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

export default function AttachPODrawer({
  isOpen,
  onClose,
  requestId,
  requestSummary,
  existingPo,
  mode = 'complete',
  onSuccess,
}: AttachPODrawerProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>(() => initialEntries({ existingPo, requestSummary, mode }))
  const [progress, setProgress] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<number | null>(null)

  const appending = mode === 'append'

  const update = (key: number, patch: Partial<Entry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)))

  const pickFile = (key: number, file: File | undefined) => {
    if (!file) return
    if (!isPdf(file)) {
      setError('Please upload a PDF document for the Purchase Order.')
      return
    }
    update(key, { file })
    setError(null)
  }

  const combined = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const ready = entries.every((e) => e.poNumber.trim() && (e.file || e.existingFileName))

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setError(null)

    const missingNumber = entries.findIndex((e) => !e.poNumber.trim())
    if (missingNumber >= 0) {
      setError(
        entries.length > 1
          ? `Purchase order ${missingNumber + 1} needs its Odoo reference (e.g. PO00412).`
          : 'Please provide the Odoo Purchase Order Reference / Number (e.g. PO00412).'
      )
      return
    }
    const numbers = entries.map((e) => e.poNumber.trim().toLowerCase())
    if (new Set(numbers).size !== numbers.length) {
      setError('Each purchase order needs its own PO number — two entries share one.')
      return
    }

    setIsSubmitting(true)

    try {
      // Send each PDF straight to storage when we can, so a dropped connection
      // costs one retry of that file rather than the whole submission.
      const orders: Record<string, unknown>[] = []
      const serverFiles: { index: number; file: File }[] = []
      const withFiles = entries.filter((e) => e.file).length
      let uploadedCount = 0

      for (const [index, entry] of entries.entries()) {
        const order: Record<string, unknown> = {
          po_number: entry.poNumber.trim(),
          vendor_name: entry.vendorName.trim() || undefined,
          supplier_id: entry.supplierId || undefined,
          total_amount: entry.amount.trim() || undefined,
        }
        if (entry.file) {
          uploadedCount += 1
          const label = withFiles > 1 ? `Uploading ${uploadedCount} of ${withFiles}` : 'Uploading'
          setProgress(`${label}…`)
          const uploaded = await uploadDocument(entry.file, {
            scope: `po-docs/${requestId}`,
            onProgress: (p) => setProgress(`${label} — ${p}%`),
          })
          if (uploaded.viaServer || !uploaded.key) {
            serverFiles.push({ index, file: entry.file })
          } else {
            order.file_name = uploaded.fileName
            order.file_url = uploaded.key
            order.file_size = uploaded.fileSize
            order.file_type = uploaded.contentType
          }
        }
        orders.push(order)
      }

      setProgress(appending ? 'Attaching…' : 'Authorizing…')

      let res: Response
      if (serverFiles.length === 0) {
        // Every file is already in storage; only references travel now.
        res = await fetch(`/api/requests/${requestId}/attach-po`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders, comment: comment.trim() || undefined, approve: true }),
        })
      } else {
        const formData = new FormData()
        formData.append('orders', JSON.stringify(orders))
        if (comment.trim()) formData.append('comment', comment.trim())
        formData.append('approve', 'true')
        for (const { index, file } of serverFiles) formData.append(`file_${index}`, file)
        res = await fetch(`/api/requests/${requestId}/attach-po`, { method: 'POST', body: formData })
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to attach the purchase order. Please try again.')
        return
      }

      setEntries(initialEntries({ existingPo: null, requestSummary, mode: 'append' }))
      setComment('')
      onClose()
      onSuccess?.()
      router.refresh()
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : 'Network error: Could not complete PO upload.'
      )
    } finally {
      setIsSubmitting(false)
      setProgress(null)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] p-0 flex flex-col h-full bg-card border-l border-border shadow-2xl"
      >
        {/* Drawer Header */}
        <div className="border-b border-border/80 px-6 py-5 bg-gradient-to-b from-muted/50 to-muted/20">
          <SheetHeader className="p-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                <ShoppingBag size={17} />
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Administrator Action
              </span>
            </div>
            <SheetTitle className="text-lg font-bold text-foreground">
              {appending ? 'Attach another purchase order' : 'Attach Odoo Purchase Orders'}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
              {appending
                ? 'This requisition is already completed. Attach any further Odoo POs raised against it — everyone on the chain is notified.'
                : 'Upload each official PO generated from Odoo — one per supplier when the materials are split. Attaching them authorizes the requisition and closes it; everyone on the chain is notified.'}
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Requisition Context Pill */}
        <div className="px-6 py-3.5 bg-muted/30 border-b border-border/60">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Target Requisition
          </div>
          <div className="text-sm font-bold text-foreground truncate">{requestSummary.purpose}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {requestSummary.projectName && (
              <>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Building2 size={12} />
                  <span>{requestSummary.projectName}</span>
                </span>
                <span className="text-muted-foreground/40">•</span>
              </>
            )}
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <Coins size={12} className="text-primary" />
              <span>{formatCurrency(requestSummary.totalAmount || 0)}</span>
            </span>
            {requestSummary.itemCount !== undefined && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-muted-foreground">
                  {requestSummary.itemCount} item{requestSummary.itemCount === 1 ? '' : 's'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Form Body */}
        <form id="attach-po-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {entries.map((entry, index) => (
            <fieldset
              key={entry.key}
              disabled={isSubmitting}
              className="space-y-3.5 rounded-xl border border-border bg-background/40 p-4"
            >
              <div className="flex items-center justify-between">
                <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {entries.length > 1 ? `Purchase order ${index + 1}` : 'Purchase order'}
                </legend>
                {entries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setEntries((list) => list.filter((e) => e.key !== entry.key))}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600"
                    title="Remove this purchase order"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>

              {/* PO Reference Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>
                    Odoo PO Number / Reference <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">e.g. PO00412</span>
                </label>
                <Input
                  required
                  placeholder="e.g. PO00412"
                  value={entry.poNumber}
                  onChange={(e) => update(entry.key, { poNumber: e.target.value })}
                  className="h-10 text-sm font-medium"
                />
              </div>

              {/* Vendor and Amount 2-Column Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Supplier</label>
                  <PoSupplierField
                    suppliers={requestSummary.suppliers ?? []}
                    value={{ supplierId: entry.supplierId, vendorName: entry.vendorName }}
                    onChange={(next) => update(entry.key, next)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Committed PO Amount (GHS)</label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={entry.amount}
                    onChange={(e) => update(entry.key, { amount: e.target.value })}
                    className="h-9 text-xs font-semibold"
                  />
                </div>
              </div>

              {/* File */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground">
                  Odoo PO PDF Document <span className="text-destructive">*</span>
                </label>

                {entry.file ? (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-primary/40 bg-primary/[0.04]">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileCheck2 size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{entry.file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(entry.file.size / 1024).toFixed(1)} KB • PDF document
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => update(entry.key, { file: null })}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Remove file"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : entry.existingFileName ? (
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{entry.existingFileName}</p>
                        <p className="text-[10px] text-muted-foreground">Attached Odoo PO PDF</p>
                      </div>
                    </div>
                    <label className="cursor-pointer text-xs font-semibold text-primary hover:underline">
                      <span>Replace</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => pickFile(entry.key, e.target.files?.[0])}
                        className="sr-only"
                      />
                    </label>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragKey(entry.key)
                    }}
                    onDragLeave={() => setDragKey(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragKey(null)
                      pickFile(entry.key, e.dataTransfer.files?.[0])
                    }}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-all cursor-pointer ${
                      dragKey === entry.key
                        ? 'border-primary bg-primary/[0.05]'
                        : 'border-border/80 hover:border-primary/50 hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => {
                        pickFile(entry.key, e.target.files?.[0])
                        e.target.value = ''
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2">
                      <FileUp size={20} />
                    </div>
                    <p className="text-xs font-bold text-foreground">Click to browse or drop the Odoo PO PDF here</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">PDF up to 10MB</p>
                  </div>
                )}
              </div>
            </fieldset>
          ))}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setEntries((list) => [...list, blankEntry()])}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 text-xs font-semibold text-primary transition-colors hover:bg-primary/[0.05] disabled:opacity-50"
          >
            <Plus size={15} />
            Add another purchase order
          </button>

          {entries.length > 1 && (
            <div className="flex items-baseline justify-between rounded-xl bg-muted/40 px-4 py-2.5 text-xs">
              <span className="font-semibold text-muted-foreground">
                {entries.length} purchase orders · combined
              </span>
              <span className="font-bold tabular-nums text-foreground">{formatCurrency(combined)}</span>
            </div>
          )}

          {/* Closing note, sent to everyone on the requisition */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {appending ? 'Note (Optional)' : 'Closing Notes (Optional)'}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Add any context, vendor payment terms, or budget code..."
              className="w-full resize-none rounded-xl border border-input bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {/* Sticky Drawer Footer */}
        <div className="border-t border-border/80 p-5 bg-card flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="submit"
            form="attach-po-form"
            disabled={isSubmitting || !ready}
            className="inline-flex h-11 w-full sm:flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-500 hover:shadow-lg disabled:opacity-50 press-active"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>{progress ?? 'Working…'}</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>
                  {appending
                    ? entries.length > 1
                      ? `Attach ${entries.length} purchase orders`
                      : 'Attach purchase order'
                    : entries.length > 1
                      ? `Authorize & Complete (${entries.length} POs)`
                      : 'Authorize & Complete'}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl border border-border px-4 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

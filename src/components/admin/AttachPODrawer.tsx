'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingBag,
  FileText,
  Upload,
  Check,
  X,
  AlertCircle,
  Loader2,
  FileCheck2,
  Building2,
  Coins,
  FileUp,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'

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
  }
  existingPo?: {
    po_number?: string | null
    vendor_name?: string | null
    total_amount?: number | null
    file_name?: string | null
    file_path?: string | null
  } | null
  onSuccess?: () => void
}

export default function AttachPODrawer({
  isOpen,
  onClose,
  requestId,
  requestSummary,
  existingPo,
  onSuccess,
}: AttachPODrawerProps) {
  const router = useRouter()
  const [poNumber, setPoNumber] = useState(existingPo?.po_number || '')
  const [vendorName, setVendorName] = useState(
    existingPo?.vendor_name || requestSummary.suggestedSupplier || ''
  )
  const [totalAmount, setTotalAmount] = useState(
    existingPo?.total_amount
      ? String(existingPo.total_amount)
      : requestSummary.totalAmount
        ? String(requestSummary.totalAmount)
        : ''
  )
  const [file, setFile] = useState<File | null>(null)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0]
      if (selected.type === 'application/pdf' || selected.name.endsWith('.pdf')) {
        setFile(selected)
        setError(null)
      } else {
        setError('Please upload a PDF document for the Purchase Order.')
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0]
      setFile(selected)
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!poNumber.trim()) {
      setError('Please provide the Odoo Purchase Order Reference / Number (e.g. PO00412).')
      return
    }

    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('po_number', poNumber.trim())
      if (vendorName.trim()) formData.append('vendor_name', vendorName.trim())
      if (totalAmount.trim()) formData.append('total_amount', totalAmount.trim())
      if (comment.trim()) formData.append('comment', comment.trim())
      formData.append('approve', 'true')

      if (file) {
        formData.append('file', file)
      }

      const res = await fetch(`/api/requests/${requestId}/attach-po`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to attach Purchase Order. Please try again.')
        return
      }

      onClose()
      onSuccess?.()
      router.refresh()
    } catch {
      setError('Network error: Could not complete PO upload.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[540px] p-0 flex flex-col h-full bg-card border-l border-border shadow-2xl"
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
              Attach Odoo Purchase Order
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
              Upload the official PO generated from your Odoo system and forward this requisition directly to Cost Control.
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Requisition Context Pill */}
        <div className="px-6 py-3.5 bg-muted/30 border-b border-border/60">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Target Requisition
          </div>
          <div className="text-sm font-bold text-foreground truncate">
            {requestSummary.purpose}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {requestSummary.projectName && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Building2 size={12} />
                <span>{requestSummary.projectName}</span>
              </span>
            )}
            <span className="text-muted-foreground/40">•</span>
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
        <form id="attach-po-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* PO Reference Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center justify-between">
              <span>Odoo PO Number / Reference <span className="text-destructive">*</span></span>
              <span className="text-[10px] text-muted-foreground font-normal">e.g. PO00412</span>
            </label>
            <Input
              required
              placeholder="e.g. PO00412"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="h-10 text-sm font-medium"
              disabled={isSubmitting}
            />
            <p className="text-[11px] text-muted-foreground">
              The matching reference generated in your Odoo procurement module.
            </p>
          </div>

          {/* Vendor and Amount 2-Column Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Supplier / Vendor
              </label>
              <Input
                placeholder="Vendor name"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="h-9 text-xs"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Committed PO Amount (GHS)
              </label>
              <Input
                type="number"
                step="any"
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="h-9 text-xs font-semibold"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* File Upload Dropzone */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground flex items-center justify-between">
              <span>Odoo PO PDF Document <span className="text-[11px] font-normal text-muted-foreground">(optional — auto-generates voucher if empty)</span></span>
              {existingPo?.file_name && !file && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  Currently Attached
                </span>
              )}
            </label>

            {file ? (
              /* Selected file card */
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-primary/40 bg-primary/[0.04]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileCheck2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB • PDF document
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Remove file"
                >
                  <X size={15} />
                </button>
              </div>
            ) : existingPo?.file_name ? (
              /* Existing PO file card */
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/40">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{existingPo.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">Attached Odoo PO PDF</p>
                  </div>
                </div>
                <label className="cursor-pointer text-xs font-semibold text-primary hover:underline">
                  <span>Replace</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="sr-only"
                    disabled={isSubmitting}
                  />
                </label>
              </div>
            ) : (
              /* Drag & drop dropzone */
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-primary bg-primary/[0.05]'
                    : 'border-border/80 hover:border-primary/50 hover:bg-muted/40'
                }`}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={isSubmitting}
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-2.5">
                  <FileUp size={22} />
                </div>
                <p className="text-xs font-bold text-foreground">
                  Click to browse or drop your Odoo PO PDF here
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Accepts PDF files up to 20MB
                </p>
              </div>
            )}
          </div>

          {/* Comment / Note for Cost Control */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Reviewer Notes for Cost Control (Optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Add any context, vendor payment terms, or budget code for Cost Control..."
              className="w-full resize-none rounded-xl border border-input bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isSubmitting}
            />
          </div>

          {/* Error Message */}
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
            disabled={isSubmitting || !poNumber.trim() || (!existingPo?.file_path && !file)}
            className="inline-flex h-11 w-full sm:flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-md transition-all hover:bg-emerald-500 hover:shadow-lg disabled:opacity-50 press-active"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Uploading & Approving...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Approve & Route to Cost Control</span>
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

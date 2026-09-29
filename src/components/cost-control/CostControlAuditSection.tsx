'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Eye, Download, ExternalLink, Upload, Loader2, AlertCircle, FileCheck, CheckCircle2, XCircle, Check, X } from 'lucide-react'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { documentUrl } from '@/lib/files'
import { formatCurrency } from '@/lib/utils'
import type { ReviewDocument } from '@/components/shared/ApprovalPanel'
import type { RequestItemRow } from '@/lib/review'

interface CostControlInvoicesSectionProps {
  requestId: string
  documents: ReviewDocument[]
  canAct: boolean
  department?: string | null
  projectName?: string | null
  notes?: string | null
}

export function CostControlInvoicesSection({
  requestId,
  documents,
  canAct,
  department,
  projectName,
  notes,
  compact = false,
}: CostControlInvoicesSectionProps & { compact?: boolean }) {
  const router = useRouter()
  const [previewDoc, setPreviewDoc] = useState<{
    name: string
    url: string
    downloadUrl: string
  } | null>(null)

  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [decliningDocId, setDecliningDocId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null)

  const uploadDocument = async (file: File | undefined) => {
    if (!file) return
    setUploadingDoc(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/requests/${requestId}/attachments`, {
        method: 'POST',
        body: form,
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadError(payload.error ?? 'Could not attach audit document.')
        return
      }
      router.refresh()
    } catch {
      setUploadError('Network error — document was not attached.')
    } finally {
      setUploadingDoc(false)
    }
  }

  const handleReview = async (attachmentId: string, action: 'accept' | 'decline' | 'reset', reason?: string) => {
    setReviewingId(attachmentId)
    setFeedback(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/attachments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId, action, notes: reason }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback({ msg: payload.error || 'Failed to update invoice.', ok: false })
        return
      }
      setDecliningDocId(null)
      setDeclineReason('')
      setFeedback({
        msg:
          action === 'accept'
            ? 'Vendor quote accepted & acknowledged. Supply Chain has been notified.'
            : action === 'decline'
            ? 'Vendor quote marked as declined. Supply Chain notified.'
            : 'Quote status reset to pending audit.',
        ok: true,
      })
      router.refresh()
    } catch {
      setFeedback({ msg: 'Network error while reviewing invoice.', ok: false })
    } finally {
      setReviewingId(null)
    }
  }

  const handleAcceptAll = async () => {
    setReviewingId('all')
    setFeedback(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/attachments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_all' }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFeedback({ msg: payload.error || 'Failed to accept quotes.', ok: false })
        return
      }
      setFeedback({
        msg: 'All vendor quotes & invoices accepted and acknowledged for procurement!',
        ok: true,
      })
      router.refresh()
    } catch {
      setFeedback({ msg: 'Network error while accepting all quotes.', ok: false })
    } finally {
      setReviewingId(null)
    }
  }

  const totalDocs = documents.length
  const acceptedDocs = documents.filter((d) => d.status === 'accepted')
  const declinedDocs = documents.filter((d) => d.status === 'declined')
  const pendingDocs = documents.filter((d) => !d.status || d.status === 'pending')

  return (
    <div className="space-y-4">
      {/* Document preview modal */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          fileName={previewDoc.name}
          fileUrl={previewDoc.url}
          downloadUrl={previewDoc.downloadUrl}
        />
      )}

      {/* ── Context & Sourcing Highlights (Clean & Compact) ── */}
      {!compact && (department || projectName || notes) && (
        <div className="rounded-xl border border-border bg-card/60 p-3.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {department && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-medium">Department:</span>
                  <span className="font-bold text-foreground">{department}</span>
                </div>
              )}
              {department && projectName && (
                <span className="text-muted-foreground/40 hidden sm:inline">•</span>
              )}
              {projectName && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-medium">Project Site:</span>
                  <span className="font-bold text-foreground">{projectName}</span>
                </div>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground">
              {totalDocs > 1 ? (
                <span className="font-medium">
                  Multi-vendor sourcing ({totalDocs} quotes attached)
                </span>
              ) : totalDocs === 1 ? (
                <span className="font-medium">Single vendor quote attached</span>
              ) : null}
            </div>
          </div>

          {notes && (
            <div className="mt-2.5 pt-2 border-t border-border/50 text-xs flex items-baseline gap-2">
              <span className="text-muted-foreground font-semibold shrink-0">Requester Note:</span>
              <p className="text-foreground italic leading-relaxed">
                &ldquo;{notes}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Supporting Invoices & Sourcing Showcase ───────────────────── */}
      <section className="@container surface rounded-2xl border border-border overflow-hidden shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/70 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileCheck size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  Vendor Invoices & Quotations
                </h3>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {totalDocs} attached
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Review and acknowledge supplier quotes sourced by Supply Chain.
              </p>
            </div>
          </div>

          {canAct && (
            <div className="flex items-center gap-2">
              {pendingDocs.length > 0 && totalDocs > 1 && (
                <button
                  type="button"
                  disabled={reviewingId !== null}
                  onClick={handleAcceptAll}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300 cursor-pointer disabled:opacity-50"
                  title="Acknowledge and accept all pending vendor quotes at once"
                >
                  {reviewingId === 'all' ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  Accept All ({pendingDocs.length}) Quotes
                </button>
              )}

              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                {uploadingDoc ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                Attach Note
                <input
                  type="file"
                  className="sr-only"
                  disabled={uploadingDoc}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    uploadDocument(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {uploadError && (
          <p className="border-b border-border bg-destructive/10 px-5 py-2 text-xs font-medium text-destructive">
            {uploadError}
          </p>
        )}

        {feedback && (
          <div
            className={`border-b border-border px-5 py-2.5 text-xs font-semibold flex items-center justify-between ${
              feedback.ok
                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            <span>{feedback.msg}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <div className="p-4 sm:p-5 space-y-4">
          {/* Sourcing Summary Bar */}
          {totalDocs > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                {declinedDocs.length > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                    <XCircle size={14} /> {declinedDocs.length} declined
                  </span>
                ) : null}
                {acceptedDocs.length > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={14} /> {acceptedDocs.length} accepted & acknowledged
                  </span>
                ) : null}
                {pendingDocs.length > 0 ? (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                    <AlertCircle size={14} /> {pendingDocs.length} pending audit
                  </span>
                ) : null}
              </div>

              <div className="text-[11px] text-muted-foreground">
                {acceptedDocs.length === totalDocs ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Ready for authorization
                  </span>
                ) : (
                  <span>Cost Control can accept multiple vendor quotes</span>
                )}
              </div>
            </div>
          )}

          {/* Cards Grid */}
          {totalDocs === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-amber-900 dark:text-amber-200">
              <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  No vendor invoices or quotations attached
                </p>
                <p className="mt-0.5 text-muted-foreground leading-relaxed">
                  Supply Chain has not uploaded supporting vendor documents for this requisition.
                  If your policy requires attached quotes before approval, you can send this back with a note.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
              {documents.map((doc) => {
                const isPdf = doc.file_name.toLowerCase().endsWith('.pdf')
                const isImage =
                  doc.file_name.toLowerCase().endsWith('.png') ||
                  doc.file_name.toLowerCase().endsWith('.jpg') ||
                  doc.file_name.toLowerCase().endsWith('.jpeg') ||
                  doc.file_name.toLowerCase().endsWith('.webp')

                const isAccepted = doc.status === 'accepted'
                const isDeclined = doc.status === 'declined'
                const isPending = !doc.status || doc.status === 'pending'

                return (
                  <div
                    key={doc.id}
                    className={`flex flex-col justify-between rounded-xl p-3.5 sm:p-4 transition-all space-y-3 ${
                      isAccepted
                        ? 'border-2 border-emerald-500/80 bg-emerald-500/[0.04] shadow-xs ring-1 ring-emerald-500/20'
                        : isDeclined
                        ? 'border border-rose-500/40 bg-rose-500/[0.03]'
                        : 'border border-border bg-card hover:border-primary/40 hover:shadow-xs'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                              isAccepted
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : isDeclined
                                ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                : 'bg-muted text-foreground'
                            }`}
                          >
                            <FileText
                              size={18}
                              className={
                                isAccepted
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isDeclined
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : isPdf
                                  ? 'text-rose-500'
                                  : isImage
                                  ? 'text-blue-500'
                                  : 'text-muted-foreground'
                              }
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-xs sm:text-sm font-bold text-foreground"
                              title={doc.file_name}
                            >
                              {doc.file_name}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <span className="rounded bg-muted px-1.5 py-0.5 font-semibold uppercase">
                                {isPdf ? 'PDF' : isImage ? 'Image' : 'Doc'}
                              </span>
                              <span>Supporting Quote</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="shrink-0">
                          {isAccepted ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                              <Check size={12} /> Accepted
                            </span>
                          ) : isDeclined ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                              <X size={12} /> Declined
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                              Pending Review
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Review audit metadata */}
                      {doc.reviewed_at && (
                        <div className="text-[11px] text-muted-foreground">
                          {isAccepted ? 'Accepted' : 'Reviewed'} by{' '}
                          <strong className="text-foreground font-semibold">
                            {doc.reviewer_name || 'Cost Control'}
                          </strong>{' '}
                          on {new Date(doc.reviewed_at).toLocaleDateString()}
                        </div>
                      )}
                      {doc.review_notes && (
                        <div className="text-xs bg-muted/60 p-2 rounded-lg italic text-foreground border border-border/50">
                          <span className="font-semibold not-italic text-muted-foreground">
                            {isDeclined ? 'Decline Reason:' : 'Audit Remark:'}
                          </span>{' '}
                          {doc.review_notes}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-border/60 pt-2.5">
                      {/* Document Viewer Buttons */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc({
                                name: doc.file_name,
                                url: documentUrl(doc.id, doc.file_url),
                                downloadUrl: documentUrl(doc.id, doc.file_url, { download: true }),
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 cursor-pointer"
                          >
                            <Eye size={12} />
                            Preview
                          </button>
                          <a
                            href={documentUrl(doc.id, doc.file_url, { download: true })}
                            download={doc.file_name}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            <Download size={12} />
                            Download
                          </a>
                        </div>
                        <a
                          href={documentUrl(doc.id, doc.file_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Open in new tab"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>

                      {/* Cost Control Decision Buttons */}
                      {canAct && (
                        <div className="pt-1">
                          {decliningDocId === doc.id ? (
                            <div className="space-y-2 rounded-lg border border-border bg-background p-2.5">
                              <p className="text-xs font-semibold text-foreground">
                                Reason for declining this vendor invoice:
                              </p>
                              <textarea
                                value={declineReason}
                                onChange={(e) => setDeclineReason(e.target.value)}
                                placeholder="e.g. Quoted rate exceeds standard budget, delivery terms missing..."
                                className="w-full rounded-md border border-input bg-card p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                rows={2}
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDecliningDocId(null)
                                    setDeclineReason('')
                                  }}
                                  className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={reviewingId !== null}
                                  onClick={() => handleReview(doc.id, 'decline', declineReason)}
                                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                                >
                                  {reviewingId === doc.id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <X size={12} />
                                  )}
                                  Confirm Decline
                                </button>
                              </div>
                            </div>
                          ) : isAccepted ? (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 border border-emerald-500/25">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 size={14} /> Accepted & Acknowledged
                              </span>
                              <button
                                type="button"
                                onClick={() => handleReview(doc.id, 'reset')}
                                className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                              >
                                Change
                              </button>
                            </div>
                          ) : isDeclined ? (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-rose-500/10 px-3 py-1.5 border border-rose-500/25">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                                <XCircle size={14} /> Declined
                              </span>
                              <button
                                type="button"
                                onClick={() => handleReview(doc.id, 'accept')}
                                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                              >
                                Re-evaluate & Accept
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={reviewingId !== null}
                                onClick={() => handleReview(doc.id, 'accept')}
                                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:opacity-50 dark:text-emerald-300 cursor-pointer"
                              >
                                {reviewingId === doc.id ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Check size={13} />
                                )}
                                Accept Quote
                              </button>
                              <button
                                type="button"
                                disabled={reviewingId !== null}
                                onClick={() => setDecliningDocId(doc.id)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-input bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-600 cursor-pointer"
                              >
                                <X size={13} /> Decline
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

interface CostControlAuditTableProps {
  items: RequestItemRow[]
  /**
   * The requester's own justification.
   *
   * It belongs with the lines, not in a card further down the page: it is
   * usually the only statement of WHY the spend is needed, and a reviewer
   * deciding on rates reads it in the same breath as the figures. Kept inside
   * this card so it travels wherever the line items are rendered.
   */
  notes?: string | null
  discountAmount: number
  totalAmount: number
}

export function CostControlAuditTable({
  items,
  notes,
  discountAmount,
  totalAmount,
}: CostControlAuditTableProps) {
  const subtotal = items.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0)
  const discount = Number(discountAmount) || 0
  const total = Math.max(0, subtotal - discount)

  /**
   * A subtotal only says something when a discount follows it.
   *
   * Without one it is the same figure as the total, and the card was printing
   * that number five separate times — a header chip, the line amount, the
   * "1 lump sum x ..." caption, the subtotal and the total. One number, stated
   * once at the line and once at the foot, is the whole job.
   */
  const showSubtotal = discount > 0

  /** Qty x rate is worth saying only when it is not just the amount restated. */
  const rateCaption = (item: RequestItemRow) => {
    const category = item.category || 'material'
    const isLump = category === 'other' || (category === 'labour' && Boolean(item.is_subcontractor))
    if (isLump) return null
    return `${Number(item.quantity)}${item.unit ? ` ${item.unit}` : ''} × ${formatCurrency(Number(item.unit_price) || 0)}`
  }

  return (
    // `@container`: the table falls back to stacked rows on its own width, not
    // the viewport, so it behaves the same whichever column it is placed in.
    <section className="@container surface overflow-hidden rounded-2xl border border-border shadow-xs">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-foreground">
          Line items ({items.length})
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Verify rates, quantities and assigned suppliers against budget.
        </p>
      </div>

      {notes?.trim() && (
        <div className="border-b border-border bg-muted/30 px-5 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Requester&rsquo;s note
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {notes}
          </p>
        </div>
      )}

      {/* ── Narrow: stacked rows ── */}
      <div className="block divide-y divide-border/60 @2xl:hidden">
        {items.map((item, index) => {
          const caption = rateCaption(item)
          return (
            <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
              <span className="mt-0.5 w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-foreground">{item.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[item.supplier_name, caption].filter(Boolean).join(' · ') || '—'}
                </p>
                {item.remarks && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">{item.remarks}</p>
                )}
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                {formatCurrency(Number(item.line_total) || 0)}
              </span>
            </div>
          )
        })}

        <div className="space-y-2 px-5 py-4">
          {showSubtotal && (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Discount</span>
                <span className="tabular-nums">− {formatCurrency(discount)}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatCurrency(total || totalAmount || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Wide: table ── */}
      <div className="hidden @2xl:block">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="h-10 w-10 pl-5 pr-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                #
              </TableHead>
              <TableHead className="h-10 min-w-[200px] px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Item
              </TableHead>
              <TableHead className="h-10 w-24 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Qty
              </TableHead>
              <TableHead className="h-10 w-32 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Unit rate
              </TableHead>
              <TableHead className="h-10 w-36 pl-3 pr-5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Amount
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((item, index) => {
              const category = item.category || 'material'
              const isSub = Boolean(item.is_subcontractor)
              const isLump = category === 'other' || (category === 'labour' && isSub)
              return (
                <TableRow key={item.id} className="border-b border-border/60">
                  <TableCell className="w-10 py-3 pl-5 pr-2 text-center text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="min-w-[200px] whitespace-normal py-3 px-3">
                    <p className="text-sm font-medium leading-snug text-foreground">{item.description}</p>
                    {/* Category and supplier identify the line; they are not
                        figures anyone reads down a column. */}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[category === 'labour' && isSub ? 'sub-contractor' : category, item.supplier_name]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {item.remarks && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">{item.remarks}</p>
                    )}
                  </TableCell>
                  <TableCell className="w-24 py-3 px-3 text-right text-sm tabular-nums text-muted-foreground">
                    {isLump ? '—' : `${Number(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`}
                  </TableCell>
                  <TableCell className="w-32 py-3 px-3 text-right text-sm tabular-nums text-muted-foreground">
                    {isLump ? '—' : formatCurrency(Number(item.unit_price) || 0)}
                  </TableCell>
                  <TableCell className="w-36 py-3 pl-3 pr-5 text-right text-sm font-medium tabular-nums text-foreground">
                    {formatCurrency(Number(item.line_total) || 0)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>

          <TableFooter className="bg-transparent">
            {showSubtotal && (
              <>
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={4} className="py-2 pl-5 pr-3 text-right text-xs text-muted-foreground">
                    Subtotal
                  </TableCell>
                  <TableCell className="py-2 pl-3 pr-5 text-right text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(subtotal)}
                  </TableCell>
                </TableRow>
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={4} className="py-2 pl-5 pr-3 text-right text-xs text-muted-foreground">
                    Discount
                  </TableCell>
                  <TableCell className="py-2 pl-3 pr-5 text-right text-xs tabular-nums text-muted-foreground">
                    − {formatCurrency(discount)}
                  </TableCell>
                </TableRow>
              </>
            )}
            <TableRow className="border-t border-border hover:bg-transparent">
              <TableCell
                colSpan={4}
                className="py-3.5 pl-5 pr-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Total
              </TableCell>
              <TableCell className="py-3.5 pl-3 pr-5 text-right text-base font-semibold tabular-nums text-foreground">
                {formatCurrency(total || totalAmount || 0)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </section>
  )
}

interface CostControlAuditSectionProps {
  requestId: string
  items: RequestItemRow[]
  documents: ReviewDocument[]
  discountAmount: number
  totalAmount: number
  canAct: boolean
  department?: string | null
  projectName?: string | null
  notes?: string | null
}

export default function CostControlAuditSection({
  requestId,
  items,
  documents,
  discountAmount,
  totalAmount,
  canAct,
  department,
  projectName,
  notes,
}: CostControlAuditSectionProps) {
  return (
    <div className="space-y-6">
      <CostControlInvoicesSection
        requestId={requestId}
        documents={documents}
        canAct={canAct}
        department={department}
        projectName={projectName}
        notes={notes}
      />
      <CostControlAuditTable
        items={items}
        discountAmount={discountAmount}
        totalAmount={totalAmount}
      />
    </div>
  )
}

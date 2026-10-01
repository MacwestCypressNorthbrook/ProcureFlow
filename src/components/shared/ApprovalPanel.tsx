'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Paperclip,
  Check,
  RotateCcw,
  Send,
  Loader2,
  FileText,
  ShoppingBag,
  Eye,
  ExternalLink,
  Download,
  RefreshCw,
  AlertCircle,
  FileCheck2,
  FileUp,
  Upload,
  ChevronDown,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { STAGES, type Stage, nextStage, previousStage } from '@/lib/workflow'
import type { PurchaseOrder } from '@/lib/types'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'
import { documentUrl } from '@/lib/files'
import AttachPODrawer from '@/components/admin/AttachPODrawer'
import UrgentEscalationDialog from '@/components/shared/UrgentEscalationDialog'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface ReviewDocument {
  id: string
  file_name: string
  file_url: string
  file_size?: number | null
  source: 'request' | 'po'
  status?: 'pending' | 'accepted' | 'declined' | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  reviewer_name?: string | null
  review_notes?: string | null
}

export interface ApprovalEntry {
  id: string
  stage: string
  action: string
  comment: string | null
  created_at: string
  performer_name?: string | null
}

export interface RequestSummaryInfo {
  purpose?: string
  department?: string
  projectName?: string
  totalAmount?: number
  currency?: string
  suggestedSupplier?: string
  itemCount?: number
}

const ACTION_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  sent_back: 'Sent back',
  resubmitted: 'Resubmitted',
  po_created: 'Purchase order raised',
  paid: 'Paid',
  rejected: 'Rejected',
  items_removed: 'Materials removed',
  edited: 'Edited',
}

const ACTION_TONE: Record<string, string> = {
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  sent_back: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  resubmitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  po_created: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
  items_removed: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  edited: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
}

/**
 * The decision surface every reviewer sees: the documents that came with the
 * requisition, the history of what each stage said, and actions for review.
 *
 * For the Administrator, this provides the dedicated Odoo PO upload and
 * routing interface to forward the PO to Cost Control.
 */
export default function ApprovalPanel({
  requestId,
  stage,
  canAct,
  isRequester = false,
  sentBack = false,
  documents,
  history,
  showDocuments = true,
  showHistory = true,
  po = null,
  requestSummary,
  isUrgent = false,
  canEscalate = false,
}: {
  requestId: string
  stage: Stage | null
  canAct: boolean
  isRequester?: boolean
  sentBack?: boolean
  documents: ReviewDocument[]
  history: ApprovalEntry[]
  /** Off when the page already lists the documents elsewhere. */
  showDocuments?: boolean
  /**
   * Off when the page already tells this story. The engineer's detail page
   * renders a stage-by-stage Status Timeline carrying the same actors, dates
   * and comments, so showing both put the identical history on screen twice.
   */
  showHistory?: boolean
  po?: PurchaseOrder | null
  requestSummary?: RequestSummaryInfo
  /** Already escalated — the red button is then a state, not an action. */
  isUrgent?: boolean
  /** The Project Lead alone may escalate; resolved server-side from the role. */
  canEscalate?: boolean
}) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Document preview modal state
  const [previewDoc, setPreviewDoc] = useState<{
    name: string
    url: string
    downloadUrl: string
  } | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(stage !== 'cost_control')

  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)

  const uploadDocument = async (file: File | undefined) => {
    if (!file) return
    setUploadingDoc(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/requests/${requestId}/attachments`, { method: 'POST', body: form })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadError(payload.error ?? 'Could not attach that file.')
        return
      }
      router.refresh()
    } catch {
      setUploadError('Network error — the file was not attached.')
    } finally {
      setUploadingDoc(false)
    }
  }

  const deleteDocument = async (attachmentId: string) => {
    if (!confirm('Are you sure you want to remove this document?')) return
    setDeletingDocId(attachmentId)
    setUploadError(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/attachments?attachmentId=${attachmentId}`, {
        method: 'DELETE',
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUploadError(payload.error ?? 'Could not remove document.')
        return
      }
      router.refresh()
    } catch {
      setUploadError('Network error — document was not removed.')
    } finally {
      setDeletingDocId(null)
    }
  }

  const act = async (action: 'approve' | 'send_back' | 'resubmit') => {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'That action could not be completed.')
        return
      }
      setComment('')
      router.refresh()
    } catch {
      setError('Network error — nothing was changed.')
    } finally {
      setBusy(null)
    }
  }

  const requestDocs = documents.filter((d) => d.source === 'request')
  const poDocs = documents.filter((d) => d.source === 'po')
  const activePoDoc =
    poDocs[0] ||
    (po?.file_path
      ? { id: `po-file-${po.id}`, file_name: po.file_name || 'PO Document', file_url: po.file_path }
      : null)

  const isAdminStage = stage === 'admin' && canAct

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

      {/* Documents — Requisition and PO documents */}
      {showDocuments && (
        <section className="surface rounded-xl">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Paperclip size={15} className="text-muted-foreground" />
              Documents
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{documents.length}</span>
              {canAct && !isAdminStage && (
                <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted">
                  {uploadingDoc ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Attach
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
              )}
            </div>
          </div>
          {uploadError && (
            <p className="border-b border-border bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">
              {uploadError}
            </p>
          )}
          <div className="p-4">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents were attached.</p>
            ) : (
              <ul className="space-y-2.5">
                {[...requestDocs, ...poDocs].map((doc) => (
                  <li key={doc.id}>
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-2.5 transition-colors hover:border-ring">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <FileText
                            size={16}
                            className={`shrink-0 ${doc.source === 'po' ? 'text-violet-500' : 'text-muted-foreground'}`}
                          />
                          <span
                            className="min-w-0 flex-1 truncate text-xs sm:text-sm font-semibold text-foreground"
                            title={doc.file_name}
                          >
                            {doc.file_name}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc({
                                name: doc.file_name,
                                url: documentUrl(doc.id, doc.file_url),
                                downloadUrl: documentUrl(doc.id, doc.file_url, { download: true }),
                              })
                            }
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            title={`Preview ${doc.file_name}`}
                          >
                            <Eye size={12} />
                            Preview
                          </button>
                          <a
                            href={documentUrl(doc.id, doc.file_url, { download: true })}
                            download={doc.file_name}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title={`Download ${doc.file_name}`}
                          >
                            <Download size={12} />
                          </a>
                          {canAct && doc.source !== 'po' && (
                            <button
                              type="button"
                              disabled={deletingDocId === doc.id}
                              onClick={() => deleteDocument(doc.id)}
                              className="inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                              title="Delete / replace this document"
                            >
                              {deletingDocId === doc.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Status & Review Remarks */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-border/40 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          {doc.status === 'accepted' ? (
                            <span className="inline-flex py-1 items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                              <Check size={11} /> Accepted & Acknowledged
                            </span>
                          ) : doc.status === 'declined' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                              <X size={11} /> Declined by Cost Control
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                              Pending Review
                            </span>
                          )}

                        </div>

                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wide ${doc.source === 'po'
                            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                            : 'bg-muted text-muted-foreground'
                            }`}
                        >
                          {doc.source === 'po' ? 'PO Doc' : 'Quote'}
                        </span>
                      </div>

                      {doc.review_notes && (
                        <div className="rounded bg-rose-500/10 p-2 text-xs italic text-rose-900 dark:text-rose-200 border border-rose-500/20">
                          <span className="font-semibold not-italic text-rose-700 dark:text-rose-400">
                            {doc.status === 'declined' ? 'Cost Control Reason:' : 'Cost Control Note:'}
                          </span>{' '}
                          {doc.review_notes}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Decision / Action Panel.
          `@container` so the buttons respond to the panel's own width: stacked
          and full-width in a 360px rail (the thumb-friendly compact layout),
          a right-aligned row of content-sized buttons once the panel is wide.
          Sizing them to the viewport is what stretched them to 1,700px when
          the page collapsed to one column. */}
      {canAct && stage && (
        <section className="@container surface rounded-2xl p-5">
          {/* SPECIAL ADMINISTRATOR WORKFLOW: ODOO PO ATTACHMENT */}
          {isAdminStage ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <ShoppingBag size={15} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Final authorization</h2>
                    <p className="text-[11px] text-muted-foreground">Attach the Odoo PO and close the requisition</p>
                  </div>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                  Admin Action
                </span>
              </div>

              {/* Case 1: PO already attached */}
              {po ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck2 size={16} className="text-violet-600 dark:text-violet-400 shrink-0" />
                        <span className="text-xs font-semibold text-foreground truncate">
                          PO #{po.po_number || 'Attached'}
                        </span>
                      </div>
                      <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                        Ready
                      </span>
                    </div>

                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">Vendor:</span>{' '}
                        {po.vendor_name || requestSummary?.suggestedSupplier || '—'}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Total:</span>{' '}
                        {formatCurrency(Number(po.total_amount) || requestSummary?.totalAmount || 0)}
                      </p>
                    </div>

                    {activePoDoc && (
                      <div className="pt-1 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() =>
                            setPreviewDoc({
                              name: activePoDoc.file_name,
                              url: documentUrl(activePoDoc.id, activePoDoc.file_url),
                              downloadUrl: documentUrl(activePoDoc.id, activePoDoc.file_url, {
                                download: true,
                              }),
                            })
                          }
                        >
                          <Eye size={13} />
                          Preview Odoo PDF
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => setIsDrawerOpen(true)}
                        >
                          <RefreshCw size={12} />
                          Edit / Replace via Drawer
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Closing notes (optional)
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder="Add a closing note — it is sent to everyone on the requisition..."
                      className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row pt-1">
                    <button
                      type="button"
                      onClick={() => act('approve')}
                      disabled={busy !== null}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {busy === 'approve' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Authorize &amp; complete
                    </button>
                    <button
                      type="button"
                      onClick={() => act('send_back')}
                      disabled={busy !== null}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      {busy === 'send_back' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                      Send back
                    </button>
                  </div>
                </div>
              ) : (
                /* Case 2: No PO attached yet - responsive action card to open drawer */
                <div className="space-y-4">
                  <div className="rounded-xl border-2 border-dashed border-violet-500/30 bg-violet-500/[0.03] p-5 text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                      <FileUp size={24} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-foreground">Attach the purchase order to complete</h3>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        Cost Control has cleared the rates and the vendor invoice. Generate the PO in Odoo, then attach the official PDF and its reference here — that closes the requisition and notifies everyone on it.
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setIsDrawerOpen(true)}
                      className="gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs h-10 px-5 shadow-sm hover:shadow"
                    >
                      <ShoppingBag size={15} />
                      Open PO Upload Drawer
                    </Button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => act('send_back')}
                      disabled={busy !== null}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      {busy === 'send_back' ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                      Send back to Cost Control
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* STANDARD WORKFLOW FOR OTHER STAGES (Requester, Lead, Supply Chain, Cost Control, Finance) */
            (() => {
              const next = stage ? nextStage(stage) : null
              const prev = stage ? previousStage(stage) : null

              let approveLabel = 'Approve'
              let sendBackLabel = 'Send back'
              let blurb = STAGES[stage]?.blurb ?? ''
              let commentPlaceholder = 'Add a comment (optional) — it travels with the decision.'

              if (stage === 'cost_control') {
                approveLabel = 'Approve to Administration'
                sendBackLabel = 'Send back to Supply Chain'
                blurb =
                  'Audit the rates and the attached vendor invoices. Approving sends this to Administration, who raises the purchase order and closes it.'
                commentPlaceholder = 'Add cost audit notes or remarks (optional)...'
              } else if (stage === 'supply_chain') {
                if (sentBack) {
                  approveLabel = 'Resubmit to Cost Control'
                  sendBackLabel = 'Send back to Project Lead'
                  blurb = 'Cost Control returned this requisition for adjustments. Update pricing or replace rejected quotes, then resubmit.'
                  commentPlaceholder = 'Add notes on the corrections made (optional)...'
                } else {
                  approveLabel = 'Approve to Cost Control'
                  sendBackLabel = 'Send back to Project Lead'
                  blurb = 'Set pricing, attach vendor invoices/quotes, and forward to Cost Control for rate verification.'
                  commentPlaceholder = 'Add notes for Cost Control (optional)...'
                }
              } else {
                if (next && STAGES[next]) approveLabel = `Approve to ${STAGES[next].label}`
                if (prev && STAGES[prev]) sendBackLabel = `Send back to ${STAGES[prev].label}`
              }

              return (
                <>
                  <h2 className="text-sm font-semibold text-foreground">
                    {sentBack
                      ? stage === 'supply_chain'
                        ? 'Resubmit to Cost Control'
                        : isRequester
                          ? 'Resubmit this requisition'
                          : `Returned to ${STAGES[stage]?.label ?? stage}`
                      : stage === 'cost_control'
                        ? 'Cost Control Decision'
                        : `Your decision as ${STAGES[stage]?.label ?? stage}`}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {isRequester && sentBack
                      ? 'Address the comments below, then send it back for review.'
                      : blurb}
                  </p>

                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder={commentPlaceholder}
                    className="mt-3 w-full resize-none rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />

                  {error && (
                    <p role="alert" className="mt-2 text-xs font-medium text-destructive">
                      {error}
                    </p>
                  )}

                  {(() => {
                    const allDocsDeclined =
                      stage === 'cost_control' &&
                      documents.length > 0 &&
                      documents.every((d) => d.status === 'declined')

                    return (
                      <>
                        {allDocsDeclined && (
                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.08] p-2.5 text-xs text-rose-900 dark:text-rose-200">
                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                            <p>
                              All vendor invoices are marked as <strong>Declined</strong>. Send back to Supply Chain for revised quotes or re-evaluate an invoice before authorizing.
                            </p>
                          </div>
                        )}

                        {/* macOS order when there is room: the primary action
                            sits on the right, the secondary to its left. */}
                        <div className="mt-4 flex flex-col gap-2 @lg:flex-row-reverse @lg:flex-wrap @lg:items-center @lg:justify-start">
                          {sentBack ? (
                            <>
                              <button
                                type="button"
                                onClick={() => act('resubmit')}
                                disabled={busy !== null}
                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60 cursor-pointer @lg:w-auto @lg:min-w-[220px]"
                              >
                                {busy === 'resubmit' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {stage === 'supply_chain' ? 'Resubmit to Cost Control' : 'Resubmit for review'}
                              </button>
                              {/* Whoever a requisition was returned to may not
                                  hold the answer themselves — they can pass it
                                  one stage further back. The answer then walks
                                  forward through each stage it passed. */}
                              {!isRequester && prev && (
                                <button
                                  type="button"
                                  onClick={() => act('send_back')}
                                  disabled={busy !== null}
                                  className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-input bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 cursor-pointer @lg:w-auto"
                                >
                                  {busy === 'send_back' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                  {sendBackLabel}
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => act('approve')}
                                disabled={busy !== null || allDocsDeclined}
                                title={allDocsDeclined ? 'All vendor invoices are declined. Send back or accept a valid quote.' : undefined}
                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer @lg:w-auto @lg:min-w-[220px]"
                              >
                                {busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                {approveLabel}
                              </button>
                              <button
                                type="button"
                                onClick={() => act('send_back')}
                                disabled={busy !== null}
                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-input bg-card px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 cursor-pointer @lg:w-auto"
                              >
                                {busy === 'send_back' ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                                {sendBackLabel}
                              </button>

                              {/* Emergency approval. Separated by a rule and a
                                  caption because it is a different kind of
                                  decision from the two above it — it interrupts
                                  the next stage rather than queueing for them. */}
                              {canEscalate && stage === 'lead' && (
                                <div className="mt-1 w-full basis-full border-t border-border pt-3 @lg:order-last">
                                  {isUrgent ? (
                                    <p className="flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-700 dark:text-red-400">
                                      <Zap size={13} />
                                      Already escalated as urgent
                                    </p>
                                  ) : (
                                    <>
                                      <UrgentEscalationDialog
                                        requestId={requestId}
                                        purpose={requestSummary?.purpose ?? 'this requisition'}
                                        nextStageLabel={next && STAGES[next] ? STAGES[next].label : 'Supply Chain'}
                                        disabled={busy !== null}
                                      />
                                      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                                        Approves and flags it, notifying {next && STAGES[next] ? STAGES[next].label : 'Supply Chain'} immediately.
                                      </p>
                                    </>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </>
              )
            })()
          )}
        </section>
      )}

      {/* History — who said what, at which stage (collapsible) */}
      {showHistory && (
        <section className="surface rounded-xl overflow-hidden border border-border">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
            aria-expanded={historyOpen}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Approval history</h2>
              {history.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {history.length}
                </span>
              )}
            </div>
            <ChevronDown
              size={16}
              className={`text-muted-foreground transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''
                }`}
            />
          </button>

          {historyOpen && (
            <div className="border-t border-border p-4">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <ol className="space-y-3">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex gap-3">
                      <span
                        className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTION_TONE[entry.action] ?? 'bg-muted text-muted-foreground'
                          }`}
                      >
                        {ACTION_LABEL[entry.action] ?? entry.action}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">
                            {entry.stage in STAGES ? STAGES[entry.stage as Stage].label : entry.stage}
                          </span>
                          {entry.performer_name ? ` · ${entry.performer_name}` : ''}
                        </p>
                        {entry.comment && (
                          <p className="mt-0.5 text-sm text-muted-foreground">{entry.comment}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      )}

      {/* Odoo PO Upload Drawer */}
      <AttachPODrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        requestId={requestId}
        requestSummary={{
          purpose: requestSummary?.purpose || 'Requisition Review',
          department: requestSummary?.department,
          projectName: requestSummary?.projectName,
          totalAmount: requestSummary?.totalAmount,
          currency: requestSummary?.currency,
          suggestedSupplier: requestSummary?.suggestedSupplier,
          itemCount: requestSummary?.itemCount,
        }}
        existingPo={po}
        onSuccess={() => {
          router.refresh()
        }}
      />
    </div>
  )
}

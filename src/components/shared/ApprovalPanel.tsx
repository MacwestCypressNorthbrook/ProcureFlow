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
} from 'lucide-react'
import { STAGES, type Stage } from '@/lib/workflow'
import type { PurchaseOrder } from '@/lib/types'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'
import { documentUrl } from '@/lib/files'
import AttachPODrawer from '@/components/admin/AttachPODrawer'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface ReviewDocument {
  id: string
  file_name: string
  file_url: string
  file_size?: number | null
  source: 'request' | 'po'
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
}

const ACTION_TONE: Record<string, string> = {
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  sent_back: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  resubmitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  po_created: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
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
  po = null,
  requestSummary,
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
  po?: PurchaseOrder | null
  requestSummary?: RequestSummaryInfo
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
              <ul className="space-y-2">
                {[...requestDocs, ...poDocs].map((doc) => (
                  <li key={doc.id}>
                    <div className="flex items-center justify-between gap-2.5 rounded-lg border border-border bg-background/40 px-3 py-2.5 transition-colors hover:border-ring">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <FileText
                          size={15}
                          className={`shrink-0 ${doc.source === 'po' ? 'text-violet-500' : 'text-muted-foreground'}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {doc.file_name}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            doc.source === 'po'
                              ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 font-semibold'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {doc.source === 'po' ? 'Purchase order' : 'Requisition'}
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
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                          title={`Preview ${doc.file_name}`}
                        >
                          <Eye size={13} />
                          Preview
                        </button>
                        <a
                          href={documentUrl(doc.id, doc.file_url, { download: true })}
                          download={doc.file_name}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title={`Download ${doc.file_name}`}
                        >
                          <Download size={13} />
                          <span className="hidden sm:inline">Download</span>
                        </a>
                        <a
                          href={documentUrl(doc.id, doc.file_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          title="Open in a new tab"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Decision / Action Panel */}
      {canAct && stage && (
        <section className="surface rounded-xl p-4">
          {/* SPECIAL ADMINISTRATOR WORKFLOW: ODOO PO ATTACHMENT */}
          {isAdminStage ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <ShoppingBag size={15} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Odoo Purchase Order</h2>
                    <p className="text-[11px] text-muted-foreground">Attach Odoo PDF & approve to Cost Control</p>
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
                      Notes for Cost Control (optional)
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      placeholder="Add an optional comment for Cost Control..."
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
                      Approve to Cost Control
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
                      <h3 className="text-sm font-bold text-foreground">Attach Odoo Purchase Order</h3>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        Generate the PO in Odoo, then open the upload drawer to attach the official PDF and link the PO reference number.
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
                      Send back to Requester
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* STANDARD WORKFLOW FOR OTHER STAGES (Requester, Lead, Supply Chain, Cost Control, Finance) */
            <>
              <h2 className="text-sm font-semibold text-foreground">
                {isRequester ? 'Resubmit this requisition' : `Your decision as ${STAGES[stage].label}`}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isRequester
                  ? 'Address the comments below, then send it back for review.'
                  : STAGES[stage].blurb}
              </p>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add a comment (optional) — it travels with the decision."
                className="mt-3 w-full resize-none rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />

              {error && (
                <p role="alert" className="mt-2 text-xs font-medium text-destructive">
                  {error}
                </p>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {isRequester && sentBack ? (
                  <button
                    type="button"
                    onClick={() => act('resubmit')}
                    disabled={busy !== null}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busy === 'resubmit' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Resubmit for review
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => act('approve')}
                      disabled={busy !== null}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {busy === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => act('send_back')}
                      disabled={busy !== null}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      {busy === 'send_back' ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                      Send back
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* History — who said what, at which stage */}
      <section className="surface rounded-xl">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Approval history</h2>
        </div>
        <div className="p-4">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span
                    className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      ACTION_TONE[entry.action] ?? 'bg-muted text-muted-foreground'
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
      </section>

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

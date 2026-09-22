'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, Check, RotateCcw, Send, Loader2, FileText } from 'lucide-react'
import { STAGES, type Stage } from '@/lib/workflow'

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
 * requisition, the history of what each stage said, and approve / send-back
 * with an optional comment.
 *
 * `canAct` is decided on the server — this component never grants authority,
 * it only reflects it. The API re-checks on every call.
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
}) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="space-y-4">
      {/* Documents — every reviewer sees what the requester attached */}
      {showDocuments && (
      <section className="surface rounded-xl">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Paperclip size={15} className="text-muted-foreground" />
            Documents
          </h2>
          <span className="text-xs text-muted-foreground">{documents.length}</span>
        </div>
        <div className="p-4">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents were attached.</p>
          ) : (
            <ul className="space-y-2">
              {[...requestDocs, ...poDocs].map((doc) => (
                <li key={doc.id}>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-background/40 px-3 py-2.5 transition-colors hover:border-ring"
                  >
                    <FileText size={15} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{doc.file_name}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {doc.source === 'po' ? 'Purchase order' : 'Requisition'}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      )}

      {/* Decision */}
      {canAct && stage && (
        <section className="surface rounded-xl p-4">
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
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-input bg-card text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {busy === 'send_back' ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  Send back
                </button>
              </>
            )}
          </div>
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
    </div>
  )
}

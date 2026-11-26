'use client'

import { useId } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, Loader2, RotateCcw } from 'lucide-react'

export type DecisionKind = 'approve' | 'send_back'

/**
 * The last step before an approval or a send-back is recorded.
 *
 * Both move the requisition out of the reviewer's queue and notify someone, so
 * the dialog restates where it is going and what happens next, and holds the
 * comment that travels with the decision — the reviewer sees exactly what will
 * be sent before it is sent. It is controlled: the panel owns the comment and
 * performs the request, so the text typed before opening is kept, and a failed
 * request leaves the dialog open with the error and nothing lost.
 */
export default function ConfirmDecisionDialog({
  open,
  onOpenChange,
  kind,
  title,
  purpose,
  consequence,
  confirmLabel,
  comment,
  onCommentChange,
  commentLabel,
  commentRequired = false,
  busy,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: DecisionKind
  title: string
  purpose?: string
  /** One or two sentences: where it goes and what happens next. */
  consequence: string
  confirmLabel: string
  comment: string
  onCommentChange: (value: string) => void
  commentLabel: string
  commentRequired?: boolean
  busy: boolean
  error: string | null
  onConfirm: () => void
}) {
  const fieldId = useId()
  const hintId = useId()
  const isApprove = kind === 'approve'
  const missingComment = commentRequired && !comment.trim()

  return (
    <Dialog
      open={open}
      // A decision in flight cannot be dismissed — closing would hide its result.
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <div
            aria-hidden="true"
            className={`mb-1 flex h-11 w-11 items-center justify-center rounded-2xl ${
              isApprove
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
            }`}
          >
            {isApprove ? <Check size={22} /> : <RotateCcw size={22} />}
          </div>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription>
            {purpose && <span className="block font-medium text-foreground">“{purpose}”</span>}
            <span className="mt-1 block">{consequence}</span>
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && !missingComment) onConfirm()
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor={fieldId} className="mb-1.5 block text-xs font-semibold text-foreground">
              {commentLabel}{' '}
              <span className="font-normal text-muted-foreground">({commentRequired ? 'required' : 'optional'})</span>
            </label>
            <textarea
              id={fieldId}
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              rows={3}
              autoFocus
              disabled={busy}
              required={commentRequired}
              aria-describedby={hintId}
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 sm:text-sm"
            />
            <p id={hintId} className="mt-1 text-[11px] text-muted-foreground">
              Recorded on the requisition and sent with the notification.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Go back
            </button>
            <button
              type="submit"
              disabled={busy || missingComment}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : isApprove ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <RotateCcw size={16} aria-hidden="true" />
              )}
              {busy ? 'Working…' : confirmLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

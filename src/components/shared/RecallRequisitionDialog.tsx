'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Undo2 } from 'lucide-react'

const MIN_REASON = 10

/**
 * Pull back an approval (or a submission) the next stage has not acted on yet.
 *
 * Shown only when the server has worked out a recall is possible; the API
 * re-checks it, so if the next stage acts first the dialog reports that and
 * nothing changes.
 */
type RecallAction = 'approved' | 'marked_urgent' | 'submitted' | 'resubmitted'

const COPY: Record<RecallAction, { button: string; title: string; consequence: (from: string, held: string) => string }> = {
  approved: {
    button: 'Recall approval',
    title: 'Recall your approval?',
    consequence: (from, held) =>
      `It leaves ${held}'s queue and returns to ${from}, where you can approve it again, send it back or reject it.`,
  },
  marked_urgent: {
    button: 'Recall escalation',
    title: 'Withdraw the urgent escalation?',
    consequence: (from, held) =>
      `The urgent flag is cleared and it returns to ${from}'s queue. ${held} is emailed that the escalation is withdrawn.`,
  },
  submitted: {
    button: 'Recall submission',
    title: 'Recall your submission?',
    consequence: (_from, held) =>
      `It leaves ${held}'s queue and comes back to you to edit. When you resubmit, it goes to ${held} again.`,
  },
  resubmitted: {
    button: 'Recall resubmission',
    title: 'Recall your resubmission?',
    consequence: (_from, held) =>
      `It leaves ${held}'s queue and is returned to you as it was before you resubmitted. When you resubmit again, it goes back to ${held}.`,
  },
}

export default function RecallRequisitionDialog({
  requestId,
  purpose,
  action,
  fromLabel,
  heldByLabel,
  compact = false,
}: {
  requestId: string
  purpose: string
  /** The trail action being recalled — decides the wording. */
  action: RecallAction
  /** The stage that gets it back, e.g. "Supply Chain". */
  fromLabel: string
  /** The stage that loses it, e.g. "Cost Control". */
  heldByLabel: string
  /** Smaller trigger, for use inside a table row. */
  compact?: boolean
}) {
  const copy = COPY[action]
  const router = useRouter()
  const fieldId = useId()
  const hintId = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = reason.trim()
  const tooShort = trimmed.length < MIN_REASON

  const close = (next: boolean) => {
    if (busy) return
    setOpen(next)
    if (!next) {
      setReason('')
      setError(null)
    }
  }

  const submit = async () => {
    if (tooShort) {
      setError(`Give at least ${MIN_REASON} characters so ${heldByLabel} knows why.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/recall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'The requisition could not be recalled.')
        // The next stage got there first: refresh so the page stops offering it.
        if (res.status === 409) router.refresh()
        return
      }
      setOpen(false)
      setReason('')
      router.refresh()
    } catch {
      setError('Network error — nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted pointer-coarse:h-11'
            : 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted pointer-coarse:h-11 press-active'
        }
      >
        <Undo2 size={compact ? 12 : 14} className="shrink-0" aria-hidden="true" />
        {compact ? 'Recall' : copy.button}
        {compact && <span className="sr-only"> “{purpose}”</span>}
      </button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <div
              aria-hidden="true"
              className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300"
            >
              <Undo2 size={22} />
            </div>
            <DialogTitle className="text-base">{copy.title}</DialogTitle>
            <DialogDescription>
              <span className="block font-medium text-foreground">“{purpose}”</span>
              <span className="mt-1 block">
                {copy.consequence(fromLabel, heldByLabel)}
                {action === 'marked_urgent' ? '' : ` ${heldByLabel} is notified.`}
              </span>
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!busy) submit()
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor={fieldId} className="mb-1.5 block text-xs font-semibold text-foreground">
                Reason <span className="font-normal text-muted-foreground">(required)</span>
              </label>
              <textarea
                id={fieldId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                disabled={busy}
                required
                minLength={MIN_REASON}
                aria-describedby={hintId}
                placeholder={
                  action === 'submitted' || action === 'resubmitted'
                    ? 'e.g. Wrong quantity on line 2 — fixing before review.'
                    : action === 'marked_urgent'
                      ? 'e.g. Site is working again; normal priority is fine.'
                      : 'e.g. Approved the wrong requisition; supplier quote has changed.'
                }
                className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 sm:text-sm"
              />
              <p id={hintId} className="mt-1 text-[11px] text-muted-foreground">
                {tooShort
                  ? `${MIN_REASON - trimmed.length} more character${MIN_REASON - trimmed.length === 1 ? '' : 's'} needed`
                  : `Recorded on the requisition and sent to ${heldByLabel}.`}
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
                onClick={() => close(false)}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                Keep it with {heldByLabel}
              </button>
              <button
                type="submit"
                disabled={busy || tooShort}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Undo2 size={16} aria-hidden="true" />}
                {busy ? 'Recalling…' : 'Recall'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

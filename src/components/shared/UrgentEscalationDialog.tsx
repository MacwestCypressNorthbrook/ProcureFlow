'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Zap, Loader2, AlertTriangle, Mail, Bell } from 'lucide-react'

const MIN_REASON = 10

/**
 * The Project Lead's emergency escalation.
 *
 * Marking a requisition urgent skips the batched digest and puts it in front of
 * Supply Chain immediately, in-app and by email. That is a real interruption to
 * somebody's day, so it is deliberately not a one-click action: the dialog
 * states exactly what will happen and will not submit without a reason, which
 * then travels with the requisition and appears in the email Supply Chain
 * receives. An escalation nobody can justify afterwards is how "urgent" stops
 * meaning anything.
 */
export default function UrgentEscalationDialog({
  requestId,
  purpose,
  nextStageLabel = 'Supply Chain',
  disabled = false,
}: {
  requestId: string
  purpose: string
  nextStageLabel?: string
  disabled?: boolean
}) {
  const router = useRouter()
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

  const escalate = async () => {
    if (tooShort) {
      setError(`Give at least ${MIN_REASON} characters so Supply Chain knows what is holding up the site.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_urgent', reason: trimmed }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'The escalation could not be sent.')
        return
      }
      setOpen(false)
      setReason('')
      router.refresh()
    } catch {
      setError('Network error — nothing was escalated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Escalate for emergency approval — Supply Chain is notified immediately"
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-600/30 bg-red-600 px-4 text-sm font-semibold text-white shadow-xs transition-all hover:bg-red-700 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 press-active"
      >
        <Zap size={16} className="shrink-0" />
        Urgent — emergency approval
      </button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle size={22} />
            </div>
            <DialogTitle className="text-base">Escalate this requisition?</DialogTitle>
            <DialogDescription>
              <span className="block font-medium text-foreground">“{purpose}”</span>
              <span className="mt-1 block">
                This approves the requisition and sends it straight to {nextStageLabel}, flagged
                urgent. It cannot be un-flagged from here.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
              What happens immediately
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-foreground">
              <li className="flex items-start gap-2">
                <Bell size={13} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                {nextStageLabel} gets an in-app alert at once — it skips the batched digest.
              </li>
              <li className="flex items-start gap-2">
                <Mail size={13} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                An urgent email goes to every {nextStageLabel} reviewer, with your reason in it.
              </li>
              <li className="flex items-start gap-2">
                <Zap size={13} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                The requisition is marked urgent for the rest of the chain and sorts to the top.
              </li>
            </ul>
          </div>

          <div>
            <label
              htmlFor="urgent-reason"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Why is this urgent? <span className="font-normal text-muted-foreground">(required)</span>
            </label>
            <textarea
              id="urgent-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              disabled={busy}
              placeholder="e.g. Concrete pour scheduled for Thursday; the site stops without these bars."
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {trimmed.length < MIN_REASON
                ? `${MIN_REASON - trimmed.length} more character${MIN_REASON - trimmed.length === 1 ? '' : 's'} needed`
                : 'This reason is sent to Supply Chain and recorded on the requisition.'}
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
              className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={escalate}
              disabled={busy || tooShort}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              {busy ? 'Escalating…' : 'Confirm — send as urgent'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

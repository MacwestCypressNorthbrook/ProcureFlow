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
import { Ban, Loader2, AlertTriangle } from 'lucide-react'
import type { CancelMode } from '@/lib/cancellation'

const MIN_REASON = 10

/**
 * Cancel a requisition — or void a completed one and its purchase orders.
 *
 * Neither can be undone from here, so the dialog says exactly what will happen
 * and will not submit without a reason, which is recorded on the requisition
 * and sent to everyone involved.
 */
export default function CancelRequisitionDialog({
  requestId,
  purpose,
  mode,
  hasPurchaseOrders = false,
}: {
  requestId: string
  purpose: string
  mode: CancelMode
  hasPurchaseOrders?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isVoid = mode === 'void'
  const noun = isVoid ? 'Void' : 'Cancel'
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
      setError(`Give at least ${MIN_REASON} characters so everyone involved knows why.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? `The requisition could not be ${isVoid ? 'voided' : 'cancelled'}.`)
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
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-600/30 bg-card px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400 press-active"
      >
        <Ban size={14} className="shrink-0" />
        {noun} requisition
      </button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle size={22} />
            </div>
            <DialogTitle className="text-base">{noun} this requisition?</DialogTitle>
            <DialogDescription>
              <span className="block font-medium text-foreground">“{purpose}”</span>
              <span className="mt-1 block">
                It leaves every review queue and can no longer be actioned.
                {hasPurchaseOrders || isVoid
                  ? ' Its purchase orders are cancelled with it.'
                  : ''}{' '}
                This cannot be undone from here.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div>
            <label htmlFor="cancel-reason" className="mb-1.5 block text-xs font-semibold text-foreground">
              Reason <span className="font-normal text-muted-foreground">(required)</span>
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              disabled={busy}
              placeholder={isVoid ? 'e.g. Duplicate of another requisition; supplier withdrew.' : 'e.g. No longer needed on site.'}
              className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {tooShort
                ? `${MIN_REASON - trimmed.length} more character${MIN_REASON - trimmed.length === 1 ? '' : 's'} needed`
                : 'This reason is recorded and sent to everyone on the requisition.'}
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
              Keep requisition
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || tooShort}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
              {busy ? `${isVoid ? 'Voiding' : 'Cancelling'}…` : `Confirm — ${noun.toLowerCase()}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

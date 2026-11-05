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
import { CheckCheck, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface BatchItem {
  id: string
  purpose: string
  total_amount?: number | string | null
}

/**
 * Approve the ticked requisitions with one comment.
 *
 * The list is shown in full before anything is sent, so a stray tick is seen
 * before it becomes an approval. Anything someone else acted on in the
 * meantime is skipped by the server and reported back, never approved twice.
 */
export default function BatchApproveDialog({
  items,
  nextStageLabel,
  onDone,
}: {
  items: BatchItem[]
  nextStageLabel: string
  onDone: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ approved: number; skipped: number } | null>(null)

  const total = items.reduce((sum, i) => sum + (Number(i.total_amount) || 0), 0)
  const n = items.length

  const close = (next: boolean) => {
    if (busy) return
    setOpen(next)
    if (!next) {
      setComment('')
      setError(null)
      if (result) {
        setResult(null)
        onDone()
        router.refresh()
      }
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/requests/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'lead', ids: items.map((i) => i.id), comment: comment.trim() || undefined }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Nothing was approved. Try again.')
        return
      }
      setResult({ approved: payload.approved ?? 0, skipped: payload.skipped ?? 0 })
    } catch {
      setError('Network error — nothing was approved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={n === 0}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 press-active"
      >
        <CheckCheck size={15} className="shrink-0" />
        Approve {n > 0 ? n : ''} selected
      </button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
          {result ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {result.approved} approved and sent to {nextStageLabel}
                </DialogTitle>
                <DialogDescription>
                  {result.skipped > 0
                    ? `${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} skipped — already actioned by someone else, sent back, or marked urgent. Open ${result.skipped === 1 ? 'it' : 'them'} from the queue.`
                    : 'Everyone involved has been notified.'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Done
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <CheckCheck size={22} />
                </div>
                <DialogTitle className="text-base">
                  Approve {n} requisition{n === 1 ? '' : 's'}?
                </DialogTitle>
                <DialogDescription>
                  {n === 1 ? 'It moves' : 'They move'} to {nextStageLabel}, worth {formatCurrency(total)} in total. Your
                  comment is recorded on each one.
                </DialogDescription>
              </DialogHeader>

              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-foreground">{i.purpose}</span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {i.total_amount != null ? formatCurrency(Number(i.total_amount)) : '—'}
                    </span>
                  </li>
                ))}
              </ul>

              <div>
                <label htmlFor="batch-comment" className="mb-1.5 block text-xs font-semibold text-foreground">
                  Comment <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="batch-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  disabled={busy}
                  placeholder="e.g. Confirmed on site visit."
                  className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
                />
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
                  onClick={submit}
                  disabled={busy || n === 0}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} />}
                  {busy ? 'Approving…' : `Approve ${n}`}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

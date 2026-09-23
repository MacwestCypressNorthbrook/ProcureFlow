'use client'

import { useState } from 'react'
import { BellRing, Check, Loader2 } from 'lucide-react'
import { currentStage, STAGES } from '@/lib/workflow'

/**
 * Nudge whoever currently holds a requisition.
 *
 * The server decides who that is and refuses more than one reminder every few
 * hours; this only reflects the outcome. Disabled when the requisition is with
 * the requester themselves or already closed — there is nobody to chase.
 */
export default function RemindButton({
  requestId,
  status,
  sentBackTo,
  className = '',
  onResult,
}: {
  requestId: string
  status: string
  sentBackTo?: string | null
  className?: string
  onResult?: (message: string, ok: boolean) => void
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const stage = currentStage(status, sentBackTo)
  const chaseable = stage !== null && stage !== 'requester'
  const disabled = !chaseable || state !== 'idle'

  const send = async () => {
    setState('sending')
    setInlineError(null)
    try {
      const res = await fetch(`/api/requests/${requestId}/remind`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState('idle')
        const message = payload.error ?? 'The reminder could not be sent.'
        setInlineError(message)
        onResult?.(message, false)
        return
      }
      setState('sent')
      const message = `Reminder sent to ${payload.notified} ${
        payload.notified === 1 ? 'person' : 'people'
      } at the ${payload.stage} stage.`
      onResult?.(message, true)
    } catch {
      setState('idle')
      const message = 'Network error — no reminder was sent.'
      setInlineError(message)
      onResult?.(message, false)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled}
        title={
          chaseable && stage
            ? `Remind ${STAGES[stage].label} about this requisition`
            : 'Nobody else is waiting to act on this requisition'
        }
        onClick={(e) => {
          e.stopPropagation()
          send()
        }}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
      >
        {state === 'sending' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : state === 'sent' ? (
          <Check size={14} className="text-emerald-500" />
        ) : (
          <BellRing size={14} />
        )}
        {state === 'sent'
          ? 'Reminder sent'
          : chaseable && stage
            ? `Remind ${STAGES[stage].label}`
            : 'Remind'}
      </button>
      {inlineError && (
        <p role="alert" className="mt-1.5 text-[11px] text-destructive">
          {inlineError}
        </p>
      )}
    </div>
  )
}

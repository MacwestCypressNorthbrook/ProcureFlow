'use client'

import { useState } from 'react'
import { AlertCircle, X } from 'lucide-react'

/**
 * A form's error, placed where it cannot be missed.
 *
 * An error rendered at the foot of a long form is below the fold by the time
 * someone presses submit, so nothing seems to happen. This is fixed to the top
 * of the screen instead, whatever the scroll position, until it is dismissed or
 * the next submit replaces it. It is fixed rather than sticky because the
 * dashboard's scroll containers stop `sticky` from holding.
 */
export default function FormErrorBanner({ message }: { message: string }) {
  // Dismissing is remembered per message, so a new error shows again.
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!message || dismissed === message) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed left-1/2 top-20 z-50 w-[min(44rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl bg-card shadow-xl"
    >
      <div className="flex items-start gap-3 rounded-xl border-2 border-destructive bg-destructive/10 py-3.5 pl-4 pr-2 text-sm font-semibold text-destructive">
        <AlertCircle size={18} className="mt-px shrink-0" />
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={() => setDismissed(message)}
          aria-label="Dismiss error"
          className="rounded-md p-1 text-destructive/70 transition-colors hover:bg-destructive/15 hover:text-destructive"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

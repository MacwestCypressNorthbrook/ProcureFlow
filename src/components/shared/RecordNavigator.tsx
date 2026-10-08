'use client'

import Link from 'next/link'
import { useMemo, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { neighboursIn, parseQueueOrder, readQueueOrderRaw } from '@/lib/queue-order'

const subscribe = () => () => {}

/**
 * Previous / Next through the queue this requisition was opened from, so a
 * reviewer can keep going without returning to the list each time.
 *
 * Reads the order the list recorded, so it follows whatever the viewer had
 * searched, filtered or sorted to. Renders nothing when there is no record —
 * a deep link, or a requisition that is not in that list.
 */
export default function RecordNavigator({ base, currentId }: { base: string; currentId: string }) {
  // An external store, not state: sessionStorage does not exist on the server
  // render, and an empty server snapshot keeps hydration consistent.
  const raw = useSyncExternalStore(subscribe, () => readQueueOrderRaw(base), () => '')
  const nav = useMemo(() => neighboursIn(parseQueueOrder(raw), currentId), [raw, currentId])

  if (!nav || nav.total < 2) return null

  const button =
    'inline-flex h-8 items-center gap-1 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted'
  const off = 'pointer-events-none opacity-40'

  return (
    <nav aria-label="Requisitions in this queue" className="flex items-center gap-2">
      <Link
        href={nav.previousId ? `${base}/${nav.previousId}` : '#'}
        aria-disabled={!nav.previousId}
        tabIndex={nav.previousId ? undefined : -1}
        className={`${button} ${nav.previousId ? '' : off}`}
      >
        <ChevronLeft size={14} />
        Previous
      </Link>
      <span className="text-xs tabular-nums text-muted-foreground">
        {nav.position} of {nav.total}
      </span>
      <Link
        href={nav.nextId ? `${base}/${nav.nextId}` : '#'}
        aria-disabled={!nav.nextId}
        tabIndex={nav.nextId ? undefined : -1}
        className={`${button} ${nav.nextId ? '' : off}`}
      >
        Next
        <ChevronRight size={14} />
      </Link>
    </nav>
  )
}

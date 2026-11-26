'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Users } from 'lucide-react'

/** Mirrors PRESENCE_REFRESH_MS in lib/presence.ts (not imported: that module is server-only). */
const REFRESH_MS = 4 * 60 * 1000
/** Re-check on returning to the tab, but not on every quick alt-tab. */
const FOCUS_RECHECK_MS = 30 * 1000

/**
 * Releases scheduled by an unmount, per presence URL. React's StrictMode (dev)
 * unmounts and remounts every component once; releasing on that first unmount
 * deleted the row the mount had just written. Deferring the release and letting
 * a remount cancel it fixes that, and in production a real navigation away
 * still releases a moment later.
 */
const pendingRelease = new Map<string, ReturnType<typeof setTimeout>>()
const RELEASE_DELAY_MS = 300

export interface PresenceOther {
  name: string
  startedAt: string
}

/** Postgres `timestamptz::text` ("2026-11-26 09:14:03.12+00") → epoch ms, Safari-safe. */
function parsePgTime(value: string): number {
  const iso = value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Date.now() : t
}

function since(value: string): string {
  const mins = Math.max(0, Math.round((Date.now() - parsePgTime(value)) / 60000))
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return `${h} h ago`
}

/**
 * "Someone else is working on this" — and, for a stage holder, the signal that
 * tells everyone else the same about them.
 *
 * Deliberately timer-free (Neon bills every wake-up): it writes when the page
 * opens, when the holder interacts (at most once per REFRESH_MS), and reads
 * when the tab regains focus. Someone who walks away stops refreshing and drops
 * off after the server's TTL; leaving the page releases at once.
 */
export default function PresenceBanner({
  requestId,
  initialOthers,
  isHolder,
}: {
  requestId: string
  initialOthers: PresenceOther[]
  /** Holds the current stage — only then does opening the page count as presence. */
  isHolder: boolean
}) {
  const [others, setOthers] = useState<PresenceOther[]>(initialOthers)
  const lastSync = useRef(0)
  const url = `/api/requests/${requestId}/presence`

  const sync = useCallback(() => {
    lastSync.current = Date.now()
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((res) => (res.ok ? (res.json() as Promise<{ others?: PresenceOther[] }>) : null))
      .then((data) => {
        if (data) setOthers(data.others ?? [])
      })
      // Presence is advisory; a failed refresh changes nothing.
      .catch(() => {})
  }, [url])

  useEffect(() => {
    // A remount of the same page cancels the release its unmount scheduled —
    // the row it would delete is still ours.
    const scheduled = pendingRelease.get(url)
    if (scheduled) {
      clearTimeout(scheduled)
      pendingRelease.delete(url)
    }
    if (isHolder) sync()

    const onActivity = () => {
      if (isHolder && document.visibilityState === 'visible' && Date.now() - lastSync.current > REFRESH_MS) sync()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSync.current > FOCUS_RECHECK_MS) sync()
    }
    const release = () => {
      if (!isHolder) return
      const body = JSON.stringify({ release: true })
      if (!navigator.sendBeacon?.(url, body)) {
        fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {})
      }
    }

    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    document.addEventListener('visibilitychange', onVisible)
    // pagehide covers closing the tab; the cleanup below covers in-app navigation.
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', release)
      pendingRelease.set(
        url,
        setTimeout(() => {
          pendingRelease.delete(url)
          release()
        }, RELEASE_DELAY_MS)
      )
    }
  }, [isHolder, sync, url])

  if (others.length === 0) return null

  const [first, ...rest] = others
  const names = rest.length === 0 ? first.name : `${first.name} and ${rest.length} other${rest.length === 1 ? '' : 's'}`

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <Users size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
      <p>
        <span className="font-semibold">{names}</span> {rest.length === 0 ? 'has' : 'have'} this open
        {rest.length === 0 ? ` (since ${since(first.startedAt)})` : ''}.{' '}
        {isHolder
          ? 'Check with them before you approve or send it back, so you do not both work on it.'
          : 'It is being worked on.'}
      </p>
    </div>
  )
}

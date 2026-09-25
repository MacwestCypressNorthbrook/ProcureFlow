'use client'

import { useState } from 'react'
import { AlertCircle, Check, Loader2, Save } from 'lucide-react'
import { Panel } from '@/components/shared/ui-kit'
import { WEEKDAY_LABELS, blockedDaysLabel } from '@/lib/settings'

/**
 * Which days engineers may not raise a new requisition on.
 *
 * This exists so the submission break is a Super User decision, not a line of
 * code someone has to find and edit — the whole point is to keep engineers
 * from raising requests whenever they like, on a schedule this team controls
 * rather than one baked into a deploy.
 */
export default function RequestWindowPanel({ initialBlockedDays }: { initialBlockedDays: number[] }) {
  const [blockedDays, setBlockedDays] = useState<Set<number>>(new Set(initialBlockedDays))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  const toggleDay = (day: number) => {
    setDirty(true)
    setSaved(false)
    setBlockedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings/request-window', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedDays: [...blockedDays] }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not save the submission window.')
        return
      }
      setDirty(false)
      setSaved(true)
    } catch {
      setError('Network error — nothing was saved.')
    } finally {
      setSaving(false)
    }
  }

  const sortedDays = [...blockedDays].sort((a, b) => a - b)

  return (
    <Panel title="Requisition Submission Window">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Engineers cannot raise a new requisition on the days checked below — the sidebar shows{' '}
        <span className="font-medium text-foreground">New Request</span> as closed for the day instead. Leads,
        Supply Chain and other reviewers are unaffected; this only governs when engineers can submit.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WEEKDAY_LABELS.map((label, day) => {
          const active = blockedDays.has(day)
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleDay(day)}
              aria-pressed={active}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
              {active && <Check size={14} />}
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {sortedDays.length === 0
          ? 'No days are currently blocked — engineers can submit any day.'
          : `Currently closed on ${blockedDaysLabel(sortedDays)}.`}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="text-xs">
          {error ? (
            <span className="flex items-center gap-1.5 font-medium text-destructive">
              <AlertCircle size={13} /> {error}
            </span>
          ) : saved && !dirty ? (
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <Check size={13} /> Saved.
            </span>
          ) : (
            <span className="text-muted-foreground">Changes apply immediately, workspace-wide.</span>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
      </div>
    </Panel>
  )
}

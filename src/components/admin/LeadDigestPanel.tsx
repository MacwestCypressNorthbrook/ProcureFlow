'use client'

import { useState } from 'react'
import { AlertCircle, Check, Loader2, Save } from 'lucide-react'
import { Panel } from '@/components/shared/ui-kit'
import { WEEKDAY_LABELS } from '@/lib/settings'

/**
 * How often Project Leads get an emailed bundle of new requisitions.
 *
 * Leads still see every requisition the instant it lands, in-app — this only
 * controls the emailed summary, which used to fire once per requisition and
 * flood their inbox. Making the day a Super User setting (instead of a value
 * baked into the cron job) means changing it later needs no deploy.
 */
export default function LeadDigestPanel({
  initialEnabled,
  initialDayOfWeek,
}: {
  initialEnabled: boolean
  initialDayOfWeek: number
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [dayOfWeek, setDayOfWeek] = useState(initialDayOfWeek)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  const markDirty = () => {
    setDirty(true)
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings/lead-digest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, dayOfWeek }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not save the digest schedule.')
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

  return (
    <Panel title="Project Lead Email Digest">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Project Leads see every new requisition immediately in-app. This controls the emailed summary only — one
        bundled email of everything awaiting their review, sent once a week instead of once per requisition.
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            markDirty()
            setEnabled(e.target.checked)
          }}
          className="mt-0.5 h-3.5 w-3.5 rounded border-input accent-primary"
        />
        <span className="font-medium text-foreground">
          Send the weekly digest email
          <span className="block text-xs font-normal text-muted-foreground">
            Turn off to rely on in-app notifications alone.
          </span>
        </span>
      </label>

      <div className={`mt-4 ${enabled ? '' : 'pointer-events-none opacity-50'}`}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sent every</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WEEKDAY_LABELS.map((label, day) => {
            const active = dayOfWeek === day
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  markDirty()
                  setDayOfWeek(day)
                }}
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
      </div>

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
            <span className="text-muted-foreground">
              {enabled ? `Currently sent every ${WEEKDAY_LABELS[dayOfWeek]}.` : 'Digest email is off.'}
            </span>
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

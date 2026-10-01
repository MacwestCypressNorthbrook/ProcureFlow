'use client'

import { useState } from 'react'
import { AlertCircle, Check, Loader2, Save } from 'lucide-react'
import { Panel } from '@/components/shared/ui-kit'
import { ROLES, type RoleId } from '@/lib/roles'
import { WEEKDAY_LABELS } from '@/lib/settings'
import type { EmailDelivery, RoleEmailPolicy } from '@/lib/notification-settings'

const DELIVERY_OPTIONS: Array<{ value: EmailDelivery; label: string }> = [
  { value: 'immediate', label: 'Immediately' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
  { value: 'off', label: 'Off (in-app only)' },
]

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

function summary(policy: RoleEmailPolicy): string {
  switch (policy.delivery) {
    case 'immediate':
      return 'One email per event, as it happens.'
    case 'daily':
      return `One collated email every day at ${hourLabel(policy.hour)}.`
    case 'weekly':
      return `One collated email every ${WEEKDAY_LABELS[policy.dayOfWeek]} at ${hourLabel(policy.hour)}.`
    case 'off':
      return 'No notification emails.'
  }
}

/**
 * How each role receives notification emails.
 *
 * In-app notifications are always instant; this only decides whether the
 * matching emails go out as they happen, collect into one daily or weekly
 * digest, or stop. A setting rather than a constant, so moving Cost Control's
 * digest from Thursday to Friday needs no deploy.
 */
export default function NotificationSettingsPanel({
  initialRoles,
}: {
  initialRoles: Record<RoleId, RoleEmailPolicy>
}) {
  const [roles, setRoles] = useState(initialRoles)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  const update = (role: RoleId, patch: Partial<RoleEmailPolicy>) => {
    setDirty(true)
    setSaved(false)
    setRoles((rs) => ({ ...rs, [role]: { ...rs[role], ...patch } }))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not save notification settings.')
        return
      }
      if (payload.data?.roles) setRoles(payload.data.roles)
      setDirty(false)
      setSaved(true)
    } catch {
      setError('Network error — nothing was saved.')
    } finally {
      setSaving(false)
    }
  }

  const selectClass =
    'h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40'

  return (
    <Panel title="Notification Emails">
      <p className="text-sm leading-relaxed text-muted-foreground">
        In-app notifications always arrive instantly. Choose how each role gets the matching emails: as they
        happen, collected into one daily or weekly digest, or not at all. A digest also lists everything waiting
        in that role&rsquo;s queue. Urgent escalations are always emailed immediately. Times are Accra time.
      </p>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {(Object.keys(ROLES) as RoleId[]).map((role) => {
          const policy = roles[role]
          const digest = policy.delivery === 'daily' || policy.delivery === 'weekly'
          return (
            <div key={role} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_11rem_9rem_6rem] sm:items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{ROLES[role].label}</p>
                <p className="text-xs text-muted-foreground">{summary(policy)}</p>
              </div>
              <label className="block">
                <span className="sr-only">Email delivery for {ROLES[role].label}</span>
                <select
                  value={policy.delivery}
                  onChange={(e) => update(role, { delivery: e.target.value as EmailDelivery })}
                  className={selectClass}
                >
                  {DELIVERY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Digest day for {ROLES[role].label}</span>
                <select
                  value={policy.dayOfWeek}
                  disabled={policy.delivery !== 'weekly'}
                  onChange={(e) => update(role, { dayOfWeek: Number(e.target.value) })}
                  className={selectClass}
                >
                  {WEEKDAY_LABELS.map((label, day) => (
                    <option key={label} value={day}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="sr-only">Digest time for {ROLES[role].label}</span>
                <select
                  value={policy.hour}
                  disabled={!digest}
                  onChange={(e) => update(role, { hour: Number(e.target.value) })}
                  className={selectClass}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )
        })}
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
          ) : dirty ? (
            <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle size={13} /> Unsaved changes.
            </span>
          ) : (
            <span className="text-muted-foreground">Changes apply to the next email sent.</span>
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

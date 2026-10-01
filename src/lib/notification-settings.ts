import { execute, queryOne } from '@/lib/db'
import { ROLES, normalizeRole, type RoleId } from '@/lib/roles'
import { accraDateStr, accraWeekday, getLeadDigestSettings } from '@/lib/settings'

/**
 * How each role receives notification emails.
 *
 * In-app notifications are never affected — the bell always updates the moment
 * something happens. This governs email only:
 *
 * - `immediate`: one email per event, as it happens.
 * - `daily` / `weekly`: each email is held in `email_digest_queue` and sent as
 *   one collated email per person at `hour` (Accra time) — every day, or on
 *   `dayOfWeek` — together with whatever is waiting in their queue.
 * - `off`: no notification emails; in-app only.
 *
 * Urgent escalations ignore this and always email at once: the point of
 * marking something urgent is that it cannot wait for Thursday.
 */
export type EmailDelivery = 'immediate' | 'daily' | 'weekly' | 'off'

export interface RoleEmailPolicy {
  delivery: EmailDelivery
  /** 0=Sunday … 6=Saturday. Used when `delivery` is `weekly`. */
  dayOfWeek: number
  /** 0–23, Accra time. Used for `daily` and `weekly`. */
  hour: number
}

export interface NotificationSettings {
  roles: Record<RoleId, RoleEmailPolicy>
  /** Accra-local date (YYYY-MM-DD) each role's digest last went out. Written by the dispatcher. */
  lastSent: Partial<Record<RoleId, string>>
}

const SETTINGS_KEY = 'notification_email_policy'
const DELIVERIES: EmailDelivery[] = ['immediate', 'daily', 'weekly', 'off']
const DEFAULT_HOUR = 8
const THURSDAY = 4

export const ROLE_IDS = Object.keys(ROLES) as RoleId[]

/**
 * Before anyone saves: everyone keeps getting emails as they happen, except
 * Cost Control, who gets one collated email on Thursday, and the Project Lead,
 * who keeps whatever the old Lead-digest setting said.
 */
async function defaultSettings(): Promise<NotificationSettings> {
  const lead = await getLeadDigestSettings()
  const roles = Object.fromEntries(
    ROLE_IDS.map((role) => [role, { delivery: 'immediate', dayOfWeek: THURSDAY, hour: DEFAULT_HOUR }])
  ) as Record<RoleId, RoleEmailPolicy>
  roles.cost_control = { delivery: 'weekly', dayOfWeek: THURSDAY, hour: DEFAULT_HOUR }
  roles.project_lead = {
    delivery: lead.enabled ? 'weekly' : 'off',
    dayOfWeek: lead.dayOfWeek,
    hour: DEFAULT_HOUR,
  }
  return { roles, lastSent: {} }
}

function sanitizeInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isInteger(n) && (n as number) >= min && (n as number) <= max ? (n as number) : fallback
}

function sanitizePolicy(input: unknown, fallback: RoleEmailPolicy): RoleEmailPolicy {
  const raw = (input ?? {}) as Record<string, unknown>
  return {
    delivery: DELIVERIES.includes(raw.delivery as EmailDelivery) ? (raw.delivery as EmailDelivery) : fallback.delivery,
    dayOfWeek: sanitizeInt(raw.dayOfWeek, 0, 6, fallback.dayOfWeek),
    hour: sanitizeInt(raw.hour, 0, 23, fallback.hour),
  }
}

// Every notification email consults this, so it is read at most every 30 s
// rather than once per email. Saving clears it.
let cache: { at: number; value: NotificationSettings } | null = null
const CACHE_MS = 30_000

export async function getNotificationSettings(): Promise<NotificationSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value

  const defaults = await defaultSettings()
  let value = defaults
  try {
    const row = await queryOne<{ value: { roles?: Record<string, unknown>; lastSent?: Record<string, unknown> } }>(
      `SELECT value FROM public.app_settings WHERE key = $1 LIMIT 1`,
      [SETTINGS_KEY]
    )
    if (row) {
      const roles = Object.fromEntries(
        ROLE_IDS.map((role) => [role, sanitizePolicy(row.value?.roles?.[role], defaults.roles[role])])
      ) as Record<RoleId, RoleEmailPolicy>
      const lastSent = Object.fromEntries(
        Object.entries(row.value?.lastSent ?? {}).filter(([, v]) => typeof v === 'string')
      ) as Partial<Record<RoleId, string>>
      value = { roles, lastSent }
    }
  } catch (err) {
    console.error('Failed to load notification settings:', err)
  }

  cache = { at: Date.now(), value }
  return value
}

async function writeSettings(value: NotificationSettings, userId: string | null): Promise<void> {
  await execute(
    `INSERT INTO public.app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = COALESCE(EXCLUDED.updated_by, public.app_settings.updated_by),
           updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(value), userId]
  )
  cache = null
}

/** Admin control: each role's delivery. Roles missing from the input keep their current policy. */
export async function setNotificationSettings(
  input: { roles?: Record<string, unknown> },
  userId: string
): Promise<NotificationSettings> {
  cache = null
  const current = await getNotificationSettings()
  const roles = Object.fromEntries(
    ROLE_IDS.map((role) => [role, sanitizePolicy(input.roles?.[role] ?? current.roles[role], current.roles[role])])
  ) as Record<RoleId, RoleEmailPolicy>
  const next = { roles, lastSent: current.lastSent }
  await writeSettings(next, userId)
  return next
}

/** Dispatcher-only: records that a role's digest went out today, so it fires once. */
export async function markRoleDigestSent(role: RoleId, dateStr: string): Promise<void> {
  cache = null
  const current = await getNotificationSettings()
  await writeSettings({ ...current, lastSent: { ...current.lastSent, [role]: dateStr } }, null)
}

/** The email policy for a user's role. Unknown or legacy-unmappable roles get emails immediately. */
export async function emailPolicyFor(role: string | null | undefined): Promise<RoleEmailPolicy> {
  const id = normalizeRole(role)
  const settings = await getNotificationSettings()
  return id ? settings.roles[id] : { delivery: 'immediate', dayOfWeek: THURSDAY, hour: DEFAULT_HOUR }
}

/** The hour of day where the business operates, 0–23. */
export function accraHour(date: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Accra', hour: '2-digit', hour12: false }).format(date)
  return Number(h) % 24
}

/**
 * Is this role's digest due now? Once the configured hour has passed on a
 * matching day, and not already sent that day — so a cron that runs every few
 * minutes sends it once, and a missed run is made up by the next.
 */
export function isDigestDue(
  policy: RoleEmailPolicy,
  lastSentOn: string | undefined,
  now: Date = new Date()
): boolean {
  if (policy.delivery !== 'daily' && policy.delivery !== 'weekly') return false
  if (policy.delivery === 'weekly' && accraWeekday(now) !== policy.dayOfWeek) return false
  if (accraHour(now) < policy.hour) return false
  return lastSentOn !== accraDateStr(now)
}

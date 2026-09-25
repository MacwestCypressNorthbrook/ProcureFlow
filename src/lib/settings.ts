import { execute, queryOne } from '@/lib/db'

export interface RequestWindowSettings {
  /** Weekdays new requisitions cannot be raised on. 0=Sunday … 6=Saturday. */
  blockedDays: number[]
}

const SETTINGS_KEY = 'request_submission_window'

// Ships closed on Thursdays until a Super User changes it — the schedule this
// replaces a hardcoded version of. Only used when no row exists yet.
const DEFAULT_BLOCKED_DAYS = [4]

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function sanitizeDays(days: unknown): number[] {
  if (!Array.isArray(days)) return []
  const cleaned = days
    .map((d) => (typeof d === 'string' ? Number(d) : d))
    .filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
  return [...new Set(cleaned)].sort((a, b) => a - b)
}

export async function getRequestWindowSettings(): Promise<RequestWindowSettings> {
  try {
    const row = await queryOne<{ value: { blockedDays?: unknown } }>(
      `SELECT value FROM public.app_settings WHERE key = $1 LIMIT 1`,
      [SETTINGS_KEY]
    )
    if (!row) return { blockedDays: DEFAULT_BLOCKED_DAYS }
    return { blockedDays: sanitizeDays(row.value?.blockedDays) }
  } catch (err) {
    console.error('Failed to load the request submission window:', err)
    return { blockedDays: DEFAULT_BLOCKED_DAYS }
  }
}

export async function setRequestWindowSettings(
  blockedDays: unknown,
  userId: string
): Promise<RequestWindowSettings> {
  const cleaned = sanitizeDays(blockedDays)
  await execute(
    `INSERT INTO public.app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify({ blockedDays: cleaned }), userId]
  )
  return { blockedDays: cleaned }
}

/**
 * Today's weekday where the business operates, not the server's — a
 * serverless function can run in any AWS region, and "Thursday" must mean
 * Thursday in Accra, not UTC.
 */
export function accraWeekday(date: Date = new Date()): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Accra', weekday: 'short' }).format(date)
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[short] ?? date.getDay()
}

export function isRequestDayBlocked(settings: RequestWindowSettings, date: Date = new Date()): boolean {
  return settings.blockedDays.includes(accraWeekday(date))
}

/** "Thursdays", "Thursdays and Fridays", "Wednesdays, Thursdays and Fridays" … */
export function blockedDaysLabel(blockedDays: number[]): string {
  const names = blockedDays.map((d) => `${WEEKDAY_LABELS[d]}s`)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

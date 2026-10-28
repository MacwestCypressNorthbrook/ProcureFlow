import { accraHour } from '@/lib/notification-settings'
import { accraWeekday } from '@/lib/settings'

/**
 * Should this cron tick do real work, or return without touching the database?
 *
 * Neon bills compute for every minute the database is awake, and suspends it
 * only after ~5 idle minutes. A cron that queries every 5 minutes therefore
 * keeps it awake around the clock — ~730 hours a month with nobody using the
 * app — which is what exhausted the plan's quota.
 *
 * The external cron keeps firing every 5 minutes; this decides which ticks
 * count. While anyone is using the app, their bell polls dispatch for free
 * (see piggybackDispatch), so the cron only covers the gaps:
 *   - business hours (Mon–Fri, 07:00–19:00 Accra): every 30 minutes, for a
 *     reviewer who approved a batch and closed the tab straight away.
 *   - otherwise: every 3 hours. Reminders and digests that fall due overnight
 *     also go out the moment the first person opens the app.
 *
 * Ticks are bucketed by 5-minute slot, so a cron firing a few seconds late
 * still lands in the slot it was meant for.
 */
export function isCronTickDue(now: Date = new Date()): boolean {
  const slot = Math.floor(now.getTime() / (5 * 60_000))
  const weekday = accraWeekday(now)
  const hour = accraHour(now)
  const businessHours = weekday >= 1 && weekday <= 5 && hour >= 7 && hour < 19

  // Accra is UTC+0, so slot 0 of each period is minute 0–4 of the hour.
  if (businessHours) return slot % 6 === 0
  return slot % 36 === 0
}

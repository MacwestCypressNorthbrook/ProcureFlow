import { queryOne } from '@/lib/db'
import { dispatchPendingReminders, dispatchEmailDigests, dispatchStageDigests } from '@/lib/notifications'
import { pruneRateLimits } from '@/lib/rate-limit'

/** How long one claim holds off every other run, on any instance. */
const LEASE_SECONDS = 120

/**
 * Claim the right to dispatch for the next two minutes, across all instances.
 *
 * Dispatch now starts from two places (the cron and active users' polls), so
 * two serverless instances could otherwise read the same stage batch and both
 * email it. The claim is a single conditional UPSERT: it returns a row only if
 * nobody claimed within the lease. Neon's HTTP driver has no session-level
 * advisory locks, hence a row.
 */
async function claimDispatchLease(): Promise<boolean> {
  const row = await queryOne<{ key: string }>(
    `INSERT INTO public.app_settings (key, value, updated_at)
     VALUES ('dispatch_lease', to_jsonb(now()), now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()
       WHERE public.app_settings.updated_at < now() - make_interval(secs => $1)
     RETURNING key`,
    [LEASE_SECONDS]
  )
  return row !== null
}

export interface DispatchResult {
  ran: boolean
  processed?: number
  emailDigests?: Awaited<ReturnType<typeof dispatchEmailDigests>>['sent']
  stageDigests?: Record<string, number>
}

/** Everything time-based: due reminders, role digests, stage digests, housekeeping. */
export async function runDispatch(): Promise<DispatchResult> {
  if (!(await claimDispatchLease())) return { ran: false }

  const result = await dispatchPendingReminders()

  // Each role's daily or weekly email digest: no-ops until a role's configured
  // day and hour (Admin → Notifications), and sends at most once per day even then.
  const digests = await dispatchEmailDigests()

  // Each downstream stage's approved batch, sent once the approvals settle.
  const stageDigests = await dispatchStageDigests()

  // Rate-limit counters are only meaningful for an hour; anything older is dead weight.
  await pruneRateLimits()

  return {
    ran: true,
    processed: result.processed,
    emailDigests: digests.sent,
    stageDigests: stageDigests.sent,
  }
}

// Per instance, so a busy instance does not even spend a query on the lease.
let lastPiggyback = 0

/**
 * Dispatch on the back of a request that already woke the database.
 *
 * While anyone is using the app their bell polls every minute, so pending work
 * goes out within a couple of minutes at no extra compute — the database is
 * awake for them anyway. The cron only has to cover the hours nobody is here.
 * Never throws: it runs after the response, where nobody would see it.
 */
export async function piggybackDispatch(): Promise<void> {
  if (Date.now() - lastPiggyback < LEASE_SECONDS * 1000) return
  lastPiggyback = Date.now()
  try {
    await runDispatch()
  } catch (err) {
    console.error('Piggybacked dispatch failed:', err)
  }
}

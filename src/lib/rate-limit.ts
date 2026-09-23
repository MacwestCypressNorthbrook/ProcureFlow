import { NextResponse } from 'next/server'
import { queryOne, execute } from '@/lib/db'

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the current window rolls over. */
  retryAfter: number
  remaining: number
}

/**
 * A fixed-window counter kept in Postgres.
 *
 * In-memory counters are worthless here: the app runs on serverless instances
 * that do not share memory, so an attacker spread across instances would never
 * reach a limit. One UPSERT per guarded request buys a limit that actually
 * holds, and the table is keyed so the write is a single index hit.
 *
 * Fails **open**: if the database is unreachable the request proceeds rather
 * than locking everyone out of procurement over a rate-limit table.
 */
export async function rateLimit(
  bucket: string,
  { max, windowSeconds }: { max: number; windowSeconds: number }
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)
  const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000))

  try {
    const row = await queryOne<{ hits: number }>(
      `INSERT INTO public.rate_limits (bucket, window_start, hits)
       VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start)
       DO UPDATE SET hits = public.rate_limits.hits + 1
       RETURNING hits`,
      [bucket, windowStart.toISOString()]
    )

    const hits = row?.hits ?? 1
    return { ok: hits <= max, retryAfter, remaining: Math.max(0, max - hits) }
  } catch (err) {
    console.error('Rate limit check failed; allowing the request:', err)
    return { ok: true, retryAfter, remaining: max }
  }
}

/** The 429 response, with the header clients and proxies actually honour. */
export function tooManyRequests(message: string, retryAfter: number) {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  )
}

/**
 * The caller's address.
 *
 * Only the first entry of `x-forwarded-for` is trusted, and only because this
 * app sits behind a platform proxy that overwrites it. Falls back to a shared
 * bucket, which is deliberately conservative: an unknown origin shares one
 * budget rather than escaping the limit entirely.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Housekeeping: drop counters older than an hour. Safe to call opportunistically. */
export async function pruneRateLimits(): Promise<void> {
  try {
    await execute(`DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour'`)
  } catch {
    /* Housekeeping only — never fail a request over it. */
  }
}

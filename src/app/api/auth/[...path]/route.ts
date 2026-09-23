import { auth } from '@/lib/auth/server'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/rate-limit'

/**
 * The Neon Auth proxy.
 *
 * `auth.handler()` is resolved per request rather than at module scope so a
 * build without the auth environment variables still succeeds — see the note
 * in `lib/auth/server.ts`.
 *
 * Sign-in and sign-up are the only unauthenticated write endpoints in the app,
 * which makes them the credential-stuffing surface: they are rate limited by
 * IP before the request is proxied upstream.
 */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { GET: handler } = auth.handler()
  return handler(request, context)
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  const action = path.join('/')

  // Credential endpoints get a tight budget; everything else (session reads,
  // callbacks) gets a loose one so normal use is never interrupted.
  const isCredentialAttempt = /sign-in|sign-up|forget-password|reset-password/.test(action)
  const limit = isCredentialAttempt
    ? await rateLimit(`auth:${action}:${clientIp(request)}`, { max: 8, windowSeconds: 300 })
    : await rateLimit(`auth:other:${clientIp(request)}`, { max: 120, windowSeconds: 60 })

  if (!limit.ok) {
    return tooManyRequests(
      isCredentialAttempt
        ? 'Too many sign-in attempts. Wait a few minutes and try again.'
        : 'Too many requests. Slow down and try again shortly.',
      limit.retryAfter
    )
  }

  const { POST: handler } = auth.handler()
  return handler(request, context)
}

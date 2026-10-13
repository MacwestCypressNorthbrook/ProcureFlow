import { PostHog } from 'posthog-node'

let client: PostHog | null = null

/**
 * Shared server-side PostHog client, or null when no key is configured.
 * Serverless: flush every event immediately and call `await flush()` before
 * the handler returns, otherwise the function can freeze with events queued.
 */
function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return null
  client ??= new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  })
  return client
}

/** Capture a server event for a user id. Never throws — analytics must not break a request. */
export async function captureServerEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = getClient()
  if (!ph) return
  try {
    ph.capture({ distinctId: userId, event, properties })
    await ph.flush()
  } catch {
    // Swallow: losing an analytics event is better than failing the action.
  }
}

import { execute } from '@/lib/db'
import { emailPolicyFor } from '@/lib/notification-settings'

export interface DigestEntry {
  title: string
  message?: string | null
  /** Relative ("/admin/…") or absolute; the digest resolves relative links against the app URL. */
  link?: string | null
  /** The requisition this is about — a digest groups its updates by requisition. */
  requestId?: string | null
}

/**
 * The one gate every notification email passes through.
 *
 * Sends now, holds the email for the recipient's daily or weekly digest, or
 * drops it, according to their role's setting in Admin → Notifications. An
 * `urgent` email is sent at once whatever the setting.
 */
export async function deliverNotificationEmail(
  recipient: { id: string; role: string | null | undefined },
  entry: DigestEntry,
  send: () => Promise<unknown>,
  { urgent = false }: { urgent?: boolean } = {}
): Promise<'sent' | 'queued' | 'skipped'> {
  const policy = await emailPolicyFor(recipient.role)

  if (urgent || policy.delivery === 'immediate') {
    await send()
    return 'sent'
  }
  if (policy.delivery === 'off') return 'skipped'

  await execute(
    `INSERT INTO public.email_digest_queue (user_id, request_id, title, message, link)
     VALUES ($1, $2, $3, $4, $5)`,
    [recipient.id, entry.requestId ?? null, entry.title, entry.message ?? null, entry.link ?? null]
  )
  return 'queued'
}

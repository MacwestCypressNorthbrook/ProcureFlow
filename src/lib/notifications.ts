import { query, queryOne, execute } from '@/lib/db'
import { sendEmail, sendActionReminderEmail } from '@/lib/email/client'
import { linkForRole, type LinkTarget } from '@/lib/links'
import type { Notification, Reminder } from '@/lib/types'

interface CreateNotificationParams {
  userId: string
  title: string
  message: string
  type?: 'info' | 'approval' | 'reminder' | 'warning' | 'success'
  /** A fixed link. Prefer `target`, which routes by the recipient's role. */
  link?: string
  /**
   * The record this notification is about. The link is then resolved against
   * the recipient's own role, so they land in an area they can actually open.
   */
  target?: LinkTarget
  sendEmailAlert?: boolean
}

/**
 * Create an in-app notification and optionally dispatch an email.
 */
export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
  link,
  target,
  sendEmailAlert = false,
}: CreateNotificationParams): Promise<Notification | null> {
  try {
    let resolvedLink = link ?? null

    if (target) {
      const recipient = await queryOne<{ role: string }>(
        `SELECT role FROM public.users WHERE id = $1 LIMIT 1`,
        [userId]
      )
      resolvedLink = linkForRole(recipient?.role, target)
    }

    const inserted = await queryOne<Notification>(
      `INSERT INTO public.notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, title, message, type, link, is_read, created_at`,
      [userId, title, message, type, resolvedLink]
    )

    if (sendEmailAlert) {
      // Lookup user email
      const user = await queryOne<{ email: string; name: string }>(
        `SELECT email, name FROM public.users WHERE id = $1 LIMIT 1`,
        [userId]
      )

      if (user?.email) {
        await sendEmail({
          to: user.email,
          subject: `[ProcureFlow] ${title}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>${title}</h2>
              <p>${message}</p>
              ${link ? `<p><a href="${process.env.NEXT_PUBLIC_APP_URL || ''}${link}">View in ProcureFlow</a></p>` : ''}
            </div>
          `,
        })
      }
    }

    return inserted
  } catch (err) {
    console.error('Failed to create notification in Neon:', err)
    return null
  }
}

/**
 * Schedule a reminder for an item (request or purchase order).
 */
export async function createReminder({
  targetId,
  targetType,
  userId,
  title,
  message,
  dueDate,
}: {
  targetId: string
  targetType: 'request' | 'purchase_order'
  userId: string
  title: string
  message?: string
  dueDate: Date | string
}): Promise<Reminder | null> {
  try {
    const dueIso = typeof dueDate === 'string' ? dueDate : dueDate.toISOString()
    const inserted = await queryOne<Reminder>(
      `INSERT INTO public.reminders (target_id, target_type, user_id, title, message, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, target_id, target_type, user_id, title, message, due_date, status, created_at, updated_at`,
      [targetId, targetType, userId, title, message || null, dueIso]
    )
    return inserted
  } catch (err) {
    console.error('Failed to create reminder in Neon:', err)
    return null
  }
}

/**
 * Fetch all notifications for a given user.
 */
export async function getUserNotifications(userId: string): Promise<Notification[]> {
  try {
    return await query<Notification>(
      `SELECT id, user_id, title, message, type, link, is_read, created_at
       FROM public.notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    )
  } catch (err) {
    console.error('Failed to fetch user notifications:', err)
    return []
  }
}

/**
 * Mark a notification as read.
 */
export async function markNotificationAsRead(id: string, userId: string): Promise<void> {
  try {
    await execute(
      `UPDATE public.notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )
  } catch (err) {
    console.error('Failed to mark notification as read:', err)
  }
}

/**
 * Process due reminders and send out emails & in-app alerts.
 */
export async function dispatchPendingReminders(): Promise<{ processed: number }> {
  try {
    const dueReminders = await query<Reminder & { email: string; user_name: string }>(
      `SELECT r.*, u.email, u.name as user_name
       FROM public.reminders r
       JOIN public.users u ON u.id = r.user_id
       WHERE r.status = 'pending' AND r.due_date <= now()
       ORDER BY r.due_date ASC
       LIMIT 100`
    )

    let count = 0
    for (const rem of dueReminders) {
      const link =
        rem.target_type === 'request'
          ? `/minta/requests/${rem.target_id}`
          : `/finance/${rem.target_id}`

      // Send email alert via Resend or SMTP
      if (rem.email) {
        await sendActionReminderEmail({
          recipientEmail: rem.email,
          recipientName: rem.user_name,
          title: rem.title,
          message: rem.message || 'You have a pending action requiring your attention.',
          linkUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}${link}`,
          dueDate: rem.due_date,
        })
      }

      // Create in-app reminder notification
      await createNotification({
        userId: rem.user_id,
        title: `Reminder: ${rem.title}`,
        message: rem.message || 'Action is due.',
        type: 'reminder',
        link,
      })

      // Mark reminder as sent
      await execute(
        `UPDATE public.reminders
         SET status = 'sent', sent_at = now(), updated_at = now()
         WHERE id = $1`,
        [rem.id]
      )

      count++
    }

    return { processed: count }
  } catch (err) {
    console.error('Error dispatching reminders:', err)
    return { processed: 0 }
  }
}

/** Notify everyone who can act at a stage, plus record it in-app and by email. */
export async function notifyStage(
  stage: import('@/lib/workflow').Stage,
  requestId: string,
  title: string,
  message: string,
  type: 'info' | 'approval' | 'reminder' | 'warning' | 'success' = 'approval',
  excludeUserId?: string
): Promise<number> {
  const { STAGES } = await import('@/lib/workflow')
  const stageDef = STAGES[stage]
  if (!stageDef) return 0

  const holders = await query<{ id: string }>(
    `SELECT id FROM public.users
      WHERE role = ANY($1::text[])
        AND COALESCE(is_active, true)
        AND auth_id NOT LIKE 'pending:%'`,
    [stageDef.roles]
  )

  const targets = excludeUserId ? holders.filter((h) => h.id !== excludeUserId) : holders

  await Promise.all(
    targets.map((h) =>
      createNotification({
        userId: h.id,
        title,
        message,
        type,
        target: { type: 'request', id: requestId },
        sendEmailAlert: true,
      })
    )
  )
  return targets.length
}


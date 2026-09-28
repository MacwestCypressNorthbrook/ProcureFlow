import { query, queryOne, execute } from '@/lib/db'
import { sendEmail, sendActionReminderEmail, sendLeadDigestEmail, sendStageDigestEmail } from '@/lib/email/client'
import { linkForRole, type LinkTarget } from '@/lib/links'
import type { Notification, Reminder } from '@/lib/types'
import { getStageInbox } from '@/lib/review'
import { getLeadDigestSettings, markLeadDigestSent, accraWeekday, accraDateStr } from '@/lib/settings'

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
 * Delete every notification belonging to a user (the dropdown's "Clear all").
 */
export async function clearUserNotifications(userId: string): Promise<void> {
  try {
    await execute(`DELETE FROM public.notifications WHERE user_id = $1`, [userId])
  } catch (err) {
    console.error('Failed to clear user notifications:', err)
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

/**
 * Bundles everything sitting in the Project Lead queue into one email per
 * Lead, on whichever weekday the Super User has configured (default
 * Thursday). Leads already got an in-app notification the instant each
 * requisition landed; this only replaces the "one email per requisition"
 * alert that would otherwise flood their inbox.
 *
 * Safe to call from a cron that fires more than once a day, or on days other
 * than the configured one — it only ever sends once per Accra-local day,
 * tracked in `app_settings` rather than in the cron schedule itself, so
 * changing the day in the admin panel takes effect immediately.
 */
export async function dispatchLeadDigest(): Promise<{ sent: number; reason: string }> {
  try {
    const settings = await getLeadDigestSettings()
    if (!settings.enabled) return { sent: 0, reason: 'digest disabled' }
    if (accraWeekday() !== settings.dayOfWeek) return { sent: 0, reason: 'not the configured day' }

    const today = accraDateStr()
    if (settings.lastSentOn === today) return { sent: 0, reason: 'already sent today' }

    const pending = await getStageInbox('lead')
    if (pending.length === 0) {
      await markLeadDigestSent(today)
      return { sent: 0, reason: 'no requisitions waiting' }
    }

    const leads = await query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM public.users WHERE role = 'project_lead' AND is_active`
    )

    const queueUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/sam/requests`
    let sent = 0
    for (const lead of leads) {
      if (!lead.email) continue
      await sendLeadDigestEmail({
        recipientEmail: lead.email,
        recipientName: lead.name || 'there',
        items: pending.map((r) => ({
          requestId: r.id,
          purpose: r.purpose,
          requesterName: r.requester_name || 'Unknown',
          projectName: r.project_name,
          amount: r.total_amount,
          createdAt: r.created_at,
        })),
        queueUrl,
      })
      sent++
    }

    await markLeadDigestSent(today)
    return { sent, reason: '' }
  } catch (err) {
    console.error('Error dispatching the lead digest:', err)
    return { sent: 0, reason: 'error' }
  }
}

/* ============================================================
   Stage digests — one email per review session, not per approval.

   When a reviewer clears a requisition it moves to the next stage, and that
   stage's holders get an in-app notification immediately. The *email* is
   deferred here instead: each approval queues a row, and the dispatcher sends
   one bundled email per stage once the approvals stop coming. A Lead working
   through fifteen requisitions therefore sends Supply Chain one email, not
   fifteen.
   ============================================================ */

/** Stages that receive bundled emails. The Lead's inbound batch is the weekly digest instead. */
const DIGEST_STAGES = ['supply_chain', 'admin', 'cost_control', 'finance'] as const

/** Where each stage works its queue — the digest's call to action. */
const STAGE_QUEUE_PATH: Record<string, string> = {
  lead: '/sam/requests',
  supply_chain: '/mintah/queue',
  admin: '/admin/requests',
  cost_control: '/cost-control',
  finance: '/finance/queue',
}

/** Send once nothing new has arrived for this long — the "they've finished reviewing" signal. */
const DIGEST_QUIET_MINUTES = 10
/** …but never sit on a batch longer than this, however steadily approvals trickle in. */
const DIGEST_MAX_WAIT_MINUTES = 30

/** Queue a requisition for its new stage's next bundled email. */
export async function enqueueStageDigest(
  stage: string,
  requestId: string,
  approvedBy: string | null
): Promise<void> {
  try {
    await execute(
      `INSERT INTO public.stage_digest_queue (stage, request_id, approved_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (stage, request_id)
         DO UPDATE SET queued_at = now(), approved_by = EXCLUDED.approved_by`,
      [stage, requestId, approvedBy]
    )
  } catch (err) {
    console.error('Failed to queue a stage digest:', err)
  }
}

/**
 * Send each stage's pending batch, where the batch has settled.
 *
 * Runs off the same cron as reminders, so how soon a batch goes out after a
 * reviewer finishes is bounded by how often that cron fires.
 */
export async function dispatchStageDigests(): Promise<{ sent: Record<string, number> }> {
  const sent: Record<string, number> = {}
  const { STAGES } = await import('@/lib/workflow')

  for (const stage of DIGEST_STAGES) {
    try {
      const window = await queryOne<{ oldest: string | null; newest: string | null; count: number }>(
        `SELECT MIN(queued_at) AS oldest, MAX(queued_at) AS newest, COUNT(*)::int AS count
           FROM public.stage_digest_queue
          WHERE stage = $1`,
        [stage]
      )
      if (!window || !window.count || !window.newest || !window.oldest) continue

      const quietFor = (Date.now() - new Date(window.newest).getTime()) / 60_000
      const waitingFor = (Date.now() - new Date(window.oldest).getTime()) / 60_000
      // Still mid-session: give the reviewer a chance to add to the batch.
      if (quietFor < DIGEST_QUIET_MINUTES && waitingFor < DIGEST_MAX_WAIT_MINUTES) continue

      const queued = await query<{ request_id: string }>(
        `SELECT request_id FROM public.stage_digest_queue WHERE stage = $1`,
        [stage]
      )
      const requestIds = queued.map((q) => q.request_id)
      if (requestIds.length === 0) continue

      // Only requisitions still sitting at this stage belong in the email — one
      // that has already moved on (or been sent back) would be noise.
      const items = await query<{
        id: string
        purpose: string
        requester_name: string | null
        project_name: string | null
        total_amount: number | null
      }>(
        `SELECT r.id, r.purpose, u.name AS requester_name, p.name AS project_name, r.total_amount
           FROM public.requests r
           LEFT JOIN public.users u ON u.id = r.created_by
           LEFT JOIN public.projects p ON p.id = r.project_id
          WHERE r.id = ANY($1::uuid[])
            AND r.status = $2
          ORDER BY r.created_at ASC`,
        [requestIds, STAGES[stage].status]
      )

      // Clear the batch either way: what is no longer here is not coming back.
      await execute(`DELETE FROM public.stage_digest_queue WHERE stage = $1`, [stage])
      if (items.length === 0) continue

      const holders = await query<{ id: string; email: string; name: string }>(
        `SELECT id, email, name FROM public.users
          WHERE role = ANY($1::text[])
            AND COALESCE(is_active, true)
            AND auth_id NOT LIKE 'pending:%'`,
        [STAGES[stage].roles]
      )

      const previous = STAGE_ORDER_BEFORE(stage)
      const queueUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}${STAGE_QUEUE_PATH[stage] ?? '/'}`

      let count = 0
      for (const holder of holders) {
        if (!holder.email) continue
        await sendStageDigestEmail({
          recipientEmail: holder.email,
          recipientName: holder.name || 'there',
          stageLabel: STAGES[stage].label,
          fromStageLabel: previous ? STAGES[previous].label : 'The previous stage',
          items: items.map((r) => ({
            requestId: r.id,
            purpose: r.purpose,
            requesterName: r.requester_name || 'Unknown',
            projectName: r.project_name,
            amount: r.total_amount,
          })),
          queueUrl,
        })
        count++
      }
      sent[stage] = count
    } catch (err) {
      console.error(`Failed to dispatch the ${stage} digest:`, err)
    }
  }

  return { sent }
}

/** The stage that hands work to this one, for the digest's "approved by" line. */
function STAGE_ORDER_BEFORE(stage: string): 'requester' | 'lead' | 'supply_chain' | 'admin' | 'cost_control' | null {
  const order = ['requester', 'lead', 'supply_chain', 'admin', 'cost_control', 'finance'] as const
  const i = order.indexOf(stage as (typeof order)[number])
  return i > 0 ? (order[i - 1] as 'requester' | 'lead' | 'supply_chain' | 'admin' | 'cost_control') : null
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


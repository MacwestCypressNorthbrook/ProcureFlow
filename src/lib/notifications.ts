import { query, queryOne, execute } from '@/lib/db'
import {
  esc as escapeHtml,
  sendEmail,
  sendActionReminderEmail,
  sendNotificationDigestEmail,
  sendStageDigestEmail,
} from '@/lib/email/client'
import { deliverNotificationEmail } from '@/lib/email/delivery'
import { linkForRole, type LinkTarget } from '@/lib/links'
import type { Notification, Reminder } from '@/lib/types'
import { getStageInbox } from '@/lib/review'
import { accraDateStr } from '@/lib/settings'
import {
  ROLE_IDS,
  emailPolicyFor,
  getNotificationSettings,
  isDigestDue,
  markRoleDigestSent,
} from '@/lib/notification-settings'
import { normalizeRole, type RoleId } from '@/lib/roles'

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

    const recipient =
      target || sendEmailAlert
        ? await queryOne<{ role: string | null; email: string | null }>(
            `SELECT role, email FROM public.users WHERE id = $1 LIMIT 1`,
            [userId]
          )
        : null

    if (target) {
      resolvedLink = linkForRole(recipient?.role, target)
    }

    const inserted = await queryOne<Notification>(
      `INSERT INTO public.notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, title, message, type, link, is_read, created_at`,
      [userId, title, message, type, resolvedLink]
    )

    // The in-app row above is always immediate; the email follows the
    // recipient's role setting — now, in their digest, or not at all.
    if (sendEmailAlert && recipient?.email) {
      const email = recipient.email
      await deliverNotificationEmail(
        { id: userId, role: recipient.role },
        {
          title,
          message,
          link: resolvedLink,
          requestId: target?.type === 'request' ? target.id : null,
        },
        () =>
          sendEmail({
            to: email,
            subject: `[ProcureFlow] ${title}`,
            html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>${escapeHtml(title)}</h2>
              <p>${escapeHtml(message)}</p>
              ${resolvedLink ? `<p><a href="${process.env.NEXT_PUBLIC_APP_URL || ''}${resolvedLink}">View in ProcureFlow</a></p>` : ''}
            </div>
          `,
          })
      )
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
 * Send each daily or weekly digest that is due.
 *
 * For every role on a digest (Admin → Notifications), once its configured
 * hour has passed on a matching day, each active person in that role gets one
 * email: the notification emails held for them since their last digest,
 * grouped by requisition, plus whatever is waiting in their stage's queue.
 * Their in-app notifications were already instant.
 *
 * Safe to call from a cron that fires every few minutes — each role sends at
 * most once per Accra-local day, tracked in `app_settings`, so changing a
 * schedule in Admin takes effect without a deploy. Emails held for a role
 * that has since been switched back to "immediately" are flushed on the next
 * run; for a role switched to "off", they are dropped.
 */
export async function dispatchEmailDigests(): Promise<{ sent: Partial<Record<RoleId, number>> }> {
  const sent: Partial<Record<RoleId, number>> = {}
  const { STAGES, STAGE_ORDER } = await import('@/lib/workflow')
  const settings = await getNotificationSettings()
  const today = accraDateStr()
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const absolute = (link: string | null) => (link && link.startsWith('/') ? `${baseUrl}${link}` : link)

  // Legacy role values (`sam`, `mintah`…) map to a role only through
  // normalizeRole, which SQL cannot call — so match here, as the dispatcher does.
  let people: Array<{ id: string; email: string | null; name: string | null; role: string | null }>
  let queued: Set<string>
  try {
    // Who has emails held. On most runs nobody does and no role's digest is
    // due, so there is nothing to send and no reason to read the user table.
    queued = new Set(
      (await query<{ user_id: string }>(`SELECT DISTINCT user_id FROM public.email_digest_queue`)).map((r) => r.user_id)
    )
    const anyDue = ROLE_IDS.some((role) => isDigestDue(settings.roles[role], settings.lastSent[role]))
    if (queued.size === 0 && !anyDue) return { sent }

    people = (
      await query<{ id: string; email: string | null; name: string | null; role: string | null }>(
        `SELECT id, email, name, role FROM public.users
          WHERE COALESCE(is_active, true) AND auth_id NOT LIKE 'pending:%'`
      )
    ).filter((p) => p.email)
  } catch (err) {
    console.error('Failed to prepare email digests:', err)
    return { sent }
  }

  for (const role of ROLE_IDS) {
    try {
      const policy = settings.roles[role]
      const scheduled = isDigestDue(policy, settings.lastSent[role])
      // Off the schedule, only people with something held have anything to flush.
      const members = people.filter(
        (p) => normalizeRole(p.role) === role && (scheduled || queued.has(p.id))
      )
      if (members.length === 0) continue

      if (policy.delivery === 'off') {
        await execute(`DELETE FROM public.email_digest_queue WHERE user_id = ANY($1::uuid[])`, [members.map((m) => m.id)])
        continue
      }

      // A role switched back to "immediately" with emails still held: flush now.
      if (!scheduled && policy.delivery !== 'immediate') continue

      // The stages this role holds — exactly, not every stage an elevated role
      // could oversee, or an Administrator's digest would list the whole chain.
      const stages = STAGE_ORDER.filter((s) => STAGES[s].roles.includes(role))
      const waiting = scheduled ? (await Promise.all(stages.map((s) => getStageInbox(s)))).flat() : []
      const queueUrl = stages.length > 0 ? `${baseUrl}${STAGE_QUEUE_PATH[stages[0]] ?? '/'}` : baseUrl || null

      let count = 0
      for (const member of members) {
        const held = await query<{
          id: string
          request_id: string | null
          purpose: string | null
          title: string
          message: string | null
          link: string | null
          queued_at: string
        }>(
          `SELECT q.id, q.request_id, r.purpose, q.title, q.message, q.link, q.queued_at
             FROM public.email_digest_queue q
             LEFT JOIN public.requests r ON r.id = q.request_id
            WHERE q.user_id = $1
            ORDER BY q.queued_at ASC`,
          [member.id]
        )
        if (held.length === 0 && waiting.length === 0) continue

        // One group per requisition; a notice about anything else stands alone.
        // The same event often arrives twice (an in-app alert and a designed
        // email for one action), so identical lines within a group collapse.
        const groups = new Map<string, { heading: string; link: string | null; updates: Array<{ title: string; message: string | null; at: string }> }>()
        for (const h of held) {
          const key = h.request_id ?? `${h.title}\u0000${h.message ?? ''}`
          const group = groups.get(key) ?? {
            heading: h.purpose ?? h.title,
            link: absolute(h.link),
            updates: [],
          }
          if (!group.updates.some((u) => u.title === h.title && u.message === h.message)) {
            group.updates.push({ title: h.title, message: h.message, at: h.queued_at })
          }
          groups.set(key, group)
        }

        await sendNotificationDigestEmail({
          recipientEmail: member.email!,
          recipientName: member.name || 'there',
          period: policy.delivery === 'daily' ? 'daily' : 'weekly',
          groups: [...groups.values()],
          waiting: waiting.map((r) => ({
            purpose: r.purpose,
            requesterName: r.requester_name || 'Unknown',
            projectName: r.project_name,
            amount: r.total_amount,
            urgent: Boolean(r.is_urgent),
          })),
          queueUrl,
        })

        if (held.length > 0) {
          await execute(`DELETE FROM public.email_digest_queue WHERE id = ANY($1::uuid[])`, [held.map((h) => h.id)])
        }
        count++
      }

      if (scheduled) await markRoleDigestSent(role, today)
      if (count > 0) sent[role] = count
    } catch (err) {
      console.error(`Failed to dispatch the ${role} email digest:`, err)
    }
  }

  return { sent }
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

  // One round-trip for every stage's batch window; most runs find none.
  let windows: Array<{ stage: string; oldest: string; newest: string }>
  try {
    windows = await query<{ stage: string; oldest: string; newest: string }>(
      `SELECT stage, MIN(queued_at) AS oldest, MAX(queued_at) AS newest
         FROM public.stage_digest_queue
        WHERE stage = ANY($1::text[])
        GROUP BY stage`,
      [[...DIGEST_STAGES]]
    )
  } catch (err) {
    console.error('Failed to read the stage digest queue:', err)
    return { sent }
  }

  for (const stage of DIGEST_STAGES) {
    try {
      const window = windows.find((w) => w.stage === stage)
      if (!window) continue

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

      const allHolders = await query<{ id: string; email: string; name: string; role: string }>(
        `SELECT id, email, name, role FROM public.users
          WHERE role = ANY($1::text[])
            AND COALESCE(is_active, true)
            AND auth_id NOT LIKE 'pending:%'`,
        [STAGES[stage].roles]
      )
      // A holder whose role is on a daily or weekly digest (or has email off)
      // sees this batch in the digest's "Waiting on you" list instead.
      const holders: typeof allHolders = []
      for (const h of allHolders) {
        if ((await emailPolicyFor(h.role)).delivery === 'immediate') holders.push(h)
      }

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
function STAGE_ORDER_BEFORE(stage: string): 'requester' | 'lead' | 'supply_chain' | 'cost_control' | null {
  if (stage === 'cost_control') return 'supply_chain'
  if (stage === 'supply_chain') return 'lead'
  if (stage === 'lead') return 'requester'
  return null
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


/* ============================================================
   Everyone on a requisition
   ============================================================ */

/** A person who should hear about a requisition, with the role that routes their link. */
export interface RequisitionParty {
  id: string
  name: string | null
  email: string | null
  role: string | null
  /** Why they are on the list, used to word the message. */
  relation: 'requester' | 'stage'
}

/**
 * Everyone with a stake in one requisition.
 *
 * That is the engineer who raised it plus every active holder of the roles in
 * the chain — Project Lead, Supply Chain, Cost Control and Administration. A
 * purchase order is the document the whole chain argues about, so when one is
 * attached or accepted it is not enough to tell the stage that happens to hold
 * the requisition at that moment; everybody who has touched it, or is about to,
 * needs to know it exists.
 *
 * Deduplicated by user id, because the requester is frequently also a holder of
 * one of these roles on a small team.
 */
export async function getRequisitionParties(requestId: string): Promise<RequisitionParty[]> {
  const { STAGES, REVIEW_STAGES } = await import('@/lib/workflow')

  const chainRoles = Array.from(new Set(REVIEW_STAGES.flatMap((s) => STAGES[s].roles)))

  try {
    const [requesterRows, holders] = await Promise.all([
      query<{ id: string; name: string | null; email: string | null; role: string | null }>(
        `SELECT u.id, u.name, u.email, u.role
           FROM public.requests r
           JOIN public.users u ON u.id = r.created_by
          WHERE r.id = $1`,
        [requestId]
      ),
      query<{ id: string; name: string | null; email: string | null; role: string | null }>(
        `SELECT id, name, email, role
           FROM public.users
          WHERE role = ANY($1::text[])
            AND COALESCE(is_active, true)
            AND auth_id NOT LIKE 'pending:%'`,
        [chainRoles]
      ),
    ])

    const seen = new Set<string>()
    const parties: RequisitionParty[] = []

    for (const r of requesterRows) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      parties.push({ ...r, relation: 'requester' })
    }
    for (const h of holders) {
      if (seen.has(h.id)) continue
      seen.add(h.id)
      parties.push({ ...h, relation: 'stage' })
    }

    return parties
  } catch (err) {
    console.error('Failed to resolve the parties on a requisition:', err)
    return []
  }
}

/**
 * Tell everyone on a requisition something, each linked into their own area.
 *
 * `target` rather than a fixed `link`: the areas are role-guarded, so one URL
 * cannot serve an engineer and an administrator at once.
 */
export async function notifyRequisitionParties(
  requestId: string,
  {
    title,
    message,
    type = 'info',
    sendEmailAlert = false,
    excludeUserId,
  }: {
    title: string
    message: string
    type?: 'info' | 'approval' | 'reminder' | 'warning' | 'success'
    sendEmailAlert?: boolean
    excludeUserId?: string | null
  }
): Promise<number> {
  const parties = await getRequisitionParties(requestId)
  const targets = excludeUserId ? parties.filter((p) => p.id !== excludeUserId) : parties

  await Promise.all(
    targets.map((p) =>
      createNotification({
        userId: p.id,
        title,
        message,
        type,
        target: { type: 'request', id: requestId },
        sendEmailAlert,
      })
    )
  )

  return targets.length
}

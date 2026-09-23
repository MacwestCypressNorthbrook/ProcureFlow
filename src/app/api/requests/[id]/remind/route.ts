import { execute, query, queryOne } from '@/lib/db'
import { getUserFromSession } from '@/lib/auth/server'
import { isElevated } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import type { Request as DbRequest, PurchaseOrder } from '@/lib/types'
import { currentStage, STAGES, stageSeesPurchaseOrder, type RequestStatus } from '@/lib/workflow'

/** Hours a requester must wait before nudging the same request again. */
const COOLDOWN_HOURS = 6

interface Holder {
  roles: string[]
  stage: string
  link: (id: string) => string
}

/**
 * Who is sitting on this request right now.
 *
 * Requests carry no assignee column — a stage is held by a role, not a person —
 * so a nudge goes to every active user who could act on it. Returns null when
 * nobody is waiting to act (rejected, or already paid).
 */
async function currentHolder(request: DbRequest): Promise<Holder | null> {
  // Who holds the requisition is a property of its stage, not of any PO —
  // the stage chain in lib/workflow.ts is the single source of truth.
  const stage = currentStage(request.status as RequestStatus, request.sent_back_to ?? null)
  if (!stage) return null

  const definition = STAGES[stage]

  if (stage === 'requester') {
    // Waiting on the person who raised it; nobody else can be nudged.
    return null
  }

  const po = await queryOne<PurchaseOrder>(
    `SELECT id, status FROM public.purchase_orders
      WHERE request_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [request.id]
  )

  return {
    roles: [...definition.roles],
    stage: definition.label,
    link: (id) => (stageSeesPurchaseOrder(stage) && po ? definition.route(id) : definition.route(id)),
  }
}

/**
 * Nudge whoever currently holds a requisition.
 *
 * Only the requester (or an admin) can send one, and only once per
 * `COOLDOWN_HOURS` per request — a reminder people can spam is a reminder
 * people learn to ignore.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params

  const existing = await queryOne<DbRequest>(
    `SELECT id, purpose, status, created_by, created_at FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )
  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (existing.created_by !== user.id && !isElevated(user.role)) {
    return NextResponse.json({ error: 'You can only send reminders for your own requests.' }, { status: 403 })
  }

  const holder = await currentHolder(existing)
  if (!holder) {
    return NextResponse.json(
      { error: 'Nobody is waiting to act on this request right now.' },
      { status: 409 }
    )
  }

  // Throttle on the reminders table rather than on notification links: once a
  // request is converted the nudge points at a purchase order, so the request
  // id no longer appears in the link.
  const recent = await queryOne<{ sent_at: string }>(
    `SELECT sent_at FROM public.reminders
      WHERE target_id = $1
        AND target_type = 'request'
        AND status = 'sent'
        AND sent_at > now() - ($2 || ' hours')::interval
      ORDER BY sent_at DESC
      LIMIT 1`,
    [id, String(COOLDOWN_HOURS)]
  )
  if (recent) {
    return NextResponse.json(
      { error: `A reminder was already sent recently. You can send another in a few hours.` },
      { status: 429 }
    )
  }

  const recipients = await query<{ id: string }>(
    `SELECT id FROM public.users
      WHERE role = ANY($1::text[])
        AND COALESCE(is_active, true)
        AND auth_id NOT LIKE 'pending:%'`,
    [holder.roles]
  )
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: `No active user holds the ${holder.stage} stage — ask an administrator to assign one.` },
      { status: 409 }
    )
  }

  const waitingDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(existing.created_at).getTime()) / 86_400_000)
  )
  const from = user.name || user.email

  await Promise.all(
    recipients.map((r) =>
      createNotification({
        userId: r.id,
        title: 'Reminder: requisition awaiting action',
        message: `${from} is waiting on "${existing.purpose}", raised ${waitingDays} day${waitingDays === 1 ? '' : 's'} ago and currently at the ${holder.stage} stage.`,
        type: 'reminder',
        link: holder.link(id),
        sendEmailAlert: true,
      })
    )
  )

  // Logged as already-sent so the scheduled dispatcher never re-sends it.
  await execute(
    `INSERT INTO public.reminders (target_id, target_type, user_id, title, message, due_date, status, sent_at)
     VALUES ($1, 'request', $2, $3, $4, now(), 'sent', now())`,
    [
      id,
      user.id,
      'Requisition reminder',
      `Sent by ${from} to the ${holder.stage} stage (${recipients.length} recipient${recipients.length === 1 ? '' : 's'}).`,
    ]
  )

  return NextResponse.json({
    success: true,
    stage: holder.stage,
    notified: recipients.length,
  })
}

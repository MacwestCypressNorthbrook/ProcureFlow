import { query, queryOne, transaction } from '@/lib/db'
import { requireCapability, isElevated } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { formatCurrency } from '@/lib/utils'
import type { Request as DbRequest, User } from '@/lib/types'
import { STAGES, statusForStage, nextStage } from '@/lib/workflow'

/** The stage a freshly submitted requisition lands on. */
const FIRST_REVIEW_STAGE = nextStage('requester')!
import { getRequestWindowSettings, isRequestDayBlocked, blockedDaysLabel } from '@/lib/settings'

/** One material line as submitted by the requisition form. */
interface IncomingItem {
  description?: string
  quantity?: number | string
  unit?: string
  unitPrice?: number | string
  supplierId?: string | null
  remarks?: string
  category?: string
  isSubcontractor?: boolean
}

const MAX_ITEMS = 100

const toNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export async function POST(request: Request) {
  const guard = await requireCapability('request:create')
  if (guard.error) return guard.error

  const limit = await rateLimit(`request-create:${guard.user.id}`, { max: 20, windowSeconds: 300 })
  if (!limit.ok) return tooManyRequests('Too many requisitions submitted. Wait a few minutes.', limit.retryAfter)

  // The UI already closes the form on these days; this is the backstop for a
  // tab left open from before the window closed.
  if (!isElevated(guard.user.role)) {
    const requestWindow = await getRequestWindowSettings()
    if (isRequestDayBlocked(requestWindow)) {
      return NextResponse.json(
        { error: `Requisitions cannot be raised on ${blockedDaysLabel(requestWindow.blockedDays)}.` },
        { status: 403 }
      )
    }
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : ''
  if (!purpose) {
    return NextResponse.json({ error: 'A purpose is required' }, { status: 400 })
  }

  // ── Line items ────────────────────────────────────────────────────────────
  const rawItems = Array.isArray(body.items) ? (body.items as IncomingItem[]) : []
  const items = rawItems
    .map((item) => ({
      description: typeof item.description === 'string' ? item.description.trim() : '',
      quantity: toNumber(item.quantity),
      unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : null,
      unitPrice: toNumber(item.unitPrice),
      supplierId: typeof item.supplierId === 'string' && item.supplierId ? item.supplierId : null,
      remarks: typeof item.remarks === 'string' && item.remarks.trim() ? item.remarks.trim() : null,
      category:
        item.category === 'labour' ? 'labour' : item.category === 'other' ? 'other' : 'material',
      // Only labour can be sub-contracted; anything else ignores the flag.
      isSubcontractor: item.category === 'labour' && item.isSubcontractor === true,
    }))
    .filter((item) => item.description)

  if (items.length === 0) {
    return NextResponse.json(
      { error: 'At least one material or labour line with a description is required' },
      { status: 400 }
    )
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `A requisition may hold at most ${MAX_ITEMS} lines` }, { status: 400 })
  }

  // Money is computed here, never trusted from the client.
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

  // ── Project site ──────────────────────────────────────────────────────────
  const projectId = typeof body.project_id === 'string' && body.project_id ? body.project_id : null
  if (projectId) {
    const allowed = isElevated(guard.user.role)
      ? await queryOne<{ id: string }>(
          `SELECT id FROM public.projects WHERE id = $1 AND status = 'active'`,
          [projectId]
        )
      : await queryOne<{ id: string }>(
          `SELECT p.id FROM public.projects p
             JOIN public.project_members pm ON pm.project_id = p.id
            WHERE p.id = $1 AND pm.user_id = $2 AND p.status = 'active'`,
          [projectId, guard.user.id]
        )
    if (!allowed) {
      return NextResponse.json(
        { error: 'You are not assigned to that project site' },
        { status: 403 }
      )
    }
  }

  // Reject supplier ids that do not resolve, so a stale form cannot write dangling refs.
  const supplierIds = [...new Set(items.map((i) => i.supplierId).filter(Boolean))] as string[]
  if (supplierIds.length > 0) {
    const found = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM public.suppliers WHERE id = ANY($1::uuid[]) AND is_active`,
      [supplierIds]
    )
    if ((found?.count ?? 0) !== supplierIds.length) {
      return NextResponse.json({ error: 'One or more suppliers are no longer available' }, { status: 400 })
    }
  }

  // ── Persist header + lines atomically ─────────────────────────────────────
  const data = await queryOne<DbRequest>(
    `INSERT INTO public.requests (
       purpose, description, department, project_id, estimated_quantity,
       estimated_unit_rate, total_amount, currency, guest_name, guest_email,
       created_by, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, purpose, description, estimated_quantity, estimated_unit_rate,
               total_amount, status, created_at`,
    [
      purpose,
      typeof body.description === 'string' ? body.description : null,
      typeof body.department === 'string' ? body.department : null,
      projectId,
      totalQuantity,
      items.length === 1 ? items[0].unitPrice : null,
      totalAmount,
      typeof body.currency === 'string' ? body.currency : 'GHS',
      typeof body.guest_name === 'string' ? body.guest_name : null,
      typeof body.guest_email === 'string' ? body.guest_email : null,
      guard.user.id,
      // Enters the chain at the first review stage, so it lands in the
      // Project Lead's queue rather than a legacy status nothing looks at.
      statusForStage('lead'),
    ]
  )

  if (!data) {
    return NextResponse.json({ error: 'Failed to create requisition' }, { status: 500 })
  }

  try {
    await transaction([
      ...items.map((item, index): [string, unknown[]] => [
        `INSERT INTO public.request_items
           (request_id, position, description, quantity, unit, unit_price, supplier_id, remarks, category, is_subcontractor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          data.id,
          index,
          item.description,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.supplierId,
          item.remarks,
          item.category,
          item.isSubcontractor,
        ],
      ]),
      // The first line of the requisition's history: who raised it, for how much.
      [
        `INSERT INTO public.request_approvals (request_id, stage, action, performed_by, comment)
         VALUES ($1, 'requester', 'submitted', $2, $3)`,
        [
          data.id,
          guard.user.id,
          `${items.length} line${items.length === 1 ? '' : 's'}, ${formatCurrency(totalAmount)}.`,
        ],
      ],
    ])
  } catch {
    // The header without its lines is an unusable record — remove it rather
    // than leaving a half-written requisition in the reviewers' queue.
    await queryOne(`DELETE FROM public.requests WHERE id = $1`, [data.id])
    return NextResponse.json({ error: 'Failed to save requisition line items' }, { status: 500 })
  }

  // ── Notify the stage that actually holds it (best effort) ─────────────────
  //
  // A stage hears about a requisition when it ARRIVES at that stage, never
  // before. A new requisition sits with the Project Lead, so the Project Lead
  // is who gets told. Cost Control and the Administrator are the fourth and
  // fifth stages of the chain and have nothing to do until it reaches them —
  // they used to be emailed on every single submission, which is noise that
  // trains people to ignore the alerts that do matter.
  //
  // The recipients are derived from `STAGES` rather than listed here, so this
  // cannot drift out of step with the chain the way the old hardcoded role
  // list did.
  try {
    const holderRoles = STAGES[FIRST_REVIEW_STAGE].roles
    const holders = await query<User>(
      `SELECT id, email, name, role FROM public.users
        WHERE role = ANY($1::text[])
          AND COALESCE(is_active, true)
          AND auth_id NOT LIKE 'pending:%'`,
      [holderRoles]
    )

    for (const holder of holders) {
      await createNotification({
        userId: holder.id,
        title: 'New requisition to review',
        message: `${guard.user.name || 'An engineer'} submitted "${purpose}" for your review.`,
        type: 'approval',
        target: { type: 'request', id: data.id },
      })
    }

    // Super Users oversee the whole system, so they get the in-app record —
    // but not the per-requisition email, which would be the same flood by
    // another name.
    const overseers = await query<User>(
      `SELECT id, email, name, role FROM public.users
        WHERE role IN ('super_user', 'superuser')
          AND COALESCE(is_active, true)
          AND auth_id NOT LIKE 'pending:%'`
    )
    for (const overseer of overseers) {
      if (holders.some((h) => h.id === overseer.id)) continue
      await createNotification({
        userId: overseer.id,
        title: 'New requisition submitted',
        message: `${guard.user.name || 'An engineer'} submitted "${purpose}". It is with the ${STAGES[FIRST_REVIEW_STAGE].label}.`,
        type: 'info',
        target: { type: 'request', id: data.id },
      })
    }

    // The full designed notice — materials, notes and the chain — to the one
    // stage that has to act on it.
    await dispatchWorkflowEmail({
      eventType: 'requisition_submitted',
      requestId: data.id,
      recipientRole: holderRoles[0],
      performerId: guard.user.id,
    })
  } catch (notifyErr) {
    console.error('Error notifying the holding stage:', notifyErr)
  }

  return NextResponse.json({ data }, { status: 201 })
}

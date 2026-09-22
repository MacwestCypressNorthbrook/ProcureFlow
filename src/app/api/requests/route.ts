import { query, queryOne, transaction } from '@/lib/db'
import { requireCapability, isElevated } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { sendRequisitionAlertEmail } from '@/lib/email/client'
import { NextResponse } from 'next/server'
import type { Request as DbRequest, User } from '@/lib/types'

/** One material line as submitted by the requisition form. */
interface IncomingItem {
  description?: string
  quantity?: number | string
  unit?: string
  unitPrice?: number | string
  supplierId?: string | null
  remarks?: string
}

const MAX_ITEMS = 100

const toNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export async function POST(request: Request) {
  const guard = await requireCapability('request:create')
  if (guard.error) return guard.error

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
    }))
    .filter((item) => item.description)

  if (items.length === 0) {
    return NextResponse.json(
      { error: 'At least one material line with a description is required' },
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
      'pending',
    ]
  )

  if (!data) {
    return NextResponse.json({ error: 'Failed to create requisition' }, { status: 500 })
  }

  try {
    await transaction(
      items.map((item, index) => [
        `INSERT INTO public.request_items
           (request_id, position, description, quantity, unit, unit_price, supplier_id, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          data.id,
          index,
          item.description,
          item.quantity,
          item.unit,
          item.unitPrice,
          item.supplierId,
          item.remarks,
        ],
      ])
    )
  } catch {
    // The header without its lines is an unusable record — remove it rather
    // than leaving a half-written requisition in the reviewers' queue.
    await queryOne(`DELETE FROM public.requests WHERE id = $1`, [data.id])
    return NextResponse.json({ error: 'Failed to save requisition line items' }, { status: 500 })
  }

  // ── Notify reviewers (best effort) ────────────────────────────────────────
  try {
    const reviewers = await query<User>(
      `SELECT id, email, name, role FROM public.users
       WHERE role IN ('project_lead', 'cost_control', 'administrator', 'super_user')
         AND is_active`
    )

    for (const reviewer of reviewers) {
      await createNotification({
        userId: reviewer.id,
        title: 'New Requisition Submitted',
        message: `${guard.user.name || 'An engineer'} submitted a requisition: "${purpose}" for review.`,
        type: 'approval',
        target: { type: 'request', id: data.id },
      })

      if (reviewer.email) {
        await sendRequisitionAlertEmail({
          recipientEmail: reviewer.email,
          recipientName: reviewer.name || reviewer.role,
          requestId: data.id,
          purpose,
          requesterName: guard.user.name || guard.user.email,
          estimatedAmount: totalAmount,
          roleName: reviewer.role,
        })
      }
    }
  } catch (notifyErr) {
    console.error('Error notifying reviewers:', notifyErr)
  }

  return NextResponse.json({ data }, { status: 201 })
}

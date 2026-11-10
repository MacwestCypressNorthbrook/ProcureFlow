import { query, queryOne, execute, transaction } from '@/lib/db'
import { lineNeedsSupplier, supplierRequiredMessage } from '@/lib/supplier-rule'
import { getRequestItems } from '@/lib/requests'
import { requireCapability } from '@/lib/auth-guard'
import { isElevated, normalizeRole } from '@/lib/roles'
import { formatCurrency } from '@/lib/utils'
import { currentStage } from '@/lib/workflow'
import { NextResponse } from 'next/server'
import type { Request as DbRequest } from '@/lib/types'
import { extractRequisition } from '@/lib/requisitions'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('po:view')
  if (guard.error) return guard.error

  const data = await queryOne<
    DbRequest & { requestor?: { id: string; name: string; email: string; role: string } }
  >(
    `SELECT r.*,
            json_build_object(
              'id', u.id,
              'name', u.name,
              'email', u.email,
              'role', u.role
            ) as requestor
     FROM public.requests r
     LEFT JOIN public.users u ON u.id = r.created_by
     WHERE r.id = $1
     LIMIT 1`,
    [id]
  )

  if (!data) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const items = await getRequestItems(id)

  return NextResponse.json({ data: { ...data, items } })
}

const toNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

interface IncomingItem {
  id?: string
  description?: string
  quantity?: number | string
  unit?: string
  unitPrice?: number | string
  unit_price?: number | string
  supplierId?: string | null
  supplier_id?: string | null
  remarks?: string
  category?: string
  isSubcontractor?: boolean
  is_subcontractor?: boolean
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireCapability('request:edit')
  if (guard.error) return guard.error

  const existing = await queryOne<DbRequest>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  // Leads and elevated roles may edit any request; everyone else, their own.
  const mayEditAny = isElevated(guard.user.role) || normalizeRole(guard.user.role) === 'project_lead'
  const isOwner =
    existing.created_by === guard.user.id ||
    (!existing.created_by && (guard.user.role === 'engineer' || existing.guest_email === guard.user.email))

  if (!mayEditAny && !isOwner) {
    return NextResponse.json({ error: 'Only the owner or leads can update this request' }, { status: 403 })
  }

  const editableStatuses = ['draft', 'pending_lead', 'sent_back', 'new', 'reviewing']
  if (!mayEditAny && !editableStatuses.includes(existing.status)) {
    return NextResponse.json(
      { error: `Requests with status "${existing.status}" cannot be modified.` },
      { status: 400 }
    )
  }

  // ── If line items are provided, update header + request_items ─────────────
  if (Array.isArray(body.items)) {
    const rawItems = body.items as IncomingItem[]
    const items = rawItems
      .map((item) => {
        const qty = toNumber(item.quantity)
        const price = toNumber(item.unitPrice ?? item.unit_price)
        const category = item.category === 'labour' ? 'labour' : item.category === 'other' ? 'other' : 'material'
        const isSub = category === 'labour' && (item.isSubcontractor === true || item.is_subcontractor === true)
        const supplierId =
          typeof item.supplierId === 'string' && item.supplierId
            ? item.supplierId
            : typeof item.supplier_id === 'string' && item.supplier_id
              ? item.supplier_id
              : null
        return {
          description: typeof item.description === 'string' ? item.description.trim() : '',
          quantity: qty,
          unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : null,
          unitPrice: price,
          supplierId,
          remarks: typeof item.remarks === 'string' && item.remarks.trim() ? item.remarks.trim() : null,
          category,
          isSubcontractor: isSub,
        }
      })
      .filter((item) => item.description)

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'At least one material or labour line with a description is required' },
        { status: 400 }
      )
    }

    const unsourced = items.find((i) => !i.supplierId && lineNeedsSupplier(i))
    if (unsourced) {
      return NextResponse.json({ error: supplierRequiredMessage(unsourced.description) }, { status: 400 })
    }

    const totalAmount = items.reduce((sum, item) => {
      const isLump = item.category === 'other' || (item.category === 'labour' && item.isSubcontractor)
      return sum + (isLump ? item.unitPrice : item.quantity * item.unitPrice)
    }, 0)
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

    const purpose =
      typeof body.purpose === 'string' && body.purpose.trim()
        ? body.purpose.trim()
        : items.length > 1
          ? `${items[0].description} + ${items.length - 1} more`
          : items[0].description

    const projectId =
      typeof body.project_id === 'string' && body.project_id
        ? body.project_id
        : existing.project_id ?? null
    const department =
      typeof body.department === 'string' && body.department
        ? body.department
        : existing.department ?? null

    const supplierIds = [...new Set(items.map((i) => i.supplierId).filter(Boolean))] as string[]
    const project = projectId
      ? await queryOne<{ name: string; code: string }>(
          `SELECT name, code FROM public.projects WHERE id = $1`,
          [projectId]
        )
      : null
    const suppliers =
      supplierIds.length > 0
        ? await query<{ id: string; name: string }>(
            `SELECT id, name FROM public.suppliers WHERE id = ANY($1::uuid[])`,
            [supplierIds]
          )
        : []
    const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]))

    const notes = typeof body.notes === 'string' ? body.notes.trim() : null
    const { data: existingRich } = extractRequisition(existing.description)

    const richDoc = {
      type: 'rich_requisition',
      header: existingRich?.header ?? {
        companyLogo: 'MACWEST',
        docTitle: 'REQUISITION FORM',
        docNo: 'MACWL-IMS-A-RF-001',
        version: '1.0',
        page: 'Page 1 of 1',
      },
      details: {
        name:
          typeof body.guest_name === 'string' && body.guest_name
            ? body.guest_name
            : existingRich?.details?.name || guard.user.name || '',
        department: department || existingRich?.details?.department || 'Operations',
        project: project ? [project.name, project.code].filter(Boolean).join(' · ') : existingRich?.details?.project || '',
        date: existingRich?.details?.date || new Date().toISOString().slice(0, 10),
      },
      items: items.map((l) => ({
        category: l.category,
        isSubcontractor: l.isSubcontractor,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit || '',
        unitPrice: l.unitPrice,
        amount: l.category === 'other' || (l.category === 'labour' && l.isSubcontractor) ? l.unitPrice : l.quantity * l.unitPrice,
        supplierName: l.supplierId ? supplierMap.get(l.supplierId) ?? '' : '',
        remarks: l.remarks || '',
      })),
      signatures: existingRich?.signatures ?? {
        requestedBy: guard.user.name || '',
        headOfDept: '',
        approvedBy: '',
        paidBy: '',
      },
      generalNotes:
        notes !== null
          ? notes
          : existingRich?.generalNotes ??
            (typeof body.description === 'string' && !body.description.trim().startsWith('{')
              ? body.description.trim()
              : ''),
    }

    const descriptionJson = JSON.stringify(richDoc)

    // Every line is replaced, so the history records what the edit did to the
    // requisition as a whole — enough to see that the amount approved upstream
    // is not the amount now on the form.
    const before = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM public.request_items WHERE request_id = $1`,
      [id]
    )
    const previousTotal = existing.total_amount == null ? null : Number(existing.total_amount)
    const editSummary = [
      previousTotal === totalAmount
        ? `Total unchanged at ${formatCurrency(totalAmount)}`
        : `Total: ${formatCurrency(previousTotal)} → ${formatCurrency(totalAmount)}`,
      before?.count === items.length
        ? `${items.length} line${items.length === 1 ? '' : 's'}`
        : `Lines: ${before?.count ?? 0} → ${items.length}`,
    ].join('; ') + '.'

    // Replace the lines, update the header and record the edit as one unit, so
    // a failure part-way cannot leave a requisition with no lines or an
    // unrecorded change.
    const results = await transaction<DbRequest>([
      [`DELETE FROM public.request_items WHERE request_id = $1`, [id]],
      ...items.map((item, index): [string, unknown[]] => [
        `INSERT INTO public.request_items
           (request_id, position, description, quantity, unit, unit_price, supplier_id, remarks, category, is_subcontractor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
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
      [
        `UPDATE public.requests
            SET purpose = $1,
                description = $2,
                department = $3,
                project_id = $4,
                estimated_quantity = $5,
                estimated_unit_rate = $6,
                total_amount = $7,
                guest_name = COALESCE($8, guest_name),
                guest_email = COALESCE($9, guest_email),
                updated_at = now()
          WHERE id = $10
          RETURNING *`,
        [
          purpose,
          descriptionJson,
          department,
          projectId,
          totalQuantity,
          items.length === 1 ? items[0].unitPrice : null,
          totalAmount,
          typeof body.guest_name === 'string' ? body.guest_name : null,
          typeof body.guest_email === 'string' ? body.guest_email : null,
          id,
        ],
      ],
      editedStatement(id, existing, guard.user, editSummary),
    ])

    // The header UPDATE is the second-to-last statement.
    const data = results[results.length - 2]?.[0] ?? null

    return NextResponse.json({ data, success: true })
  }

  // ── Fallback for simple field updates without items array ──────────────────
  const estQty = body.estimated_quantity ? Number(body.estimated_quantity) : null
  const estRate = body.estimated_unit_rate ? Number(body.estimated_unit_rate) : null
  const totalAmount = estQty && estRate ? estQty * estRate : null

  const previousTotal = existing.total_amount == null ? null : Number(existing.total_amount)
  const editSummary =
    totalAmount !== null && totalAmount !== previousTotal
      ? `Total: ${formatCurrency(previousTotal)} → ${formatCurrency(totalAmount)}.`
      : 'Details updated.'

  const results = await transaction<DbRequest>([
    [
      `UPDATE public.requests
       SET purpose = COALESCE($1, purpose),
           description = COALESCE($2, description),
           department = COALESCE($3, department),
           estimated_quantity = COALESCE($4, estimated_quantity),
           estimated_unit_rate = COALESCE($5, estimated_unit_rate),
           total_amount = COALESCE($6, total_amount),
           guest_name = COALESCE($7, guest_name),
           guest_email = COALESCE($8, guest_email),
           updated_at = now()
       WHERE id = $9
       RETURNING *`,
      [
        body.purpose,
        body.description,
        body.department,
        estQty,
        estRate,
        totalAmount,
        body.guest_name,
        body.guest_email,
        id,
      ],
    ],
    editedStatement(id, existing, guard.user, editSummary),
  ])

  return NextResponse.json({ data: results[0]?.[0] ?? null, success: true })
}

/**
 * The `edited` entry for a requisition's history, as a [sql, params] pair for
 * `transaction()`. Filed under the stage holding the requisition when it was
 * edited when a reviewer made the change, or under `requester` when the
 * requester did, so the label reflects who acted.
 */
function editedStatement(
  requestId: string,
  existing: DbRequest,
  user: { id: string; role: string },
  summary: string
): [string, unknown[]] {
  // The label names who acted, not where the requisition sat: a requester
  // editing their own request must not read as the Project Lead.
  const actsAsReviewer = isElevated(user.role) || normalizeRole(user.role) === 'project_lead'
  const stage = actsAsReviewer
    ? currentStage(existing.status, existing.sent_back_to) ?? 'requester'
    : 'requester'
  const userId = user.id
  return [
    `INSERT INTO public.request_approvals (request_id, stage, action, performed_by, comment)
     VALUES ($1, $2, 'edited', $3, $4)`,
    [requestId, stage, userId, summary],
  ]
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('request:edit')
  if (guard.error) return guard.error

  const existing = await queryOne<DbRequest>(
    `SELECT id, created_by, status FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (!isElevated(guard.user.role) && existing.created_by !== guard.user.id) {
    return NextResponse.json({ error: 'Only the owner can delete this request' }, { status: 403 })
  }

  await execute(`DELETE FROM public.requests WHERE id = $1`, [id])
  return NextResponse.json({ success: true })
}

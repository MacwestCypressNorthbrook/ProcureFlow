import { query, queryOne, execute, transaction } from '@/lib/db'
import { getRequestItems } from '@/lib/requests'
import { requireCapability } from '@/lib/auth-guard'
import { isElevated, normalizeRole } from '@/lib/roles'
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

    // Atomically replace request_items and update request header
    await execute(`DELETE FROM public.request_items WHERE request_id = $1`, [id])
    await transaction(
      items.map((item, index) => [
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
      ])
    )

    const data = await queryOne<DbRequest>(
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
      ]
    )

    return NextResponse.json({ data, success: true })
  }

  // ── Fallback for simple field updates without items array ──────────────────
  const estQty = body.estimated_quantity ? Number(body.estimated_quantity) : null
  const estRate = body.estimated_unit_rate ? Number(body.estimated_unit_rate) : null
  const totalAmount = estQty && estRate ? estQty * estRate : null

  const data = await queryOne<DbRequest>(
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
    ]
  )

  return NextResponse.json({ data, success: true })
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

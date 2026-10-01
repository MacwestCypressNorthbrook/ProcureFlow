import { queryOne, transaction } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { isElevated } from '@/lib/roles'
import { formatCurrency } from '@/lib/utils'
import { NextResponse } from 'next/server'
import type { PurchaseOrder } from '@/lib/types'
import { getPoAuditTrail, poAuditStatement } from '@/lib/audit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('po:view')
  if (guard.error) return guard.error

  const po = await queryOne<PurchaseOrder & Record<string, unknown>>(
    `SELECT po.*,
            json_build_object('id', u1.id, 'name', u1.name, 'email', u1.email, 'role', u1.role) as requestor,
            json_build_object('id', u2.id, 'name', u2.name, 'email', u2.email, 'role', u2.role) as approver,
            json_build_object('id', u3.id, 'name', u3.name, 'email', u3.email, 'role', u3.role) as payer
     FROM public.purchase_orders po
     LEFT JOIN public.users u1 ON u1.id = po.created_by
     LEFT JOIN public.users u2 ON u2.id = COALESCE(po.approved_by, po.sam_approved_by)
     LEFT JOIN public.users u3 ON u3.id = po.paid_by
     WHERE po.id = $1
     LIMIT 1`,
    [id]
  )

  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  const auditTrail = await getPoAuditTrail(id)

  return NextResponse.json({ data: { ...po, audit_trail: auditTrail ?? [] } })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const guard = await requireCapability('po:view')
  if (guard.error) return guard.error

  const existing = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  }

  if (!isElevated(guard.user.role) && existing.created_by !== guard.user.id) {
    return NextResponse.json({ error: 'Only the creator can update this PO' }, { status: 403 })
  }

  const quantity = body.quantity !== undefined ? Number(body.quantity) : null
  const unitRate = body.unit_rate !== undefined ? Number(body.unit_rate) : null
  const totalAmount = quantity && unitRate ? quantity * unitRate : (body.total_amount ? Number(body.total_amount) : null)

  // What the edit actually changes, in words, for the audit trail. COALESCE
  // below keeps any field the body leaves out, so only supplied values count.
  const changes: string[] = []
  const noteText = (label: string, before: unknown, after: unknown) => {
    if (after === undefined || after === null || after === '' || String(after) === String(before ?? '')) return
    changes.push(`${label}: ${before ?? '—'} → ${after}`)
  }
  const noteAmount = (label: string, before: unknown, after: number | null) => {
    if (after === null || Number(before) === after) return
    changes.push(`${label}: ${formatCurrency(before === null ? null : Number(before))} → ${formatCurrency(after)}`)
  }
  noteText('Purpose', existing.purpose, body.purpose)
  noteText('Vendor', existing.vendor_name, body.vendor_name)
  noteText('Quantity', existing.quantity, quantity)
  noteAmount('Unit rate', existing.unit_rate, unitRate)
  noteAmount('Total', existing.total_amount, totalAmount)
  if (body.description && body.description !== existing.description) changes.push('Description updated')
  if (body.file_path && body.file_path !== existing.file_path) {
    changes.push(`Document replaced${body.file_name ? ` with ${body.file_name}` : ''}`)
  }

  // An edit to a sent-back or rejected PO is its resubmission.
  const resubmits = existing.status === 'sent_back' || existing.status === 'rejected'

  const results = await transaction<PurchaseOrder>([
    [
      `UPDATE public.purchase_orders
       SET purpose = COALESCE($1, purpose),
           description = COALESCE($2, description),
           vendor_name = COALESCE($3, vendor_name),
           quantity = COALESCE($4, quantity),
           unit_rate = COALESCE($5, unit_rate),
           total_amount = COALESCE($6, total_amount),
           file_path = COALESCE($7, file_path),
           file_name = COALESCE($8, file_name),
           status = CASE WHEN status = 'sent_back' OR status = 'rejected' THEN 'pending_cost_control' ELSE status END,
           updated_at = now()
       WHERE id = $9
       RETURNING *`,
      [
        body.purpose,
        body.description,
        body.vendor_name,
        quantity,
        unitRate,
        totalAmount,
        body.file_path,
        body.file_name,
        id,
      ],
    ],
    ...(changes.length > 0 ? [poAuditStatement(id, 'edited', guard.user.id, changes.join('; '))] : []),
    ...(resubmits ? [poAuditStatement(id, 'resubmitted', guard.user.id, 'Returned to Cost Control for approval.')] : []),
  ])

  return NextResponse.json({ data: results[0]?.[0] ?? null })
}

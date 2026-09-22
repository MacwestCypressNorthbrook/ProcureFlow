import { queryOne, execute } from '@/lib/db'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification } from '@/lib/notifications'
import { NextResponse } from 'next/server'
import type { Request as DbRequest, PurchaseOrder } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('request:convert')
  if (guard.error) return guard.error

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    /* no body */
  }

  const req = await queryOne<DbRequest>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(req.estimated_quantity)
  const unitRate = body.unit_rate !== undefined ? Number(body.unit_rate) : Number(req.estimated_unit_rate)
  const totalAmount = quantity && unitRate ? quantity * unitRate : null
  const purpose = typeof body.purpose === 'string' && body.purpose.trim() ? body.purpose.trim() : req.purpose
  const description = typeof body.description === 'string' ? body.description : req.description
  const fileName = typeof body.file_name === 'string' && body.file_name.trim() ? body.file_name.trim() : null
  const fileUrl = typeof body.file_url === 'string' && body.file_url.trim() ? body.file_url.trim() : null
  const vendorName = typeof body.vendor_name === 'string' ? body.vendor_name : null

  const po = await queryOne<PurchaseOrder>(
    `INSERT INTO public.purchase_orders (
       request_id, purpose, description, vendor_name, quantity, unit_rate, total_amount,
       file_name, file_path, created_by, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      req.id,
      purpose,
      description,
      vendorName,
      quantity || null,
      unitRate || null,
      totalAmount,
      fileName,
      fileUrl,
      guard.user.id,
      'pending_cost_control',
    ]
  )

  if (!po) {
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 })
  }

  // Raising the purchase order is the Administrator's approval: the
  // requisition moves straight on to Cost Control.
  await execute(
    `UPDATE public.requests
        SET status = 'pending_cost_control', sent_back_to = NULL, return_to_stage = NULL, updated_at = now()
      WHERE id = $1`,
    [id]
  )

  await execute(
    `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
     VALUES ($1, $2, 'admin', 'po_created', $3, $4)`,
    [id, po.id, guard.user.id, typeof body.comment === 'string' ? body.comment.trim() || null : null]
  )

  if (fileName && fileUrl) {
    await execute(
      `INSERT INTO public.po_attachments (po_id, file_name, file_url, uploaded_by)
       VALUES ($1, $2, $3, $4)`,
      [po.id, fileName, fileUrl, guard.user.id]
    )
  }

  await execute(
    `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [po.id, 'created', guard.user.id, 'PO converted from requisition']
  )

  if (req.created_by) {
    await createNotification({
      userId: req.created_by,
      title: 'Requisition Converted to Purchase Order',
      message: `Your requisition "${req.purpose}" has been converted to a Purchase Order.`,
      type: 'success',
      target: { type: 'request', id },
      sendEmailAlert: true,
    })
  }

  return NextResponse.json({ data: po }, { status: 201 })
}

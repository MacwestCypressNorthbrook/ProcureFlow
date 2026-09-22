import { queryOne, execute } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
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

  const contentType = request.headers.get('content-type') || ''

  let poNumber: string
  let fileName: string | null = null
  let fileUrl: string | null = null
  let fileBuffer: Buffer | null = null
  let fileMimeType: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    poNumber = String(formData.get('po_number') || '')
    const file = formData.get('file') as File | null
    if (file && file.size > 0) {
      fileName = file.name
      fileMimeType = file.type || 'application/pdf'
      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    }
  } else {
    const body = await request.json()
    poNumber = body.po_number
    fileName = body.file_name || null
    fileUrl = body.file_url || null
  }

  if (!poNumber) {
    return NextResponse.json({ error: 'po_number is required' }, { status: 400 })
  }
  if (!fileName && !fileUrl) {
    return NextResponse.json({ error: 'A PDF file or file_url is required' }, { status: 400 })
  }

  const req = await queryOne<DbRequest>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  // Upload file to Neon Object Storage if raw file provided
  if (fileBuffer && fileName) {
    const storagePath = `po-docs/${id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    try {
      await uploadFile(fileBuffer, storagePath, fileMimeType || 'application/pdf')
      fileUrl = storagePath
    } catch (uploadErr) {
      console.error('Neon storage upload failed:', uploadErr)
      return NextResponse.json({ error: 'Failed to upload PO file to storage' }, { status: 500 })
    }
  }

  const descriptionWithPoNumber = `[PO#: ${poNumber}] ${req.description || ''}`.trim()
  const estQty = req.estimated_quantity ? Number(req.estimated_quantity) : null
  const estRate = req.estimated_unit_rate ? Number(req.estimated_unit_rate) : null
  const totalAmount = estQty && estRate ? estQty * estRate : null

  const po = await queryOne<PurchaseOrder>(
    `INSERT INTO public.purchase_orders (
       po_number, request_id, purpose, description, quantity, unit_rate, total_amount,
       file_name, file_path, created_by, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, po_number, purpose, total_amount, status`,
    [
      poNumber,
      req.id,
      req.purpose,
      descriptionWithPoNumber,
      estQty,
      estRate,
      totalAmount,
      fileName,
      fileUrl,
      guard.user.id,
      // Same entry status as /convert — both mean "PO raised, awaiting review".
      'pending_cost_control',
    ]
  )

  if (!po) {
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 })
  }

  // Update request status to converted
  await execute(
    `UPDATE public.requests SET status = 'converted', updated_at = now() WHERE id = $1`,
    [id]
  )

  // Record PO attachment
  if (fileName && fileUrl) {
    await execute(
      `INSERT INTO public.po_attachments (po_id, file_name, file_url, uploaded_by)
       VALUES ($1, $2, $3, $4)`,
      [po.id, fileName, fileUrl, guard.user.id]
    )
  }

  // Record audit trail
  await execute(
    `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [po.id, 'created', guard.user.id, `PO ${poNumber} attached and submitted for approval`]
  )

  // Send notification to request creator if available
  if (req.created_by) {
    await createNotification({
      userId: req.created_by,
      title: 'Purchase Order Created',
      message: `Purchase order #${poNumber} has been generated for your requisition "${req.purpose}".`,
      type: 'info',
      link: `/minta/tracking`,
      sendEmailAlert: true,
    })
  }

  return NextResponse.json({ success: true, po_id: po.id }, { status: 201 })
}

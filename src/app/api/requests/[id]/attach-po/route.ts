import { queryOne, execute } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification, notifyRequisitionParties, notifyStage } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { checkUpload, isOwnStorageKey } from '@/lib/uploads'
import type { Request as DbRequest, PurchaseOrder } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireCapability('request:convert')
  if (guard.error) return guard.error

  const limit = await rateLimit(`po-upload:${guard.user.id}`, { max: 20, windowSeconds: 300 })
  if (!limit.ok) return tooManyRequests('Too many uploads. Wait a few minutes and try again.', limit.retryAfter)

  const contentType = request.headers.get('content-type') || ''

  let poNumber = ''
  let vendorName: string | null = null
  let totalAmountInput: number | null = null
  let comment: string | null = null
  let fileName: string | null = null
  let fileUrl: string | null = null
  let fileSize: number | null = null
  let fileBuffer: Buffer | null = null
  let fileMimeType: string | null = null
  let approveImmediately = true

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    poNumber = String(formData.get('po_number') || '').trim()
    vendorName = formData.get('vendor_name') ? String(formData.get('vendor_name')).trim() : null
    const amountVal = formData.get('total_amount')
    if (amountVal !== null && amountVal !== '') {
      const parsed = Number(amountVal)
      if (!isNaN(parsed)) totalAmountInput = parsed
    }
    comment = formData.get('comment') ? String(formData.get('comment')).trim() : null
    if (formData.has('approve')) {
      approveImmediately = formData.get('approve') !== 'false'
    }

    const file = formData.get('file') as File | null
    if (file && file.size > 0) {
      const check = checkUpload(file)
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 413 })
      }
      fileName = file.name
      fileSize = file.size
      fileMimeType = check.mime
      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    }

    if (!fileName && formData.get('file_name')) {
      fileName = String(formData.get('file_name'))
    }
    if (!fileUrl && formData.get('file_url')) {
      fileUrl = String(formData.get('file_url'))
    }
  } else {
    const body = await request.json().catch(() => ({}))
    poNumber = typeof body.po_number === 'string' ? body.po_number.trim() : ''
    vendorName = typeof body.vendor_name === 'string' && body.vendor_name.trim() ? body.vendor_name.trim() : null
    if (body.total_amount !== undefined && body.total_amount !== null) {
      const parsed = Number(body.total_amount)
      if (!isNaN(parsed)) totalAmountInput = parsed
    }
    comment = typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null
    fileName = typeof body.file_name === 'string' ? body.file_name.trim() : null
    fileUrl = typeof body.file_url === 'string' ? body.file_url.trim() : null
    fileSize = typeof body.file_size === 'number' ? body.file_size : null
    if (body.approve !== undefined) {
      approveImmediately = Boolean(body.approve)
    }
  }

  if (!poNumber) {
    return NextResponse.json({ error: 'Odoo PO reference / number is required' }, { status: 400 })
  }

  // A key supplied in JSON must be one the presign endpoint issued.
  if (fileUrl && !fileUrl.startsWith('data:') && !isOwnStorageKey(fileUrl)) {
    return NextResponse.json({ error: 'That upload reference is not valid.' }, { status: 400 })
  }

  const req = await queryOne<DbRequest>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  // The Administrator now closes the chain, so a purchase order belongs to a
  // requisition that has cleared Project Lead, Supply Chain AND Cost Control —
  // that is exactly `pending_admin` under the reordered flow. The UI gates on
  // the same thing; this re-checks it, because the UI is not the authority.
  if (req.status !== 'pending_admin') {
    return NextResponse.json(
      {
        error:
          req.status === 'sent_back'
            ? 'This requisition was sent back and is not awaiting a purchase order.'
            : 'This requisition has not cleared Cost Control review yet.',
      },
      { status: 409 }
    )
  }

  // If a data: URL was provided without a raw buffer, decode it to buffer for S3 upload
  if (!fileBuffer && fileUrl && fileUrl.startsWith('data:')) {
    const match = fileUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      fileMimeType = match[1] || 'application/pdf'
      fileBuffer = Buffer.from(match[2], 'base64')
      fileSize = fileBuffer.length
    }
  }

  // If no file was uploaded, generate a valid Odoo PO PDF voucher
  if (!fileBuffer && !fileUrl) {
    fileName = `PO-${poNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}-voucher.pdf`
    fileMimeType = 'application/pdf'
    const safePurpose = (req.purpose || 'Requisition').replace(/[^\w\s-]/g, '')
    const safeVendor = (vendorName || 'Designated Supplier').replace(/[^\w\s-]/g, '')
    const amountStr = totalAmountInput !== null ? String(totalAmountInput) : String(req.total_amount || 0)
    
    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 18 Tf
50 720 Td
(OFFICIAL PURCHASE ORDER: ${poNumber}) Tj
/F1 12 Tf
0 -36 Td
(Requisition: ${safePurpose}) Tj
0 -24 Td
(Supplier: ${safeVendor}) Tj
0 -24 Td
(Committed Value: GHS ${amountStr}) Tj
0 -24 Td
(Generated via ProcureFlow Odoo Bridge) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000560 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
630
%%EOF`
    fileBuffer = Buffer.from(pdfContent)
    fileSize = fileBuffer.length
  }

  // Upload file buffer to Neon Object Storage
  if (fileBuffer && fileName) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `po-docs/${id}/${Date.now()}-${safeName}`
    try {
      await uploadFile(fileBuffer, storagePath, fileMimeType || 'application/pdf')
      fileUrl = storagePath
    } catch (uploadErr) {
      console.error('Neon storage upload failed:', uploadErr)
      // If S3/storage is unreachable or mock, use placeholder path
      fileUrl = storagePath
    }
  }

  const estQty = req.estimated_quantity ? Number(req.estimated_quantity) : null
  const estRate = req.estimated_unit_rate ? Number(req.estimated_unit_rate) : null
  const fallbackTotal = req.total_amount ? Number(req.total_amount) : estQty && estRate ? estQty * estRate : null
  const finalAmount = totalAmountInput !== null ? totalAmountInput : fallbackTotal
  const descriptionWithPoNumber = `[Odoo PO#: ${poNumber}] ${req.description || ''}`.trim()

  // Check if a PO record already exists for this request
  const existingPo = await queryOne<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  )

  let po: PurchaseOrder | null = null

  if (existingPo) {
    po = await queryOne<PurchaseOrder>(
      `UPDATE public.purchase_orders
          SET po_number = $1,
              vendor_name = COALESCE($2, vendor_name),
              total_amount = COALESCE($3, total_amount),
              file_name = COALESCE($4, file_name),
              file_path = COALESCE($5, file_path),
              status = $8,
              notes = COALESCE($6, notes),
              updated_at = now()
        WHERE id = $7
        RETURNING *`,
      [
        poNumber,
        vendorName,
        finalAmount,
        fileName,
        fileUrl,
        comment,
        existingPo.id,
        approveImmediately ? 'approved' : 'pending_admin',
      ]
    )
  } else {
    po = await queryOne<PurchaseOrder>(
      `INSERT INTO public.purchase_orders (
         po_number, request_id, purpose, description, vendor_name, quantity, unit_rate, total_amount,
         file_name, file_path, created_by, status, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $13, $12)
       RETURNING *`,
      [
        poNumber,
        req.id,
        req.purpose,
        descriptionWithPoNumber,
        vendorName,
        estQty,
        estRate,
        finalAmount,
        fileName,
        fileUrl,
        guard.user.id,
        comment,
        approveImmediately ? 'approved' : 'pending_admin',
      ]
    )
  }

  if (!po) {
    return NextResponse.json({ error: 'Failed to create or update purchase order' }, { status: 500 })
  }

  // The same file is deliberately recorded twice, and both sides are load-bearing:
  //   purchase_orders.file_path  — the PO's own document. The attach drawer's
  //     "you cannot approve without a document" guard and /api/documents/po-file-*
  //     read this one.
  //   po_attachments             — the list the PO detail pages render, and what
  //     lets a purchase order carry more than one file.
  // Any view that merges the two must therefore de-duplicate on file_url, the way
  // getReviewBundle does; listing both is what made every PO appear twice.
  if (fileName && fileUrl) {
    await execute(
      `INSERT INTO public.po_attachments (po_id, file_name, file_url, file_size, file_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [po.id, fileName, fileUrl, fileSize, fileMimeType || 'application/pdf', guard.user.id]
    )
  }

  // Attaching the purchase order at the closing stage IS the completion: the
  // Administrator is the last stage, so there is nobody to hand it on to. The
  // requisition closes here and the whole chain is told at once.
  if (approveImmediately) {
    await execute(
      `UPDATE public.requests
          SET status = 'completed',
              sent_back_to = NULL,
              return_to_stage = NULL,
              updated_at = now()
        WHERE id = $1`,
      [id]
    )

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, 'admin', 'po_created', $3, $4)`,
      [
        id,
        po.id,
        guard.user.id,
        comment || `Purchase order #${poNumber} attached and the requisition authorized.`,
      ]
    )

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, 'admin', 'completed', $3, $4)`,
      [id, po.id, guard.user.id, comment]
    )

    await execute(
      `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
       VALUES ($1, 'created', $2, $3)`,
      [po.id, guard.user.id, `PO #${poNumber} attached; requisition authorized and closed.`]
    )

    // The purchase order is the document the whole chain argued about, so once
    // it is attached and accepted, everyone who raised, justified, priced or
    // audited the requisition is told — each linked into their own area, since
    // no single URL serves an engineer and an administrator alike.
    await notifyRequisitionParties(id, {
      title: `Purchase order #${poNumber} attached — requisition completed`,
      message: `Purchase order #${poNumber} for "${req.purpose}" was attached by ${guard.user.name || guard.user.email} and the requisition is now authorized and closed. The purchase order is visible on the requisition.`,
      type: 'success',
      sendEmailAlert: true,
      excludeUserId: guard.user.id,
    })

    // A designed email to match, to every stage of the chain.
    for (const role of ['engineer', 'project_lead', 'supply_chain', 'cost_control'] as const) {
      await dispatchWorkflowEmail({
        eventType: 'po_attached',
        requestId: id,
        poId: po.id,
        recipientRole: role,
        performerId: guard.user.id,
        comments: comment,
      })
    }

    if (req.created_by && req.created_by !== guard.user.id) {
      await dispatchWorkflowEmail({
        eventType: 'requisition_completed',
        requestId: id,
        poId: po.id,
        recipientUserId: req.created_by,
        performerId: guard.user.id,
        comments: comment,
      })
    }
  } else {
    // Saved but not yet authorized: the requisition stays with the
    // Administrator and only they need to know it is ready to sign off.
    await notifyStage(
      'admin',
      id,
      'Purchase order saved — awaiting your authorization',
      `Purchase order #${poNumber} for "${req.purpose}" was saved as a draft and is ready for final authorization.`,
      'approval',
      guard.user.id
    )

    if (req.created_by && req.created_by !== guard.user.id) {
      await createNotification({
        userId: req.created_by,
        title: 'Purchase order raised',
        message: `Purchase order #${poNumber} has been raised against your requisition "${req.purpose}".`,
        type: 'info',
        target: { type: 'request', id },
      })
    }
  }

  return NextResponse.json(
    {
      success: true,
      po_id: po.id,
      po_number: po.po_number,
      status: approveImmediately ? 'completed' : req.status,
    },
    { status: 201 }
  )
}

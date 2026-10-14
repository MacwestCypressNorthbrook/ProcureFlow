import { query, queryOne, execute } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
import { requireCapability } from '@/lib/auth-guard'
import { createNotification, notifyRequisitionParties, notifyStage } from '@/lib/notifications'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { checkUpload, isOwnStorageKey } from '@/lib/uploads'
import type { Request as DbRequest, PurchaseOrder } from '@/lib/types'
import { poHasSupplierColumn, resolvePoSupplier } from '@/lib/po-supplier'

/** One purchase order in a submission, before it is stored. */
interface OrderInput {
  poNumber: string
  /** The supplier picked in the drawer; resolved from the vendor name when absent. */
  supplierId: string | null
  vendorName: string | null
  amount: number | null
  fileName: string | null
  fileUrl: string | null
  fileSize: number | null
  fileMime: string | null
  fileBuffer: Buffer | null
}

/**
 * A requisition sourced from several suppliers is raised as several purchase
 * orders in Odoo — one per vendor — so a single submission carries a list.
 * Twenty is far beyond any real requisition and keeps one request bounded.
 */
const MAX_ORDERS = 20

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

const amountOf = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function orderFromJson(o: Record<string, unknown>): OrderInput {
  return {
    poNumber: text(o.po_number) ?? '',
    supplierId: text(o.supplier_id),
    vendorName: text(o.vendor_name),
    amount: amountOf(o.total_amount),
    fileName: text(o.file_name),
    fileUrl: text(o.file_url),
    fileSize: typeof o.file_size === 'number' ? o.file_size : null,
    fileMime: text(o.file_type),
    fileBuffer: null,
  }
}

async function readFile(order: OrderInput, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null
  const check = checkUpload(file)
  if (!check.ok) return check.error
  order.fileName = file.name
  order.fileSize = file.size
  order.fileMime = check.mime
  order.fileBuffer = Buffer.from(await file.arrayBuffer())
  return null
}

/** A placeholder voucher, for an order attached without its Odoo PDF. */
function voucherPdf(poNumber: string, purpose: string, vendor: string, amount: string): Buffer {
  const safePurpose = purpose.replace(/[^\w\s-]/g, '')
  const safeVendor = vendor.replace(/[^\w\s-]/g, '')
  const safeNumber = poNumber.replace(/[^\w\s-]/g, '')
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 18 Tf
50 720 Td
(OFFICIAL PURCHASE ORDER: ${safeNumber}) Tj
/F1 12 Tf
0 -36 Td
(Requisition: ${safePurpose}) Tj
0 -24 Td
(Supplier: ${safeVendor}) Tj
0 -24 Td
(Committed Value: GHS ${amount}) Tj
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
%%EOF`)
}

/**
 * Attach one or more Odoo purchase orders to a requisition.
 *
 * At the closing stage (`pending_admin`) attaching them IS the completion: the
 * requisition closes and the whole chain is told. On a requisition that is
 * already completed, the Administrator may attach further orders — a supplier
 * split out late, or a balance raised as its own PO — without reopening it.
 *
 * Accepts the original single-order body (`po_number`, `file`, …) as well as
 * `orders: [...]`; multipart submissions carry `orders` as JSON with each
 * order's file under `file_<index>`.
 */
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

  let orders: OrderInput[] = []
  let comment: string | null = null
  let approveImmediately = true

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    comment = text(formData.get('comment'))
    if (formData.has('approve')) approveImmediately = formData.get('approve') !== 'false'

    const rawOrders = formData.get('orders')
    if (typeof rawOrders === 'string') {
      let parsed: unknown
      try {
        parsed = JSON.parse(rawOrders)
      } catch {
        return NextResponse.json({ error: 'The purchase order list could not be read.' }, { status: 400 })
      }
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ error: 'The purchase order list could not be read.' }, { status: 400 })
      }
      orders = parsed.map((o) => orderFromJson((o ?? {}) as Record<string, unknown>))
      for (let i = 0; i < orders.length; i++) {
        const fileError = await readFile(orders[i], formData.get(`file_${i}`) as File | null)
        if (fileError) return NextResponse.json({ error: fileError }, { status: 413 })
      }
    } else {
      const single: OrderInput = {
        poNumber: text(formData.get('po_number')) ?? '',
        supplierId: text(formData.get('supplier_id')),
        vendorName: text(formData.get('vendor_name')),
        amount: amountOf(formData.get('total_amount')),
        fileName: text(formData.get('file_name')),
        fileUrl: text(formData.get('file_url')),
        fileSize: null,
        fileMime: null,
        fileBuffer: null,
      }
      const fileError = await readFile(single, formData.get('file') as File | null)
      if (fileError) return NextResponse.json({ error: fileError }, { status: 413 })
      orders = [single]
    }
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    comment = text(body.comment)
    if (body.approve !== undefined) approveImmediately = Boolean(body.approve)
    orders = Array.isArray(body.orders)
      ? body.orders.map((o) => orderFromJson((o ?? {}) as Record<string, unknown>))
      : [orderFromJson(body)]
  }

  /* ── Validate the submission as a whole ─────────────────── */

  if (orders.length === 0) {
    return NextResponse.json({ error: 'Add at least one purchase order.' }, { status: 400 })
  }
  if (orders.length > MAX_ORDERS) {
    return NextResponse.json({ error: `Attach at most ${MAX_ORDERS} purchase orders at once.` }, { status: 400 })
  }

  const seen = new Set<string>()
  for (const [i, order] of orders.entries()) {
    const label = orders.length > 1 ? `Purchase order ${i + 1}` : 'The purchase order'
    if (!order.poNumber) {
      return NextResponse.json({ error: `${label} needs its Odoo PO reference / number.` }, { status: 400 })
    }
    const key = order.poNumber.toLowerCase()
    if (seen.has(key)) {
      return NextResponse.json({ error: `PO #${order.poNumber} is listed twice.` }, { status: 400 })
    }
    seen.add(key)

    // A key supplied in JSON must be one the presign endpoint issued.
    if (order.fileUrl && !order.fileUrl.startsWith('data:') && !isOwnStorageKey(order.fileUrl)) {
      return NextResponse.json({ error: 'That upload reference is not valid.' }, { status: 400 })
    }
  }

  const req = await queryOne<DbRequest>(
    `SELECT * FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )
  if (!req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  // A purchase order belongs to a requisition that has cleared Project Lead,
  // Supply Chain AND Cost Control — `pending_admin` — or to one the
  // Administrator already closed and is adding to. The UI gates on the same
  // thing; this re-checks it, because the UI is not the authority.
  const appending = req.status === 'completed'
  if (req.status !== 'pending_admin' && !appending) {
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
  if (appending && !approveImmediately) {
    return NextResponse.json(
      { error: 'This requisition is already completed — further purchase orders are attached as final.' },
      { status: 409 }
    )
  }

  // PO numbers are unique across the system. One already on THIS requisition
  // is being re-attached (a replacement PDF, a corrected amount); one on
  // another requisition is a typo that would otherwise surface as a 500.
  const existing = await query<PurchaseOrder>(
    `SELECT * FROM public.purchase_orders WHERE lower(po_number) = ANY($1::text[])`,
    [[...seen]]
  )
  const clash = existing.find((po) => po.request_id !== id)
  if (clash) {
    return NextResponse.json(
      { error: `PO #${clash.po_number} is already attached to another requisition.` },
      { status: 409 }
    )
  }
  const ownByNumber = new Map(existing.map((po) => [String(po.po_number).toLowerCase(), po]))

  /* ── Store each order ───────────────────────────────────── */

  const requestTotal = req.total_amount
    ? Number(req.total_amount)
    : req.estimated_quantity && req.estimated_unit_rate
      ? Number(req.estimated_quantity) * Number(req.estimated_unit_rate)
      : null
  const poStatus = approveImmediately ? 'approved' : 'pending_admin'
  const saved: PurchaseOrder[] = []
  const linkSuppliers = await poHasSupplierColumn()

  for (const order of orders) {
    // Link the order to its supplier. The vendor name defaults to the
    // supplier's own, so a picked supplier never leaves the PO unnamed.
    const supplier = await resolvePoSupplier(id, order.supplierId, order.vendorName)
    if (order.supplierId && !supplier) {
      return NextResponse.json({ error: `The supplier chosen for PO #${order.poNumber} no longer exists.` }, { status: 400 })
    }
    if (supplier && !order.vendorName) order.vendorName = supplier.name

    // With a single order the requisition total is a safe default; split
    // across several, there is no honest default and the amount stays blank.
    const amount = order.amount ?? (orders.length === 1 ? requestTotal : null)

    if (!order.fileBuffer && order.fileUrl?.startsWith('data:')) {
      const match = order.fileUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        order.fileMime = match[1] || 'application/pdf'
        order.fileBuffer = Buffer.from(match[2], 'base64')
        order.fileSize = order.fileBuffer.length
      }
    }

    const prior = ownByNumber.get(order.poNumber.toLowerCase())

    // Re-attaching an order that already has its document keeps that document;
    // only an order with no file at all gets the placeholder voucher.
    if (!order.fileBuffer && !order.fileUrl && !prior?.file_path) {
      order.fileName = `PO-${order.poNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}-voucher.pdf`
      order.fileMime = 'application/pdf'
      order.fileBuffer = voucherPdf(
        order.poNumber,
        req.purpose || 'Requisition',
        order.vendorName || 'Designated Supplier',
        String(amount ?? 0)
      )
      order.fileSize = order.fileBuffer.length
    }

    if (order.fileBuffer && order.fileName) {
      const safeName = order.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `po-docs/${id}/${Date.now()}-${safeName}`
      try {
        await uploadFile(order.fileBuffer, storagePath, order.fileMime || 'application/pdf')
      } catch (uploadErr) {
        // If S3/storage is unreachable or mock, keep the placeholder path.
        console.error('Neon storage upload failed:', uploadErr)
      }
      order.fileUrl = storagePath
    }

    const po = prior
      ? await queryOne<PurchaseOrder>(
          `UPDATE public.purchase_orders
              SET vendor_name = COALESCE($2, vendor_name),
                  total_amount = COALESCE($3, total_amount),
                  file_name = COALESCE($4, file_name),
                  file_path = COALESCE($5, file_path),
                  status = $6,
                  notes = COALESCE($7, notes),
                  ${linkSuppliers ? 'supplier_id = COALESCE($8, supplier_id),' : ''}
                  updated_at = now()
            WHERE id = $1
            RETURNING *`,
          [
            prior.id,
            order.vendorName,
            amount,
            order.fileName,
            order.fileUrl,
            poStatus,
            comment,
            ...(linkSuppliers ? [supplier?.id ?? null] : []),
          ]
        )
      : await queryOne<PurchaseOrder>(
          `INSERT INTO public.purchase_orders (
             po_number, request_id, purpose, description, vendor_name, quantity, unit_rate, total_amount,
             file_name, file_path, created_by, status, notes${linkSuppliers ? ', supplier_id' : ''}
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13${linkSuppliers ? ', $14' : ''})
           RETURNING *`,
          [
            order.poNumber,
            req.id,
            req.purpose,
            `[Odoo PO#: ${order.poNumber}] ${req.description || ''}`.trim(),
            order.vendorName,
            orders.length === 1 && req.estimated_quantity ? Number(req.estimated_quantity) : null,
            orders.length === 1 && req.estimated_unit_rate ? Number(req.estimated_unit_rate) : null,
            amount,
            order.fileName,
            order.fileUrl,
            guard.user.id,
            poStatus,
            comment,
            ...(linkSuppliers ? [supplier?.id ?? null] : []),
          ]
        )

    if (!po) {
      return NextResponse.json(
        { error: `Failed to save PO #${order.poNumber}.${saved.length ? ` ${saved.length} earlier order(s) were saved.` : ''}` },
        { status: 500 }
      )
    }
    saved.push(po)

    // The same file is deliberately recorded twice, and both sides are load-bearing:
    //   purchase_orders.file_path  — the PO's own document, which
    //     /api/documents/po-file-* reads.
    //   po_attachments             — the list the PO detail pages render.
    // Any view that merges the two must therefore de-duplicate on file_url, the
    // way getReviewBundle does.
    if (order.fileName && order.fileUrl) {
      await execute(
        `INSERT INTO public.po_attachments (po_id, file_name, file_url, file_size, file_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [po.id, order.fileName, order.fileUrl, order.fileSize, order.fileMime || 'application/pdf', guard.user.id]
      )
    }
  }

  const numbers = saved.map((po) => `#${po.po_number}`)
  const numberList = numbers.join(', ')
  const plural = saved.length > 1
  const ordersPhrase = plural ? `Purchase orders ${numberList}` : `Purchase order ${numberList}`
  const firstPo = saved[0]

  for (const po of saved) {
    await execute(
      `INSERT INTO public.po_audit_trail (po_id, action, performed_by, notes)
       VALUES ($1, 'created', $2, $3)`,
      [
        po.id,
        guard.user.id,
        appending
          ? `PO #${po.po_number} attached to a completed requisition.`
          : approveImmediately
            ? `PO #${po.po_number} attached; requisition authorized and closed.`
            : `PO #${po.po_number} saved as a draft.`,
      ]
    )
  }

  /* ── Adding to a requisition that is already closed ─────── */
  if (appending) {
    for (const po of saved) {
      await execute(
        `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
         VALUES ($1, $2, 'admin', 'po_created', $3, $4)`,
        [id, po.id, guard.user.id, comment || `Additional purchase order #${po.po_number} attached.`]
      )
    }

    await notifyRequisitionParties(id, {
      title: plural ? 'Additional purchase orders attached' : `Purchase order #${firstPo.po_number} attached`,
      message: `${ordersPhrase} ${plural ? 'were' : 'was'} attached to the completed requisition "${req.purpose}" by ${guard.user.name || guard.user.email}.${comment ? ` Note: ${comment}` : ''}`,
      type: 'info',
      sendEmailAlert: true,
      excludeUserId: guard.user.id,
    })

    return NextResponse.json(
      { success: true, po_ids: saved.map((p) => p.id), po_numbers: saved.map((p) => p.po_number), status: 'completed' },
      { status: 201 }
    )
  }

  /* ── Closing stage: attaching the orders IS the completion ─ */
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

    for (const po of saved) {
      await execute(
        `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
         VALUES ($1, $2, 'admin', 'po_created', $3, $4)`,
        [id, po.id, guard.user.id, `Purchase order #${po.po_number} attached and the requisition authorized.`]
      )
    }

    await execute(
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, 'admin', 'completed', $3, $4)`,
      [id, firstPo.id, guard.user.id, comment]
    )

    // Once the orders are attached and accepted, everyone who raised, justified,
    // priced or audited the requisition is told — each linked into their own
    // area, since no single URL serves an engineer and an administrator alike.
    await notifyRequisitionParties(id, {
      title: plural
        ? `${saved.length} purchase orders attached — requisition completed`
        : `Purchase order #${firstPo.po_number} attached — requisition completed`,
      message: `${ordersPhrase} for "${req.purpose}" ${plural ? 'were' : 'was'} attached by ${guard.user.name || guard.user.email} and the requisition is now authorized and closed. ${plural ? 'They are' : 'It is'} visible on the requisition.`,
      type: 'success',
      sendEmailAlert: true,
      excludeUserId: guard.user.id,
    })

    // One designed email per stage, not one per order. The email renders the
    // first order; the comment names them all so none goes unmentioned.
    const emailComment = plural
      ? `${ordersPhrase} attached.${comment ? ` ${comment}` : ''}`
      : comment
    for (const role of ['engineer', 'project_lead', 'supply_chain', 'cost_control'] as const) {
      await dispatchWorkflowEmail({
        eventType: 'po_attached',
        requestId: id,
        poId: firstPo.id,
        recipientRole: role,
        performerId: guard.user.id,
        comments: emailComment,
      })
    }

    if (req.created_by && req.created_by !== guard.user.id) {
      await dispatchWorkflowEmail({
        eventType: 'requisition_completed',
        requestId: id,
        poId: firstPo.id,
        recipientUserId: req.created_by,
        performerId: guard.user.id,
        comments: emailComment,
      })
    }
  } else {
    // Saved but not yet authorized: the requisition stays with the
    // Administrator and only they need to know it is ready to sign off.
    await notifyStage(
      'admin',
      id,
      'Purchase order saved — awaiting your authorization',
      `${ordersPhrase} for "${req.purpose}" ${plural ? 'were' : 'was'} saved as a draft and ${plural ? 'are' : 'is'} ready for final authorization.`,
      'approval',
      guard.user.id
    )

    if (req.created_by && req.created_by !== guard.user.id) {
      await createNotification({
        userId: req.created_by,
        title: 'Purchase order raised',
        message: `${ordersPhrase} ${plural ? 'have' : 'has'} been raised against your requisition "${req.purpose}".`,
        type: 'info',
        target: { type: 'request', id },
      })
    }
  }

  return NextResponse.json(
    {
      success: true,
      po_id: firstPo.id,
      po_number: firstPo.po_number,
      po_ids: saved.map((p) => p.id),
      po_numbers: saved.map((p) => p.po_number),
      status: approveImmediately ? 'completed' : req.status,
    },
    { status: 201 }
  )
}

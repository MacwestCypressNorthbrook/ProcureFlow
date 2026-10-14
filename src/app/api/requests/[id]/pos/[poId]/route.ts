import { query, queryOne, transaction } from '@/lib/db'
import { uploadFile, deleteFile } from '@/lib/storage'
import { requireCapability } from '@/lib/auth-guard'
import { poAuditStatement } from '@/lib/audit'
import { notifyRequisitionParties } from '@/lib/notifications'
import { formatCurrency } from '@/lib/utils'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { checkUpload, isOwnStorageKey } from '@/lib/uploads'
import type { Request as DbRequest, PurchaseOrder } from '@/lib/types'

/**
 * Correct or remove a purchase order the Administrator already attached.
 *
 * Odoo is the source of the PO, and Odoo POs get revised: a wrong number keyed
 * in, an amended amount, a reissued PDF, an order cancelled outright. The
 * requisition has to follow, so the Administrator can edit each field, swap
 * the document, or delete the order and attach its replacement.
 *
 * Open only while the requisition is with the Administrator or completed —
 * before that there are no purchase orders to correct.
 */

const EDITABLE_STATUSES = ['pending_admin', 'completed']

async function load(requestId: string, poId: string) {
  const [req, po] = await Promise.all([
    queryOne<DbRequest>(`SELECT * FROM public.requests WHERE id = $1 LIMIT 1`, [requestId]),
    queryOne<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders WHERE id = $1 AND request_id = $2 LIMIT 1`,
      [poId, requestId]
    ),
  ])
  if (!req || !po) {
    return { error: NextResponse.json({ error: 'Purchase order not found on this requisition.' }, { status: 404 }) }
  }
  if (!EDITABLE_STATUSES.includes(req.status)) {
    return {
      error: NextResponse.json(
        { error: 'Purchase orders can only be changed while the requisition is with the Administrator or completed.' },
        { status: 409 }
      ),
    }
  }
  return { req, po }
}

/** Remove stored objects nothing references any more. Best effort — a stray object is harmless. */
async function sweepFiles(keys: string[]) {
  for (const key of new Set(keys)) {
    if (!isOwnStorageKey(key)) continue
    try {
      await deleteFile(key)
    } catch (err) {
      console.error('Could not delete a replaced PO document from storage:', err)
    }
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> }
) {
  const { id, poId } = await params
  const guard = await requireCapability('request:convert')
  if (guard.error) return guard.error

  const limit = await rateLimit(`po-upload:${guard.user.id}`, { max: 20, windowSeconds: 300 })
  if (!limit.ok) return tooManyRequests('Too many changes at once. Wait a few minutes and try again.', limit.retryAfter)

  const loaded = await load(id, poId)
  if (loaded.error) return loaded.error
  const { req, po } = loaded

  let poNumber: string | null = null
  let vendorName: string | null | undefined
  let amount: number | null | undefined
  let fileName: string | null = null
  let fileUrl: string | null = null
  let fileSize: number | null = null
  let fileMime: string | null = null
  let fileBuffer: Buffer | null = null

  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : null)

  if ((request.headers.get('content-type') || '').includes('multipart/form-data')) {
    const form = await request.formData()
    poNumber = text(form.get('po_number'))
    if (form.has('vendor_name')) vendorName = text(form.get('vendor_name')) || null
    if (form.has('total_amount')) {
      const raw = text(form.get('total_amount'))
      amount = raw ? Number(raw) : null
    }
    const file = form.get('file') as File | null
    if (file && file.size > 0) {
      const check = checkUpload(file)
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 413 })
      fileName = file.name
      fileSize = file.size
      fileMime = check.mime
      fileBuffer = Buffer.from(await file.arrayBuffer())
    }
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    poNumber = text(body.po_number)
    if ('vendor_name' in body) vendorName = text(body.vendor_name) || null
    if ('total_amount' in body) {
      const raw = body.total_amount
      amount = raw === null || raw === '' || raw === undefined ? null : Number(raw)
    }
    fileName = text(body.file_name)
    fileUrl = text(body.file_url)
    fileSize = typeof body.file_size === 'number' ? body.file_size : null
    fileMime = text(body.file_type)
    if (fileUrl && !isOwnStorageKey(fileUrl)) {
      return NextResponse.json({ error: 'That upload reference is not valid.' }, { status: 400 })
    }
  }

  if (poNumber === '') {
    return NextResponse.json({ error: 'The PO number cannot be blank.' }, { status: 400 })
  }
  if (amount !== undefined && amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: 'Enter the PO amount as a positive number.' }, { status: 400 })
  }

  // PO numbers are unique across the system.
  if (poNumber && poNumber.toLowerCase() !== String(po.po_number ?? '').toLowerCase()) {
    const taken = await queryOne<{ id: string }>(
      `SELECT id FROM public.purchase_orders WHERE lower(po_number) = lower($1) AND id <> $2 LIMIT 1`,
      [poNumber, poId]
    )
    if (taken) {
      return NextResponse.json({ error: `PO #${poNumber} is already in use.` }, { status: 409 })
    }
  }

  if (fileBuffer && fileName) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    fileUrl = `po-docs/${id}/${Date.now()}-${safeName}`
    try {
      await uploadFile(fileBuffer, fileUrl, fileMime || 'application/pdf')
    } catch (err) {
      console.error('Neon storage upload failed:', err)
      return NextResponse.json({ error: 'The new document could not be stored. Try again.' }, { status: 502 })
    }
  }
  const replacingFile = Boolean(fileUrl && fileName)

  // What changed, in words — for the PO's audit trail and the requisition history.
  const changes: string[] = []
  if (poNumber && poNumber !== po.po_number) changes.push(`PO number: ${po.po_number ?? '—'} → ${poNumber}`)
  if (vendorName !== undefined && (vendorName ?? '') !== (po.vendor_name ?? '')) {
    changes.push(`Vendor: ${po.vendor_name || '—'} → ${vendorName || '—'}`)
  }
  if (amount !== undefined && Number(amount) !== Number(po.total_amount)) {
    changes.push(
      `Amount: ${po.total_amount != null ? formatCurrency(Number(po.total_amount)) : '—'} → ${amount != null ? formatCurrency(amount) : '—'}`
    )
  }
  if (replacingFile) changes.push(`Document replaced with ${fileName}`)

  if (changes.length === 0) {
    return NextResponse.json({ success: true, unchanged: true })
  }

  const oldAttachments = replacingFile
    ? await query<{ file_url: string }>(`SELECT file_url FROM public.po_attachments WHERE po_id = $1`, [poId])
    : []

  const label = poNumber ?? po.po_number
  await transaction([
    [
      `UPDATE public.purchase_orders
          SET po_number = COALESCE($2, po_number),
              vendor_name = CASE WHEN $3::boolean THEN $4 ELSE vendor_name END,
              total_amount = CASE WHEN $5::boolean THEN $6::numeric ELSE total_amount END,
              file_name = COALESCE($7, file_name),
              file_path = COALESCE($8, file_path),
              description = CASE WHEN $2::text IS NULL THEN description
                                 ELSE regexp_replace(COALESCE(description, ''), '^\\[Odoo PO#: [^]]*\\]', '[Odoo PO#: ' || $2 || ']') END,
              updated_at = now()
        WHERE id = $1`,
      [
        poId,
        poNumber && poNumber !== po.po_number ? poNumber : null,
        vendorName !== undefined,
        vendorName ?? null,
        amount !== undefined,
        amount ?? null,
        replacingFile ? fileName : null,
        replacingFile ? fileUrl : null,
      ],
    ],
    // A replaced document replaces — the old file stops being listed rather
    // than sitting beside the new one as a second "PO Doc".
    ...(replacingFile
      ? ([
          [`DELETE FROM public.po_attachments WHERE po_id = $1`, [poId]],
          [
            `INSERT INTO public.po_attachments (po_id, file_name, file_url, file_size, file_type, uploaded_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [poId, fileName, fileUrl, fileSize, fileMime || 'application/pdf', guard.user.id],
          ],
        ] as [string, unknown[]][])
      : []),
    poAuditStatement(poId, 'edited', guard.user.id, changes.join('; ')),
    [
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, $2, 'admin', 'edited', $3, $4)`,
      [id, poId, guard.user.id, `Purchase order #${label} corrected — ${changes.join('; ')}.`],
    ],
  ])

  if (replacingFile) {
    await sweepFiles(
      [...oldAttachments.map((a) => a.file_url), po.file_path ?? ''].filter((k) => k && k !== fileUrl)
    )
  }

  // Everyone on a completed requisition was told what the PO said; they are
  // told when it says something else.
  if (req.status === 'completed') {
    await notifyRequisitionParties(id, {
      title: `Purchase order #${label} updated`,
      message: `The purchase order on "${req.purpose}" was corrected by ${guard.user.name || guard.user.email}: ${changes.join('; ')}.`,
      type: 'info',
      sendEmailAlert: false,
      excludeUserId: guard.user.id,
    })
  }

  return NextResponse.json({ success: true, changes })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; poId: string }> }
) {
  const { id, poId } = await params
  const guard = await requireCapability('request:convert')
  if (guard.error) return guard.error

  const loaded = await load(id, poId)
  if (loaded.error) return loaded.error
  const { req, po } = loaded

  // Deleting cascades the payment ledger with it. Money that moved against an
  // order is a record, not a mistake to tidy away.
  const paid = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM public.po_payments WHERE po_id = $1`,
    [poId]
  )
  if ((paid?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: `PO #${po.po_number} already has payments recorded against it and cannot be deleted.` },
      { status: 409 }
    )
  }

  const reason = new URL(request.url).searchParams.get('reason')?.trim() || null
  const remaining = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM public.purchase_orders WHERE request_id = $1 AND id <> $2`,
    [id, poId]
  )
  // A completed requisition is completed BY its purchase order. Removing the
  // last one puts it back in the Administrator's queue to attach the
  // replacement, rather than leaving a closed requisition with nothing behind it.
  const reopens = req.status === 'completed' && (remaining?.count ?? 0) === 0

  const files = await query<{ file_url: string }>(`SELECT file_url FROM public.po_attachments WHERE po_id = $1`, [poId])

  await transaction([
    [
      `INSERT INTO public.request_approvals (request_id, po_id, stage, action, performed_by, comment)
       VALUES ($1, NULL, 'admin', 'edited', $2, $3)`,
      [
        id,
        guard.user.id,
        `Purchase order #${po.po_number} deleted${reopens ? ' — requisition returned to the Administrator for a replacement' : ''}.${reason ? ` Reason: ${reason}` : ''}`,
      ],
    ],
    [`DELETE FROM public.purchase_orders WHERE id = $1`, [poId]],
    ...(reopens
      ? ([
          [
            `UPDATE public.requests SET status = 'pending_admin', updated_at = now() WHERE id = $1`,
            [id],
          ],
        ] as [string, unknown[]][])
      : []),
  ])

  await sweepFiles([...files.map((f) => f.file_url), po.file_path ?? ''].filter(Boolean))

  if (req.status === 'completed') {
    await notifyRequisitionParties(id, {
      title: `Purchase order #${po.po_number} withdrawn`,
      message: `Purchase order #${po.po_number} on "${req.purpose}" was deleted by ${guard.user.name || guard.user.email}.${reopens ? ' A replacement will be attached.' : ''}${reason ? ` Reason: ${reason}` : ''}`,
      type: 'warning',
      sendEmailAlert: false,
      excludeUserId: guard.user.id,
    })
  }

  return NextResponse.json({ success: true, reopened: reopens, status: reopens ? 'pending_admin' : req.status })
}

import { query, queryOne } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { checkUpload, safeStorageKey, isOwnStorageKey } from '@/lib/uploads'
import { dispatchWorkflowEmail } from '@/lib/email/workflow-dispatcher'
import { createNotification, notifyStage } from '@/lib/notifications'
import { STAGES, currentStage } from '@/lib/workflow'
import type { RequestAttachment } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole(
    'engineer',
    'project_lead',
    'cost_control',
    'supply_chain',
    'finance',
    'super_user',
    'administrator'
  )
  if (guard.error) return guard.error

  const limit = await rateLimit(`upload:${guard.user.id}`, { max: 20, windowSeconds: 300 })
  if (!limit.ok) return tooManyRequests('Too many uploads. Wait a few minutes and try again.', limit.retryAfter)

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const data = await query<RequestAttachment>(
    `SELECT id, request_id, file_name, file_url, file_size, file_type, uploaded_by, created_at
     FROM public.request_attachments
     WHERE request_id = $1
     ORDER BY created_at DESC`,
    [id]
  )

  return NextResponse.json({ data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole(
    'engineer',
    'project_lead',
    'cost_control',
    'supply_chain',
    'super_user',
    'administrator'
  )
  if (guard.error) return guard.error

  const contentType = request.headers.get('content-type') || ''

  const existing = await queryOne<{
    id: string
    purpose: string
    created_by: string | null
    status: string
    sent_back_to: string | null
  }>(
    `SELECT id, purpose, created_by, status, sent_back_to
       FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  let fileName: string
  let fileUrl: string
  let fileSize: number | null = null
  let fileMime: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 })
    }

    const check = checkUpload(file)
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 413 })
    }

    fileName = file.name
    fileSize = file.size
    fileMime = check.mime
    const storageKey = safeStorageKey(`request-docs/${id}`, fileName)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      await uploadFile(buffer, storageKey, fileMime)
      fileUrl = storageKey
    } catch (uploadErr) {
      console.error('Neon storage upload failed:', uploadErr)
      return NextResponse.json(
        { error: 'Failed to upload file to Neon Object Storage' },
        { status: 500 }
      )
    }
  } else {
    // Fallback JSON payload
    const body = await request.json()
    fileName = body.file_name
    fileUrl = body.file_url

    if (!fileName || !fileUrl) {
      return NextResponse.json(
        { error: 'file_name and file_url are required' },
        { status: 400 }
      )
    }

    // Only a key this app issued may be recorded — see `isOwnStorageKey`.
    if (!isOwnStorageKey(fileUrl)) {
      return NextResponse.json(
        { error: 'That upload reference is not valid.' },
        { status: 400 }
      )
    }

    fileSize = typeof body.file_size === 'number' ? body.file_size : null
    fileMime = typeof body.file_type === 'string' ? body.file_type : null
  }

  const inserted = await queryOne<RequestAttachment>(
    `INSERT INTO public.request_attachments (request_id, file_name, file_url, file_size, file_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, request_id, file_name, file_url, file_size, file_type, uploaded_by, created_at`,
    [id, fileName, fileUrl, fileSize, fileMime, guard.user.id]
  )

  // Who hears about a new document: the person who raised the requisition, and
  // whichever stage is holding it right now — nobody else.
  //
  // This used to email Cost Control on every upload regardless of where the
  // requisition actually was. Supply Chain attaches quotes while the item is
  // still with Supply Chain, so Cost Control was being told about work two
  // stages before it reached them. The holder is resolved from the status
  // instead, so the mail follows the chain rather than guessing at it.
  try {
    const holder = currentStage(existing.status, existing.sent_back_to)

    if (existing.created_by && existing.created_by !== guard.user.id) {
      await createNotification({
        userId: existing.created_by,
        title: 'Document attached to your requisition',
        message: `"${fileName}" was attached to "${existing.purpose}" by ${guard.user.name || guard.user.email}.`,
        type: 'info',
        target: { type: 'request', id },
      })
    }

    if (holder && holder !== 'requester') {
      await notifyStage(
        holder,
        id,
        'Document attached',
        `"${fileName}" was attached to "${existing.purpose}" by ${guard.user.name || guard.user.email}.`,
        'info',
        guard.user.id
      )

      await dispatchWorkflowEmail({
        eventType: 'invoice_acknowledged',
        requestId: id,
        recipientRole: STAGES[holder].roles[0],
        performerId: guard.user.id,
        documentName: fileName,
      })
    }
  } catch (err) {
    console.error('Attachment saved, but notifying the holding stage failed:', err)
  }

  return NextResponse.json({ data: inserted }, { status: 201 })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole(
    'cost_control',
    'super_user',
    'administrator'
  )
  if (guard.error) return guard.error

  const reqRow = await queryOne<{ id: string; purpose: string }>(
    `SELECT id, purpose FROM public.requests WHERE id = $1 LIMIT 1`,
    [id]
  )
  if (!reqRow) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const { attachmentId, action, notes } = body as {
    attachmentId?: string
    action?: 'accept' | 'decline' | 'reset' | 'accept_all'
    notes?: string
  }

  if (!action || (!attachmentId && action !== 'accept_all')) {
    return NextResponse.json(
      { error: 'Valid action and attachmentId (or accept_all) are required' },
      { status: 400 }
    )
  }

  const { notifyStage } = await import('@/lib/notifications')

  // Batch action: Accept all pending invoices at once
  if (action === 'accept_all') {
    await query(
      `UPDATE public.request_attachments
          SET status = 'accepted',
              reviewed_by = $1,
              reviewed_at = now()
        WHERE request_id = $2 AND (status IS NULL OR status = 'pending')`,
      [guard.user.id, id]
    )

    await notifyStage(
      'supply_chain',
      id,
      'All vendor invoices accepted',
      `Cost Control reviewed and accepted every attached vendor invoice and quote for "${reqRow.purpose}".`,
      'success',
      guard.user.id
    )

    await dispatchWorkflowEmail({
      eventType: 'invoice_accepted',
      requestId: id,
      recipientRole: 'supply_chain',
      performerId: guard.user.id,
      comments: notes || null,
    })

    return NextResponse.json({ success: true, action: 'accept_all' })
  }

  const targetDoc = await queryOne<{ id: string; file_name: string }>(
    `SELECT id, file_name FROM public.request_attachments WHERE id = $1 AND request_id = $2 LIMIT 1`,
    [attachmentId, id]
  )
  if (!targetDoc) {
    return NextResponse.json({ error: 'Invoice attachment not found' }, { status: 404 })
  }

  if (action === 'accept') {
    // Multi-vendor support: Accepting this vendor's invoice acknowledges it WITHOUT declining other vendor quotes!
    await query(
      `UPDATE public.request_attachments
          SET status = 'accepted',
              reviewed_by = $1,
              reviewed_at = now(),
              review_notes = $2
        WHERE id = $3`,
      [guard.user.id, notes || null, attachmentId]
    )

    // Notify Supply Chain of the acknowledgement and acceptance
    await notifyStage(
      'supply_chain',
      id,
      'Vendor invoice accepted',
      `Cost Control reviewed and accepted vendor invoice "${targetDoc.file_name}" for "${reqRow.purpose}".${notes ? ` Note: ${notes}` : ''}`,
      'success',
      guard.user.id
    )

    // `documentName` narrows the email to the one invoice that was decided on,
    // so it reads as a decision about that invoice rather than a file listing.
    await dispatchWorkflowEmail({
      eventType: 'invoice_accepted',
      requestId: id,
      recipientRole: 'supply_chain',
      performerId: guard.user.id,
      comments: notes || null,
      documentName: targetDoc.file_name,
    })
  } else if (action === 'decline') {
    await query(
      `UPDATE public.request_attachments
          SET status = 'declined',
              reviewed_by = $1,
              reviewed_at = now(),
              review_notes = $2
        WHERE id = $3`,
      [guard.user.id, notes || 'Declined during Cost Control review', attachmentId]
    )

    // Notify Supply Chain of the decline, with the reason attached
    await notifyStage(
      'supply_chain',
      id,
      'Vendor invoice declined by Cost Control',
      `Cost Control declined invoice "${targetDoc.file_name}" for "${reqRow.purpose}". A revised quote is needed.${notes ? ` Reason: ${notes}` : ''}`,
      'warning',
      guard.user.id
    )

    await dispatchWorkflowEmail({
      eventType: 'invoice_declined',
      requestId: id,
      recipientRole: 'supply_chain',
      performerId: guard.user.id,
      comments: notes || 'Declined during Cost Control review.',
      documentName: targetDoc.file_name,
    })
  } else if (action === 'reset') {
    await query(
      `UPDATE public.request_attachments
          SET status = 'pending',
              reviewed_by = NULL,
              reviewed_at = NULL,
              review_notes = NULL
        WHERE id = $1`,
      [attachmentId]
    )
  }

  return NextResponse.json({ success: true, action, attachmentId })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await requireRole(
    'engineer',
    'supply_chain',
    'cost_control',
    'super_user',
    'administrator'
  )
  if (guard.error) return guard.error

  const { searchParams } = new URL(request.url)
  let attachmentId = searchParams.get('attachmentId')

  if (!attachmentId) {
    const body = await request.json().catch(() => ({}))
    attachmentId = body?.attachmentId
  }

  if (!attachmentId) {
    return NextResponse.json({ error: 'attachmentId is required' }, { status: 400 })
  }

  const existing = await queryOne<{ id: string; file_name: string }>(
    `SELECT id, file_name FROM public.request_attachments WHERE id = $1 AND request_id = $2 LIMIT 1`,
    [attachmentId, id]
  )

  if (!existing) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  await query(`DELETE FROM public.request_attachments WHERE id = $1 AND request_id = $2`, [
    attachmentId,
    id,
  ])

  return NextResponse.json({ success: true, deletedId: attachmentId })
}

import { query, queryOne } from '@/lib/db'
import { uploadFile } from '@/lib/storage'
import { requireRole } from '@/lib/auth-guard'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { checkUpload, safeStorageKey, isOwnStorageKey } from '@/lib/uploads'
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

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM public.requests WHERE id = $1 LIMIT 1`,
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

  return NextResponse.json({ data: inserted }, { status: 201 })
}

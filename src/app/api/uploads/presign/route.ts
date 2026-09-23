import { NextResponse } from 'next/server'
import { getUserFromSession } from '@/lib/auth/server'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { checkUpload, safeStorageKey, MAX_UPLOAD_BYTES } from '@/lib/uploads'
import { getSignedUploadUrl, storageConfigured } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Hand the browser a short-lived URL to upload a document straight to storage.
 *
 * The file never passes through this server: on a weak connection that halves
 * the bytes on the wire and means a dropped transfer can be retried without
 * involving us. Everything that guards an upload still happens here — session,
 * rate limit, size and type — because the signature encodes the key and content
 * type, so the browser cannot store something other than what was approved.
 *
 * Returns 503 when storage is unconfigured so the client can fall back to the
 * older through-the-server upload rather than failing outright.
 */
export async function POST(request: Request) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const limit = await rateLimit(`presign:${user.id}`, { max: 40, windowSeconds: 300 })
  if (!limit.ok) {
    return tooManyRequests('Too many uploads. Wait a few minutes and try again.', limit.retryAfter)
  }

  let body: { file_name?: string; file_size?: number; file_type?: string; scope?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const fileName = body.file_name?.trim()
  const fileSize = Number(body.file_size)
  if (!fileName || !Number.isFinite(fileSize)) {
    return NextResponse.json({ error: 'A file name and size are required' }, { status: 400 })
  }

  const check = checkUpload({ name: fileName, size: fileSize, type: body.file_type })
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 413 })
  }

  if (!storageConfigured()) {
    return NextResponse.json(
      { error: 'Object storage is not configured.', fallback: true },
      { status: 503 }
    )
  }

  // Scope is a folder hint only; it is sanitised rather than trusted.
  const scope = (body.scope ?? 'misc').replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 80) || 'misc'
  const key = safeStorageKey(`uploads/${scope}`, fileName)

  const uploadUrl = await getSignedUploadUrl(key, check.mime)
  if (!uploadUrl) {
    return NextResponse.json(
      { error: 'Could not prepare the upload.', fallback: true },
      { status: 503 }
    )
  }

  return NextResponse.json({
    upload_url: uploadUrl,
    key,
    content_type: check.mime,
    max_bytes: MAX_UPLOAD_BYTES,
  })
}

import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
import { normalizeRole } from '@/lib/roles'
import { getSignedDownloadUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

/**
 * Serve an attachment by its row id, redirecting to a freshly signed URL.
 *
 * Storage keys must never reach the browser: a bare key like
 * "request-docs/<id>/<file>" is a *relative* URL, so opening it navigates to
 * whatever origin the tab happens to be on. Signing here also means links can
 * never go stale, and only a signed-in reviewer can resolve one.
 *
 * `?download=1` saves the file instead of displaying it, and is served from
 * THIS origin rather than as a redirect.
 *
 * A redirect cannot be made to download reliably. The `download` attribute on
 * an anchor is ignored the moment the response crosses to another origin, so
 * the browser falls back to whatever the storage host says — and a PDF with no
 * `Content-Disposition` of its own simply opens, usually in a new tab. Piping
 * the bytes back through here keeps the whole exchange same-origin, which
 * makes both the attribute and our own `Content-Disposition` authoritative.
 * Previews still redirect: they are meant to be displayed, and that path
 * should not pay to proxy the bytes.
 */
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

  const row = await findAttachment(id)
  if (!row?.file_url) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // An engineer may read the documents on their own requisitions only.
  // Reviewers see every requisition by the nature of their stage, so the role
  // itself is the grant — but a requester must not be able to walk ids.
  const role = normalizeRole(guard.user.role)
  if (role === 'engineer' && row.requester_id !== guard.user.id) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const download = new URL(request.url).searchParams.get('download') === '1'

  // Already an absolute URL (legacy rows, or a data: URL) — hand it back as-is.
  if (/^(https?|data|blob):/.test(row.file_url)) {
    return download && /^https?:/.test(row.file_url)
      ? streamAsAttachment(row.file_url, row.file_name)
      : NextResponse.redirect(row.file_url)
  }

  const signed = await getSignedDownloadUrl(row.file_url, 300, {
    fileName: row.file_name,
    download,
  })

  if (!signed || signed === row.file_url) {
    return NextResponse.json(
      { error: 'Object storage is not configured, so this document cannot be served' },
      { status: 503 }
    )
  }

  return download ? streamAsAttachment(signed, row.file_name) : NextResponse.redirect(signed)
}

/**
 * Pipe a remote object back to the browser as an attachment.
 *
 * The body is streamed rather than buffered, so a large purchase order does not
 * sit in memory on the way through.
 */
async function streamAsAttachment(url: string, fileName?: string | null) {
  let upstream: Response
  try {
    upstream = await fetch(url)
  } catch {
    return NextResponse.json({ error: 'The document could not be retrieved' }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'The document could not be retrieved' }, { status: 502 })
  }

  // A quoted filename cannot carry quotes, control characters or non-Latin-1
  // bytes, so send a sanitised one for old clients and the RFC 5987 form for
  // everyone else.
  const name = (fileName || 'document').replace(/[\r\n"\\]/g, '_')
  const ascii = name.replace(/[^\x20-\x7e]/g, '_')
  const headers = new Headers({
    'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    // The signed URL behind this is short-lived and the file is private.
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)

  return new NextResponse(upstream.body, { status: 200, headers })
}

interface AttachmentRow {
  file_name: string
  file_url: string
  /** The requisition the document hangs off, for the ownership check. */
  request_id: string | null
  /** Who raised that requisition. */
  requester_id: string | null
}

async function findAttachment(id: string): Promise<AttachmentRow | null> {
  // The PO's own uploaded file has no attachment row of its own.
  if (id.startsWith('po-file-')) {
    return await queryOne<AttachmentRow>(
      `SELECT COALESCE(po.file_name, 'Purchase order') AS file_name,
              po.file_path AS file_url,
              po.request_id,
              r.created_by AS requester_id
         FROM public.purchase_orders po
         LEFT JOIN public.requests r ON r.id = po.request_id
        WHERE po.id = $1 AND po.file_path IS NOT NULL
        LIMIT 1`,
      [id.slice('po-file-'.length)]
    )
  }

  return (
    (await queryOne<AttachmentRow>(
      `SELECT ra.file_name, ra.file_url, ra.request_id, r.created_by AS requester_id
         FROM public.request_attachments ra
         LEFT JOIN public.requests r ON r.id = ra.request_id
        WHERE ra.id = $1
        LIMIT 1`,
      [id]
    )) ??
    (await queryOne<AttachmentRow>(
      `SELECT pa.file_name, pa.file_url, po.request_id, r.created_by AS requester_id
         FROM public.po_attachments pa
         JOIN public.purchase_orders po ON po.id = pa.po_id
         LEFT JOIN public.requests r ON r.id = po.request_id
        WHERE pa.id = $1
        LIMIT 1`,
      [id]
    ))
  )
}

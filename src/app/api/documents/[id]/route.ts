import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireRole } from '@/lib/auth-guard'
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
 * `?download=1` asks the browser to save rather than display the file.
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

  // Already an absolute URL (legacy rows, or a data: URL) — hand it back as-is.
  if (/^(https?|data|blob):/.test(row.file_url)) {
    return NextResponse.redirect(row.file_url)
  }

  const download = new URL(request.url).searchParams.get('download') === '1'
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

  return NextResponse.redirect(signed)
}

interface AttachmentRow {
  file_name: string
  file_url: string
}

async function findAttachment(id: string): Promise<AttachmentRow | null> {
  // The PO's own uploaded file has no attachment row of its own.
  if (id.startsWith('po-file-')) {
    return await queryOne<AttachmentRow>(
      `SELECT COALESCE(file_name, 'Purchase order') AS file_name, file_path AS file_url
         FROM public.purchase_orders
        WHERE id = $1 AND file_path IS NOT NULL
        LIMIT 1`,
      [id.slice('po-file-'.length)]
    )
  }

  return (
    (await queryOne<AttachmentRow>(
      `SELECT file_name, file_url FROM public.request_attachments WHERE id = $1 LIMIT 1`,
      [id]
    )) ??
    (await queryOne<AttachmentRow>(
      `SELECT file_name, file_url FROM public.po_attachments WHERE id = $1 LIMIT 1`,
      [id]
    ))
  )
}

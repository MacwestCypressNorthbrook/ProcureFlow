import { getSignedDownloadUrl } from '@/lib/storage'

/**
 * If the URL looks like an Object Storage path (not a full URL or data: URL),
 * generate an S3 pre-signed URL for it from Neon Object Storage.
 * Otherwise return the URL as-is.
 */
export async function resolveFileUrl(url: string): Promise<string> {
  if (!url) return url
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url
  }

  // Looks like a storage path (e.g. "po-docs/uuid/filename.pdf" or "request-docs/...")
  return await getSignedDownloadUrl(url, 3600)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Resolve an array of attachment objects, replacing file_url with signed URLs where needed.
 */
export async function resolveAttachments(
  attachments: any[]
): Promise<any[]> {
  if (!Array.isArray(attachments)) return []
  // Resolved to an API href rather than a signed URL: signing happens per
  // click, so a link can never expire while the page is open.
  return attachments.map((att) =>
    att && typeof att.file_url === 'string' && att.id
      ? { ...att, file_url: documentHref(String(att.id), att.file_url) }
      : att
  )
}

/**
 * The URL the browser should use for an attachment.
 *
 * Absolute and data: URLs pass through; anything else is a storage key, which
 * must be served via `/api/documents/<id>` so it gets signed server-side.
 */
export function documentHref(id: string, fileUrl: string | null | undefined): string {
  if (!fileUrl) return ''
  if (/^(https?|data|blob):/.test(fileUrl)) return fileUrl
  return `/api/documents/${encodeURIComponent(id)}`
}

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
  return Promise.all(
    attachments.map(async (att) => {
      if (att && typeof att.file_url === 'string') {
        return { ...att, file_url: await resolveFileUrl(att.file_url) }
      }
      return att
    })
  )
}

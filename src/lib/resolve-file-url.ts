import { createClient } from '@/lib/supabase/server'

/**
 * If the URL looks like a Supabase Storage path (not a full URL or data: URL),
 * generate a signed URL for it. Otherwise return the URL as-is.
 */
export async function resolveFileUrl(url: string): Promise<string> {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }

  // Looks like a storage path (e.g. "po-docs/uuid/filename.pdf")
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('po-files')
    .createSignedUrl(url, 3600)

  if (error || !data?.signedUrl) return url
  return data.signedUrl
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Resolve an array of attachment objects, replacing file_url with signed URLs where needed.
 */
export async function resolveAttachments(
  attachments: any[]
): Promise<any[]> {
  return Promise.all(
    attachments.map(async (att) => {
      if (att && typeof att.file_url === 'string') {
        return { ...att, file_url: await resolveFileUrl(att.file_url) }
      }
      return att
    })
  )
}

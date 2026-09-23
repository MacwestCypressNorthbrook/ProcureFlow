/**
 * Upload limits, shared by every route that accepts a file.
 *
 * Two jobs: stop an oversized or hostile file before it reaches storage, and
 * fail fast with a readable message rather than letting a site engineer on a
 * weak connection spend ten minutes uploading something that will be rejected.
 */

/** 10 MB. A scanned quote or an Odoo PO PDF is comfortably inside this. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * What a requisition or purchase order may carry.
 *
 * Deliberately a allowlist, not a blocklist: anything executable, or anything
 * the browser might render as active content from our own origin, stays out.
 */
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/webp': 'WebP image',
  'image/heic': 'HEIC image',
  'application/msword': 'Word document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
  'application/vnd.ms-excel': 'Excel spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel spreadsheet',
  'text/csv': 'CSV file',
}

const EXTENSION_FALLBACK: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
}

export const humanSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

/**
 * Validate a file's size and type.
 *
 * Browsers sometimes send an empty or generic MIME type (notably for HEIC and
 * for files picked from cloud drives), so the extension is used as a fallback
 * before rejecting.
 */
export function checkUpload(file: { name: string; size: number; type?: string | null }): {
  ok: true
  mime: string
} | {
  ok: false
  error: string
} {
  if (!file.size) {
    return { ok: false, error: 'That file is empty.' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is ${humanSize(file.size)}. The limit is ${humanSize(MAX_UPLOAD_BYTES)} — compress it or split it up.`,
    }
  }

  const declared = (file.type || '').toLowerCase().split(';')[0].trim()
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mime =
    declared && declared !== 'application/octet-stream'
      ? declared
      : (EXTENSION_FALLBACK[extension] ?? declared)

  if (!mime || !(mime in ALLOWED_UPLOAD_TYPES)) {
    return {
      ok: false,
      error: 'Only PDFs, images, Word, Excel and CSV files can be attached.',
    }
  }

  return { ok: true, mime }
}

/** A storage key that can never escape its folder or carry odd characters. */
export function safeStorageKey(prefix: string, fileName: string): string {
  const cleaned = fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(-120)
  return `${prefix}/${Date.now()}-${cleaned}`
}

/**
 * Is this a storage key this app issued, rather than something a client made up?
 *
 * The JSON upload paths accept a key produced by the presign endpoint. Without
 * this check a caller could point an attachment at an arbitrary key — another
 * requisition's document — or at an external URL that would then be rendered
 * as if it were ours.
 */
export function isOwnStorageKey(key: string): boolean {
  if (!key || /^[a-z][a-z0-9+.-]*:/i.test(key)) return false // no scheme: not a URL
  if (key.includes('..') || key.startsWith('/')) return false
  return /^(uploads|request-docs|po-docs)\//.test(key)
}

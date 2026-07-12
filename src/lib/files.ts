/** Client-side helpers for handling uploaded documents stored as data URLs. */

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** Open a document in a new tab. Chrome blocks top-level navigation to `data:`
 *  URLs, so convert those to a short-lived blob URL first. */
export function openDocument(url: string) {
  if (url.startsWith('data:')) {
    const blobUrl = URL.createObjectURL(dataUrlToBlob(url))
    window.open(blobUrl, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

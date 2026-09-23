'use client'

/**
 * Browser-side document upload.
 *
 * Path taken, in order:
 *   1. Ask the server for a signed URL and PUT the file straight to storage.
 *   2. If that is unavailable (storage unconfigured, CORS refused, network
 *      error), fall back to posting the file through the app server.
 *
 * The direct path exists for people on mobile data: the file crosses the
 * network once instead of twice, progress is real, and a failed attempt is
 * retried with a backoff rather than surfacing as "upload failed".
 */

export interface UploadOutcome {
  /** Storage key when uploaded directly; absent when the server took the file. */
  key?: string
  fileName: string
  fileSize: number
  contentType: string
  /** True when the file went through the app server instead of to storage. */
  viaServer: boolean
}

export interface UploadOptions {
  /** Folder hint, e.g. `request-docs/<id>`. */
  scope: string
  /** 0–100, called as the transfer progresses. */
  onProgress?: (percent: number) => void
  /** How many times to retry a failed transfer before giving up. */
  retries?: number
  signal?: AbortSignal
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** PUT with progress. `fetch` cannot report upload progress, so this uses XHR. */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.setRequestHeader('Content-Type', contentType)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.ontimeout = () => reject(new Error('The upload timed out'))

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(file)
  })
}

/**
 * Upload one file, preferring the direct-to-storage path.
 *
 * Throws only when every attempt on both paths has failed; the message is
 * written for the person holding the phone, not for a log.
 */
export async function uploadDocument(file: File, options: UploadOptions): Promise<UploadOutcome> {
  const { scope, onProgress, retries = 2, signal } = options

  // 1. Try for a signed URL.
  let presign: { upload_url: string; key: string; content_type: string } | null = null
  try {
    const res = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        scope,
      }),
      signal,
    })

    if (res.status === 413) {
      // Too large or wrong type — the server already said why, and retrying or
      // falling back would waste the user's data allowance.
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload.error ?? 'That file cannot be attached.')
    }

    if (res.ok) {
      presign = await res.json()
    }
    // Any other status (503 unconfigured, etc.) falls through to the server path.
  } catch (err) {
    if (err instanceof Error && /cannot be attached|limit is/.test(err.message)) throw err
    // Otherwise: no signed URL, use the server path.
  }

  // 2. Direct upload, with retries.
  if (presign) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await putWithProgress(presign.upload_url, file, presign.content_type, onProgress, signal)
        return {
          key: presign.key,
          fileName: file.name,
          fileSize: file.size,
          contentType: presign.content_type,
          viaServer: false,
        }
      } catch (err) {
        if (signal?.aborted) throw err
        if (attempt === retries) break
        // Back off before retrying: a flaky link often recovers within seconds.
        await sleep(1000 * 2 ** attempt)
        onProgress?.(0)
      }
    }
  }

  // 3. Fall back to the server, which streams it to storage for us.
  return {
    fileName: file.name,
    fileSize: file.size,
    contentType: file.type || 'application/octet-stream',
    viaServer: true,
  }
}

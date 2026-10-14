'use client'

import { zip, type ZipEntry } from '@/lib/zip'
import { downloadBlob } from '@/lib/xlsx'
import { toCsv, type CsvColumn } from '@/lib/csv'

/**
 * Bundle many stored documents into one .zip download.
 *
 * Each file comes through `/api/documents/<id>?download=1`, the same
 * same-origin, signed-on-demand route a single download uses, so access rules
 * are exactly those of clicking each file in turn. An `index.csv` inside the
 * archive lists every document and says plainly which could not be fetched,
 * so a partial bundle never passes for a complete one.
 */

export interface BundleItem {
  /** Attachment id the document route resolves. */
  id: string
  fileName: string
  /** Sub-folder inside the archive, e.g. the project name. */
  folder?: string
  /** Extra columns for the index, e.g. invoice number, supplier, amount. */
  index: Record<string, string | number | null | undefined>
}

/** Big enough for any real filter; small enough that a browser tab survives it. */
export const MAX_BUNDLE_FILES = 200

const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file'

export async function downloadDocumentBundle(
  items: BundleItem[],
  filename: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ included: number; failed: number }> {
  const list = items.slice(0, MAX_BUNDLE_FILES)
  const entries: ZipEntry[] = []
  const used = new Set<string>()
  const status = new Map<string, string>()
  let done = 0

  const uniquePath = (item: BundleItem) => {
    const folder = item.folder ? `${clean(item.folder)}/` : ''
    const dot = item.fileName.lastIndexOf('.')
    const stem = clean(dot > 0 ? item.fileName.slice(0, dot) : item.fileName)
    const ext = dot > 0 ? item.fileName.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
    let path = `${folder}${stem}${ext}`
    let n = 2
    while (used.has(path.toLowerCase())) path = `${folder}${stem} (${n++})${ext}`
    used.add(path.toLowerCase())
    return path
  }

  // A few at a time: fast on a good connection, gentle on a weak one.
  const queue = [...list]
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const res = await fetch(`/api/documents/${encodeURIComponent(item.id)}?download=1`)
        if (!res.ok) throw new Error(String(res.status))
        const data = new Uint8Array(await res.arrayBuffer())
        const path = uniquePath(item)
        entries.push({ name: path, data })
        status.set(item.id, path)
      } catch {
        status.set(item.id, '')
      }
      onProgress?.(++done, list.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, worker))

  const extraKeys = [...new Set(list.flatMap((i) => Object.keys(i.index)))]
  const columns: CsvColumn<BundleItem>[] = [
    ...extraKeys.map((key) => ({ header: key, value: (i: BundleItem) => String(i.index[key] ?? '') })),
    { header: 'File in this archive', value: (i) => status.get(i.id) || 'NOT INCLUDED — could not be fetched' },
  ]
  let indexCsv = toCsv(list, columns)
  if (items.length > list.length) {
    indexCsv += `\n"Only the first ${MAX_BUNDLE_FILES} of ${items.length} documents are in this archive. Narrow the filters and download again for the rest."\n`
  }
  entries.unshift({ name: 'index.csv', data: new TextEncoder().encode('﻿' + indexCsv) })

  downloadBlob(zip(entries), filename)
  const failed = [...status.values()].filter((v) => !v).length
  return { included: list.length - failed, failed }
}

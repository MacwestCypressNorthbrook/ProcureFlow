'use client'

import { useState } from 'react'
import { Eye, Download, ExternalLink, FileText } from 'lucide-react'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'
import { documentUrl } from '@/lib/files'

/**
 * Open the purchase order without leaving the requisition.
 *
 * Cost Control and Finance decide on the PO document itself, so it gets its own
 * controls on the purchase order panel rather than only appearing in the
 * document list further down the page.
 */
export default function PoDocumentActions({
  documentId,
  fileName,
  fileUrl,
}: {
  documentId: string
  fileName: string
  fileUrl: string
}) {
  const [open, setOpen] = useState(false)
  const viewUrl = documentUrl(documentId, fileUrl)
  const saveUrl = documentUrl(documentId, fileUrl, { download: true })

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2.5">
        <FileText size={15} className="shrink-0 text-violet-600 dark:text-violet-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{fileName}</span>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Eye size={13} />
          Preview
        </button>

        <a
          href={saveUrl}
          download={fileName}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Download size={13} />
          Download
        </a>

        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in a new tab"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {open && (
        <DocumentPreviewModal
          isOpen={open}
          onClose={() => setOpen(false)}
          fileName={fileName}
          fileUrl={viewUrl}
          downloadUrl={saveUrl}
        />
      )}
    </>
  )
}

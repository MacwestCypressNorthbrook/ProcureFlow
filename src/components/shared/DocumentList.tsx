'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'
import { formatDate } from '@/lib/utils'
import { openDocument } from '@/lib/files'
import { FileText, Eye, ExternalLink } from 'lucide-react'

interface Doc {
  id: string
  file_name: string
  file_url: string
  created_at?: string
}

/** Compact, previewable list of document attachments. Every doc can be opened
 *  in an in-app preview modal or a new tab. */
export default function DocumentList({
  docs,
  emptyLabel = 'No documents attached yet.',
}: {
  docs: Doc[]
  emptyLabel?: string
}) {
  const [previewDoc, setPreviewDoc] = useState<{ fileName: string; fileUrl: string } | null>(null)

  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs font-medium text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {docs.map((att) => (
          <div key={att.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{att.file_name}</p>
              {att.created_at && (
                <p className="truncate text-xs text-muted-foreground">{formatDate(att.created_at)}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => setPreviewDoc({ fileName: att.file_name, fileUrl: att.file_url })}
              >
                <Eye size={13} />
                Preview
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-7 w-7 text-muted-foreground"
                title="Open in new tab"
                onClick={() => openDocument(att.file_url)}
              >
                <ExternalLink size={13} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          fileName={previewDoc.fileName}
          fileUrl={previewDoc.fileUrl}
        />
      )}
    </>
  )
}

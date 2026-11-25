'use client'

import { useEffect, useMemo } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { X, ExternalLink, Download, AlertCircle } from 'lucide-react'
import { dataUrlToBlob, openDocument } from '@/lib/files'

interface DocumentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  fileName: string
  fileUrl: string
  /** Save-to-disk link. Omitted for data URLs, which the browser saves itself. */
  downloadUrl?: string
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  fileName,
  fileUrl,
  downloadUrl,
}: DocumentPreviewModalProps) {
  // Data URLs render unreliably in cross-browser iframes; resolve to a blob URL.
  const src = useMemo(() => {
    if (!isOpen) return ''
    if (fileUrl.startsWith('data:')) return URL.createObjectURL(dataUrlToBlob(fileUrl))
    return fileUrl
  }, [isOpen, fileUrl])

  // Focus trap/return, Escape and scroll lock come from the Dialog primitive.
  useEffect(() => {
    return () => {
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
    }
  }, [src])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogPortal>
        <DialogOverlay className="z-[100] bg-black/60 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-[100] flex h-[90vh] w-[90vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-2xl outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <DialogTitle className="truncate text-sm leading-normal font-semibold text-foreground">{fileName}</DialogTitle>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={downloadUrl ?? fileUrl}
                download={fileName}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Download size="13" />
                Download
              </a>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openDocument(fileUrl)}>
                <ExternalLink size="13" />
                Open in new tab
              </Button>
              <DialogClose render={<Button variant="ghost" size="icon-sm" />}>
                <X size="16" aria-hidden />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <iframe src={src} title={fileName} className="h-full w-full border-0" />
            <noscript>
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <AlertCircle size="48" className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Unable to preview this document.</p>
              </div>
            </noscript>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

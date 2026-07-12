'use client'

import { useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { X, ExternalLink, AlertCircle } from 'lucide-react'
import { dataUrlToBlob, openDocument } from '@/lib/files'

interface DocumentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  fileName: string
  fileUrl: string
}

export default function DocumentPreviewModal({ isOpen, onClose, fileName, fileUrl }: DocumentPreviewModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  // Data URLs render unreliably in cross-browser iframes; resolve to a blob URL.
  const src = useMemo(() => {
    if (!isOpen) return ''
    if (fileUrl.startsWith('data:')) return URL.createObjectURL(dataUrlToBlob(fileUrl))
    return fileUrl
  }, [isOpen, fileUrl])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
    }
  }, [isOpen, handleEscape, src])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[90vh] w-[90vw] max-w-6xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="truncate text-sm font-semibold text-foreground">{fileName}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openDocument(fileUrl)}>
              <ExternalLink size="13" />
              Open in New Tab
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X size="16" />
              <span className="sr-only">Close</span>
            </Button>
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
      </div>
    </div>
  )
}

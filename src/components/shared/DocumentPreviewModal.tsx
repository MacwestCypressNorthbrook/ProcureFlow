'use client'

import { useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { X, ExternalLink, AlertCircle } from 'lucide-react'

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

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleEscape])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[90vh] w-[90vw] max-w-6xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground truncate">{fileName}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink size="13" />
              Open in New Tab
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
            >
              <X size="16" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <iframe
            src={fileUrl}
            title={fileName}
            className="h-full w-full border-0"
            onError={() => {}}
          />
          <noscript>
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
              <AlertCircle size="48" className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Unable to preview this document.
              </p>
              <Button
                onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
                className="gap-1.5"
              >
                <ExternalLink size="14" />
                Open in New Tab
              </Button>
            </div>
          </noscript>
        </div>
      </div>
    </div>
  )
}

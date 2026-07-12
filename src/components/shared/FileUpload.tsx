'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import DocumentPreviewModal from '@/components/shared/DocumentPreviewModal'
import { readFileAsDataUrl, formatBytes } from '@/lib/files'
import { UploadCloud, FileText, X, Eye, Loader2 } from 'lucide-react'

export interface UploadedFile {
  fileName: string
  fileUrl: string
  size?: number
  file?: File
}

interface FileUploadProps {
  value: UploadedFile | null
  onChange: (value: UploadedFile | null) => void
  accept?: string
  maxSizeMB?: number
  disabled?: boolean
}

export default function FileUpload({
  value,
  onChange,
  accept = 'application/pdf',
  maxSizeMB = 10,
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)

  const isPdf = (file: File) =>
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  const handleFile = async (file: File) => {
    setError('')
    if (accept.includes('pdf') && !isPdf(file)) {
      setError('Please choose a PDF file.')
      return
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File is too large (max ${maxSizeMB} MB).`)
      return
    }
    setReading(true)
    try {
      const fileUrl = await readFileAsDataUrl(file)
      onChange({ fileName: file.name, fileUrl, size: file.size, file })
    } catch {
      setError('Could not read that file. Please try again.')
    } finally {
      setReading(false)
    }
  }

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (value) {
    return (
      <>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{value.fileName}</p>
            <p className="text-xs text-muted-foreground">{value.size ? formatBytes(value.size) : 'PDF'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setPreview(true)}>
              <Eye size={13} /> Preview
            </Button>
            {!disabled && (
              <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Remove" onClick={() => onChange(null)}>
                <X size={14} />
              </Button>
            )}
          </div>
        </div>
        {preview && (
          <DocumentPreviewModal isOpen={preview} onClose={() => setPreview(false)} fileName={value.fileName} fileUrl={value.fileUrl} />
        )}
      </>
    )
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onInput} disabled={disabled} />
      <button
        type="button"
        disabled={disabled || reading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? 'border-primary bg-primary/[0.04]' : 'border-border bg-muted/20 hover:bg-muted/40'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        {reading ? (
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        ) : (
          <UploadCloud size={20} className="text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground">
          {reading ? 'Reading file…' : 'Click to upload or drag & drop'}
        </span>
        <span className="text-xs text-muted-foreground">PDF up to {maxSizeMB} MB</span>
      </button>
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

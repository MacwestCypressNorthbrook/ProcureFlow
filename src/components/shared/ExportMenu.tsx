'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Table2, Check } from 'lucide-react'
import { downloadExcel, downloadPdf, exportFilename, type ExportColumn, type ExportMeta } from '@/lib/export'
import { toCsv, downloadCsv, type CsvColumn } from '@/lib/csv'
import { cn } from '@/lib/utils'

/**
 * Export what is on screen, in whichever format the viewer needs.
 *
 * It takes the rows `DataView` hands it — already filtered, searched and sorted
 * — so narrowing a Reviewed tab to one project and exporting gives that one
 * project, not the whole table. Three formats because the three are genuinely
 * different jobs: Excel for someone who will pivot it, PDF for someone who will
 * file or sign it, CSV for a system that will read it.
 */
export default function ExportMenu<T>({
  rows,
  columns,
  meta,
  section,
  className,
}: {
  rows: T[]
  columns: ExportColumn<T>[]
  meta: ExportMeta
  /** Slug used in the filename: `procureflow-<section>-2026-09-29.xls` */
  section: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const count = rows.length
  const disabled = count === 0

  // Click-outside and Escape both close it — a menu that can only be dismissed
  // by picking something from it is a trap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const flash = (label: string) => {
    setDone(label)
    setError(null)
    setTimeout(() => setDone(null), 2000)
  }

  const run = (format: 'excel' | 'pdf' | 'csv') => {
    setOpen(false)
    try {
      if (format === 'excel') {
        downloadExcel(rows, columns, meta, section)
        flash('Excel')
      } else if (format === 'pdf') {
        const opened = downloadPdf(rows, columns, meta)
        if (opened) flash('PDF')
        // A blocked popup is the single most common failure here, and it is
        // silent unless we say so.
        else setError('Allow pop-ups for this site to export a PDF.')
      } else {
        const csvColumns: CsvColumn<T>[] = columns.map((c) => ({ header: c.header, value: c.value }))
        downloadCsv(exportFilename(section, 'csv'), toCsv(rows, csvColumns))
        flash('CSV')
      }
    } catch {
      setError('That export could not be generated.')
    }
  }

  const options = [
    {
      id: 'excel' as const,
      label: 'Excel workbook',
      hint: 'Formatted .xls with totals',
      icon: <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />,
    },
    {
      id: 'pdf' as const,
      label: 'PDF document',
      hint: 'Typeset for printing or filing',
      icon: <FileText size={16} className="text-rose-600 dark:text-rose-400" />,
    },
    {
      id: 'csv' as const,
      label: 'CSV file',
      hint: 'Plain data for another system',
      icon: <Table2 size={16} className="text-muted-foreground" />,
    },
  ]

  return (
    <div ref={wrapRef} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? 'Nothing to export' : `Export these ${count} record${count === 1 ? '' : 's'}`}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-3.5 text-sm font-medium text-foreground transition-colors',
          disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted press-active'
        )}
      >
        {done ? (
          <Check size={15} className="text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Download size={15} />
        )}
        {done ? `${done} exported` : 'Export'}
        {!done && count > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({count})</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[272px] overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Export {count} record{count === 1 ? '' : 's'}
          </p>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={() => run(option.id)}
              className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted press-active"
            >
              <span className="mt-0.5 shrink-0">{option.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="absolute right-0 top-full mt-1.5 w-max max-w-[260px] rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ReportExportOption {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  /** May report progress through the callback; a returned string is shown as the outcome. */
  run: (progress: (text: string) => void) => Promise<string | void> | string | void
  disabled?: string | false
}

/**
 * Export what is on screen. Takes the already filtered and sorted rows' count
 * for the label; each option does its own work, so a slow one (bundling
 * documents) can say how far along it is.
 */
export default function ReportExportMenu({
  count,
  noun,
  options,
}: {
  count: number
  /** "purchase order", "invoice" */
  noun: string
  options: ReportExportOption[]
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ text: string; ok: boolean } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = async (option: ReportExportOption) => {
    setOpen(false)
    setBusy('Preparing…')
    setOutcome(null)
    try {
      const result = await option.run(setBusy)
      setOutcome({ text: result || `${option.label} downloaded`, ok: true })
    } catch (err) {
      setOutcome({ text: err instanceof Error && err.message ? err.message : 'That export could not be generated.', ok: false })
    } finally {
      setBusy(null)
      setTimeout(() => setOutcome(null), 4000)
    }
  }

  const disabled = count === 0 || busy !== null

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-card px-3.5 text-sm font-medium text-foreground transition-colors',
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted press-active'
        )}
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : outcome?.ok ? <Check size={15} className="text-emerald-600" /> : <Download size={15} />}
        {busy ?? 'Export'}
        {!busy && count > 0 && <span className="text-xs font-normal text-muted-foreground">({count})</span>}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-[290px] overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl">
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            {count} {noun}
            {count === 1 ? '' : 's'} · as filtered
          </p>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              disabled={Boolean(option.disabled)}
              title={option.disabled || undefined}
              onClick={() => run(option)}
              className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 press-active"
            >
              <span className="mt-0.5 shrink-0">{option.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.disabled || option.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {outcome && (
        <p
          role="status"
          className={cn(
            'absolute right-0 top-full z-40 mt-1.5 w-max max-w-[280px] rounded-lg px-2.5 py-1.5 text-xs font-medium',
            outcome.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'
          )}
        >
          {outcome.text}
        </p>
      )}
    </div>
  )
}

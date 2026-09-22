'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'

export interface SupplierOption {
  id: string
  name: string
  category?: string | null
  contact_name?: string | null
  phone?: string | null
}

/**
 * Search-or-add supplier control.
 *
 * Sized for thumbs: a full-height trigger, a sheet-style panel on phones and a
 * dropdown from `sm` up. If the typed name matches nothing, the panel offers to
 * create it inline so a site engineer is never blocked by a missing vendor.
 */
export default function SupplierPicker({
  value,
  suppliers,
  onChange,
  onCreated,
  disabled,
  compact,
}: {
  value: string | null
  suppliers: SupplierOption[]
  onChange: (supplierId: string | null) => void
  onCreated: (supplier: SupplierOption) => void
  disabled?: boolean
  /** Renders a shorter trigger for use inside a desktop table row. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = suppliers.find((s) => s.id === value) ?? null

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        (s.contact_name ?? '').toLowerCase().includes(q)
    )
  }, [suppliers, term])

  const exactMatch = matches.some((s) => s.name.toLowerCase() === term.trim().toLowerCase())
  const canCreate = term.trim().length > 1 && !exactMatch

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Focusing the search on open would summon the keyboard over the list on
    // phones, so only do it where there is room for both.
    if (window.matchMedia('(min-width: 640px)').matches) searchRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (id: string | null) => {
    onChange(id)
    setOpen(false)
    setTerm('')
    setError('')
  }

  const createSupplier = async () => {
    const name = term.trim()
    if (!name || creating) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Could not add supplier')
        return
      }
      onCreated(payload.data as SupplierOption)
      pick(payload.data.id as string)
    } catch {
      setError('Network error — could not add supplier')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left transition-colors hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
          compact ? 'h-10 text-sm' : 'h-12 text-base sm:h-11 sm:text-sm'
        }`}
      >
        <span className={`truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selected ? selected.name : 'Select supplier'}
        </span>
        <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="relative border-b border-border">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search or type a new name…"
              className="h-12 w-full bg-transparent pl-9 pr-9 text-base text-foreground placeholder:text-muted-foreground focus:outline-none sm:h-11 sm:text-sm"
            />
            {term && (
              <button
                type="button"
                onClick={() => setTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {value && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="flex w-full items-center px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted"
              >
                Clear selection
              </button>
            )}

            {matches.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s.id)}
                className="flex w-full items-center justify-between gap-2 border-t border-border px-3 py-3 text-left hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                  {(s.category || s.contact_name) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {[s.category, s.contact_name].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {s.id === value && <Check size={16} className="shrink-0 text-primary" />}
              </button>
            ))}

            {matches.length === 0 && !canCreate && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No suppliers found.</p>
            )}

            {canCreate && (
              <button
                type="button"
                onClick={createSupplier}
                disabled={creating}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-3 text-left text-sm font-medium text-primary hover:bg-muted disabled:opacity-60"
              >
                <Plus size={16} className="shrink-0" />
                <span className="truncate">
                  {creating ? 'Adding…' : `Add "${term.trim()}" as a new supplier`}
                </span>
              </button>
            )}
          </div>

          {error && (
            <p className="border-t border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}

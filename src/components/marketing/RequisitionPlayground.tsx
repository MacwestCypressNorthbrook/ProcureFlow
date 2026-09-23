'use client'

import { useState } from 'react'
import {
  Lock,
  Minus,
  Plus,
  Trash2,
  ArrowRightLeft,
} from 'lucide-react'

const ghs = (n: number, min = 0) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: min }).format(n)

interface PlaygroundItem { id: string; desc: string; qty: number; price: number }

const initialItems: PlaygroundItem[] = [
  { id: '1', desc: 'Service rendered — Adenta Assembly', qty: 1, price: 5000 },
  { id: '2', desc: 'Ergonomic office chairs', qty: 2, price: 450 },
]

type SimState = 'idle' | 'submitting' | 'reviewing' | 'approved' | 'paid'

/**
 * The only interactive part of the landing page.
 *
 * Split out so the rest of the page ships as static HTML with no client
 * JavaScript at all — on a weak connection the copy and the call to action
 * render immediately, and this island hydrates whenever it arrives.
 */
export default function RequisitionPlayground() {
  const [items, setItems] = useState<PlaygroundItem[]>(initialItems)
  const [sim, setSim] = useState<SimState>('idle')

  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  const updateQty = (id: string, delta: number) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, it.qty + delta) } : it)),
    )
  const removeItem = (id: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.id !== id)))
  const addItem = () => {
    const pool = [
      ['Mechanical keyboards', 120],
      ['Dell UltraSharp monitors', 680],
      ['Docking stations', 240],
      ['Gigabit network switch', 85],
    ] as const
    const [desc, price] = pool[Math.floor(Math.random() * pool.length)]
    setItems((prev) => [...prev, { id: Date.now().toString(), desc, qty: 1, price }])
  }

  const runSim = () => {
    if (sim !== 'idle') return
    setSim('submitting')
    setTimeout(() => setSim('reviewing'), 1200)
    setTimeout(() => setSim('approved'), 2600)
    setTimeout(() => setSim('paid'), 4000)
    setTimeout(() => setSim('idle'), 6200)
  }

  const simMeta: Record<SimState, { label: string; cls: string }> = {
    idle: { label: 'Run the approval loop', cls: 'bg-foreground text-background hover:bg-foreground/90' },
    submitting: { label: 'Submitting requisition…', cls: 'bg-blue-600 text-white' },
    reviewing: { label: 'Converting to purchase order…', cls: 'bg-violet-600 text-white' },
    approved: { label: 'Signed off by Sam…', cls: 'bg-amber-600 text-white' },
    paid: { label: 'Paid & closed by Finance', cls: 'bg-emerald-600 text-white' },
  }

  return (
    /* Interactive requisition preview */
    <div className="relative animate-scale-in" style={{ animationDelay: '120ms' }}>
              <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[28px] bg-gradient-to-tr from-primary/8 via-transparent to-primary/5 blur-2xl" aria-hidden />
              <div className="surface-elevated rounded-2xl overflow-hidden">
                {/* window chrome */}
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-border" />
                  <span className="h-2.5 w-2.5 rounded-full bg-border" />
                  <span className="h-2.5 w-2.5 rounded-full bg-border" />
                  <span className="ml-2 text-xs font-medium text-muted-foreground">Requisition · RF-001</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Lock size="11" /> Live preview
                  </span>
                </div>

                <div className="p-5 relative">
                  {sim !== 'idle' && (
                    <div className="absolute right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      {sim}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requester</p>
                      <p className="text-sm font-semibold text-foreground">Bernard Wiafe · Operations</p>
                    </div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background text-[11px] font-semibold">MW</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {items.map((it) => (
                      <div
                        key={it.id}
                        className="group flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">{it.desc}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {it.qty} × {ghs(it.price)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQty(it.id, -1)}
                            disabled={sim !== 'idle'}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                            aria-label="Decrease quantity"
                          >
                            <Minus size="12" />
                          </button>
                          <span className="w-5 text-center text-xs font-semibold tabular">{it.qty}</span>
                          <button
                            onClick={() => updateQty(it.id, 1)}
                            disabled={sim !== 'idle'}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                            aria-label="Increase quantity"
                          >
                            <Plus size="12" />
                          </button>
                          <button
                            onClick={() => removeItem(it.id)}
                            disabled={sim !== 'idle' || items.length === 1}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-0"
                            aria-label="Remove item"
                          >
                            <Trash2 size="12" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {sim === 'idle' && (
                      <button
                        onClick={addItem}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <Plus size="13" /> Add line item
                      </button>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Grand total</span>
                    <span className="text-lg font-semibold text-foreground font-mono">{ghs(total, 2)}</span>
                  </div>

                  <button
                    onClick={runSim}
                    disabled={sim !== 'idle'}
                    className={`mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors press-active ${simMeta[sim].cls}`}
                  >
                    {sim === 'idle' ? <ArrowRightLeft size="16" /> : <span className="h-2 w-2 rounded-full bg-white animate-ping" />}
                    {simMeta[sim].label}
                  </button>
                </div>
              </div>
            </div>
  )
}

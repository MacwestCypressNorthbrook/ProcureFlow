'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import {
  FileText,
  ClipboardCheck,
  CreditCard as CardIcon,
  Shield,
  ArrowRight,
  CheckCircle,
  Zap,
  Plus,
  Minus,
  Trash2,
  ArrowRightLeft,
  TrendingUp,
  Lock,
  Clock,
  ChevronDown,
  Box,
  Verified,
} from 'lucide-react'

const ghs = (n: number, min = 0) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: min }).format(n)

interface PlaygroundItem { id: string; desc: string; qty: number; price: number }

const initialItems: PlaygroundItem[] = [
  { id: '1', desc: 'Service rendered — Adenta Assembly', qty: 1, price: 5000 },
  { id: '2', desc: 'Ergonomic office chairs', qty: 2, price: 450 },
]

type SimState = 'idle' | 'submitting' | 'reviewing' | 'approved' | 'paid'

const pipeline = [
  {
    icon: <FileText size="22" />,
    step: '01',
    actor: 'Minta · anyone',
    title: 'Submit a requisition',
    body: 'Build a multi-item request with quantities, unit prices and remarks. No login required to raise one.',
    tint: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  },
  {
    icon: <ClipboardCheck size="22" />,
    step: '02',
    actor: 'Mintah',
    title: 'Review & convert',
    body: 'Procurement checks specs, adds detail and converts the request into a formal purchase order.',
    tint: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
  },
  {
    icon: <Shield size="22" />,
    step: '03',
    actor: 'Sam · executive',
    title: 'Approve in seconds',
    body: 'A single, signed off decision from any device. The full audit trail is captured automatically.',
    tint: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  },
  {
    icon: <CardIcon size="22" />,
    step: '04',
    actor: 'Finance',
    title: 'Disburse & settle',
    body: 'Finance processes the payment, attaches the receipt and closes the loop — cleanly and on record.',
    tint: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  },
]

const metrics = [
  { value: '15s', label: 'Median approval time' },
  { value: '100%', label: 'Auditable by default' },
  { value: '4', label: 'Roles, one clean loop' },
  { value: '0', label: 'Lost receipts, ever' },
]

export default function HomePage() {
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />

      {/* ─── Hero ─── */}
      <section className="relative isolate">
        <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[820px] -translate-x-1/2 brand-glow opacity-40" aria-hidden />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28 relative">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-10 items-center">
            {/* Copy */}
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-xs)] animate-fade-in">
                <span className="flex h-1.5 w-1.5 rounded-full bg-success" />
                Trusted procurement, from request to receipt
              </div>

              <h1 className="mt-6 text-[2.6rem] leading-[1.03] sm:text-6xl font-semibold tracking-[-0.035em] text-foreground text-balance animate-slide-up">
                Procurement that
                <span className="text-gradient"> settles itself.</span>
              </h1>

              <p className="mt-6 text-lg leading-relaxed text-muted-foreground text-pretty animate-slide-up" style={{ animationDelay: '60ms' }}>
                Raise a requisition, get it approved, and pay the vendor — in one auditable flow.
                No email chains, no lost paper, no guesswork about who signed what.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3 animate-slide-up" style={{ animationDelay: '120ms' }}>
                <Link href="/request">
                  <Button size="lg" className="h-11 px-5 gap-2 shadow-sm">
                    Submit a request
                    <ArrowRight size="16" />
                  </Button>
                </Link>
                <Link href="/auth/login">
                  <Button size="lg" variant="outline" className="h-11 px-5">
                    Sign in to dashboard
                  </Button>
                </Link>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-6 max-w-md border-t border-border pt-6 animate-slide-up" style={{ animationDelay: '180ms' }}>
                {metrics.slice(0, 3).map((m) => (
                  <div key={m.label}>
                    <dt className="text-2xl font-semibold tracking-tight text-foreground tabular">{m.value}</dt>
                    <dd className="mt-1 text-xs text-muted-foreground leading-snug">{m.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Interactive requisition preview */}
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
          </div>
        </div>
      </section>

      {/* ─── Trust strip ─── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              One accountable loop across every role
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
              {['Minta', 'Mintah', 'Sam', 'Finance'].map((r, i, arr) => (
                <div key={r} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">{r}</span>
                  {i < arr.length - 1 && <ArrowRight size="13" className="text-muted-foreground/60" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">How it works</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-foreground text-balance">
            Four roles. One clean, auditable loop.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Every hand-off is explicit and recorded. No one wonders where a request is or who needs to act next.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4 stagger">
          {pipeline.map((s) => (
            <div key={s.step} className="group surface rounded-2xl p-6 hover-lift">
              <div className="flex items-center justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tint}`}>{s.icon}</span>
                <span className="text-sm font-semibold text-muted-foreground/50 tabular">{s.step}</span>
              </div>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-primary">{s.actor}</p>
              <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Bento features ─── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Large: audit trail */}
          <div className="surface rounded-2xl p-8 lg:col-span-2 lg:row-span-2 flex flex-col">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield size="22" />
            </span>
            <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">A trail you can defend</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Every action — who raised it, who approved it, who paid — is timestamped and immutable.
              Reconcile in minutes and pass audits without the scavenger hunt.
            </p>
            <div className="mt-7 flex-1 rounded-xl border border-border bg-muted/30 p-4">
              <ul className="space-y-3">
                {[
                  { who: 'Bernard Wiafe', what: 'raised requisition RF-001', tone: 'bg-blue-500' },
                  { who: 'Mintah', what: 'converted to PO-2214', tone: 'bg-violet-500' },
                  { who: 'Sam', what: 'approved · signed off', tone: 'bg-amber-500' },
                  { who: 'Finance', what: 'paid & attached receipt', tone: 'bg-emerald-500' },
                ].map((row, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${row.tone}`} />
                    <span className="text-sm text-foreground"><span className="font-semibold">{row.who}</span> {row.what}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground font-mono">{`0${i + 1}:${(i * 7 + 12) % 60}`.padStart(5, '0')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Speed */}
          <div className="surface rounded-2xl p-8 hover-lift">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Verified size="22" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">Approve from anywhere</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Executives sign off in seconds on any device. No app to install, no VPN.
            </p>
          </div>

          {/* Roles */}
          <div className="surface rounded-2xl p-8 hover-lift">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Lock size="22" />
            </span>
            <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">Role-based by design</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Each person sees exactly their part of the flow — nothing more, nothing missed.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Product preview ─── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="surface-elevated overflow-hidden rounded-3xl">
          <div className="grid lg:grid-cols-2">
            <div className="p-8 sm:p-12 lg:p-14 flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">The dashboard</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground text-balance">
                See every order at a glance
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Live counts of what&apos;s new, what&apos;s waiting on Sam, and what&apos;s cleared for payment —
                so nothing stalls in someone&apos;s inbox.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Real-time status across requisitions and POs',
                  'Clear ownership at every stage of the loop',
                  'Currency-accurate totals with tabular figures',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-foreground">
                    <CheckCircle size="18" className="mt-0.5 shrink-0 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link href="/auth/login">
                  <Button className="h-11 px-5 gap-2">
                    Explore the dashboard
                    <ArrowRight size="16" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative min-h-[320px] border-t border-border lg:border-l lg:border-t-0 bg-muted/30">
              <Image
                src="/images/hero-dashboard.jpg"
                alt="ProcureFlow dashboard preview"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Metrics band ─── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="text-center sm:text-left">
                <p className="text-4xl font-semibold tracking-tight text-foreground tabular">{m.value}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-foreground px-8 py-16 sm:px-16 sm:py-20 text-center">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[600px] -translate-x-1/2 bg-primary/25 blur-[100px]" aria-hidden />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-background text-balance">
              Ready to close the loop on procurement?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-background/70">
              Raise your first requisition in under a minute. No account needed to get started.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/request">
                <Button size="lg" className="h-12 px-6 gap-2 bg-background text-foreground hover:bg-background/90">
                  Start a requisition
                  <ArrowRight size="16" />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 border-background/20 bg-transparent text-background hover:bg-background/10"
                >
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
                  <Box size="15" />
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-foreground">ProcureFlow</span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                High-trust procurement, from request to receipt.
              </p>
            </div>
            {[
              { title: 'Product', links: [['Submit a request', '/request'], ['Dashboard', '/auth/login'], ['How it works', '#']] },
              { title: 'Roles', links: [['Minta', '#'], ['Mintah', '#'], ['Sam', '#'], ['Finance', '#']] },
              { title: 'Company', links: [['About', '#'], ['Security', '#'], ['Contact', '#']] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.title}</h4>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} ProcureFlow. All rights reserved.</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock size="13" />
              <TrendingUp size="13" />
              <ChevronDown size="13" className="rotate-0" />
              <span className="ml-1">Built for teams that move money carefully.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User, Request, PurchaseOrder } from '@/lib/types'
import { ROLE_LABELS, PO_STATUS_CONFIG, REQUEST_STATUS_CONFIG } from '@/lib/utils'
import ThemeToggle from '@/components/layout/ThemeToggle'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import {
  Category,
  People,
  ClipboardTick,
  ShoppingCart,
  Setting2,
  Logout,
  Menu,
  SearchNormal1,
  TickCircle,
  Warning2,
  ArrowRight,
  Card as CardIcon,
} from '@/lib/icons'

const ghs = (n: number | null) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(n)

const shortDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const ASSIGNABLE = ['minta', 'mintah', 'sam', 'finance', 'admin', 'superuser']

const roleDot: Record<string, string> = {
  superuser: 'bg-violet-500',
  admin: 'bg-slate-500',
  minta: 'bg-blue-500',
  mintah: 'bg-indigo-500',
  sam: 'bg-amber-500',
  finance: 'bg-emerald-500',
}

type Section = 'overview' | 'users' | 'requests' | 'pos' | 'settings'

const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Category size="18" /> },
  { id: 'users', label: 'Users', icon: <People size="18" /> },
  { id: 'requests', label: 'Requests', icon: <ClipboardTick size="18" /> },
  { id: 'pos', label: 'Purchase Orders', icon: <ShoppingCart size="18" /> },
  { id: 'settings', label: 'Settings', icon: <Setting2 size="18" /> },
]

function BrandMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m8 9.7 4 2.3 4-2.3M12 12v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function StatusPill({ status, kind }: { status: string; kind: 'po' | 'request' }) {
  const cfg = (kind === 'po' ? PO_STATUS_CONFIG : REQUEST_STATUS_CONFIG)[status]
  if (!cfg) return <span className="text-xs text-muted-foreground">{status}</span>
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export default function AdminClient({
  users: initialUsers,
  requests,
  pos,
}: {
  users: User[]
  requests: Request[]
  pos: PurchaseOrder[]
}) {
  const router = useRouter()
  const [section, setSection] = useState<Section>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const stats = useMemo(
    () => ({
      users: users.length,
      requests: requests.length,
      pos: pos.length,
      completed: pos.filter((p) => p.status === 'completed').length,
      value: pos.reduce((s, p) => s + (p.total_amount ?? 0), 0),
      pending: pos.filter((p) => p.status === 'pending_sam' || p.status === 'pending_payment').length,
    }),
    [users, requests, pos],
  )

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of users) m[u.role ?? 'unknown'] = (m[u.role ?? 'unknown'] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [users])

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.role === roleFilter
      const matchesQuery =
        !q || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      return matchesRole && matchesQuery
    })
  }, [users, query, roleFilter])

  const changeRole = async (id: string, role: string) => {
    const prev = users.find((u) => u.id === id)?.role
    if (prev === role) return
    setSavingId(id)
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, role } : u)))
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Update failed' }))
        setUsers((us) => us.map((u) => (u.id === id ? { ...u, role: prev ?? u.role } : u)))
        setToast({ msg: error ?? 'Could not update role', ok: false })
      } else {
        setToast({ msg: 'Role updated', ok: true })
        router.refresh()
      }
    } catch {
      setUsers((us) => us.map((u) => (u.id === id ? { ...u, role: prev ?? u.role } : u)))
      setToast({ msg: 'Network error', ok: false })
    } finally {
      setSavingId(null)
      setTimeout(() => setToast(null), 2600)
    }
  }

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-0.5">
      {nav.map((n) => (
        <button
          key={n.id}
          onClick={() => {
            setSection(n.id)
            onNavigate?.()
          }}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors press-active ${
            section === n.id
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {n.icon}
          {n.label}
        </button>
      ))}
    </nav>
  )

  const sidebarInner = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col p-4">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-2 pt-2">
        <BrandMark />
        <span className="text-[15px] font-semibold tracking-tight">
          Procure<span className="text-primary">Flow</span>
        </span>
        <span className="ml-auto rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Admin
        </span>
      </Link>
      <NavList onNavigate={onNavigate} />
      <div className="mt-auto space-y-1 border-t border-border pt-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowRight size="18" className="rotate-180" />
          Back to site
        </Link>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Logout size="18" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )

  const sectionMeta: Record<Section, { title: string; sub: string }> = {
    overview: { title: 'Overview', sub: 'System health and activity at a glance' },
    users: { title: 'Users', sub: 'Manage people and their roles' },
    requests: { title: 'Requests', sub: 'Every requisition raised across the org' },
    pos: { title: 'Purchase Orders', sub: 'Orders from creation through payment' },
    settings: { title: 'Settings', sub: 'Preferences and administration' },
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen border-r border-border bg-card lg:block">
        {sidebarInner()}
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass-nav px-4 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden">
              <Menu size="20" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] border-r border-border bg-card p-0">
              <SheetTitle className="sr-only">Admin navigation</SheetTitle>
              {sidebarInner(() => setMobileOpen(false))}
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
              {sectionMeta[section].title}
            </h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{sectionMeta[section].sub}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Superuser
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {section === 'overview' && (
            <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { label: 'Total users', value: stats.users, icon: <People size="18" />, tint: 'text-violet-600 dark:text-violet-400 bg-violet-500/10' },
                  { label: 'Requests', value: stats.requests, icon: <ClipboardTick size="18" />, tint: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
                  { label: 'Purchase orders', value: stats.pos, icon: <ShoppingCart size="18" />, tint: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
                  { label: 'Completed', value: stats.completed, icon: <TickCircle size="18" />, tint: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
                ].map((s) => (
                  <div key={s.label} className="surface rounded-xl p-5">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.tint}`}>{s.icon}</span>
                    <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground tabular">{s.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-5">
                {/* Value + pending */}
                <div className="surface rounded-xl p-6 lg:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total PO value</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground font-mono">{ghs(stats.value)}</p>
                  <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
                    <Warning2 size="16" className="text-amber-500" />
                    <span className="text-foreground">{stats.pending}</span>
                    <span className="text-muted-foreground">orders awaiting action</span>
                  </div>
                </div>

                {/* Role distribution */}
                <div className="surface rounded-xl p-6 lg:col-span-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Users by role</p>
                  <ul className="mt-4 space-y-3">
                    {roleCounts.map(([role, count]) => (
                      <li key={role} className="flex items-center gap-3">
                        <span className="flex w-28 items-center gap-2 text-sm text-foreground">
                          <span className={`h-2 w-2 rounded-full ${roleDot[role] ?? 'bg-slate-400'}`} />
                          {ROLE_LABELS[role]?.split(' ')[0] ?? role}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground/80"
                            style={{ width: `${(count / Math.max(1, users.length)) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 text-right text-sm font-medium tabular text-muted-foreground">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Recent POs */}
              <div className="surface overflow-hidden rounded-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                  <h2 className="text-sm font-semibold text-foreground">Recent purchase orders</h2>
                  <button onClick={() => setSection('pos')} className="text-xs font-medium text-primary hover:underline">
                    View all
                  </button>
                </div>
                <Table
                  head={['Purpose', 'Amount', 'Status', 'Created']}
                  rows={pos.slice(0, 5).map((p) => [
                    <span key="p" className="font-medium text-foreground">{p.purpose}</span>,
                    <span key="a" className="font-mono text-muted-foreground">{ghs(p.total_amount)}</span>,
                    <StatusPill key="s" status={p.status} kind="po" />,
                    <span key="d" className="text-muted-foreground">{shortDate(p.created_at)}</span>,
                  ])}
                  empty="No purchase orders yet."
                />
              </div>
            </div>
          )}

          {section === 'users' && (
            <div className="mx-auto max-w-5xl space-y-5 animate-fade-in">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <SearchNormal1 size="16" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-10 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">All roles</option>
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                  ))}
                </select>
                <span className="shrink-0 rounded-lg bg-muted px-3 py-2 text-sm font-medium tabular text-muted-foreground">
                  {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
                </span>
              </div>

              <div className="surface overflow-hidden rounded-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">User</th>
                        <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role</th>
                        <th className="hidden px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                                {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{u.name ?? 'Unnamed'}</p>
                                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${roleDot[u.role] ?? 'bg-slate-400'}`} />
                              <select
                                value={ASSIGNABLE.includes(u.role) ? u.role : ''}
                                onChange={(e) => changeRole(u.id, e.target.value)}
                                disabled={savingId === u.id}
                                className="h-8 rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                              >
                                {!ASSIGNABLE.includes(u.role) && <option value="">{u.role}</option>}
                                {ASSIGNABLE.map((r) => (
                                  <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                                ))}
                              </select>
                              {savingId === u.id && <span className="text-xs text-muted-foreground">Saving…</span>}
                            </div>
                          </td>
                          <td className="hidden px-6 py-3 text-muted-foreground sm:table-cell">{shortDate(u.created_at)}</td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-sm text-muted-foreground">
                            No users match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                <CardIcon size="18" className="mt-0.5 shrink-0" />
                <p>
                  New users join through the{' '}
                  <Link href="/auth/signup" className="font-medium text-primary hover:underline">signup page</Link>{' '}
                  and pick a starting role. Adjust anyone&apos;s role inline above — changes save instantly.
                </p>
              </div>
            </div>
          )}

          {section === 'requests' && (
            <div className="mx-auto max-w-5xl animate-fade-in">
              <div className="surface overflow-hidden rounded-xl">
                <Table
                  head={['Purpose', 'Requester', 'Amount', 'Status', 'Created']}
                  rows={requests.map((r) => [
                    <span key="p" className="font-medium text-foreground">{r.purpose}</span>,
                    <span key="r" className="text-muted-foreground">{r.guest_name ?? '—'}</span>,
                    <span key="a" className="font-mono text-muted-foreground">{ghs(r.estimated_unit_rate)}</span>,
                    <StatusPill key="s" status={r.status} kind="request" />,
                    <span key="d" className="text-muted-foreground">{shortDate(r.created_at)}</span>,
                  ])}
                  empty="No requests raised yet."
                />
              </div>
            </div>
          )}

          {section === 'pos' && (
            <div className="mx-auto max-w-5xl animate-fade-in">
              <div className="surface overflow-hidden rounded-xl">
                <Table
                  head={['Purpose', 'Amount', 'Status', 'Created', 'Paid']}
                  rows={pos.map((p) => [
                    <span key="p" className="font-medium text-foreground">{p.purpose}</span>,
                    <span key="a" className="font-mono text-muted-foreground">{ghs(p.total_amount)}</span>,
                    <StatusPill key="s" status={p.status} kind="po" />,
                    <span key="d" className="text-muted-foreground">{shortDate(p.created_at)}</span>,
                    <span key="pd" className="text-muted-foreground">{shortDate(p.paid_at)}</span>,
                  ])}
                  empty="No purchase orders yet."
                />
              </div>
            </div>
          )}

          {section === 'settings' && (
            <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
              <div className="surface flex items-center justify-between rounded-xl p-6">
                <div>
                  <p className="text-sm font-semibold text-foreground">Appearance</p>
                  <p className="mt-1 text-sm text-muted-foreground">Switch between light and dark themes.</p>
                </div>
                <ThemeToggle />
              </div>
              <div className="surface rounded-xl p-6">
                <p className="text-sm font-semibold text-foreground">Superuser accounts</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Elevated roles can be assigned from the Users section. The very first superuser is provisioned
                  directly in Supabase. Every role change here is applied immediately and reflected across the app.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-slide-up rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.ok ? 'bg-foreground text-background' : 'bg-destructive text-destructive-foreground'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[]
  rows: React.ReactNode[][]
  empty: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
              {cells.map((c, j) => (
                <td key={j} className="px-6 py-3.5">{c}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-6 py-12 text-center text-sm text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

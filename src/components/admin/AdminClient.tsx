'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User, Request, PurchaseOrder } from '@/lib/types'
import { ROLE_LABELS, PO_STATUS_CONFIG, REQUEST_STATUS_CONFIG } from '@/lib/utils'
import ThemeToggle from '@/components/layout/ThemeToggle'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Card, CardContent } from '@/components/ui/card'
import {
  LayoutGrid,
  Users as PeopleIcon,
  ClipboardCheck,
  ShoppingBag,
  Settings,
  Search,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  History,
} from 'lucide-react'

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

const roleBadgeColor: Record<string, string> = {
  superuser: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  admin: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
  minta: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  mintah: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  sam: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  finance: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
}

type Section = 'overview' | 'users' | 'requests' | 'pos' | 'audit' | 'settings'

const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size="18" /> },
  { id: 'users', label: 'Users', icon: <PeopleIcon size="18" /> },
  { id: 'requests', label: 'Requests', icon: <ClipboardCheck size="18" /> },
  { id: 'pos', label: 'Purchase Orders', icon: <ShoppingBag size="18" /> },
  { id: 'audit', label: 'Audit Trail', icon: <History size="18" /> },
  { id: 'settings', label: 'Settings', icon: <Settings size="18" /> },
]

function StatusPill({ status, kind }: { status: string; kind: 'po' | 'request' }) {
  const cfg = (kind === 'po' ? PO_STATUS_CONFIG : REQUEST_STATUS_CONFIG)[status]
  if (!cfg) return <span className="text-xs text-muted-foreground">{status}</span>
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export default function AdminClient({
  user,
  role,
  users: initialUsers,
  requests,
  pos,
  auditTrail,
}: {
  user: { name?: string; email: string } | null
  role: string | null
  users: User[]
  requests: Request[]
  pos: PurchaseOrder[]
  auditTrail: any[]
}) {
  const router = useRouter()
  const [section, setSection] = useState<Section>('overview')
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

  const changeRole = async (id: string, newRole: string) => {
    const prev = users.find((u) => u.id === id)?.role
    if (prev === newRole) return
    setSavingId(id)
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, role: newRole } : u)))
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role: newRole }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Update failed' }))
        setUsers((us) => us.map((u) => (u.id === id ? { ...u, role: prev ?? u.role } : u)))
        setToast({ msg: error ?? 'Could not update role', ok: false })
      } else {
        setToast({ msg: 'Role updated successfully', ok: true })
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

  const customNav = nav.map((n) => ({
    id: n.id,
    label: n.label,
    icon: n.icon,
    active: section === n.id,
    onClick: () => setSection(n.id),
  }))

  const sectionMeta: Record<Section, { title: string; sub: string }> = {
    overview: { title: 'Overview', sub: 'System health and activity at a glance' },
    users: { title: 'Users Directory', sub: 'Manage people and assign system roles' },
    requests: { title: 'Requisitions Raised', sub: 'Every request raised across the organization' },
    pos: { title: 'Purchase Orders', sub: 'Purchase orders from creation through payment' },
    audit: { title: 'Audit Trail', sub: 'Track all actions across the procurement pipeline' },
    settings: { title: 'Administration Settings', sub: 'Preferences and system information' },
  }

  return (
    <DashboardLayout
      title={sectionMeta[section].title}
      subtitle={sectionMeta[section].sub}
      user={user}
      role={role}
      customNav={customNav}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {section === 'overview' && (
          <div className="space-y-8 animate-slide-up">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: 'Total Users', value: stats.users, icon: <PeopleIcon size="20" />, tint: 'text-violet-600 dark:text-violet-400 bg-violet-500/10' },
                { label: 'Total Requests', value: stats.requests, icon: <ClipboardCheck size="20" />, tint: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
                { label: 'Purchase Orders', value: stats.pos, icon: <ShoppingBag size="20" />, tint: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
                { label: 'Completed Orders', value: stats.completed, icon: <CheckCircle size="20" />, tint: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
              ].map((s) => (
                <div key={s.label} className="group surface rounded-2xl p-5 border border-border/60 hover:shadow-md transition-all duration-200">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${s.tint}`}>
                    {s.icon}
                  </span>
                  <p className="mt-4 text-3xl font-bold tracking-tight text-foreground tabular">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground font-medium">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Distribution and PO Value */}
            <div className="grid gap-6 lg:grid-cols-5">
              {/* Value + Pending */}
              <div className="surface rounded-2xl p-6 border border-border/60 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total PO Value</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-foreground font-mono">{ghs(stats.value)}</p>
                </div>
                <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-amber-500/10 bg-amber-500/5 px-4 py-3 text-sm">
                  <AlertTriangle size="18" className="text-amber-500 shrink-0" />
                  <div className="text-xs font-medium text-foreground">
                    <span className="font-bold text-amber-600 dark:text-amber-400">{stats.pending}</span> orders await executive approval or payment.
                  </div>
                </div>
              </div>

              {/* Role Distribution */}
              <div className="surface rounded-2xl p-6 border border-border/60 lg:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Users by Role</p>
                <ul className="space-y-4">
                  {roleCounts.map(([r, count]) => (
                    <li key={r} className="flex items-center gap-3">
                      <span className="flex w-28 items-center gap-2 text-xs font-semibold text-foreground">
                        <span className={`h-2 w-2 rounded-full ${roleDot[r] ?? 'bg-slate-400'}`} />
                        {ROLE_LABELS[r]?.split(' ')[0] ?? r}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground/75 transition-all duration-300"
                          style={{ width: `${(count / Math.max(1, users.length)) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-medium tabular text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recent POs */}
            <div className="surface rounded-2xl border border-border/60 overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/10">
                <h2 className="text-sm font-semibold text-foreground">Recent Purchase Orders</h2>
                <button
                  onClick={() => setSection('pos')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  View all
                  <ArrowRight size="12" />
                </button>
              </div>
              <Table
                head={['Purpose', 'Amount', 'Status', 'Created']}
                rows={pos.slice(0, 5).map((p) => [
                  <span key="p" className="font-semibold text-foreground">{p.purpose}</span>,
                  <span key="a" className="font-mono text-xs font-semibold text-foreground">{ghs(p.total_amount)}</span>,
                  <StatusPill key="s" status={p.status} kind="po" />,
                  <span key="d" className="text-muted-foreground text-xs font-medium">{shortDate(p.created_at)}</span>,
                ])}
                empty="No purchase orders yet."
              />
            </div>
          </div>
        )}

        {section === 'users' && (
          <div className="space-y-6 animate-slide-up">
            {/* Search & Filter Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search size="16" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-10 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Roles</option>
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                  ))}
                </select>
                <span className="inline-flex items-center rounded-xl bg-muted px-3.5 py-2.5 text-xs font-semibold text-muted-foreground tabular">
                  {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
                </span>
              </div>
            </div>

            {/* Users Table */}
            <div className="surface rounded-2xl border border-border/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/15 text-muted-foreground font-semibold">
                      <th className="px-6 py-3.5 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3.5 uppercase tracking-wider">Role & Permissions</th>
                      <th className="hidden px-6 py-3.5 uppercase tracking-wider sm:table-cell">Date Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-muted/15 transition-colors">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                              {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground text-sm">{u.name ?? 'Unnamed'}</p>
                              <p className="truncate text-xs text-muted-foreground font-medium">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2">
                            <select
                              value={ASSIGNABLE.includes(u.role) ? u.role : ''}
                              onChange={(e) => changeRole(u.id, e.target.value)}
                              disabled={savingId === u.id}
                              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                            >
                              {!ASSIGNABLE.includes(u.role) && <option value="">{u.role}</option>}
                              {ASSIGNABLE.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                              ))}
                            </select>
                            {savingId === u.id && <span className="text-[10px] text-muted-foreground animate-pulse">Saving…</span>}
                          </div>
                        </td>
                        <td className="hidden px-6 py-3.5 text-muted-foreground font-medium sm:table-cell">{shortDate(u.created_at)}</td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-sm text-muted-foreground font-medium">
                          No users found matching your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Note Panel */}
            <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-xs text-muted-foreground leading-relaxed">
              <CheckCircle size="18" className="mt-0.5 shrink-0 text-primary" />
              <p>
                New users join through the{' '}
                <Link href="/auth/signup" className="font-semibold text-primary hover:underline">signup page</Link>{' '}
                and pick a starting role. Adjust roles inline from the dropdown — modifications will save instantly in real-time.
              </p>
            </div>
          </div>
        )}

        {section === 'requests' && (
          <div className="space-y-6 animate-slide-up">
            <div className="surface rounded-2xl border border-border/60 overflow-hidden">
              <Table
                head={['Purpose', 'Requester', 'Amount', 'Status', 'Created']}
                rows={requests.map((r) => [
                  <span key="p" className="font-semibold text-foreground">{r.purpose}</span>,
                  <span key="r" className="text-muted-foreground text-xs font-semibold">{r.guest_name ?? '—'}</span>,
                  <span key="a" className="font-mono text-xs text-muted-foreground">{ghs(r.estimated_unit_rate)}</span>,
                  <StatusPill key="s" status={r.status} kind="request" />,
                  <span key="d" className="text-muted-foreground text-xs font-medium">{shortDate(r.created_at)}</span>,
                ])}
                empty="No requests raised yet."
              />
            </div>
          </div>
        )}

        {section === 'pos' && (
          <div className="space-y-6 animate-slide-up">
            <div className="surface rounded-2xl border border-border/60 overflow-hidden">
              <Table
                head={['Purpose', 'Amount', 'Status', 'Created', 'Paid On']}
                rows={pos.map((p) => [
                  <span key="p" className="font-semibold text-foreground">{p.purpose}</span>,
                  <span key="a" className="font-mono text-xs font-semibold text-foreground">{ghs(p.total_amount)}</span>,
                  <StatusPill key="s" status={p.status} kind="po" />,
                  <span key="d" className="text-muted-foreground text-xs font-medium">{shortDate(p.created_at)}</span>,
                  <span key="pd" className="text-muted-foreground text-xs font-medium">{shortDate(p.paid_at)}</span>,
                ])}
                empty="No purchase orders yet."
              />
            </div>
          </div>
        )}

        {section === 'audit' && (
          <div className="space-y-6 animate-slide-up">
            <div className="surface rounded-2xl border border-border/60 overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/10">
                <p className="text-xs text-muted-foreground font-medium">
                  Showing the latest {auditTrail.length} actions across all purchase orders
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/15 text-muted-foreground font-semibold">
                      <th className="px-6 py-3.5 uppercase tracking-wider">Action</th>
                      <th className="px-6 py-3.5 uppercase tracking-wider">Purchase Order</th>
                      <th className="px-6 py-3.5 uppercase tracking-wider">Performed By</th>
                      <th className="px-6 py-3.5 uppercase tracking-wider">Notes</th>
                      <th className="px-6 py-3.5 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditTrail.map((entry: any) => {
                      const actionLabels: Record<string, string> = {
                        created: 'PO Created',
                        approved_by_sam: 'Approved by Sam',
                        rejected_by_sam: 'Rejected by Sam',
                        sent_back_by_sam: 'Sent Back by Sam',
                        payment_completed: 'Payment Completed',
                        comment_added: 'Comment Added',
                      }
                      const actionColors: Record<string, string> = {
                        created: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                        approved_by_sam: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        rejected_by_sam: 'bg-red-500/10 text-red-600 dark:text-red-400',
                        sent_back_by_sam: 'bg-red-500/10 text-red-600 dark:text-red-400',
                        payment_completed: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
                        comment_added: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
                      }
                      return (
                        <tr key={entry.id} className="border-b border-border/60 last:border-0 hover:bg-muted/15 transition-colors">
                          <td className="px-6 py-3.5">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${actionColors[entry.action] ?? 'bg-muted text-muted-foreground'}`}>
                              {actionLabels[entry.action] ?? entry.action}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="font-semibold text-foreground">{entry.po?.purpose ?? '—'}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="text-muted-foreground font-medium">{entry.performer?.name ?? '—'}</span>
                          </td>
                          <td className="px-6 py-3.5 max-w-[200px] truncate text-muted-foreground">{entry.notes ?? '—'}</td>
                          <td className="px-6 py-3.5 text-muted-foreground font-medium">{shortDate(entry.created_at)}</td>
                        </tr>
                      )
                    })}
                    {auditTrail.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground font-medium">
                          No audit trail entries yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {section === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-5 animate-slide-up">
            <div className="surface rounded-2xl border border-border/60 p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Interface Appearance</p>
                <p className="mt-1 text-xs text-muted-foreground font-medium">Switch between light and dark visual aesthetics.</p>
              </div>
              <ThemeToggle />
            </div>

            <div className="surface rounded-2xl border border-border/60 p-6">
              <p className="text-sm font-semibold text-foreground mb-1.5">Superuser Accounts</p>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                Elevated administrative roles can be managed and modified from the **Users** section.
                Every role change is applied instantly to the database and takes effect immediately.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-scale-in rounded-xl px-5 py-3 text-xs font-bold shadow-xl border ${
            toast.ok
              ? 'bg-foreground text-background border-foreground'
              : 'bg-destructive text-destructive-foreground border-destructive/20'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
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
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/15 text-muted-foreground font-semibold">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-6 py-3.5 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/15 transition-colors">
              {cells.map((c, j) => (
                <td key={j} className="px-6 py-3.5 font-medium">{c}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-6 py-12 text-center text-sm text-muted-foreground font-medium">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

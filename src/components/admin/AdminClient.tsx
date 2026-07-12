'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { User, Request, PurchaseOrder } from '@/lib/types'
import { ROLE_LABELS, PO_STATUS_CONFIG, REQUEST_STATUS_CONFIG } from '@/lib/utils'
import ThemeToggle from '@/components/layout/ThemeToggle'
import DashboardLayout from '@/components/layout/DashboardLayout'
import StatusBadge from '@/components/shared/StatusBadge'
import { PageContainer, Panel, SectionHeader, StatStrip, EmptyState } from '@/components/shared/ui-kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

type Section = 'overview' | 'users' | 'requests' | 'pos' | 'audit' | 'settings'

const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={18} /> },
  { id: 'users', label: 'Users', icon: <PeopleIcon size={18} /> },
  { id: 'requests', label: 'Requests', icon: <ClipboardCheck size={18} /> },
  { id: 'pos', label: 'Purchase Orders', icon: <ShoppingBag size={18} /> },
  { id: 'audit', label: 'Audit Trail', icon: <History size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
]

interface Col {
  label: string
  align?: 'left' | 'right'
  hideBelow?: 'sm' | 'md' | 'lg'
}

function DataTable({ cols, rows, empty }: { cols: Col[]; rows: React.ReactNode[][]; empty: string }) {
  const hide = (c: Col) =>
    c.hideBelow === 'sm' ? 'hidden sm:table-cell' : c.hideBelow === 'md' ? 'hidden md:table-cell' : c.hideBelow === 'lg' ? 'hidden lg:table-cell' : ''
  return (
    <div className="surface overflow-hidden rounded-xl">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {cols.map((c, i) => (
              <TableHead
                key={i}
                className={`h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${c.align === 'right' ? 'text-right' : ''} ${hide(c)}`}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((cells, i) => (
              <TableRow key={i} className="border-border last:border-0">
                {cells.map((cell, j) => (
                  <TableCell
                    key={j}
                    className={`px-4 py-3 text-sm ${cols[j]?.align === 'right' ? 'text-right' : ''} ${hide(cols[j] ?? {} as Col)}`}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell colSpan={cols.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
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
      const matchesQuery = !q || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
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
      <PageContainer>
        {section === 'overview' && (
          <div className="space-y-8">
            <StatStrip
              stats={[
                { label: 'Total Users', value: stats.users, icon: <PeopleIcon size={18} />, accent: 'purple' },
                { label: 'Requests', value: stats.requests, icon: <ClipboardCheck size={18} />, accent: 'blue' },
                { label: 'Purchase Orders', value: stats.pos, icon: <ShoppingBag size={18} />, accent: 'amber' },
                { label: 'Completed', value: stats.completed, icon: <CheckCircle size={18} />, accent: 'emerald' },
                { label: 'PO Value', value: ghs(stats.value), icon: <TrendingUp size={18} />, accent: 'indigo' },
              ]}
            />

            <div className="grid gap-6 lg:grid-cols-5">
              <Panel title="Awaiting Action" icon={<AlertTriangle size={16} className="text-amber-500" />} className="lg:col-span-2">
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">{stats.pending}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  orders awaiting executive approval or payment across the pipeline.
                </p>
                <button
                  onClick={() => setSection('pos')}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Review purchase orders <ArrowRight size={13} />
                </button>
              </Panel>

              <Panel title="Users by Role" icon={<PeopleIcon size={16} />} className="lg:col-span-3">
                <ul className="space-y-3.5">
                  {roleCounts.map(([r, count]) => (
                    <li key={r} className="flex items-center gap-3">
                      <span className="flex w-24 items-center gap-2 text-xs font-medium text-foreground">
                        <span className={`h-2 w-2 rounded-full ${roleDot[r] ?? 'bg-slate-400'}`} />
                        {ROLE_LABELS[r]?.split(' ')[0] ?? r}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(count / Math.max(1, users.length)) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <section>
              <SectionHeader
                title="Recent Purchase Orders"
                action={
                  <button onClick={() => setSection('pos')} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    View all <ArrowRight size={13} />
                  </button>
                }
              />
              <DataTable
                cols={[
                  { label: 'Purpose' },
                  { label: 'Amount', align: 'right' },
                  { label: 'Status' },
                  { label: 'Created', hideBelow: 'sm' },
                ]}
                rows={pos.slice(0, 6).map((p) => [
                  <span key="p" className="font-medium text-foreground">{p.purpose}</span>,
                  <span key="a" className="font-semibold tabular-nums text-foreground">{ghs(p.total_amount)}</span>,
                  <StatusBadge key="s" status={p.status} config={PO_STATUS_CONFIG} />,
                  <span key="d" className="text-xs text-muted-foreground">{shortDate(p.created_at)}</span>,
                ])}
                empty="No purchase orders yet."
              />
            </section>
          </div>
        )}

        {section === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-10 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Roles</option>
                  {ASSIGNABLE.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                  ))}
                </select>
                <span className="inline-flex h-10 items-center rounded-lg bg-muted px-3 text-xs font-medium tabular-nums text-muted-foreground">
                  {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
                </span>
              </div>
            </div>

            <div className="surface overflow-hidden rounded-xl">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">User</TableHead>
                    <TableHead className="h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Role &amp; Permissions</TableHead>
                    <TableHead className="hidden h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="border-border last:border-0">
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                            {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{u.name ?? 'Unnamed'}</p>
                            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={ASSIGNABLE.includes(u.role) ? u.role : ''}
                            onChange={(e) => changeRole(u.id, e.target.value)}
                            disabled={savingId === u.id}
                            className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                          >
                            {!ASSIGNABLE.includes(u.role) && <option value="">{u.role}</option>}
                            {ASSIGNABLE.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                            ))}
                          </select>
                          {savingId === u.id && <span className="animate-pulse text-[10px] text-muted-foreground">Saving…</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">{shortDate(u.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableCell colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No users found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs leading-relaxed text-muted-foreground">
              <CheckCircle size={16} className="mt-0.5 shrink-0 text-primary" />
              <p>
                New users join through the{' '}
                <Link href="/auth/signup" className="font-medium text-primary hover:underline">signup page</Link>{' '}
                and pick a starting role. Adjust roles inline from the dropdown — changes save instantly.
              </p>
            </div>
          </div>
        )}

        {section === 'requests' && (
          <DataTable
            cols={[
              { label: 'Purpose' },
              { label: 'Requester', hideBelow: 'md' },
              { label: 'Amount', align: 'right', hideBelow: 'sm' },
              { label: 'Status' },
              { label: 'Created', hideBelow: 'sm' },
            ]}
            rows={requests.map((r) => [
              <span key="p" className="font-medium text-foreground">{r.purpose}</span>,
              <span key="r" className="text-sm text-muted-foreground">{r.guest_name ?? '—'}</span>,
              <span key="a" className="tabular-nums text-muted-foreground">{ghs(r.estimated_unit_rate)}</span>,
              <StatusBadge key="s" status={r.status} config={REQUEST_STATUS_CONFIG} />,
              <span key="d" className="text-xs text-muted-foreground">{shortDate(r.created_at)}</span>,
            ])}
            empty="No requests raised yet."
          />
        )}

        {section === 'pos' && (
          <DataTable
            cols={[
              { label: 'Purpose' },
              { label: 'Amount', align: 'right' },
              { label: 'Status' },
              { label: 'Created', hideBelow: 'sm' },
              { label: 'Paid On', hideBelow: 'md' },
            ]}
            rows={pos.map((p) => [
              <span key="p" className="font-medium text-foreground">{p.purpose}</span>,
              <span key="a" className="font-semibold tabular-nums text-foreground">{ghs(p.total_amount)}</span>,
              <StatusBadge key="s" status={p.status} config={PO_STATUS_CONFIG} />,
              <span key="d" className="text-xs text-muted-foreground">{shortDate(p.created_at)}</span>,
              <span key="pd" className="text-xs text-muted-foreground">{shortDate(p.paid_at)}</span>,
            ])}
            empty="No purchase orders yet."
          />
        )}

        {section === 'audit' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Showing the latest {auditTrail.length} actions across all purchase orders.
            </p>
            <DataTable
              cols={[
                { label: 'Action' },
                { label: 'Purchase Order', hideBelow: 'sm' },
                { label: 'By', hideBelow: 'md' },
                { label: 'Notes', hideBelow: 'lg' },
                { label: 'Time', align: 'right' },
              ]}
              rows={auditTrail.map((entry: any) => {
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
                return [
                  <span key="a" className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${actionColors[entry.action] ?? 'bg-muted text-muted-foreground'}`}>
                    {actionLabels[entry.action] ?? entry.action}
                  </span>,
                  <span key="po" className="font-medium text-foreground">{entry.po?.purpose ?? '—'}</span>,
                  <span key="by" className="text-sm text-muted-foreground">{entry.performer?.name ?? '—'}</span>,
                  <span key="n" className="block max-w-[220px] truncate text-xs text-muted-foreground">{entry.notes ?? '—'}</span>,
                  <span key="t" className="text-xs text-muted-foreground">{shortDate(entry.created_at)}</span>,
                ]
              })}
              empty="No audit trail entries yet."
            />
          </div>
        )}

        {section === 'settings' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Interface Appearance">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">Switch between light and dark themes.</p>
                <ThemeToggle />
              </div>
            </Panel>
            <Panel title="Superuser Accounts">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Elevated administrative roles are managed from the <span className="font-medium text-foreground">Users</span> section.
                Every role change is applied to the database and takes effect immediately.
              </p>
            </Panel>
          </div>
        )}
      </PageContainer>

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-scale-in rounded-xl border px-5 py-3 text-xs font-semibold shadow-xl ${
            toast.ok ? 'border-foreground bg-foreground text-background' : 'border-destructive/20 bg-destructive text-destructive-foreground'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </DashboardLayout>
  )
}

'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Request, PurchaseOrder, ProjectWithMemberCount, UserWithProjects } from '@/lib/types'
import { ROLE_LABELS, PO_STATUS_CONFIG, REQUEST_STATUS_CONFIG } from '@/lib/utils'
import ThemeToggle from '@/components/layout/ThemeToggle'
import DashboardLayout from '@/components/layout/DashboardLayout'
import StatusBadge from '@/components/shared/StatusBadge'
import { PageContainer, Panel, SectionHeader, StatGrid, DashboardHero } from '@/components/shared/ui-kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import UsersPanel from './UsersPanel'
import ProjectsPanel from './ProjectsPanel'
import SuppliersPanel, { type SupplierRow } from './SuppliersPanel'
import {
  LayoutGrid,
  Users as PeopleIcon,
  ClipboardCheck,
  ShoppingBag,
  Settings,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  History,
  Building2,
  Truck,
  Wallet,
} from 'lucide-react'
import { AUDIT_ACTION_LABELS } from '@/lib/audit'

const ghs = (n: number | null) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(n)

const shortDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'


const roleDot: Record<string, string> = {
  engineer: 'bg-blue-500',
  supply_chain: 'bg-amber-500',
  finance: 'bg-rose-500',
  cost_control: 'bg-emerald-500',
  project_lead: 'bg-indigo-500',
  super_user: 'bg-purple-500',
  administrator: 'bg-slate-500',
  adminstrator: 'bg-slate-500',
  superuser: 'bg-purple-500',
  admin: 'bg-slate-500',
  minta: 'bg-blue-500',
  mintah: 'bg-amber-500',
  sam: 'bg-indigo-500',
}

type Section = 'overview' | 'users' | 'projects' | 'suppliers' | 'requests' | 'pos' | 'audit' | 'settings'

const SECTIONS: Section[] = ['overview', 'users', 'projects', 'suppliers', 'requests', 'pos', 'audit', 'settings']

const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={18} /> },
  { id: 'users', label: 'Users', icon: <PeopleIcon size={18} /> },
  { id: 'projects', label: 'Projects', icon: <Building2 size={18} /> },
  { id: 'suppliers', label: 'Suppliers', icon: <Truck size={18} /> },
  { id: 'requests', label: 'Requests', icon: <ClipboardCheck size={18} /> },
  { id: 'pos', label: 'Purchase Orders', icon: <ShoppingBag size={18} /> },
  { id: 'audit', label: 'Audit Trail', icon: <History size={18} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
]


// Labels come from the shared audit module so this panel and the PO detail
// views cannot drift apart on what an action is called.
const ACTION_LABELS = AUDIT_ACTION_LABELS

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
  sent_back: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  paid: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  // legacy spellings
  approved_by_sam: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rejected_by_sam: 'bg-red-500/10 text-red-600 dark:text-red-400',
  sent_back_by_sam: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  payment_completed: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  comment_added: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
}

/** Shape of the audit rows the admin page joins together. */
export interface AuditEntry {
  id: string
  action: string
  notes: string | null
  created_at: string
  po: { id: string; purpose: string; status: string } | null
  performer: { id: string; name: string | null; email: string } | null
}

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
  users,
  projects,
  suppliers,
  requests,
  pos,
  auditTrail,
}: {
  user: { name?: string; email: string } | null
  role: string | null
  users: UserWithProjects[]
  projects: ProjectWithMemberCount[]
  suppliers: SupplierRow[]
  requests: Request[]
  pos: PurchaseOrder[]
  auditTrail: AuditEntry[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // The tab lives in the URL so /admin?tab=users is linkable and survives a
  // refresh — the sidebar's deep links depend on it.
  const tabParam = searchParams.get('tab')
  const section: Section = SECTIONS.includes(tabParam as Section)
    ? (tabParam as Section)
    : 'overview'

  // A notification deep-links an administrator to their own panel rather than
  // into another team's area; `focus` carries the record id so the list opens
  // filtered to it instead of dumping them on the full table.
  const focusId = searchParams.get('focus') ?? ''

  const setSection = (next: Section) => {
    const query = next === 'overview' ? '' : `?tab=${next}`
    router.replace(`/admin${query}`, { scroll: false })
  }

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  /** Surface the outcome of an admin action, then re-fetch server data. */
  const notify = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2800)
  }

  const stats = useMemo(
    () => ({
      users: users.length,
      requests: requests.length,
      pos: pos.length,
      completed: pos.filter((p) => p.status === 'paid').length,
      value: pos.reduce((s, p) => s + (p.total_amount ?? 0), 0),
      settledValue: pos
        .filter((p) => p.status === 'paid')
        .reduce((s, p) => s + (p.total_amount ?? 0), 0),
      pending: pos.filter((p) => p.status === 'pending_cost_control' || p.status === 'pending_finance').length,
      converted: requests.filter((r) => r.status === 'converted' || r.status === 'approved').length,
      activeUsers: users.filter((u) => u.is_active !== false).length,
    }),
    [users, requests, pos],
  )

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of users) m[u.role ?? 'unknown'] = (m[u.role ?? 'unknown'] ?? 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [users])

  const pipeline = useMemo(() => {
    const raised = requests.length
    const base = Math.max(1, raised)
    const approved = pos.filter(
      (p) => p.status === 'pending_finance' || p.status === 'paid',
    ).length
    const settled = pos.filter((p) => p.status === 'paid').length
    return [
      { label: 'Requisitions raised', count: raised, pct: 1, dot: 'bg-blue-500', bar: 'bg-blue-500', hint: 'Across every project site' },
      { label: 'Converted to POs', count: pos.length, pct: pos.length / base, dot: 'bg-amber-500', bar: 'bg-amber-500', hint: 'Raised by procurement' },
      { label: 'Approved', count: approved, pct: approved / base, dot: 'bg-indigo-500', bar: 'bg-indigo-500', hint: 'Signed off and cleared for payment' },
      { label: 'Paid & closed', count: settled, pct: settled / base, dot: 'bg-emerald-500', bar: 'bg-emerald-500', hint: 'Receipted and reconciled' },
    ]
  }, [requests, pos])

  const firstName = user?.name?.split(' ')[0]

  const requestCols: DataColumn<Request>[] = [
    {
      id: 'purpose',
      label: 'Purpose',
      sortable: true,
      sortValue: (r) => r.purpose,
      cell: (r) => <span className="font-medium text-foreground">{r.purpose}</span>,
    },
    {
      id: 'requester',
      label: 'Requester',
      hideBelow: 'md',
      sortable: true,
      sortValue: (r) => r.guest_name ?? '',
      cell: (r) => <span className="text-sm text-muted-foreground">{r.guest_name ?? '—'}</span>,
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'right',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (r) => r.total_amount ?? null,
      cell: (r) => <span className="tabular-nums text-muted-foreground">{ghs(r.total_amount ?? null)}</span>,
    },
    {
      id: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />,
    },
    {
      id: 'created_at',
      label: 'Created',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => <span className="text-xs text-muted-foreground">{shortDate(r.created_at)}</span>,
    },
  ]

  const requestFacets: DataFacet<Request>[] = [
    {
      id: 'status',
      label: 'Status',
      options: Array.from(new Set(requests.map((r) => r.status))).sort().map((v) => ({
        value: v,
        label: REQUEST_STATUS_CONFIG[v]?.label ?? v,
      })),
      matches: (r, value) => r.status === value,
    },
  ]

  const poCols: DataColumn<PurchaseOrder>[] = [
    {
      id: 'purpose',
      label: 'Purpose',
      sortable: true,
      sortValue: (p) => p.purpose,
      cell: (p) => <span className="font-medium text-foreground">{p.purpose}</span>,
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (p) => p.total_amount,
      cell: (p) => <span className="font-semibold tabular-nums text-foreground">{ghs(p.total_amount)}</span>,
    },
    {
      id: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (p) => p.status,
      cell: (p) => <StatusBadge status={p.status} config={PO_STATUS_CONFIG} />,
    },
    {
      id: 'created_at',
      label: 'Created',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (p) => p.created_at,
      cell: (p) => <span className="text-xs text-muted-foreground">{shortDate(p.created_at)}</span>,
    },
    {
      id: 'paid_at',
      label: 'Paid On',
      hideBelow: 'md',
      sortable: true,
      sortValue: (p) => p.paid_at ?? null,
      cell: (p) => <span className="text-xs text-muted-foreground">{shortDate(p.paid_at)}</span>,
    },
  ]

  const poFacets: DataFacet<PurchaseOrder>[] = [
    {
      id: 'status',
      label: 'Status',
      options: Array.from(new Set(pos.map((p) => p.status))).sort().map((v) => ({
        value: v,
        label: PO_STATUS_CONFIG[v]?.label ?? v,
      })),
      matches: (p, value) => p.status === value,
    },
  ]

  const auditCols: DataColumn<AuditEntry>[] = [
    {
      id: 'action',
      label: 'Action',
      sortable: true,
      sortValue: (e) => ACTION_LABELS[e.action] ?? e.action,
      cell: (e) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${ACTION_COLORS[e.action] ?? 'bg-muted text-muted-foreground'}`}>
          {ACTION_LABELS[e.action] ?? e.action}
        </span>
      ),
    },
    {
      id: 'po',
      label: 'Purchase Order',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (e) => e.po?.purpose ?? '',
      cell: (e) => <span className="font-medium text-foreground">{e.po?.purpose ?? '—'}</span>,
    },
    {
      id: 'by',
      label: 'By',
      hideBelow: 'md',
      sortable: true,
      sortValue: (e) => e.performer?.name ?? '',
      cell: (e) => <span className="text-sm text-muted-foreground">{e.performer?.name ?? '—'}</span>,
    },
    {
      id: 'notes',
      label: 'Notes',
      hideBelow: 'lg',
      cell: (e) => <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{e.notes ?? '—'}</span>,
    },
    {
      id: 'created_at',
      label: 'Time',
      align: 'right',
      sortable: true,
      sortValue: (e) => e.created_at,
      cell: (e) => <span className="text-xs text-muted-foreground">{shortDate(e.created_at)}</span>,
    },
  ]

  const auditFacets: DataFacet<AuditEntry>[] = [
    {
      id: 'action',
      label: 'Action',
      options: Array.from(new Set(auditTrail.map((e) => e.action))).sort().map((v) => ({
        value: v,
        label: ACTION_LABELS[v] ?? v,
      })),
      matches: (e, value) => e.action === value,
    },
  ]

  const customNav = nav.map((n) => ({
    id: n.id,
    label: n.label,
    icon: n.icon,
    active: section === n.id,
    onClick: () => setSection(n.id),
  }))

  const sectionMeta: Record<Section, { title: string; sub: string }> = {
    overview: { title: 'Overview', sub: 'System health and activity at a glance' },
    users: { title: 'User Management', sub: 'Roles, project assignments and account access' },
    projects: { title: 'Project Sites', sub: 'The sites requisitions are raised against' },
    suppliers: { title: 'Suppliers', sub: 'Vendors engineers can pick on a requisition' },
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
          <div className="space-y-6">
            <DashboardHero
              eyebrow="Control centre"
              title={firstName ? `System overview, ${firstName}` : 'System overview'}
              description={`${stats.users} account${stats.users === 1 ? '' : 's'} across ${projects.length} project site${projects.length === 1 ? '' : 's'} have raised ${stats.requests} requisition${stats.requests === 1 ? '' : 's'} and ${stats.pos} purchase order${stats.pos === 1 ? '' : 's'} worth ${ghs(stats.value)}.`}
              meta={[
                { label: `${stats.pending} awaiting action`, tone: stats.pending > 0 ? 'amber' : 'emerald' },
                { label: `${stats.completed} completed`, tone: 'emerald' },
                { label: `${ghs(stats.settledValue)} settled`, tone: 'indigo' },
              ]}
              actions={
                <button
                  type="button"
                  onClick={() => setSection('users')}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 press-active"
                >
                  <PeopleIcon size={15} /> Manage users
                </button>
              }
            />

            <StatGrid
              stats={[
                {
                  label: 'Total users',
                  value: stats.users,
                  icon: <PeopleIcon size={18} />,
                  tone: 'purple',
                  hint: `${stats.activeUsers} active`,
                  onClick: () => setSection('users'),
                },
                {
                  label: 'Project sites',
                  value: projects.length,
                  icon: <Building2 size={18} />,
                  tone: 'indigo',
                  hint: 'Requisitions are raised against these',
                  onClick: () => setSection('projects'),
                },
                {
                  label: 'Suppliers',
                  value: suppliers.length,
                  icon: <Truck size={18} />,
                  tone: 'blue',
                  hint: 'Available on requisitions',
                  onClick: () => setSection('suppliers'),
                },
                {
                  label: 'Requisitions',
                  value: stats.requests,
                  icon: <ClipboardCheck size={18} />,
                  tone: 'amber',
                  hint: `${stats.converted} converted to POs`,
                  share: stats.requests > 0 ? stats.converted / stats.requests : 0,
                  onClick: () => setSection('requests'),
                },
                {
                  label: 'Purchase orders',
                  value: stats.pos,
                  icon: <ShoppingBag size={18} />,
                  tone: 'emerald',
                  hint: `${stats.completed} completed`,
                  share: stats.pos > 0 ? stats.completed / stats.pos : 0,
                  badge: stats.pending > 0 ? `${stats.pending} open` : undefined,
                  onClick: () => setSection('pos'),
                },
              ]}
            />

            <div className="grid gap-4 lg:grid-cols-5">
              <Panel
                title="Procurement pipeline"
                icon={<TrendingUp size={16} />}
                className="lg:col-span-3"
                bodyClassName="p-5"
                action={
                  <button
                    onClick={() => setSection('pos')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Purchase orders <ArrowRight size={13} />
                  </button>
                }
              >
                <ul className="space-y-4">
                  {pipeline.map((stage) => (
                    <li key={stage.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                          <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                          {stage.label}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {stage.count}
                          <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                            {Math.round(stage.pct * 100)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className={`block h-full rounded-full ${stage.bar}`}
                          style={{ width: `${Math.max(stage.pct * 100, stage.count > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{stage.hint}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <Wallet size={13} /> Total PO value
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground">
                      {ghs(stats.value)}
                    </p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <CheckCircle size={13} /> Settled
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                      {ghs(stats.settledValue)}
                    </p>
                  </div>
                </div>
              </Panel>

              <div className="space-y-4 lg:col-span-2">
                <Panel
                  title="Awaiting action"
                  icon={<AlertTriangle size={16} className="text-amber-500" />}
                  bodyClassName="p-5"
                >
                  <div className="flex items-end gap-3">
                    <p className="text-4xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
                      {stats.pending}
                    </p>
                    <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {stats.pending > 0 ? 'Open' : 'Clear'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    orders awaiting executive approval or payment across the pipeline.
                  </p>
                  <button
                    onClick={() => setSection('pos')}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Review purchase orders <ArrowRight size={13} />
                  </button>
                </Panel>

                <Panel title="Users by role" icon={<PeopleIcon size={16} />} bodyClassName="p-5">
                  <ul className="space-y-3.5">
                    {roleCounts.map(([r, count]) => (
                      <li key={r}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${roleDot[r] ?? 'bg-slate-400'}`} />
                            <span className="truncate">{ROLE_LABELS[r]?.split(' ')[0] ?? r}</span>
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${(roleDot[r] ?? 'bg-slate-400')}`}
                            style={{ width: `${(count / Math.max(1, users.length)) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
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
          <UsersPanel users={users} projects={projects} onChanged={router.refresh} notify={notify} />
        )}

        {section === 'projects' && (
          <ProjectsPanel projects={projects} onChanged={router.refresh} notify={notify} />
        )}

        {section === 'suppliers' && (
          <SuppliersPanel suppliers={suppliers} onChanged={router.refresh} notify={notify} />
        )}

        {section === 'requests' && (
          <DataView
            rows={requests}
            getRowId={(r) => r.id}
            columns={requestCols}
            facets={requestFacets}
            searchPlaceholder="Search requisitions…"
            searchText={(r) => [r.id, r.purpose, r.guest_name, r.guest_email, r.department]}
            initialTerm={focusId}
            defaultSort={{ id: 'created_at', dir: 'desc' }}
            storageKey="admin-requests"
            emptyTitle="No requests raised yet"
            renderCard={(r) => (
              <article className="surface flex h-full flex-col rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{r.purpose}</p>
                  <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />
                </div>
                <div className="mt-auto pt-4">
                  <p className="text-lg font-semibold tabular-nums text-foreground">{ghs(r.total_amount ?? null)}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{r.guest_name ?? '—'}</span>
                    <span className="shrink-0">{shortDate(r.created_at)}</span>
                  </div>
                </div>
              </article>
            )}
          />
        )}

        {section === 'pos' && (
          <DataView
            rows={pos}
            getRowId={(p) => p.id}
            columns={poCols}
            facets={poFacets}
            searchPlaceholder="Search purchase orders…"
            searchText={(p) => [p.id, p.purpose, p.po_number, p.vendor_name, p.description]}
            initialTerm={focusId}
            defaultSort={{ id: 'created_at', dir: 'desc' }}
            storageKey="admin-pos"
            emptyTitle="No purchase orders yet"
            renderCard={(p) => (
              <article className="surface flex h-full flex-col rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{p.purpose}</p>
                  <StatusBadge status={p.status} config={PO_STATUS_CONFIG} />
                </div>
                <div className="mt-auto pt-4">
                  <p className="text-lg font-semibold tabular-nums text-foreground">{ghs(p.total_amount)}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>Created {shortDate(p.created_at)}</span>
                    {p.paid_at && <span className="shrink-0">Paid {shortDate(p.paid_at)}</span>}
                  </div>
                </div>
              </article>
            )}
          />
        )}

        {section === 'audit' && (
          <DataView
            rows={auditTrail}
            getRowId={(e) => e.id}
            columns={auditCols}
            facets={auditFacets}
            searchPlaceholder="Search the audit trail…"
            searchText={(e) => [e.action, e.notes, e.po?.purpose, e.performer?.name, e.performer?.email]}
            defaultSort={{ id: 'created_at', dir: 'desc' }}
            storageKey="admin-audit"
            emptyTitle="No audit trail entries yet"
          />
        )}

        {section === 'settings' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Workspace">
              <dl className="divide-y divide-border">
                {[
                  { label: 'People', value: `${stats.activeUsers} active of ${stats.users}`, tab: 'users' as Section },
                  { label: 'Project sites', value: String(projects.length), tab: 'projects' as Section },
                  { label: 'Suppliers', value: String(suppliers.length), tab: 'suppliers' as Section },
                  { label: 'Requisitions', value: String(requests.length), tab: 'requests' as Section },
                  { label: 'Purchase orders', value: String(pos.length), tab: 'pos' as Section },
                  { label: 'Recorded actions', value: String(auditTrail.length), tab: 'audit' as Section },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-foreground">{row.value}</span>
                      <button
                        type="button"
                        onClick={() => setSection(row.tab)}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={`Open ${row.label}`}
                      >
                        <ArrowRight size={14} />
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel title="Role distribution">
              {roleCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {roleCounts.map(([roleKey, count]) => {
                    const pct = stats.users > 0 ? Math.round((count / stats.users) * 100) : 0
                    return (
                      <li key={roleKey}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="font-medium text-foreground">
                            {ROLE_LABELS[roleKey] ?? roleKey}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {count} · {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                Roles decide approval authority. Change them under{' '}
                <button
                  type="button"
                  onClick={() => setSection('users')}
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Users
                </button>
                ; every change takes effect immediately.
              </p>
            </Panel>

            <Panel title="Appearance">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Theme</p>
                  <p className="text-[11px] text-muted-foreground">
                    Applies to this browser only. Follows your system by default.
                  </p>
                </div>
                <ThemeToggle />
              </div>
            </Panel>

            <Panel title="Your account">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Your own name, password and sign-in live in your personal settings.
              </p>
              <Link
                href="/settings"
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted press-active"
              >
                <Settings size={15} />
                Open account settings
              </Link>
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

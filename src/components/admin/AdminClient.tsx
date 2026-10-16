'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Request, ProjectWithMemberCount, UserWithProjects } from '@/lib/types'
import { ROLE_LABELS, PO_STATUS_CONFIG, REQUEST_STATUS_CONFIG } from '@/lib/utils'
import ThemeToggle from '@/components/layout/ThemeToggle'
import StatusBadge from '@/components/shared/StatusBadge'
import { PageContainer, PageHeader, Panel, SectionHeader, DashboardHero } from '@/components/shared/ui-kit'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import UsersPanel from './UsersPanel'
import ProjectsPanel from './ProjectsPanel'
import SuppliersPanel, { type SupplierRow } from './SuppliersPanel'
import EmailPreviewModal from './EmailPreviewModal'
import RequestWindowPanel from './RequestWindowPanel'
import NotificationSettingsPanel from './NotificationSettingsPanel'
import AttachPODrawer from './AttachPODrawer'
import ExportButton from './ExportButton'
import ExportMenu from '@/components/shared/ExportMenu'
import PurchaseOrdersReport from './PurchaseOrdersReport'
import InvoicesReport from './InvoicesReport'
import RequisitionsDashboard from './RequisitionsDashboard'
import AuditDashboard from './AuditDashboard'
import AdminOverviewDashboard from './AdminOverviewDashboard'
import { TableTray } from '@/components/shared/dashboard/kit'
import type { AdminPurchaseOrder, AdminInvoice } from './report-types'
import type { ExportColumn } from '@/lib/export'
import { currentStage, STAGE_LABEL } from '@/lib/workflow'
import { csvNumber, formatDate as csvDate, type CsvColumn } from '@/lib/csv'
import {
  LayoutGrid,
  Users as PeopleIcon,
  ClipboardCheck,
  ShoppingBag,
  Settings,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  History,
  Building2,
  Truck,
  Wallet,
  Mail,
  FileUp,
  SlidersHorizontal,
  Receipt,
} from 'lucide-react'
import { AUDIT_ACTION_LABELS } from '@/lib/audit'
import { can, type Capability, type RoleId } from '@/lib/roles'
import type { RoleEmailPolicy } from '@/lib/notification-settings'

const ghs = (n: number | string | null | undefined) => {
  if (n == null || n === '') return '—'
  const val = Number(n)
  if (isNaN(val)) return '—'
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(val)
}

const shortDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'


/** A requisition row as the admin page queries it — with its purchase orders folded in. */
export type AdminRequestRow = Request & {
  project_name?: string | null
  /** The engineer who raised it, from their account. */
  requester_name?: string | null
  requester_email?: string | null
  sent_back_to?: string | null
  /** When the requisition last moved — its time at the current stage starts here. */
  stage_since?: string | null
  /** The most recent purchase order. */
  po_id?: string | null
  po_number?: string | null
  po_status?: string | null
  /** Every purchase order on it; a multi-supplier requisition has one per vendor. */
  po_count?: number | null
  po_numbers?: string | null
}
type AdminRequest = AdminRequestRow

/** Who raised it: their account name, then the name typed on the form. */
const engineerOf = (r: AdminRequest): string =>
  r.requester_name?.trim() || r.guest_name?.trim() || r.requester_email || r.guest_email || 'Unknown'

/** Where a requisition sits, as a filterable key — a chain stage, or how it ended. */
function stageKeyOf(r: AdminRequest): string {
  const stage = currentStage(r.status, r.sent_back_to)
  if (stage) return r.status === 'sent_back' ? `sent_back:${stage}` : stage
  return r.status
}

const CLOSED_LABELS: Record<string, string> = {
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

function stageLabelOf(key: string): string {
  if (key.startsWith('sent_back:')) {
    const stage = key.slice('sent_back:'.length)
    return stage === 'requester' ? 'Requester (sent back)' : `${STAGE_LABEL(stage)} (sent back)`
  }
  if (key === 'requester') return 'Requester (draft)'
  return CLOSED_LABELS[key] ?? (STAGE_LABEL(key) || REQUEST_STATUS_CONFIG[key]?.label || key)
}

/** Chain order, so the Stage filter and summaries read the way work flows. */
const STAGE_KEY_ORDER = [
  'requester',
  'sent_back:requester',
  'lead',
  'sent_back:lead',
  'supply_chain',
  'sent_back:supply_chain',
  'cost_control',
  'sent_back:cost_control',
  'admin',
  'sent_back:admin',
  'completed',
  'rejected',
  'cancelled',
]
const stageRank = (key: string) => {
  const i = STAGE_KEY_ORDER.indexOf(key)
  return i === -1 ? STAGE_KEY_ORDER.length : i
}

/** Whole days at the current stage; null once the requisition is closed. */
function daysAtStage(r: AdminRequest): number | null {
  if (!currentStage(r.status, r.sent_back_to)) return null
  const since = new Date(r.stage_since ?? r.created_at).getTime()
  if (Number.isNaN(since)) return null
  return Math.max(0, Math.floor((Date.now() - since) / 86_400_000))
}

/** "3 with Project Lead · 1 completed" — the shape of a set of requisitions. */
function stageSummary(rows: AdminRequest[]): string {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const key = stageKeyOf(r)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => stageRank(a[0]) - stageRank(b[0]))
    .map(([key, n]) => {
      const label = stageLabelOf(key)
      return CLOSED_LABELS[key] ? `${n} ${label.toLowerCase()}` : `${n} with ${label}`
    })
    .join(' · ')
}

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

type Section = 'overview' | 'users' | 'projects' | 'suppliers' | 'requests' | 'pos' | 'invoices' | 'audit' | 'emails' | 'settings'

const SECTIONS: Section[] = ['overview', 'users', 'projects', 'suppliers', 'requests', 'pos', 'invoices', 'audit', 'emails', 'settings']

/**
 * Each tab declares the capability it needs, so a section the viewer cannot
 * hold is neither listed nor reachable by typing `?tab=` into the address bar.
 */
const nav: { id: Section; label: string; icon: React.ReactNode; capability?: Capability }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={18} /> },
  { id: 'users', label: 'Users', icon: <PeopleIcon size={18} />, capability: 'admin:users' },
  { id: 'projects', label: 'Projects', icon: <Building2 size={18} />, capability: 'admin:projects' },
  { id: 'suppliers', label: 'Suppliers', icon: <Truck size={18} />, capability: 'admin:suppliers' },
  { id: 'requests', label: 'Requests', icon: <ClipboardCheck size={18} /> },
  { id: 'pos', label: 'Purchase Orders', icon: <ShoppingBag size={18} /> },
  { id: 'invoices', label: 'Invoices', icon: <Receipt size={18} /> },
  { id: 'audit', label: 'Audit Trail', icon: <History size={18} />, capability: 'admin:audit' },
  { id: 'emails', label: 'Email Templates', icon: <Mail size={18} />, capability: 'admin:email' },
  { id: 'settings', label: 'Workspace Preferences', icon: <SlidersHorizontal size={18} />, capability: 'admin:preferences' },
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
  invoices,
  auditTrail,
  requestWindowBlockedDays,
  notificationRoles,
}: {
  user: { name?: string; email: string } | null
  role: string | null
  users: UserWithProjects[]
  projects: ProjectWithMemberCount[]
  suppliers: SupplierRow[]
  requests: AdminRequest[]
  pos: AdminPurchaseOrder[]
  invoices: AdminInvoice[]
  auditTrail: AuditEntry[]
  requestWindowBlockedDays: number[]
  notificationRoles: Record<RoleId, RoleEmailPolicy> | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // The tab lives in the URL so /admin?tab=users is linkable and survives a
  // refresh — the sidebar's deep links depend on it.
  const visibleNav = useMemo(
    () => nav.filter((n) => !n.capability || can(role, n.capability)),
    [role],
  )
  const allowedSections = useMemo(
    () => new Set(visibleNav.map((n) => n.id)),
    [visibleNav],
  )

  const tabParam = searchParams.get('tab')
  // An unreachable tab silently falls back to Overview rather than rendering
  // a section this role is not permitted to see.
  const section: Section =
    SECTIONS.includes(tabParam as Section) && allowedSections.has(tabParam as Section)
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
  // What each table's search and filters leave — the dashboards above it chart exactly these.
  const [visibleRequests, setVisibleRequests] = useState<AdminRequest[]>(requests)
  const [visibleAudit, setVisibleAudit] = useState<AuditEntry[]>(auditTrail)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)

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
      value: pos.reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
      settledValue: pos
        .filter((p) => p.status === 'paid')
        .reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
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

  const firstName = user?.name?.split(' ')[0]

  const [poTarget, setPoTarget] = useState<AdminRequest | null>(null)

  const summaryFor = (r: AdminRequest) => ({
    purpose: r.purpose,
    department: r.department ?? undefined,
    totalAmount: r.total_amount != null ? Number(r.total_amount) : undefined,
    currency: r.currency ?? undefined,
    requesterName: r.guest_name ?? undefined,
  })

  /** The action that turns a cleared requisition into a purchase order. */
  const attachColumn: DataColumn<AdminRequest> = {
    id: 'attach',
    label: 'Action',
    align: 'right',
    cell: (r) =>
      r.status === 'pending_admin' ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setPoTarget(r)
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <FileUp size={13} /> Attach PO
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }

  /* ── CSV shapes: flat, spreadsheet-friendly, labels matching the screen ── */

  const requestExport: ExportColumn<AdminRequest>[] = [
    { header: 'Purpose', value: (r) => r.purpose },
    { header: 'Engineer', value: engineerOf },
    { header: 'Project site', value: (r) => r.project_name ?? '' },
    { header: 'Department', value: (r) => r.department ?? '' },
    { header: 'Current stage', value: (r) => stageLabelOf(stageKeyOf(r)) },
    { header: 'Days at stage', value: (r) => daysAtStage(r) ?? '', align: 'right' },
    { header: 'Status', value: (r) => REQUEST_STATUS_CONFIG[r.status]?.label ?? r.status },
    { header: 'PO numbers', value: (r) => r.po_numbers ?? r.po_number ?? '' },
    { header: 'Raised', value: (r) => csvDate(r.created_at) },
    { header: 'Last movement', value: (r) => csvDate(r.stage_since ?? null) },
    { header: 'Amount (GHS)', value: (r) => csvNumber(r.total_amount), total: true },
  ]

  /** Title, filters and filename that describe exactly what was exported. */
  const requestExportMeta = (visible: AdminRequest[]) => {
    const engineers = [...new Set(visible.map(engineerOf))]
    const sites = [...new Set(visible.map((r) => r.project_name).filter(Boolean))] as string[]
    const oneEngineer = engineers.length === 1 ? engineers[0] : null
    const filters: string[] = []
    if (oneEngineer) filters.push(`Engineer: ${oneEngineer}`)
    if (sites.length === 1) filters.push(`Project site: ${sites[0]}`)
    if (visible.length < requests.length) filters.push(`${visible.length} of ${requests.length} requisitions`)
    return {
      section: oneEngineer ? `requisitions-${slug(oneEngineer)}` : 'requisitions',
      meta: {
        title: oneEngineer ? `Requisitions — ${oneEngineer}` : 'Requisitions by stage',
        subtitle: `Where each requisition sits in the approval chain. ${stageSummary(visible)}`,
        exportedBy: user?.name || user?.email || null,
        filters,
      },
    }
  }

  const auditCsv: CsvColumn<AuditEntry>[] = [
    { header: 'Action', value: (e) => AUDIT_ACTION_LABELS[e.action] ?? e.action },
    { header: 'Purchase order', value: (e) => e.po?.purpose ?? '' },
    { header: 'Performed by', value: (e) => e.performer?.name ?? e.performer?.email ?? '' },
    { header: 'Notes', value: (e) => e.notes ?? '' },
    { header: 'Time', value: (e) => csvDate(e.created_at) },
  ]

  const requestCols: DataColumn<AdminRequest>[] = [
    {
      id: 'purpose',
      label: 'Purpose',
      sortable: true,
      sortValue: (r) => r.purpose,
      cell: (r) => <span className="font-medium text-foreground">{r.purpose}</span>,
    },
    {
      id: 'requester',
      label: 'Engineer',
      hideBelow: 'md',
      sortable: true,
      sortValue: engineerOf,
      cell: (r) => <span className="text-sm text-muted-foreground">{engineerOf(r)}</span>,
    },
    {
      id: 'project',
      label: 'Project site',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (r) => r.project_name ?? '',
      cell: (r) =>
        r.project_name ? (
          <span className="block max-w-[190px] truncate text-sm text-foreground" title={r.project_name}>
            {r.project_name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        ),
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
      id: 'po',
      label: 'Purchase Order',
      sortable: true,
      sortValue: (r) => r.po_number || (r.po_id ? 'PO' : 'None'),
      cell: (r) => {
        const { po_number: poNumber, po_id: poId, po_status: poStatus } = r
        if (poId || poNumber) {
          return (
            <div className="flex flex-col items-start gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
                <ShoppingBag size={12} className="shrink-0 text-violet-600 dark:text-violet-400" />
                <span>{poNumber || (poId ? `PO #${poId.slice(0, 8)}` : 'PO')}</span>
                {(r.po_count ?? 0) > 1 && (
                  <span className="font-normal text-violet-600/80 dark:text-violet-300/80" title={r.po_numbers ?? undefined}>
                    +{(r.po_count ?? 1) - 1} more
                  </span>
                )}
              </span>
              {poStatus && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  {PO_STATUS_CONFIG[poStatus]?.label || poStatus}
                </span>
              )}
            </div>
          )
        }
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            No PO Attached
          </span>
        )
      },
    },
    {
      id: 'stage',
      label: 'Current stage',
      sortable: true,
      sortValue: (r) => stageRank(stageKeyOf(r)),
      cell: (r) => {
        const days = daysAtStage(r)
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-medium text-foreground">{stageLabelOf(stageKeyOf(r))}</span>
            {days !== null && (
              <span
                className={`text-[11px] tabular-nums ${days > 7 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
              >
                {days === 0 ? 'Since today' : `${days} day${days === 1 ? '' : 's'} here`}
              </span>
            )}
          </div>
        )
      },
    },
    {
      id: 'status',
      label: 'Status',
      hideBelow: 'lg',
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

  const requestFacets: DataFacet<AdminRequest>[] = [
    {
      id: 'engineer',
      label: 'Engineer',
      options: [...new Set(requests.map(engineerOf))]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
      matches: (r, value) => engineerOf(r) === value,
    },
    {
      id: 'stage',
      label: 'Stage',
      options: [...new Set(requests.map(stageKeyOf))]
        .sort((a, b) => stageRank(a) - stageRank(b))
        .map((key) => ({ value: key, label: stageLabelOf(key) })),
      matches: (r, value) => stageKeyOf(r) === value,
    },
    {
      id: 'po_state',
      label: 'PO Attached',
      options: [
        { value: 'has_po', label: 'PO Attached' },
        { value: 'no_po', label: 'No PO attached' },
      ],
      matches: (r, value) => (value === 'has_po' ? Boolean(r.po_id) : !r.po_id),
    },
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

  const sectionMeta: Record<Section, { title: string; sub: string }> = {
    overview: { title: 'Overview', sub: 'System health and activity at a glance' },
    users: { title: 'User Management', sub: 'Roles, project assignments and account access' },
    projects: { title: 'Project Sites', sub: 'The sites requisitions are raised against' },
    suppliers: { title: 'Suppliers', sub: 'Vendors engineers can pick on a requisition' },
    requests: { title: 'Requisitions Raised', sub: 'Every request raised across the organization' },
    pos: { title: 'Purchase Orders', sub: 'Committed spend by project, supplier and engineer — filter, then export exactly what you see' },
    invoices: { title: 'Invoices', sub: 'Every supplier invoice — recorded or still only an attached document — filter, export, or download the files' },
    audit: { title: 'Audit Trail', sub: 'Track all actions across the procurement pipeline' },
    emails: { title: 'Email Notification Studio', sub: 'Preview and test transactional email templates tailored to active workflows' },
    settings: { title: 'Workspace Preferences', sub: 'Preferences, role distribution and system information' },
  }

  return (
    <>
      <PageContainer className="space-y-5">
        {section !== 'overview' && (
          <PageHeader title={sectionMeta[section].title} subtitle={sectionMeta[section].sub} />
        )}

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

            <AdminOverviewDashboard requests={requests} pos={pos} />

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
          <UsersPanel users={users} projects={projects} requests={requests} onChanged={router.refresh} notify={notify} />
        )}

        {section === 'projects' && (
          <ProjectsPanel projects={projects} requests={requests} pos={pos} onChanged={router.refresh} notify={notify} />
        )}

        {section === 'suppliers' && (
          <SuppliersPanel suppliers={suppliers} pos={pos} onChanged={router.refresh} notify={notify} />
        )}

        {section === 'requests' && (
          <div className="space-y-4 sm:space-y-5">
            <RequisitionsDashboard all={requests} visible={visibleRequests} engineerOf={engineerOf} daysAtStage={daysAtStage} />
            <TableTray
              label="Requisitions"
              info="Every chart above reflects exactly what this table's search and filters leave. Select a row to open the requisition."
            >
              <DataView
                rows={requests}
                onVisibleRows={setVisibleRequests}
                getRowId={(r) => r.id}
                columns={[...requestCols, attachColumn]}
                facets={requestFacets}
                onRowClick={(r) => router.push(`/admin/requests/${r.id}`)}
                searchPlaceholder="Search requisitions…"
                searchText={(r) => [r.id, r.purpose, engineerOf(r), r.guest_email, r.department, r.project_name, r.po_numbers]}
                initialTerm={focusId}
                defaultSort={{ id: 'created_at', dir: 'desc' }}
                storageKey="admin-requests"
                toolbarExtra={(visible) => (
                  (() => {
                    const { section: exportSection, meta } = requestExportMeta(visible)
                    return <ExportMenu rows={visible} columns={requestExport} meta={meta} section={exportSection} />
                  })()
                )}
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
            </TableTray>
          </div>
        )}

        {section === 'pos' && (
          <PurchaseOrdersReport
            pos={pos}
            invoices={invoices}
            exportedBy={user?.name || user?.email || null}
            focusId={focusId}
          />
        )}

        {section === 'invoices' && (
          <InvoicesReport invoices={invoices} exportedBy={user?.name || user?.email || null} />
        )}

        {section === 'audit' && (
          <div className="space-y-4 sm:space-y-5">
            <AuditDashboard all={auditTrail} visible={visibleAudit} />
            <TableTray label="Audit log" info="Every chart above reflects exactly what this table's search and filters leave.">
              <DataView
                rows={auditTrail}
                onVisibleRows={setVisibleAudit}
                getRowId={(e) => e.id}
                columns={auditCols}
                facets={auditFacets}
                searchPlaceholder="Search the audit trail…"
                searchText={(e) => [e.action, e.notes, e.po?.purpose, e.performer?.name, e.performer?.email]}
                defaultSort={{ id: 'created_at', dir: 'desc' }}
                toolbarExtra={(visible) => (
                  <ExportButton rows={visible} columns={auditCsv} section="audit-trail" />
                )}
                storageKey="admin-audit"
                emptyTitle="No audit trail entries yet"
              />
            </TableTray>
          </div>
        )}

        {section === 'emails' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary uppercase tracking-wider">
                      ProcureFlow Email System
                    </span>
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Tailored to Request
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Transactional Workflow Notifications
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Stakeholders receive rich, responsive HTML emails tailored to the active requisition — featuring
                    project site locations, itemized line tables, financial currency summaries, reviewer notes, and bulletproof
                    role-aware action buttons.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg press-active shrink-0"
                >
                  <Mail size={16} />
                  <span>Launch Template Studio</span>
                </button>
              </div>
            </div>

            {/* Grid of the 4 milestone templates */}
            <div className="grid gap-5 md:grid-cols-2">
              {/* 1. PO Approved */}
              <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-emerald-500/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle size={20} />
                  </div>
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                    Approved
                  </span>
                </div>
                <h4 className="mt-3.5 text-base font-bold text-foreground">Purchase Order Approved</h4>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Dispatched to the requisition submitter and creator when Cost Control clears the PO. Notifies them that the order is queued for Finance disbursement.
                </p>
                <div className="mt-4 pt-3.5 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Trigger: Cost Control Approval</span>
                  <button
                    type="button"
                    onClick={() => setIsEmailModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>Preview & Test</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* 2. PO Sent Back */}
              <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-amber-500/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <AlertTriangle size={20} />
                  </div>
                  <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Revision Required
                  </span>
                </div>
                <h4 className="mt-3.5 text-base font-bold text-foreground">PO Sent Back for Revision</h4>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Dispatched when an order is returned for correction. Prominently quotes reviewer feedback and notes, with instructions on how to amend and resubmit.
                </p>
                <div className="mt-4 pt-3.5 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Trigger: Reviewer Send-Back</span>
                  <button
                    type="button"
                    onClick={() => setIsEmailModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>Preview & Test</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* 3. Payment Complete */}
              <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-teal-500/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                    <Wallet size={20} />
                  </div>
                  <span className="rounded-full bg-teal-500/10 border border-teal-500/20 px-2.5 py-0.5 text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wide">
                    Payment Disbursed
                  </span>
                </div>
                <h4 className="mt-3.5 text-base font-bold text-foreground">Payment Completed & Disbursed</h4>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Dispatched when Finance completes and records disbursement. Confirms settlement details, vendor payment confirmation, and closes the requisition lifecycle.
                </p>
                <div className="mt-4 pt-3.5 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Trigger: Finance Disbursement</span>
                  <button
                    type="button"
                    onClick={() => setIsEmailModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>Preview & Test</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>

              {/* 4. Converted to PO */}
              <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-indigo-500/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    <ClipboardCheck size={20} />
                  </div>
                  <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                    PO Generated
                  </span>
                </div>
                <h4 className="mt-3.5 text-base font-bold text-foreground">Requisition Converted to PO</h4>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Dispatched to the submitter when Administration converts their requisition into an official Purchase Order. Shows PO number and assigned vendor.
                </p>
                <div className="mt-4 pt-3.5 border-t border-border/60 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">Trigger: Admin PO Conversion</span>
                  <button
                    type="button"
                    onClick={() => setIsEmailModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>Preview & Test</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {section === 'settings' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <RequestWindowPanel initialBlockedDays={requestWindowBlockedDays} />
            </div>

            {notificationRoles && (
              <div className="lg:col-span-2">
                <NotificationSettingsPanel initialRoles={notificationRoles} />
              </div>
            )}

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

            <Panel title="Email Notifications">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Preview all responsive email templates tailored to active purchase orders and requisitions.
              </p>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 press-active"
              >
                <Mail size={15} />
                Open Email Studio
              </button>
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

      <EmailPreviewModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        currentUserEmail={user?.email}
      />

      {poTarget && (
        <AttachPODrawer
          isOpen={Boolean(poTarget)}
          onClose={() => setPoTarget(null)}
          requestId={poTarget.id}
          requestSummary={summaryFor(poTarget)}
          onSuccess={() => {
            setPoTarget(null)
            notify('Purchase order attached — sent to Cost Control', true)
            router.refresh()
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-scale-in rounded-xl border px-5 py-3 text-xs font-semibold shadow-xl ${
            toast.ok ? 'border-foreground bg-foreground text-background' : 'border-destructive/20 bg-destructive text-destructive-foreground'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}

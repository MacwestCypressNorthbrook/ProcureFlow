'use client'

import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/shared/StatusBadge'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { extractRequisition } from '@/components/shared/RichRequisitionView'
import { REQUEST_STATUS_CONFIG, PO_STATUS_CONFIG, formatDate } from '@/lib/utils'
import { ChevronRight, FileText } from 'lucide-react'
import { requisitionType, RequisitionTypeBadge, REQUISITION_TYPE_CONFIG } from '@/components/shared/requisition-type'

interface RequestRow {
  id: string
  purpose: string
  description?: string | null
  guest_name?: string | null
  guest_email?: string | null
  estimated_quantity?: number | null
  estimated_unit_rate?: number | null
  total_amount?: number | null
  status: string
  created_at: string
  /** Joined from public.projects — the site the materials are for. */
  project_name?: string | null
  [key: string]: unknown
}

function itemSummary(description?: string | null): string | null {
  if (!description) return null
  const { data } = extractRequisition(description)
  if (data) {
    const count = data.items?.length ?? 0
    const first = data.items?.[0]?.description ?? ''
    return count > 1 ? `${first} +${count - 1} more` : first
  }
  return description
}


/** Prefer the stored total; fall back to qty × rate for rows predating it. */
function estimatedTotal(req: RequestRow): number | null {
  if (req.total_amount != null) return req.total_amount
  if (req.estimated_quantity != null && req.estimated_unit_rate != null) {
    return req.estimated_quantity * req.estimated_unit_rate
  }
  return null
}

const ghs = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 }).format(n)

export default function RequestTable({
  requests,
  hrefBase,
  compact = false,
  storageKey = 'requests',
}: {
  requests: RequestRow[]
  hrefBase: string
  storageKey?: string
  /** Dashboard preview: plain table, no toolbar or pagination. */
  compact?: boolean
}) {
  const router = useRouter()

  const columns: DataColumn<RequestRow>[] = [
    {
      id: 'purpose',
      label: 'Request',
      sortable: true,
      sortValue: (r) => r.purpose,
      cell: (r) => {
        const summary = itemSummary(r.description)
        const hasPo = r.has_po === true
        const poNumber = typeof r.po_number === 'string' ? r.po_number : null
        const poStatus = typeof r.po_status === 'string' ? r.po_status : null
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
              {summary && <p className="truncate text-xs text-muted-foreground">{summary}</p>}
              {hasPo && (
                <span className="mt-0.5 inline-flex items-center gap-1.5">
                  <span className="rounded-full bg-emerald-500/20 text-emerald-600 text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider tabular-nums">
                    {poNumber ? poNumber : 'PO attached'}
                  </span>
                  {poStatus && (
                    <StatusBadge status={poStatus} config={PO_STATUS_CONFIG} className="text-[10px] px-1.5 py-0" />
                  )}
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      id: 'type',
      label: 'Type',
      sortable: true,
      sortValue: (r) => requisitionType(r.description),
      cell: (r) => <RequisitionTypeBadge type={requisitionType(r.description)} />,
    },
    {
      id: 'project',
      label: 'Project site',
      hideBelow: 'md',
      sortable: true,
      sortValue: (r) => r.project_name ?? '',
      cell: (r) =>
        r.project_name ? (
          <span className="block max-w-[200px] truncate text-sm text-foreground" title={r.project_name}>
            {r.project_name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        ),
    },
    {
      id: 'requester',
      label: 'Requester',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (r) => r.guest_name ?? '',
      cell: (r) => (
        <>
          <p className="truncate text-sm text-foreground">{r.guest_name || '—'}</p>
          {r.guest_email && <p className="truncate text-xs text-muted-foreground">{r.guest_email}</p>}
        </>
      ),
    },
    {
      id: 'total',
      label: 'Est. Total',
      align: 'right',
      hideBelow: 'md',
      sortable: true,
      sortValue: estimatedTotal,
      cell: (r) => <span className="tabular-nums text-foreground">{ghs(estimatedTotal(r))}</span>,
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
      label: 'Submitted',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
    {
      id: 'chevron',
      label: '',
      align: 'right',
      headClassName: 'w-10',
      cell: () => (
        <ChevronRight size={16} className="inline text-muted-foreground/50 transition-colors group-hover:text-foreground" />
      ),
    },
  ]

  const statuses = Array.from(new Set(requests.map((r) => r.status))).sort()
  const projects = Array.from(new Set(requests.map((r) => r.project_name).filter(Boolean))).sort() as string[]
  const types = Array.from(new Set(requests.map((r) => requisitionType(r.description))))
  const facets: DataFacet<RequestRow>[] = [
    {
      id: 'status',
      label: 'Status',
      options: statuses.map((s) => ({ value: s, label: REQUEST_STATUS_CONFIG[s]?.label ?? s })),
      matches: (r, value) => r.status === value,
    },
    ...(types.length > 1
      ? [
          {
            id: 'type',
            label: 'Type',
            options: types.map((t) => ({ value: t, label: REQUISITION_TYPE_CONFIG[t].label })),
            matches: (r, value) => requisitionType(r.description) === value,
          } satisfies DataFacet<RequestRow>,
        ]
      : []),
    ...(projects.length > 0
      ? [
          {
            id: 'project',
            label: 'Project site',
            options: projects.map((p) => ({ value: p, label: p })),
            matches: (r, value) => r.project_name === value,
          } satisfies DataFacet<RequestRow>,
        ]
      : []),
  ]

  return (
    <DataView
      rows={requests}
      getRowId={(r) => r.id}
      columns={columns}
      facets={facets}
      searchPlaceholder="Search requests…"
      searchText={(r) => [
        r.purpose,
        r.guest_name,
        r.guest_email,
        itemSummary(r.description),
        REQUISITION_TYPE_CONFIG[requisitionType(r.description)].label,
      ]}
      defaultSort={{ id: 'created_at', dir: 'desc' }}
      storageKey={storageKey}
      compact={compact}
      onRowClick={(r) => router.push(`${hrefBase}/${r.id}`)}
      emptyTitle="No requests yet"
      emptyMessage="Requisitions will appear here once they are raised."
      renderCard={(r) => {
        const summary = itemSummary(r.description)
        return (
          <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 text-sm font-semibold text-foreground">{r.purpose}</p>
              <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />
            </div>
            <div className="mt-1.5">
              <RequisitionTypeBadge type={requisitionType(r.description)} />
            </div>
            {summary && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{summary}</p>}
            <div className="mt-auto pt-4">
              <p className="text-lg font-semibold tabular-nums text-foreground">{ghs(estimatedTotal(r))}</p>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{r.guest_name || '—'}</span>
                <span className="shrink-0">{formatDate(r.created_at)}</span>
              </div>
            </div>
          </article>
        )
      }}
    />
  )
}

'use client'

import { useRouter } from 'next/navigation'
import DataView, { type DataColumn } from '@/components/shared/DataView'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { Paperclip, ShoppingBag } from 'lucide-react'
import type { QueueRow } from '@/lib/review'
import Link from 'next/link'
import { requisitionType, RequisitionTypeBadge, REQUISITION_TYPE_CONFIG } from '@/components/shared/requisition-type'

/**
 * A stage's inbox.
 *
 * Deliberately the same columns for every stage: who raised it, the site, what
 * it is worth, how many documents came with it and whether a purchase order
 * exists yet. Newest first, like every other list in the app; the "Longest
 * waiting" tile above the queue is what surfaces anything ageing.
 */
export default function QueueTable({
  rows,
  hrefBase,
  storageKey,
}: {
  rows: QueueRow[]
  hrefBase: string
  storageKey: string
}) {
  const router = useRouter()

  const columns: DataColumn<QueueRow>[] = [
    {
      id: 'purpose',
      label: 'Requisition',
      sortable: true,
      sortValue: (r) => r.purpose,
      cell: (r) => (
        <div className="min-w-0 max-w-[200px] sm:max-w-[260px] xl:max-w-[340px]">
          {/* A real anchor, not just the row's click handler — so the
              requisition can be opened in a new tab and reached by keyboard. */}
          <Link
            href={`${hrefBase}/${r.id}`}
            className="block truncate text-sm font-medium text-foreground outline-none hover:underline focus-visible:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.purpose}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {r.requester_name ?? r.guest_name ?? 'Unknown'}
          </p>
        </div>
      ),
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
      id: 'amount',
      label: 'Value',
      align: 'right',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (r) => Number(r.total_amount) || 0,
      cell: (r) => (
        <span className="tabular-nums text-foreground">
          {r.total_amount != null ? formatCurrency(Number(r.total_amount)) : '—'}
        </span>
      ),
    },
    {
      id: 'docs',
      label: 'Docs',
      align: 'right',
      hideBelow: 'md',
      sortable: true,
      sortValue: (r) => r.document_count,
      cell: (r) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Paperclip size={12} />
          {r.document_count}
        </span>
      ),
    },
    {
      id: 'po',
      label: 'PO State',
      sortable: true,
      sortValue: (r) => (r.po_id ? 1 : 0),
      cell: (r) =>
        r.po_id ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border whitespace-nowrap border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-300">
            <ShoppingBag size={12} className="shrink-0 text-violet-600 dark:text-violet-400" />
            <span>{r.po_number || 'PO Attached'}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            No PO
          </span>
        ),
    },
    {
      id: 'status',
      label: 'Stage',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />,
    },
    {
      id: 'created_at',
      label: 'Raised',
      hideBelow: 'lg',
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</span>,
    },
  ]

  const types = Array.from(new Set(rows.map((r) => requisitionType(r.description))))
  const facets = [
    {
      id: 'po_filter',
      label: 'PO Status',
      options: [
        { value: 'has_po', label: 'PO Attached' },
        { value: 'no_po', label: 'No PO (Pre-PO)' },
      ],
      matches: (r: QueueRow, value: string) => (value === 'has_po' ? Boolean(r.po_id) : !r.po_id),
    },
    ...(types.length > 1
      ? [
        {
          id: 'type',
          label: 'Type',
          options: types.map((t) => ({ value: t, label: REQUISITION_TYPE_CONFIG[t].label })),
          matches: (r: QueueRow, value: string) => requisitionType(r.description) === value,
        },
      ]
      : []),
  ]

  return (
    <DataView
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      facets={facets}
      searchPlaceholder="Search requisitions…"
      searchText={(r) => [
        r.purpose,
        r.requester_name,
        r.project_name,
        r.po_number,
        REQUISITION_TYPE_CONFIG[requisitionType(r.description)].label,
      ]}
      defaultSort={{ id: 'created_at', dir: 'desc' }}
      storageKey={storageKey}
      onRowClick={(r) => router.push(`${hrefBase}/${r.id}`)}
      emptyTitle="Nothing waiting"
      emptyMessage="Requisitions arrive here when the stage before yours approves them."
      renderCard={(r) => (
        <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 text-sm font-semibold text-foreground">{r.purpose}</p>
            <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {r.requester_name ?? r.guest_name ?? 'Unknown'}
            {r.project_name ? ` · ${r.project_name}` : ''}
          </p>
          <div className="mt-1.5">
            <RequisitionTypeBadge type={requisitionType(r.description)} />
          </div>
          <div className="mt-2">
            {r.po_id ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                <ShoppingBag size={11} className="shrink-0" />
                {r.po_number || 'PO Attached'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                No PO Attached
              </span>
            )}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
            <span className="tabular-nums font-medium text-foreground">
              {r.total_amount != null ? formatCurrency(Number(r.total_amount)) : '—'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip size={12} />
              {r.document_count}
            </span>
          </div>
        </article>
      )}
    />
  )
}

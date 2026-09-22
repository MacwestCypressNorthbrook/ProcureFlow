'use client'

import { useRouter } from 'next/navigation'
import DataView, { type DataColumn } from '@/components/shared/DataView'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { Paperclip, ShoppingBag } from 'lucide-react'
import type { QueueRow } from '@/lib/review'

/**
 * A stage's inbox.
 *
 * Deliberately the same columns for every stage: who raised it, the site, what
 * it is worth, how many documents came with it and whether a purchase order
 * exists yet. Oldest first — a queue is worked from the front.
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
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
          <p className="truncate text-xs text-muted-foreground">
            {r.requester_name ?? r.guest_name ?? 'Unknown'}
            {r.project_name ? ` · ${r.project_name}` : ''}
          </p>
        </div>
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
      label: 'PO',
      hideBelow: 'lg',
      cell: (r) =>
        r.po_id ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <ShoppingBag size={12} className="text-muted-foreground" />
            {r.po_number ?? 'Raised'}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
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
      cell: (r) => <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
  ]

  return (
    <DataView
      rows={rows}
      getRowId={(r) => r.id}
      columns={columns}
      searchPlaceholder="Search requisitions…"
      searchText={(r) => [r.purpose, r.requester_name, r.project_name, r.po_number]}
      defaultSort={{ id: 'created_at', dir: 'asc' }}
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
          <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
            <span className="tabular-nums">
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

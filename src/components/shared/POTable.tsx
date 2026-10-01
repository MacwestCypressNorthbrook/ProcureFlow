'use client'

import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/shared/StatusBadge'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { PO_STATUS_CONFIG, formatCurrency, formatDate, formatQuantity } from '@/lib/utils'
import { ChevronRight, FileText, AlertTriangle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'
import { requisitionType, RequisitionTypeBadge, REQUISITION_TYPE_CONFIG } from '@/components/shared/requisition-type'

export default function POTable({
  pos,
  hrefBase,
  showRejection = false,
  compact = false,
  storageKey = 'purchase-orders',
}: {
  pos: PurchaseOrder[]
  hrefBase: string
  showRejection?: boolean
  storageKey?: string
  /** Dashboard preview: plain table, no toolbar or pagination. */
  compact?: boolean
}) {
  const router = useRouter()

  const columns: DataColumn<PurchaseOrder>[] = [
    {
      id: 'purpose',
      label: 'Purchase Order',
      sortable: true,
      sortValue: (p) => p.purpose,
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FileText size={15} />
          </span>
          <div className="min-w-0 max-w-[200px] sm:max-w-[260px] xl:max-w-[340px]">
            <p className="truncate text-sm font-medium text-foreground">{p.purpose}</p>
            <p className="truncate text-xs text-muted-foreground">
              {p.po_number ?? `#${p.id.slice(0, 8)}`}
              {p.file_name ? ` · ${p.file_name}` : ''}
            </p>
            {showRejection && p.sam_rejection_reason && (
              <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-destructive">
                <AlertTriangle size={11} className="shrink-0" />
                {p.sam_rejection_reason}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'type',
      label: 'Type',
      sortable: true,
      sortValue: (p) => requisitionType(p.request_description),
      cell: (p) => <RequisitionTypeBadge type={requisitionType(p.request_description)} />,
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'left',
      sortable: true,
      sortValue: (p) => p.total_amount,
      cell: (p) => (
        <span className="font-semibold tabular-nums text-foreground">{formatCurrency(p.total_amount)}</span>
      ),
    },
    {
      id: 'breakdown',
      label: 'Qty × Rate',
      align: 'left',
      hideBelow: 'md',
      cell: (p) => (
        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {p.quantity && p.unit_rate ? `${formatQuantity(p.quantity)} × ${formatCurrency(p.unit_rate)}` : '—'}
        </span>
      ),
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
      cell: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.created_at)}</span>,
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

  const statuses = Array.from(new Set(pos.map((p) => p.status))).sort()
  const types = Array.from(new Set(pos.map((p) => requisitionType(p.request_description))))
  const facets: DataFacet<PurchaseOrder>[] = [
    {
      id: 'status',
      label: 'Status',
      options: statuses.map((s) => ({ value: s, label: PO_STATUS_CONFIG[s]?.label ?? s })),
      matches: (p, value) => p.status === value,
    },
    ...(types.length > 1
      ? [
        {
          id: 'type',
          label: 'Type',
          options: types.map((t) => ({ value: t, label: REQUISITION_TYPE_CONFIG[t].label })),
          matches: (p, value) => requisitionType(p.request_description) === value,
        } satisfies DataFacet<PurchaseOrder>,
      ]
      : []),
  ]

  return (
    <DataView
      rows={pos}
      getRowId={(p) => p.id}
      columns={columns}
      facets={facets}
      searchPlaceholder="Search purchase orders…"
      searchText={(p) => [
        p.purpose,
        p.po_number,
        p.description,
        p.vendor_name,
        p.file_name,
        REQUISITION_TYPE_CONFIG[requisitionType(p.request_description)].label,
      ]}
      defaultSort={{ id: 'created_at', dir: 'desc' }}
      storageKey={storageKey}
      compact={compact}
      onRowClick={(p) => router.push(`${hrefBase}/${p.id}`)}
      emptyTitle="No purchase orders yet"
      emptyMessage="Purchase orders will appear here once requisitions are converted."
      renderCard={(p) => (
        <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-foreground">{p.purpose}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {p.po_number ?? `#${p.id.slice(0, 8)}`}
              </p>
            </div>
            <StatusBadge status={p.status} config={PO_STATUS_CONFIG} />
          </div>

          <div className="mt-1.5">
            <RequisitionTypeBadge type={requisitionType(p.request_description)} />
          </div>

          {showRejection && p.sam_rejection_reason && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-destructive">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{p.sam_rejection_reason}</span>
            </p>
          )}

          <div className="mt-auto pt-4">
            <p className="text-lg font-semibold tabular-nums text-foreground">{formatCurrency(p.total_amount)}</p>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">
                {p.quantity && p.unit_rate ? `${formatQuantity(p.quantity)} × ${formatCurrency(p.unit_rate)}` : '—'}
              </span>
              <span className="shrink-0">{formatDate(p.created_at)}</span>
            </div>
          </div>
        </article>
      )}
    />
  )
}

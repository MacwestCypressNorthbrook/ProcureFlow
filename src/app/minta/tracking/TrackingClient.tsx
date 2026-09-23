'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import StatusBadge from '@/components/shared/StatusBadge'
import StageProgress from '@/components/shared/StageProgress'
import RemindButton from '@/components/shared/RemindButton'
import { REQUEST_STATUS_CONFIG, formatDate, formatCurrency } from '@/lib/utils'
import type { Request } from '@/lib/types'

const amountOf = (r: Request) => r.total_amount ?? r.estimated_unit_rate ?? null

export default function TrackingClient({ requests }: { requests: Request[] }) {
  const router = useRouter()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const report = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const columns: DataColumn<Request>[] = [
    {
      id: 'purpose',
      label: 'Request',
      sortable: true,
      sortValue: (r) => r.purpose,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
          <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
        </div>
      ),
    },
    {
      id: 'amount',
      label: 'Amount',
      align: 'right',
      hideBelow: 'sm',
      sortable: true,
      sortValue: amountOf,
      cell: (r) => (
        <span className="tabular-nums text-foreground">
          {amountOf(r) != null ? formatCurrency(amountOf(r)) : '—'}
        </span>
      ),
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      hideBelow: 'md',
      cell: (r) => <StageProgress status={r.status} sentBackTo={r.sent_back_to} />,
    },
    {
      id: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />,
    },
    {
      id: 'remind',
      label: 'Reminder',
      align: 'right',
      hideBelow: 'sm',
      cell: (r) => (
        <RemindButton
          requestId={r.id}
          status={r.status}
          sentBackTo={r.sent_back_to}
          onResult={report}
        />
      ),
    },
  ]

  const facets: DataFacet<Request>[] = [
    {
      id: 'status',
      label: 'Status',
      options: Array.from(new Set(requests.map((r) => r.status))).sort().map((s) => ({
        value: s,
        label: REQUEST_STATUS_CONFIG[s]?.label ?? s,
      })),
      matches: (r, value) => r.status === value,
    },
  ]

  return (
    <>
    <DataView
      rows={requests}
      getRowId={(r) => r.id}
      columns={columns}
      facets={facets}
      searchPlaceholder="Search your requests…"
      searchText={(r) => [r.purpose, r.description]}
      defaultSort={{ id: 'created_at', dir: 'desc' }}
      storageKey="minta-tracking"
      onRowClick={(r) => router.push(`/minta/requests/${r.id}`)}
      emptyTitle="Nothing to track yet"
      emptyMessage="Submit a request to see its progress through the pipeline."
      renderCard={(r) => (
        <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 text-sm font-semibold text-foreground">{r.purpose}</p>
            <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />
          </div>
          <div className="mt-3">
            <StageProgress status={r.status} sentBackTo={r.sent_back_to} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {amountOf(r) != null ? formatCurrency(amountOf(r)) : '—'}
            </span>
            <span>{formatDate(r.created_at)}</span>
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <RemindButton
              requestId={r.id}
              status={r.status}
              sentBackTo={r.sent_back_to}
              onResult={report}
            />
          </div>
        </article>
      )}
    />

    {toast && (
      <div
        role="status"
        className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-scale-in rounded-xl border px-5 py-3 text-xs font-semibold shadow-xl ${
          toast.ok
            ? 'border-foreground bg-foreground text-background'
            : 'border-destructive/20 bg-destructive text-destructive-foreground'
        }`}
      >
        {toast.msg}
      </div>
    )}
    </>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Check, RotateCcw, ShoppingBag, Banknote, XCircle } from 'lucide-react'
import type { StageDecision } from '@/lib/review'

const ACTION: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  approved: {
    label: 'Approved',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    icon: <Check size={12} />,
  },
  sent_back: {
    label: 'Sent back',
    className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    icon: <RotateCcw size={12} />,
  },
  po_created: {
    label: 'PO attached',
    className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    icon: <ShoppingBag size={12} />,
  },
  paid: {
    label: 'Paid',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    icon: <Banknote size={12} />,
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400',
    icon: <XCircle size={12} />,
  },
}

function ActionPill({ action }: { action: string }) {
  const meta = ACTION[action] ?? {
    label: action.replace(/_/g, ' '),
    className: 'bg-muted text-muted-foreground',
    icon: null,
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  )
}

/**
 * What this stage has already decided.
 *
 * The queue answers "what is waiting on me"; this answers "what did I do, and
 * what did I say about it" — including the comment, which is the part people
 * come back looking for.
 */
export default function DecisionsTable({
  rows,
  hrefBase,
  storageKey,
}: {
  rows: StageDecision[]
  hrefBase: string
  storageKey: string
}) {
  const router = useRouter()

  const columns: DataColumn<StageDecision>[] = [
    {
      id: 'purpose',
      label: 'Requisition',
      sortable: true,
      sortValue: (d) => d.purpose,
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{d.purpose}</p>
          <p className="truncate text-xs text-muted-foreground">{d.requester_name ?? 'Unknown'}</p>
        </div>
      ),
    },
    {
      id: 'action',
      label: 'Decision',
      sortable: true,
      sortValue: (d) => d.action,
      cell: (d) => <ActionPill action={d.action} />,
    },
    {
      id: 'project',
      label: 'Project site',
      hideBelow: 'xl',
      sortable: true,
      sortValue: (d) => d.project_name ?? '',
      cell: (d) =>
        d.project_name ? (
          <span className="block max-w-[180px] truncate text-sm text-foreground" title={d.project_name}>
            {d.project_name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        ),
    },
    {
      id: 'comment',
      label: 'Comment',
      hideBelow: 'lg',
      cell: (d) =>
        d.comment ? (
          <span className="block max-w-[280px] truncate text-xs text-muted-foreground" title={d.comment}>
            “{d.comment}”
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        ),
    },
    {
      id: 'po',
      label: 'PO',
      hideBelow: 'xl',
      sortable: true,
      sortValue: (d) => d.po_number ?? '',
      cell: (d) =>
        d.po_number ? (
          <span className="font-mono text-xs text-foreground">{d.po_number}</span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        ),
    },
    {
      id: 'amount',
      label: 'Value',
      align: 'right',
      hideBelow: 'sm',
      sortable: true,
      sortValue: (d) => Number(d.total_amount) || 0,
      cell: (d) => (
        <span className="tabular-nums text-foreground">
          {d.total_amount != null ? formatCurrency(Number(d.total_amount)) : '—'}
        </span>
      ),
    },
    {
      id: 'created_at',
      label: 'Decided',
      hideBelow: 'md',
      sortable: true,
      sortValue: (d) => d.created_at,
      cell: (d) => (
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">{d.actor_name ?? '—'}</p>
          <p className="truncate text-[11px] text-muted-foreground">{formatDate(d.created_at)}</p>
        </div>
      ),
    },
  ]

  const facets: DataFacet<StageDecision>[] = [
    {
      id: 'action',
      label: 'Decision',
      options: Array.from(new Set(rows.map((r) => r.action))).map((a) => ({
        value: a,
        label: ACTION[a]?.label ?? a,
      })),
      matches: (d, value) => d.action === value,
    },
  ]

  return (
    <DataView
      rows={rows}
      getRowId={(d) => d.id}
      columns={columns}
      facets={facets}
      searchPlaceholder="Search what you reviewed…"
      searchText={(d) => [d.purpose, d.requester_name, d.project_name, d.po_number, d.comment]}
      defaultSort={{ id: 'created_at', dir: 'desc' }}
      storageKey={storageKey}
      onRowClick={(d) => router.push(`${hrefBase}/${d.request_id}`)}
      emptyTitle="Nothing reviewed yet"
      emptyMessage="Approvals and send-backs you make will be listed here."
      renderCard={(d) => (
        <article className="surface flex h-full flex-col rounded-xl p-4 transition-colors hover:border-ring">
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 text-sm font-semibold text-foreground">{d.purpose}</p>
            <ActionPill action={d.action} />
          </div>
          {d.comment && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">“{d.comment}”</p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {d.total_amount != null ? formatCurrency(Number(d.total_amount)) : '—'}
            </span>
            <span className="truncate">{formatDate(d.created_at)}</span>
          </div>
        </article>
      )}
    />
  )
}

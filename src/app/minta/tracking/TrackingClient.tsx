'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DataView, { type DataColumn, type DataFacet } from '@/components/shared/DataView'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG, formatDate, formatCurrency } from '@/lib/utils'
import { ArrowRight, BellRing, Check, Loader2 } from 'lucide-react'
import type { Request } from '@/lib/types'

const PIPELINE_STAGES = ['new', 'reviewing', 'converted'] as const

const stageColors: Record<string, { active: string; done: string; pending: string }> = {
  new: {
    active: 'bg-blue-500 text-white',
    done: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    pending: 'bg-muted text-muted-foreground',
  },
  reviewing: {
    active: 'bg-amber-500 text-white',
    done: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    pending: 'bg-muted text-muted-foreground',
  },
  converted: {
    active: 'bg-emerald-500 text-white',
    done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    pending: 'bg-muted text-muted-foreground',
  },
}

/** How far a status has travelled down the pipeline; -1 for off-pipeline states. */
function getStageIndex(status: string): number {
  if (status === 'new' || status === 'pending') return 0
  if (status === 'reviewing' || status === 'under_review') return 1
  if (status === 'converted' || status === 'approved') return 2
  return -1
}

function Pipeline({ status }: { status: string }) {
  const currentIdx = getStageIndex(status)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PIPELINE_STAGES.map((stage, i) => {
        const isDone = currentIdx >= i && currentIdx !== -1
        const isActive = currentIdx === i
        const c = stageColors[stage]
        return (
          <div key={stage} className="flex items-center gap-1.5">
            <span className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${isActive ? c.active : isDone ? c.done : c.pending}`}>
              {REQUEST_STATUS_CONFIG[stage]?.label || stage}
            </span>
            {i < PIPELINE_STAGES.length - 1 && <ArrowRight size={12} className="text-muted-foreground/40" />}
          </div>
        )
      })}
      {status === 'rejected' && (
        <>
          <ArrowRight size={12} className="text-muted-foreground/40" />
          <span className="rounded-md bg-red-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            Rejected
          </span>
        </>
      )}
      {status === 'archived' && (
        <>
          <ArrowRight size={12} className="text-muted-foreground/40" />
          <span className="rounded-md bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Archived
          </span>
        </>
      )}
    </div>
  )
}

const amountOf = (r: Request) => r.total_amount ?? r.estimated_unit_rate ?? null

/** Who a nudge would reach, mirroring `currentHolder` on the server. */
function holderLabel(status: string): string | null {
  if (status === 'new' || status === 'pending') return 'procurement'
  if (status === 'reviewing' || status === 'under_review') return 'procurement'
  if (status === 'converted' || status === 'approved') return 'the next approver'
  return null
}

type RemindState = 'idle' | 'sending' | 'sent' | 'error'

/** Nudge the role currently holding a request. Disabled once nothing is pending. */
function RemindButton({
  request,
  state,
  onSend,
  className = '',
}: {
  request: Request
  state: RemindState
  onSend: (r: Request) => void
  className?: string
}) {
  const holder = holderLabel(request.status)
  const disabled = holder === null || state === 'sending' || state === 'sent'

  return (
    <button
      type="button"
      disabled={disabled}
      title={
        holder
          ? `Remind ${holder} about this request`
          : 'Nothing is pending on this request'
      }
      onClick={(e) => {
        e.stopPropagation()
        onSend(request)
      }}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {state === 'sending' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : state === 'sent' ? (
        <Check size={14} className="text-emerald-500" />
      ) : (
        <BellRing size={14} />
      )}
      {state === 'sent' ? 'Reminded' : 'Remind'}
    </button>
  )
}

export default function TrackingClient({ requests }: { requests: Request[] }) {
  const router = useRouter()
  const [remindState, setRemindState] = useState<Record<string, RemindState>>({})
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const sendReminder = async (request: Request) => {
    setRemindState((s) => ({ ...s, [request.id]: 'sending' }))
    try {
      const res = await fetch(`/api/requests/${request.id}/remind`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRemindState((s) => ({ ...s, [request.id]: 'idle' }))
        setToast({ msg: payload.error ?? 'The reminder could not be sent.', ok: false })
      } else {
        setRemindState((s) => ({ ...s, [request.id]: 'sent' }))
        setToast({
          msg: `Reminder sent to ${payload.notified} ${payload.notified === 1 ? 'person' : 'people'} at the ${payload.stage} stage.`,
          ok: true,
        })
      }
    } catch {
      setRemindState((s) => ({ ...s, [request.id]: 'idle' }))
      setToast({ msg: 'Network error — no reminder was sent.', ok: false })
    } finally {
      setTimeout(() => setToast(null), 4000)
    }
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
      cell: (r) => <Pipeline status={r.status} />,
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
        <RemindButton request={r} state={remindState[r.id] ?? 'idle'} onSend={sendReminder} />
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
            <Pipeline status={r.status} />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {amountOf(r) != null ? formatCurrency(amountOf(r)) : '—'}
            </span>
            <span>{formatDate(r.created_at)}</span>
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <RemindButton
              request={r}
              state={remindState[r.id] ?? 'idle'}
              onSend={sendReminder}
              className="w-full justify-center"
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

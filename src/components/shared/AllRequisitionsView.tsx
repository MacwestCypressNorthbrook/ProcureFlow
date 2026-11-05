import { query } from '@/lib/db'
import { approvalsListSql } from '@/lib/approval-trail'
import RequestTable from '@/components/shared/RequestTable'
import { monthSplit } from '@/components/shared/stat-presets'
import { SectionHeader, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { STAGES, statusForStage, type Stage } from '@/lib/workflow'
import { CalendarCheck, Clock, Eye, FileText } from 'lucide-react'
import Link from 'next/link'

/**
 * Every requisition in the pipeline, for a reviewing stage.
 *
 * Deliberately separate from the stage's own queue: this is visibility, that is
 * work. The tiles state which is which, so an approved requisition waiting on
 * the viewer is never confused with one merely passing through.
 *
 * Capped at 500 — the table paginates client-side and nobody scrolls past a few
 * hundred rows.
 */
export default async function AllRequisitionsView({
  stage,
  queueHref,
  queueLabel,
  storageKey,
  hrefBase,
}: {
  /** Whose page this is; decides which rows count as "awaiting you". */
  stage: Stage
  /** Where this stage actually works its queue. */
  queueHref: string
  queueLabel: string
  storageKey: string
  hrefBase: string
}) {
  let rows: Record<string, unknown>[] = []

  try {
    rows = await query<Record<string, unknown>>(
      `SELECT r.*,
              pr.name AS project_name,
              (po.id IS NOT NULL) AS has_po,
              po.po_number,
              po.status AS po_status,
              ${approvalsListSql('r.id')} AS approvals_list
         FROM public.requests r
         LEFT JOIN public.projects pr ON pr.id = r.project_id
         LEFT JOIN LATERAL (
              SELECT id, po_number, status
                FROM public.purchase_orders
               WHERE request_id = r.id
               ORDER BY created_at DESC
               LIMIT 1
         ) po ON true
        ORDER BY r.created_at DESC
        LIMIT 500`
    )
  } catch (err) {
    console.error('Failed to load the requisition pipeline from Neon:', err)
  }

  const mineStatus = statusForStage(stage)
  const awaitingMe = rows.filter((r) => r.status === mineStatus)
  // Everything still short of this stage — visible, but not the viewer's to act on.
  const earlierStages = STAGE_SEQUENCE.slice(0, STAGE_SEQUENCE.indexOf(stage)).map(statusForStage)
  const upstream = rows.filter((r) => earlierStages.includes(r.status as never))

  const month = monthSplit(rows.map((r) => (r.created_at as string | null) ?? null))
  const raisedAt = rows
    .map((r) => new Date((r.created_at as string) ?? '').getTime())
    .filter((t) => !Number.isNaN(t))
  const oldest =
    raisedAt.length > 0 ? Math.max(0, Math.floor((Date.now() - Math.min(...raisedAt)) / 86_400_000)) : null

  return (
    <>
      <StatGrid
        stats={[
          {
            label: 'Awaiting your action',
            value: awaitingMe.length,
            icon: <Eye size={18} />,
            tone: 'amber',
            badge: awaitingMe.length > 0 ? 'Approved — needs you' : undefined,
            compare: `Approved through to ${STAGES[stage].label}`,
            href: queueHref,
          },
          {
            label: 'Earlier in the chain',
            value: upstream.length,
            icon: <FileText size={18} />,
            tone: 'blue',
            compare: 'Not yours yet — view only',
          },
          {
            label: 'Raised this month',
            value: month.thisMonth,
            icon: <CalendarCheck size={18} />,
            tone: 'emerald',
            delta: month.delta,
            compare: month.lastMonth > 0 ? `vs. ${month.lastMonth} last month` : 'No activity last month',
          },
          {
            label: 'Longest waiting',
            value: oldest ? `${oldest}d` : '—',
            icon: <Clock size={18} />,
            tone: oldest !== null && oldest > 7 ? 'red' : 'amber',
            compare: oldest !== null ? 'Since the request was raised' : 'Nothing in the pipeline',
          },
        ]}
      />

      <section>
        <SectionHeader title="All Requisitions — every stage" count={rows.length} />
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Eye size={14} className="mt-0.5 shrink-0" />
          <span>
            Visibility across the whole pipeline, at every stage — including requisitions that are not yours to
            act on. The ones approved through to you are in{' '}
            <Link href={queueHref} className="font-medium text-primary hover:underline">
              {queueLabel}
            </Link>
            . Filter by <span className="font-medium text-foreground">Status</span> to narrow this list.
          </span>
        </p>
        {rows.length > 0 ? (
          <RequestTable requests={rows as never} hrefBase={hrefBase} storageKey={storageKey} />
        ) : (
          <EmptyState
            icon={<FileText size={20} />}
            title="No requisitions yet"
            description="Requisitions will appear here once they are raised."
          />
        )}
      </section>
    </>
  )
}

/** The chain in order, for working out what sits earlier than a given stage. */
const STAGE_SEQUENCE: Stage[] = ['requester', 'lead', 'supply_chain', 'admin', 'cost_control', 'finance']

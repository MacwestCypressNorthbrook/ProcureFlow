'use client'

import { useMemo } from 'react'
import {
  KpiRow,
  KpiTile,
  compact,
  ghsFull,
  ghsShort,
  monthOverMonth,
  monthlySpark,
  num,
  pct,
} from '@/components/shared/dashboard/kit'
import { RankedList, StageBars } from '@/components/shared/dashboard/share-charts'
import { AgeingStrip, GaugeRing, StackedColumns } from '@/components/shared/dashboard/queue-charts'
import { daysSince, isOpen } from '@/components/dashboards/chain'
import type { AdminPurchaseOrder } from './report-types'
import type { AdminRequestRow } from './AdminClient'

/** Where a requisition ended up, for the intake chart. */
const OUTCOME_OF = (r: AdminRequestRow) =>
  r.status === 'completed' ? 'completed' : r.status === 'rejected' || r.status === 'cancelled' ? 'stopped' : isOpen(r) ? 'open' : 'other'

/**
 * The Administrator's overview: how much work comes in each month and where
 * it ends up, how much committed money is settled, how far the pipeline gets,
 * and the requisitions waiting on the Administrator to attach a PO.
 */
export default function AdminOverviewDashboard({ requests, pos }: { requests: AdminRequestRow[]; pos: AdminPurchaseOrder[] }) {
  const model = useMemo(() => {
    const amount = (p: AdminPurchaseOrder) => num(p.total_amount)
    const live = pos.filter((p) => p.status !== 'rejected' && p.status !== 'cancelled')
    const paid = pos.filter((p) => p.status === 'paid')
    const awaitingPay = pos.filter((p) => p.status === 'pending_finance' || p.status === 'partially_paid')
    const withCc = pos.filter((p) => p.status === 'pending_cost_control')
    const awaitingPo = requests.filter((r) => r.status === 'pending_admin')
    const withPo = requests.filter((r) => r.po_id || r.po_number)

    const sites = new Map<string, number>()
    for (const p of live) sites.set(p.project_name || 'Unassigned', (sites.get(p.project_name || 'Unassigned') ?? 0) + amount(p))

    return {
      committed: live.reduce((s, p) => s + amount(p), 0),
      paidValue: paid.reduce((s, p) => s + amount(p), 0),
      paid,
      awaitingPay,
      withCc,
      awaitingPo,
      withPo,
      sites: [...sites].map(([label, value]) => ({ label, value })),
      sparks: {
        requests: monthlySpark(requests, (r) => r.created_at, (rs) => rs.length, (n) => `${n} raised`),
        committed: monthlySpark(live, (p) => p.created_at, (ps) => ps.reduce((s, p) => s + amount(p), 0), ghsFull),
        awaitingPo: monthlySpark(awaitingPo, (r) => r.created_at, (rs) => rs.length, (n) => `${n} awaiting a PO`),
        paid: monthlySpark(paid, (p) => p.paid_at ?? p.updated_at, (ps) => ps.reduce((s, p) => s + amount(p), 0), ghsFull),
      },
    }
  }, [requests, pos])

  return (
    <>
      <KpiRow>
        <KpiTile
          label="Requisitions"
          value={requests.length.toLocaleString('en-GB')}
          unit="raised"
          spark={model.sparks.requests}
          info="Every requisition raised across all sites. The sparkline counts them per month over the last eight."
          trend={monthOverMonth(model.sparks.requests, { upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Committed"
          prefix="GHS"
          value={compact(model.committed)}
          title={ghsFull(model.committed)}
          spark={model.sparks.committed}
          info="Value of live purchase orders — everything not rejected or cancelled — by the month raised."
          trend={monthOverMonth(model.sparks.committed, { percent: true, upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Awaiting a PO"
          value={model.awaitingPo.length.toLocaleString('en-GB')}
          unit={model.awaitingPo.length === 1 ? 'requisition' : 'requisitions'}
          spark={model.sparks.awaitingPo}
          info="Requisitions both reviews have cleared, waiting on the Administrator to raise the PO in Odoo and attach the PDF."
          note="attach the Odoo PDF"
        />
        <KpiTile
          label="Settled"
          prefix="GHS"
          value={compact(model.paidValue)}
          title={ghsFull(model.paidValue)}
          spark={model.sparks.paid}
          info="Value of purchase orders Finance has paid. The sparkline is each month's payments."
          note={`${pct(model.paidValue, model.committed)}% of committed`}
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <StackedColumns
            label="Monthly intake"
            info="Requisitions raised each month, coloured by where each one stands today: completed, still in the approval chain, or stopped (rejected or cancelled)."
            items={requests.map((r) => ({ at: r.created_at, key: OUTCOME_OF(r) }))}
            categories={[
              { key: 'completed', label: 'Completed', slot: 3 },
              { key: 'open', label: 'In the chain', slot: 2 },
              { key: 'stopped', label: 'Stopped', slot: 1 },
            ]}
            noun="requisition"
            headlineKey="completed"
            headlineWord="completed"
          />
        </div>
        <GaugeRing
          label="Settled"
          info="Share of committed purchase-order value Finance has paid. The counts below are purchase orders at each step."
          rate={model.committed ? model.paidValue / model.committed : null}
          title="of committed value paid"
          caption={`${ghsShort(model.paidValue)} of ${ghsShort(model.committed)}`}
          noun="purchase order"
          parts={[
            { label: 'Paid', count: model.paid.length, slot: 3 },
            { label: 'Awaiting payment', count: model.awaitingPay.length, slot: 2 },
            { label: 'With Cost Control', count: model.withCc.length, slot: 1 },
          ]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StageBars
          label="Pipeline"
          info="How far requisitions get: raised, turned into a purchase order, cleared for payment, and paid."
          format="count"
          stages={[
            { label: 'Raised', note: 'requisitions', value: requests.length },
            { label: 'Reached a PO', note: 'Administrator attached one', value: model.withPo.length },
            { label: 'Cleared', note: 'approved for payment', value: model.awaitingPay.length + model.paid.length },
            { label: 'Paid', note: 'settled by Finance', value: model.paid.length },
          ]}
          footer={[
            { label: 'Committed', value: ghsShort(model.committed) },
            { label: 'Settled', value: ghsShort(model.paidValue) },
          ]}
        />
        <AgeingStrip
          label="Waiting on you"
          info="Requisitions cleared by both reviews, waiting for their purchase order. Each dot sits at the days since it last moved, sized by value. Select one to attach its PO."
          items={model.awaitingPo.map((r) => ({
            id: r.id,
            label: r.purpose || 'Untitled requisition',
            days: daysSince(r.stage_since ?? r.created_at) ?? 0,
            value: num(r.total_amount),
            href: `/admin/requests/${r.id}`,
          }))}
          format="money"
          noun="requisition"
          empty="Every cleared requisition has its purchase order."
        />
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <RankedList
            label="Top sites"
            info="Project sites by the value of their live purchase orders."
            items={model.sites}
            format="money"
            limit={6}
            headline={{ value: model.sites.length.toLocaleString('en-GB'), caption: 'sites with purchase orders' }}
          />
        </div>
      </div>
    </>
  )
}

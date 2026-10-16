'use client'

import { useMemo, useState } from 'react'
import { REQUEST_STATUS_CONFIG } from '@/lib/utils'
import {
  KpiRow,
  KpiTile,
  compact,
  concentrationInsight,
  ghsFull,
  monthOverMonth,
  monthlySpark,
  num,
  pct,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { PixelTrend } from '@/components/shared/dashboard/time-charts'
import { BreakdownDonut, StageFlow } from '@/components/shared/dashboard/share-charts'
import { GaugeRing } from '@/components/shared/dashboard/queue-charts'
import { STUCK_DAYS, chainFlow, daysSince, isOpen } from './chain'

/** An engineer's own requisition, as the home page queries it. */
export interface MyRequisition {
  id: string
  status: string
  sent_back_to?: string | null
  total_amount?: number | string | null
  project_name?: string | null
  has_po?: boolean | null
  created_at: string
  updated_at?: string | null
}

type Dimension = 'project' | 'status'

/**
 * The Engineer's home: how often their requisitions get through (a gauge),
 * where the open ones are in the chain right now, and what they have asked
 * for over time.
 */
export default function EngineerHomeDashboard({ requests }: { requests: MyRequisition[] }) {
  const [dimension, setDimension] = useState<Dimension>('project')

  const model = useMemo(() => {
    const amount = (r: MyRequisition) => num(r.total_amount)
    const open = requests.filter(isOpen)
    const completed = requests.filter((r) => r.status === 'completed').length
    const rejected = requests.filter((r) => r.status === 'rejected').length
    const withPo = requests.filter((r) => r.has_po)
    return {
      count: requests.length,
      value: requests.reduce((s, r) => s + amount(r), 0),
      open: open.length,
      sentBack: requests.filter((r) => r.status === 'sent_back').length,
      completed,
      rejected,
      withPo: withPo.length,
      // The row's last update is the closest thing to "arrived at this stage" the page has.
      flow: chainFlow(open, (r) => daysSince(r.updated_at ?? r.created_at)),
      trend: requests.map((r) => ({ at: r.created_at, value: amount(r), part: r.has_po ? amount(r) : 0 })),
      sparks: {
        count: monthlySpark(requests, (r) => r.created_at, (rs) => rs.length, (n) => `${n} raised`),
        value: monthlySpark(requests, (r) => r.created_at, (rs) => rs.reduce((s, r) => s + amount(r), 0), ghsFull),
        open: monthlySpark(open, (r) => r.created_at, (rs) => rs.length, (n) => `${n} still open`),
        withPo: monthlySpark(withPo, (r) => r.created_at, (rs) => rs.length, (n) => `${n} with a PO`),
      },
    }
  }, [requests])

  const slices = useMemo(() => {
    const key = dimension === 'project' ? (r: MyRequisition) => r.project_name || 'Unassigned' : (r: MyRequisition) => r.status
    const label = (k: string) => (dimension === 'status' ? REQUEST_STATUS_CONFIG[k]?.label ?? k : k)
    return stableSlices(requests, requests, key, (r) => num(r.total_amount), label)
  }, [requests, dimension])

  const decided = model.completed + model.rejected

  return (
    <>
      <KpiRow>
        <KpiTile
          label="My requisitions"
          value={model.count.toLocaleString('en-GB')}
          unit="raised"
          spark={model.sparks.count}
          info="Every requisition you have raised. The sparkline counts them by month over the last eight."
          trend={monthOverMonth(model.sparks.count, { upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Asked for"
          prefix="GHS"
          value={compact(model.value)}
          title={ghsFull(model.value)}
          spark={model.sparks.value}
          info="The priced value of your requisitions, by the month you raised them."
          trend={monthOverMonth(model.sparks.value, { percent: true, upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="In flight"
          value={model.open.toLocaleString('en-GB')}
          unit="open"
          spark={model.sparks.open}
          info="Your requisitions still moving through approval, by the month you raised them — tall bars on the left are old ones still waiting."
          note={model.sentBack ? `${model.sentBack} sent back to you` : 'none sent back'}
        />
        <KpiTile
          label="Reached a PO"
          value={`${pct(model.withPo, model.count)}`}
          unit="%"
          spark={model.sparks.withPo}
          info="Share of your requisitions that became a purchase order."
          note={`${model.withPo} of ${model.count}`}
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <StageFlow
            label="Where mine are"
            info={`Your open requisitions by the stage they are waiting at. The outlined stage holds the most; amber counts are over ${STUCK_DAYS} days since they last moved.`}
            stages={model.flow}
            noun="requisition"
            stuckAfter={STUCK_DAYS}
          />
        </div>
        <GaugeRing
          label="Approval rate"
          info="Of your requisitions that reached a final answer, the share that were completed rather than rejected. Ones still in the chain are not counted either way."
          rate={decided ? model.completed / decided : null}
          title="completed, of those decided"
          caption={decided ? `${model.completed} completed · ${model.rejected} rejected` : 'None decided yet'}
          noun="decision"
          target={0.9}
          parts={[
            { label: 'Completed', count: model.completed, slot: 3 },
            { label: 'Still in the chain', count: model.open, slot: null },
            { label: 'Rejected', count: model.rejected, slot: 1 },
          ]}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PixelTrend
            label="What I've asked for"
            info="The value of your requisitions by the date you raised them. Dark squares became a purchase order; light squares have not — yet."
            items={model.trend}
            format="money"
            noun="requisition"
            partLabel="Reached a PO"
            restLabel="No PO yet"
            rangeLabel="Requisitioned in range"
          />
        </div>
        <BreakdownDonut
          label="My spend mix"
          info="Your requisitioned value by project site or by where each one stands."
          measure="Requisitioned"
          format="money"
          noun="requisition"
          slices={slices}
          insight={concentrationInsight(slices, dimension, dimension === 'project' ? 'projects' : 'statuses', 'what you have asked for')}
          dimension={dimension}
          dimensions={[
            { value: 'project', label: 'Project' },
            { value: 'status', label: 'Status' },
          ]}
          onDimension={setDimension}
        />
      </div>
    </>
  )
}

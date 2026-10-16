'use client'

import { useMemo, useState } from 'react'
import { REQUEST_STATUS_CONFIG } from '@/lib/utils'
import { currentStage } from '@/lib/workflow'
import {
  KpiRow,
  KpiTile,
  AttentionStrip,
  compact,
  concentrationInsight,
  ghsFull,
  monthOverMonth,
  monthlySpark,
  num,
  pct,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { CalendarHeatmap } from '@/components/shared/dashboard/time-charts'
import { BreakdownDonut, DayHistogram, StageFlow } from '@/components/shared/dashboard/share-charts'
import { STUCK_DAYS, chainFlow } from '@/components/dashboards/chain'
import type { AdminRequestRow } from './AdminClient'

type Dimension = 'project' | 'engineer' | 'department' | 'status'

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'department', label: 'Department' },
  { value: 'status', label: 'Status' },
]

/**
 * The Requisitions dashboard: the rhythm of what gets raised (a day-by-day
 * calendar), where open work is sitting in the approval chain, and how long it
 * has waited there. It reads exactly the rows the table below leaves visible.
 */
export default function RequisitionsDashboard({
  all,
  visible,
  engineerOf,
  daysAtStage,
}: {
  all: AdminRequestRow[]
  visible: AdminRequestRow[]
  engineerOf: (r: AdminRequestRow) => string
  daysAtStage: (r: AdminRequestRow) => number | null
}) {
  const [dimension, setDimension] = useState<Dimension>('project')

  const model = useMemo(() => {
    const amount = (r: AdminRequestRow) => num(r.total_amount)
    const open = visible.filter((r) => currentStage(r.status, r.sent_back_to) !== null)
    const waits = open.map(daysAtStage).filter((d): d is number => d !== null)
    const withPo = visible.filter((r) => r.po_id || r.po_number)

    const flow = chainFlow(open, daysAtStage)

    const sparks = {
      count: monthlySpark(visible, (r) => r.created_at, (rs) => rs.length, (n) => `${n} raised`),
      value: monthlySpark(visible, (r) => r.created_at, (rs) => rs.reduce((s, r) => s + amount(r), 0), ghsFull),
      open: monthlySpark(open, (r) => r.created_at, (rs) => rs.length, (n) => `${n} still open`),
      withPo: monthlySpark(withPo, (r) => r.created_at, (rs) => rs.length, (n) => `${n} with a PO`),
    }

    return {
      count: visible.length,
      value: visible.reduce((s, r) => s + amount(r), 0),
      open: open.length,
      stuck: waits.filter((d) => d > STUCK_DAYS).length,
      waits,
      withPo: withPo.length,
      awaitingPo: visible.filter((r) => r.status === 'pending_admin').length,
      sentBack: visible.filter((r) => r.status === 'sent_back').length,
      unassigned: visible.filter((r) => !r.project_name).length,
      flow,
      sparks,
      days: visible.map((r) => ({ at: r.created_at, value: amount(r) })),
    }
  }, [visible, daysAtStage])

  const breakdown = useMemo(() => {
    const key: Record<Dimension, (r: AdminRequestRow) => string> = {
      project: (r) => r.project_name || 'Unassigned',
      engineer: engineerOf,
      department: (r) => r.department || 'None',
      status: (r) => r.status,
    }
    const label = (k: string) => (dimension === 'status' ? REQUEST_STATUS_CONFIG[k]?.label ?? k : k)
    const slices = stableSlices(all, visible, key[dimension], () => 1, label)
    const noun = DIMENSIONS.find((d) => d.value === dimension)!.label.toLowerCase()
    return { slices, insight: concentrationInsight(slices, noun, noun === 'status' ? 'statuses' : `${noun}s`, 'requisitions') }
  }, [all, visible, dimension, engineerOf])

  return (
    <>
      <KpiRow>
        <KpiTile
          label="Requisitions"
          value={model.count.toLocaleString('en-GB')}
          unit="raised"
          spark={model.sparks.count}
          info="Requisitions matching the table's filters. The sparkline counts those raised each month over the last eight; the dark bar is this month."
          trend={monthOverMonth(model.sparks.count, { upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Requisitioned"
          prefix="GHS"
          value={compact(model.value)}
          title={ghsFull(model.value)}
          spark={model.sparks.value}
          info="The priced value of those requisitions — what engineers have asked to buy, before any purchase order."
          trend={monthOverMonth(model.sparks.value, { percent: true, upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="In the chain"
          value={model.open.toLocaleString('en-GB')}
          unit="open"
          spark={model.sparks.open}
          info={`Requisitions still moving through approval. The sparkline shows the month each open one was raised, so tall bars on the left mean old work still waiting. Stuck means more than ${STUCK_DAYS} days at one stage.`}
          note={model.stuck ? `${model.stuck} stuck over ${STUCK_DAYS} days` : 'none stuck'}
        />
        <KpiTile
          label="Reached a PO"
          value={`${pct(model.withPo, model.count)}`}
          unit="%"
          spark={model.sparks.withPo}
          info="Share of requisitions with a purchase order attached. The sparkline counts them by the month the requisition was raised."
          note={`${model.withPo} with a PO · ${model.awaitingPo} awaiting one`}
        />
      </KpiRow>

      <AttentionStrip
        items={[
          model.stuck > 0 && `${model.stuck} requisition${model.stuck === 1 ? '' : 's'} stuck over ${STUCK_DAYS} days at one stage`,
          model.awaitingPo > 0 && `${model.awaitingPo} cleared and waiting for the Administrator to attach a PO`,
          model.sentBack > 0 && `${model.sentBack} sent back for changes`,
          model.unassigned > 0 && `${model.unassigned} with no project site`,
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <CalendarHeatmap
            label="Requisition activity"
            info="One square per day over the last 26 weeks, darker the more requisitions were raised. Switch to Value to shade by what they were priced at."
            items={model.days}
            noun="requisition"
            valueFormat="money"
          />
        </div>
        <BreakdownDonut
          label="Who's asking"
          info="How the requisitions split. The five largest keep their colour as you filter; the rest fold into Other."
          measure="Requisitions"
          format="count"
          noun="requisition"
          slices={breakdown.slices}
          insight={breakdown.insight}
          dimension={dimension}
          dimensions={DIMENSIONS}
          onDimension={setDimension}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <StageFlow
            label="Approval chain"
            info={`Where open requisitions sit right now, in chain order. The outlined stage holds the most; amber counts are over ${STUCK_DAYS} days at that stage.`}
            stages={model.flow}
            noun="requisition"
            stuckAfter={STUCK_DAYS}
          />
        </div>
        <DayHistogram
          label="Waiting at stage"
          info="How long each open requisition has sat at its current stage. The darker column holds the median."
          days={model.waits}
          noun="requisition"
          caption="median days waiting"
        />
      </div>
    </>
  )
}

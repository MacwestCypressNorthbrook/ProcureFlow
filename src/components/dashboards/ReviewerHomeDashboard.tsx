'use client'

import { useMemo } from 'react'
import {
  KpiRow,
  KpiTile,
  compact,
  concentrationInsight,
  ghsFull,
  median,
  monthOverMonth,
  monthlySpark,
  num,
  pct,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { PixelTrend } from '@/components/shared/dashboard/time-charts'
import { BreakdownDonut, DayHistogram, RankedList, StackedShare, Treemap } from '@/components/shared/dashboard/share-charts'
import { AgeingStrip, GaugeRing, StackedColumns } from '@/components/shared/dashboard/queue-charts'
import { OUTCOMES, daysSince, isOutcome } from './chain'

/** A requisition waiting on a reviewer, as `getStageInbox` returns it. */
export interface QueueItem {
  id: string
  purpose: string
  status: string
  total_amount?: number | string | null
  project_name?: string | null
  requester_name?: string | null
  supplier_names?: string | null
  is_urgent?: boolean | null
  created_at: string
  updated_at?: string | null
}

/** One decision a stage recorded, as `getStageDecisions` returns it. */
export interface DecisionItem {
  id: string
  action: string
  created_at: string
  total_amount?: number | string | null
  project_name?: string | null
}

/**
 * What each reviewing role's home leads with. The three stages share their
 * data — a queue and a record of decisions — so they share this component, but
 * each asks a different question of it and so gets a different dashboard.
 *
 *   lead          "Am I keeping up?"  — decisions month by month, who is waiting.
 *   supply_chain  "What do I price next?" — the queue by age, suppliers involved,
 *                 where work sits around this desk.
 *   cost_control  "What have I passed?" — value audited, pass rate, where the
 *                 queue's money is.
 */
export type ReviewerRole = 'lead' | 'supply_chain' | 'cost_control'

export interface Neighbours {
  /** Waiting at the stage before this one. */
  before: { label: string; count: number }
  /** Sent back to this stage by the one after. */
  returned: number
  /** Waiting at the stage after this one. */
  after: { label: string; count: number }
}

export default function ReviewerHomeDashboard({
  role,
  queue,
  decisions,
  hrefBase,
  neighbours,
}: {
  role: ReviewerRole
  queue: QueueItem[]
  decisions: DecisionItem[]
  /** Where a queued requisition opens, e.g. "/sam/requests". */
  hrefBase: string
  neighbours?: Neighbours
}) {
  const model = useMemo(() => {
    const amount = (r: { total_amount?: number | string | null }) => num(r.total_amount)
    // The lead is the first stage, so a requisition has waited since it was
    // raised; later stages have the row's last movement to go on.
    const waited = (r: QueueItem) => daysSince(role === 'lead' ? r.created_at : (r.updated_at ?? r.created_at)) ?? 0
    const outcomes = decisions.filter((d) => isOutcome(d.action))
    const count = (key: string) => outcomes.filter((d) => d.action === key).length
    const waits = queue.map(waited)
    return {
      waited,
      queueValue: queue.reduce((s, r) => s + amount(r), 0),
      urgent: queue.filter((r) => r.is_urgent).length,
      oldest: waits.length ? Math.max(...waits) : null,
      medianWait: median(waits),
      overWeek: waits.filter((d) => d > 7).length,
      waits,
      outcomes,
      approved: count('approved'),
      sentBack: count('sent_back'),
      rejected: count('rejected'),
      sparks: {
        arrivals: monthlySpark(queue, (r) => r.created_at, (rs) => rs.length, (n) => `${n} raised`),
        value: monthlySpark(queue, (r) => r.created_at, (rs) => rs.reduce((s, r) => s + amount(r), 0), ghsFull),
        decided: monthlySpark(outcomes, (d) => d.created_at, (ds) => ds.length, (n) => `${n} decided`),
        overWeek: monthlySpark(queue, (r) => r.created_at, (rs) => rs.filter((r) => waited(r) > 7).length, (n) => `${n} waiting over a week`),
      },
    }
  }, [queue, decisions, role])

  const decided = model.approved + model.sentBack + model.rejected
  const projectSlices = useMemo(() => stableSlices(queue, queue, (r) => r.project_name || 'Unassigned', (r) => num(r.total_amount)), [queue])
  const ageing = queue.map((r) => ({
    id: r.id,
    label: r.purpose || 'Untitled requisition',
    days: model.waited(r),
    value: num(r.total_amount),
    urgent: Boolean(r.is_urgent),
    href: `${hrefBase}/${r.id}`,
  }))

  const kpis = (
    <KpiRow>
      <KpiTile
        label={role === 'cost_control' ? 'Awaiting audit' : 'Awaiting you'}
        value={queue.length.toLocaleString('en-GB')}
        unit={queue.length === 1 ? 'requisition' : 'requisitions'}
        spark={model.sparks.arrivals}
        info="Requisitions waiting on this stage right now, including any sent back to it. The sparkline shows the month each was raised."
        note={model.urgent ? `${model.urgent} marked urgent` : 'none marked urgent'}
      />
      <KpiTile
        label="Queue value"
        prefix="GHS"
        value={compact(model.queueValue)}
        title={ghsFull(model.queueValue)}
        spark={model.sparks.value}
        info="What the waiting requisitions are priced at, by the month they were raised."
        note={`across ${queue.length} requisition${queue.length === 1 ? '' : 's'}`}
      />
      <KpiTile
        label="Longest waiting"
        value={model.oldest === null ? '—' : String(model.oldest)}
        unit={model.oldest === 1 ? 'day' : 'days'}
        spark={model.sparks.overWeek}
        info={`Days since the oldest waiting requisition ${role === 'lead' ? 'was raised' : 'last moved'}. The sparkline counts those waiting over a week, by the month they were raised.`}
        note={model.overWeek ? `${model.overWeek} over a week` : 'nothing over a week'}
      />
      <KpiTile
        label={role === 'cost_control' ? 'Audits' : 'Decisions'}
        value={decided.toLocaleString('en-GB')}
        unit="made"
        spark={model.sparks.decided}
        info="Approvals, send-backs and rejections recorded at this stage, by month."
        trend={monthOverMonth(model.sparks.decided, { upIsGood: true })}
        note="this month vs last"
      />
    </KpiRow>
  )

  if (role === 'lead') {
    const requesters = new Map<string, number>()
    for (const r of queue) requesters.set(r.requester_name || 'Unknown', (requesters.get(r.requester_name || 'Unknown') ?? 0) + 1)
    return (
      <>
        {kpis}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <StackedColumns
              label="My decisions"
              info="Every approval, send-back and rejection you recorded, month by month. A rising orange band means more work is arriving that needs changes."
              items={model.outcomes.map((d) => ({ at: d.created_at, key: d.action }))}
              categories={OUTCOMES}
              noun="decision"
              headlineKey="approved"
              headlineWord="approved"
            />
          </div>
          <BreakdownDonut
            label="Queue by site"
            info="What is waiting on you, split by project site and weighted by value."
            measure="Waiting"
            format="money"
            noun="requisition"
            slices={projectSlices}
            insight={concentrationInsight(projectSlices, 'site', 'sites', 'the queue')}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <AgeingStrip
              label="Queue ageing"
              info="Each dot is a requisition waiting on you, placed by days since it was raised and sized by value. Select one to open it."
              items={ageing}
              format="money"
              noun="requisition"
              empty="Nothing is waiting on you."
            />
          </div>
          <RankedList
            label="Who's waiting"
            info="Engineers with requisitions in your queue."
            items={[...requesters].map(([label, value]) => ({ label, value, note: value === 1 ? 'requisition' : 'requisitions' }))}
            format="count"
            headline={{ value: requesters.size.toLocaleString('en-GB'), caption: 'engineers waiting on you' }}
            empty="Nobody is waiting on you."
          />
        </div>
      </>
    )
  }

  if (role === 'supply_chain') {
    const suppliers = new Map<string, number>()
    for (const r of queue)
      for (const name of (r.supplier_names ?? '').split(',').map((s) => s.trim()).filter(Boolean)) suppliers.set(name, (suppliers.get(name) ?? 0) + 1)
    const noSupplier = queue.filter((r) => !r.supplier_names).length
    return (
      <>
        {kpis}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <AgeingStrip
              label="Pricing queue"
              info="Each dot is a requisition waiting for pricing, placed by days since it last moved and sized by value. Ringed dots were marked urgent. Select one to open it."
              items={ageing}
              format="money"
              noun="requisition"
              empty="Nothing is waiting for pricing."
            />
          </div>
          <BreakdownDonut
            label="Queue by site"
            info="What is waiting for pricing, split by project site and weighted by value."
            measure="Waiting"
            format="money"
            noun="requisition"
            slices={projectSlices}
            insight={concentrationInsight(projectSlices, 'site', 'sites', 'the queue')}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {neighbours && (
            <StackedShare
              label="Around this desk"
              info="Where requisitions sit around Supply Chain: still with Project Leads, in your queue, returned to you by Cost Control, and passed on to Cost Control."
              steps={[
                { label: neighbours.before.label, note: 'coming your way', count: neighbours.before.count },
                { label: 'Your queue', note: 'to price', count: queue.length - neighbours.returned },
                { label: 'Returned to you', note: 'needs revising', count: neighbours.returned },
                { label: neighbours.after.label, note: 'passed on', count: neighbours.after.count },
              ]}
              noun="requisition"
              doneLabel="passed on"
            />
          )}
          <RankedList
            label="Suppliers to price"
            info="Suppliers named on the requisitions in your queue — each one usually means its own quote and purchase order."
            items={[...suppliers].map(([label, value]) => ({ label, value, note: value === 1 ? 'requisition' : 'requisitions' }))}
            format="count"
            headline={{ value: suppliers.size.toLocaleString('en-GB'), caption: noSupplier ? `suppliers · ${noSupplier} requisitions name none yet` : 'suppliers in your queue' }}
            empty="No supplier is named in your queue yet."
          />
          <div className="min-w-0 md:col-span-2 xl:col-span-1">
            <StackedColumns
              label="My decisions"
              info="Requisitions you passed on, sent back or rejected, month by month."
              items={model.outcomes.map((d) => ({ at: d.created_at, key: d.action }))}
              categories={OUTCOMES}
              noun="decision"
              headlineKey="approved"
              headlineWord="passed on"
              months={6}
            />
          </div>
        </div>
      </>
    )
  }

  // Cost Control.
  const siteValue = new Map<string, { value: number; count: number }>()
  for (const r of queue) {
    const k = r.project_name || 'Unassigned'
    const e = siteValue.get(k) ?? { value: 0, count: 0 }
    e.value += num(r.total_amount)
    e.count += 1
    siteValue.set(k, e)
  }
  return (
    <>
      {kpis}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PixelTrend
            label="Value audited"
            info="The value of the requisitions you decided, by the date of the decision. Dark squares passed; light squares were sent back or rejected."
            items={model.outcomes.map((d) => ({ at: d.created_at, value: num(d.total_amount), part: d.action === 'approved' ? num(d.total_amount) : 0 }))}
            format="money"
            noun="audit"
            partLabel="Passed"
            restLabel="Returned or rejected"
            rangeLabel="Audited in range"
          />
        </div>
        <GaugeRing
          label="Pass rate"
          info="Of the requisitions you decided, the share passed first time. Send-backs and rejections are what pulls it down."
          rate={decided ? model.approved / decided : null}
          title="passed"
          caption={decided ? `${model.approved} of ${decided} audits` : 'No audits yet'}
          noun="audit"
          parts={OUTCOMES.map((o) => ({ label: o.label, count: o.key === 'approved' ? model.approved : o.key === 'sent_back' ? model.sentBack : model.rejected, slot: o.slot }))}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Treemap
            label="Queue by site"
            info="What is waiting for audit, one tile per project site, sized by value."
            items={[...siteValue].map(([k, v]) => ({ key: k, label: k, value: v.value, sub: `${v.count} requisition${v.count === 1 ? '' : 's'}` }))}
            format="money"
            subLabel="Waiting"
            headline={{ value: `GHS ${compact(model.queueValue)}`, caption: `waiting for audit across ${siteValue.size} site${siteValue.size === 1 ? '' : 's'}` }}
          />
        </div>
        <DayHistogram
          label="Waiting for audit"
          info="How long each waiting requisition has sat since it last moved. The darker column holds the median."
          days={model.waits}
          noun="requisition"
          caption={`median days waiting · ${pct(model.overWeek, queue.length)}% over a week`}
        />
      </div>
    </>
  )
}

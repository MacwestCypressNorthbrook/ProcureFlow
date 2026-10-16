'use client'

import { useMemo } from 'react'
import { AUDIT_ACTION_LABELS } from '@/lib/audit'
import {
  KpiRow,
  KpiTile,
  concentrationInsight,
  monthOverMonth,
  monthlySpark,
  pct,
  plural,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { PixelTrend, PunchCard } from '@/components/shared/dashboard/time-charts'
import { BreakdownDonut, RankedList } from '@/components/shared/dashboard/share-charts'
import type { AuditEntry } from './AdminClient'

/** Legacy spellings fold into the action they mean, so one decision is one slice. */
const CANONICAL: Record<string, string> = {
  approved_by_sam: 'approved',
  rejected_by_sam: 'rejected',
  sent_back_by_sam: 'sent_back',
  payment_completed: 'paid',
}
const actionOf = (e: AuditEntry) => CANONICAL[e.action] ?? e.action
const isApproval = (e: AuditEntry) => actionOf(e) === 'approved'
const isPushback = (e: AuditEntry) => actionOf(e) === 'rejected' || actionOf(e) === 'sent_back'
const personOf = (e: AuditEntry) => e.performer?.name || e.performer?.email || 'System'

/**
 * The Audit dashboard: when the team works (a weekday × hour punch card),
 * what they do, how decisions trend, and who carries the load.
 */
export default function AuditDashboard({ all, visible }: { all: AuditEntry[]; visible: AuditEntry[] }) {
  const model = useMemo(() => {
    const monthAgo = new Date().getTime() - 30 * 86_400_000
    const recent = visible.filter((e) => new Date(e.created_at).getTime() >= monthAgo)
    const people = new Map<string, number>()
    for (const e of visible) people.set(personOf(e), (people.get(personOf(e)) ?? 0) + 1)
    const approvals = visible.filter(isApproval).length
    const decisions = visible.filter((e) => isApproval(e) || isPushback(e)).length
    return {
      count: visible.length,
      approvals,
      pushback: visible.filter(isPushback).length,
      decisions,
      activePeople: new Set(recent.map(personOf)).size,
      people: [...people].map(([label, value]) => ({ label, value, note: `${pct(value, visible.length)}%` })),
      sparks: {
        events: monthlySpark(visible, (e) => e.created_at, (es) => es.length, (n) => `${n} events`),
        approvals: monthlySpark(visible, (e) => e.created_at, (es) => es.filter(isApproval).length, (n) => `${n} approvals`),
        pushback: monthlySpark(visible, (e) => e.created_at, (es) => es.filter(isPushback).length, (n) => `${n} sent back or rejected`),
        people: monthlySpark(visible, (e) => e.created_at, (es) => new Set(es.map(personOf)).size, (n) => `${n} people`),
      },
    }
  }, [visible])

  const slices = useMemo(
    () => stableSlices(all.map((e) => ({ ...e, action: actionOf(e) })), visible.map((e) => ({ ...e, action: actionOf(e) })), (e) => e.action, () => 1, (k) => AUDIT_ACTION_LABELS[k] ?? k),
    [all, visible]
  )

  return (
    <>
      <KpiRow>
        <KpiTile
          label="Events"
          value={model.count.toLocaleString('en-GB')}
          unit="logged"
          spark={model.sparks.events}
          info="Every recorded action matching the table's filters. The sparkline counts them per month over the last eight."
          trend={monthOverMonth(model.sparks.events, { upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Approvals"
          value={model.approvals.toLocaleString('en-GB')}
          spark={model.sparks.approvals}
          info="Approvals at any stage of the chain, including the legacy SAM approvals."
          trend={monthOverMonth(model.sparks.approvals, { upIsGood: true })}
          note={`${pct(model.approvals, model.decisions)}% of decisions`}
        />
        <KpiTile
          label="Pushback"
          value={model.pushback.toLocaleString('en-GB')}
          spark={model.sparks.pushback}
          info="Requisitions sent back for changes or rejected outright. Falling is good — it means work arrives right first time."
          trend={monthOverMonth(model.sparks.pushback, { upIsGood: false })}
          note="this month vs last"
        />
        <KpiTile
          label="People active"
          value={model.activePeople.toLocaleString('en-GB')}
          unit="last 30 days"
          spark={model.sparks.people}
          info="Distinct people who recorded at least one action in the last 30 days. The sparkline counts them per month."
          note={`${plural(model.people.length, 'person', 'people')} in the log`}
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PunchCard
            label="When work happens"
            info="Every logged action placed by weekday and hour. A bigger dot means more actions in that hour; office hours are Monday–Friday, 08:00–18:00."
            times={visible.map((e) => e.created_at)}
            noun="action"
          />
        </div>
        <BreakdownDonut
          label="What gets done"
          info="Logged actions by type. Legacy spellings are folded into the action they mean."
          measure="Actions"
          format="count"
          noun="action"
          slices={slices}
          insight={concentrationInsight(slices, 'action', 'actions', 'logged activity')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PixelTrend
            label="Decisions over time"
            info="Logged actions by date. Dark squares are approvals; light squares are everything else — comments, send-backs, rejections, payments."
            items={visible.map((e) => ({ at: e.created_at, value: 1, part: isApproval(e) ? 1 : 0 }))}
            format="count"
            noun="action"
            partLabel="Approvals"
            restLabel="Other actions"
            rangeLabel="Logged in range"
          />
        </div>
        <RankedList
          label="Most active"
          info="Who recorded the most actions in the rows shown."
          items={model.people}
          format="count"
          headline={{ value: model.people.length.toLocaleString('en-GB'), caption: 'people in the log' }}
        />
      </div>
    </>
  )
}

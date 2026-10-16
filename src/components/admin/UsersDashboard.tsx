'use client'

import { useMemo } from 'react'
import type { UserWithProjects } from '@/lib/types'
import { normalizeRole, roleLabel } from '@/lib/roles'
import {
  KpiRow,
  KpiTile,
  lastMonths,
  monthKeyOf,
  monthLabel,
  monthOverMonth,
  monthlySpark,
  pct,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { GrowthLine } from '@/components/shared/dashboard/time-charts'
import { MeterList, RankedList, Waffle } from '@/components/shared/dashboard/share-charts'
import type { AdminRequestRow } from './AdminClient'

const roleKey = (u: UserWithProjects) => normalizeRole(u.role) ?? u.role ?? 'unknown'

/**
 * The Users dashboard: who the team is (a hundred-square waffle by role), how
 * it has grown, where people are assigned, and who is actually raising work.
 */
export default function UsersDashboard({
  all,
  visible,
  requests,
}: {
  all: UserWithProjects[]
  visible: UserWithProjects[]
  requests: AdminRequestRow[]
}) {
  const model = useMemo(() => {
    const monthAgo = new Date().getTime() - 30 * 86_400_000
    const ids = new Set(visible.map((u) => u.id))
    const theirs = requests.filter((r) => r.created_by && ids.has(r.created_by))
    const raisers = new Set(theirs.filter((r) => new Date(r.created_at).getTime() >= monthAgo).map((r) => r.created_by))

    const months = lastMonths(12)
    const before = visible.filter((u) => monthKeyOf(u.created_at) < months[0]).length
    const added = months.map((m) => visible.filter((u) => monthKeyOf(u.created_at) === m).length)

    const perSite = new Map<string, number>()
    for (const u of visible) for (const p of u.projects) perSite.set(p.name, (perSite.get(p.name) ?? 0) + 1)

    const name = new Map(visible.map((u) => [u.id, u.name || u.email]))
    const perPerson = new Map<string, number>()
    for (const r of theirs) {
      const who = name.get(r.created_by!) ?? 'Unknown'
      perPerson.set(who, (perPerson.get(who) ?? 0) + 1)
    }

    return {
      count: visible.length,
      active: visible.filter((u) => u.is_active !== false).length,
      unassigned: visible.filter((u) => u.projects.length === 0).length,
      raisers: raisers.size,
      growth: months.map((m, i) => ({ label: monthLabel(m), added: added[i], total: before + added.slice(0, i + 1).reduce((a, b) => a + b, 0) })),
      perSite: [...perSite].map(([label, value]) => ({ label, value })),
      perPerson: [...perPerson].map(([label, value]) => ({ label, value, note: value === 1 ? 'requisition' : 'requisitions' })),
      sparks: {
        joined: monthlySpark(visible, (u) => u.created_at, (us) => us.length, (n) => `${n} joined`),
        active: monthlySpark(visible.filter((u) => u.is_active !== false), (u) => u.created_at, (us) => us.length, (n) => `${n} active accounts joined`),
        raisers: monthlySpark(theirs, (r) => r.created_at, (rs) => new Set(rs.map((r) => r.created_by)).size, (n) => `${n} people raising`),
        unassigned: monthlySpark(visible.filter((u) => u.projects.length === 0), (u) => u.created_at, (us) => us.length, (n) => `${n} joined unassigned`),
      },
    }
  }, [visible, requests])

  const slices = useMemo(() => stableSlices(all, visible, roleKey, () => 1, roleLabel), [all, visible])
  const top = slices.find((s) => s.slot !== null)

  return (
    <>
      <KpiRow>
        <KpiTile
          label="Accounts"
          value={model.count.toLocaleString('en-GB')}
          unit="people"
          spark={model.sparks.joined}
          info="Accounts matching the filters. The sparkline counts people who joined each month."
          trend={monthOverMonth(model.sparks.joined, { upIsGood: null })}
          note="joined this month vs last"
        />
        <KpiTile
          label="Active"
          value={`${pct(model.active, model.count)}`}
          unit="%"
          spark={model.sparks.active}
          info="Accounts that can still sign in. Deactivated accounts keep their history but cannot act."
          note={`${model.count - model.active} deactivated`}
        />
        <KpiTile
          label="Raising work"
          value={model.raisers.toLocaleString('en-GB')}
          unit="last 30 days"
          spark={model.sparks.raisers}
          info="People who raised at least one requisition in the last 30 days. The sparkline counts them per month."
          trend={monthOverMonth(model.sparks.raisers, { upIsGood: true })}
          note="this month vs last"
        />
        <KpiTile
          label="Unassigned"
          value={model.unassigned.toLocaleString('en-GB')}
          unit={`of ${model.count}`}
          spark={model.sparks.unassigned}
          info="Accounts on no project site. Engineers need a site before they can raise a requisition against it."
          note="on no project site"
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <Waffle
          label="Team make-up"
          info="A hundred squares, each one percent of the accounts shown, coloured by role."
          slices={slices}
          noun="person"
          nounPlural="people"
          headline={{ value: `${slices.length}`, caption: top ? `roles · ${top.label} is ${pct(top.value, model.count)}% of the team` : 'roles' }}
        />
        <div className="min-w-0 lg:col-span-2">
          <GrowthLine label="Team growth" info="Accounts at the end of each month, for the last twelve months." points={model.growth} noun="account" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RankedList
          label="Site coverage"
          info="How many of the people shown are assigned to each site. One person can cover several sites."
          items={model.perSite}
          format="count"
          headline={{ value: model.perSite.length.toLocaleString('en-GB'), caption: 'sites with someone assigned' }}
          empty="Nobody shown is assigned to a site."
        />
        <RankedList
          label="Top requesters"
          info="Requisitions raised by each person shown, all time."
          items={model.perPerson}
          format="count"
          headline={{ value: model.perPerson.length.toLocaleString('en-GB'), caption: 'people have raised a requisition' }}
          empty="Nobody shown has raised a requisition yet."
        />
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <MeterList
            label="Account health"
            info="How many accounts carry each detail or setting."
            headline={{ value: `${pct(visible.filter((u) => u.name && u.phone).length, model.count)}%`, caption: 'have a name and phone on file' }}
            meters={[
              { label: 'Active', have: model.active, of: model.count, note: 'can sign in' },
              { label: 'On a site', have: model.count - model.unassigned, of: model.count, note: 'assigned to a project' },
              { label: 'Name', have: visible.filter((u) => u.name).length, of: model.count, note: 'not just an email' },
              { label: 'Phone', have: visible.filter((u) => u.phone).length, of: model.count, note: 'reachable on site' },
            ]}
          />
        </div>
      </div>
    </>
  )
}

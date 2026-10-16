'use client'

import { useMemo, useState } from 'react'
import type { ProjectWithMemberCount } from '@/lib/types'
import {
  KpiRow,
  KpiTile,
  Segmented,
  compact,
  concentrationInsight,
  ghsFull,
  ghsShort,
  monthOverMonth,
  monthlySpark,
  num,
  pct,
  plural,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { BreakdownDonut, MeterList, RankedList, Treemap } from '@/components/shared/dashboard/share-charts'
import type { AdminPurchaseOrder } from './report-types'
import type { AdminRequestRow } from './AdminClient'

const STATUS_LABEL: Record<string, string> = { active: 'Active', on_hold: 'On hold', archived: 'Archived' }

/** An active site with no requisition for this long has gone quiet. */
const QUIET_DAYS = 30

/**
 * The Projects dashboard: where the money goes, site by site (a treemap whose
 * tiles are sized by spend), how the portfolio is made up, who is staffed,
 * and which active sites have gone quiet.
 */
export default function ProjectsDashboard({
  all,
  visible,
  requests,
  pos,
}: {
  all: ProjectWithMemberCount[]
  visible: ProjectWithMemberCount[]
  requests: AdminRequestRow[]
  pos: AdminPurchaseOrder[]
}) {
  const [measure, setMeasure] = useState<'committed' | 'requisitioned'>('committed')
  const [dimension, setDimension] = useState<'status' | 'client'>('status')

  const model = useMemo(() => {
    const now = new Date().getTime()
    // Requisitions carry the site's id; purchase orders only its name and code.
    const reqsBy = new Map<string, AdminRequestRow[]>()
    for (const r of requests) if (r.project_id) reqsBy.set(r.project_id, [...(reqsBy.get(r.project_id) ?? []), r])
    const posBy = new Map<string, AdminPurchaseOrder[]>()
    for (const p of pos) {
      const site = visible.find((s) => (p.project_code && s.code === p.project_code) || s.name === p.project_name)
      if (site) posBy.set(site.id, [...(posBy.get(site.id) ?? []), p])
    }

    const sites = visible.map((s) => {
      const reqs = reqsBy.get(s.id) ?? []
      const sitePos = posBy.get(s.id) ?? []
      const last = reqs.reduce((m, r) => Math.max(m, new Date(r.created_at).getTime()), 0)
      return {
        site: s,
        reqs,
        pos: sitePos,
        requisitioned: reqs.reduce((sum, r) => sum + num(r.total_amount), 0),
        committed: sitePos.reduce((sum, p) => sum + num(p.total_amount), 0),
        quietDays: last ? Math.floor((now - last) / 86_400_000) : null,
      }
    })
    const active = sites.filter((x) => x.site.status === 'active')
    const quiet = active.filter((x) => x.quietDays === null || x.quietDays > QUIET_DAYS)
    const allReqs = sites.flatMap((x) => x.reqs)
    const allPos = sites.flatMap((x) => x.pos)

    return {
      sites,
      count: visible.length,
      active: active.length,
      quiet,
      members: visible.reduce((s, p) => s + p.member_count, 0),
      unstaffed: visible.filter((p) => p.member_count === 0).length,
      requisitions: allReqs.length,
      committed: allPos.reduce((s, p) => s + num(p.total_amount), 0),
      sparks: {
        sites: monthlySpark(visible, (p) => p.created_at, (ps) => ps.length, (n) => `${n} sites added`),
        reqs: monthlySpark(allReqs, (r) => r.created_at, (rs) => rs.length, (n) => `${n} requisitions`),
        committed: monthlySpark(allPos, (p) => p.created_at, (ps) => ps.reduce((s, p) => s + num(p.total_amount), 0), ghsFull),
        busy: monthlySpark(allReqs, (r) => r.created_at, (rs) => new Set(rs.map((r) => r.project_id)).size, (n) => `${n} sites raising`),
      },
    }
  }, [visible, requests, pos])

  const slices = useMemo(() => {
    const key = dimension === 'status' ? (p: ProjectWithMemberCount) => p.status : (p: ProjectWithMemberCount) => p.client || 'No client'
    return stableSlices(all, visible, key, () => 1, (k) => (dimension === 'status' ? STATUS_LABEL[k] ?? k : k))
  }, [all, visible, dimension])

  const treeTotal = model.sites.reduce((s, x) => s + x[measure], 0)
  const leader = [...model.sites].sort((a, b) => b[measure] - a[measure])[0]

  return (
    <>
      <KpiRow>
        <KpiTile
          label="Project sites"
          value={model.count.toLocaleString('en-GB')}
          unit={`${model.active} active`}
          spark={model.sparks.sites}
          info="Sites matching the filters. The sparkline counts sites created each month."
          note={`${model.members} people assigned`}
        />
        <KpiTile
          label="Requisitions"
          value={model.requisitions.toLocaleString('en-GB')}
          unit="raised"
          spark={model.sparks.reqs}
          info="Requisitions raised against these sites, by month raised."
          trend={monthOverMonth(model.sparks.reqs, { upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Committed"
          prefix="GHS"
          value={compact(model.committed)}
          title={ghsFull(model.committed)}
          spark={model.sparks.committed}
          info="Purchase-order value raised for these sites, matched by site code or name."
          trend={monthOverMonth(model.sparks.committed, { percent: true, upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Quiet sites"
          value={model.quiet.length.toLocaleString('en-GB')}
          unit={`of ${model.active} active`}
          spark={model.sparks.busy}
          info={`Active sites with no requisition in the last ${QUIET_DAYS} days — finished, stalled, or ordering some other way. The sparkline counts sites raising requisitions each month.`}
          note={`no requisition in ${QUIET_DAYS} days`}
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Treemap
            label="Spend by site"
            info="Each tile is a site, its area its share of the total. Switch between purchase-order value committed and value requisitioned."
            items={model.sites.map((x) => ({
              key: x.site.id,
              label: x.site.code ? `${x.site.code} · ${x.site.name}` : x.site.name,
              value: x[measure],
              sub: `${plural(x.reqs.length, 'requisition')} · ${plural(x.site.member_count, 'member')}`,
            }))}
            format="money"
            subLabel="Activity"
            headline={{
              value: ghsShort(treeTotal),
              caption: leader && leader[measure] > 0 ? `${measure} · ${leader.site.name} leads with ${pct(leader[measure], treeTotal)}%` : `${measure} across ${model.count} sites`,
            }}
            action={
              <Segmented
                label="Measure"
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: 'committed', label: 'Committed' },
                  { value: 'requisitioned', label: 'Requisitioned' },
                ]}
              />
            }
          />
        </div>
        <BreakdownDonut
          label="Portfolio"
          info="Sites by status or by client. The five largest groups keep their colour as you filter."
          measure="Sites"
          format="count"
          noun="site"
          slices={slices}
          insight={concentrationInsight(slices, dimension, dimension === 'status' ? 'statuses' : 'clients', 'the sites')}
          dimension={dimension}
          dimensions={[
            { value: 'status', label: 'Status' },
            { value: 'client', label: 'Client' },
          ]}
          onDimension={setDimension}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RankedList
          label="Team size"
          info="People assigned to each site."
          items={visible.map((p) => ({ label: p.name, value: p.member_count }))}
          format="count"
          headline={{ value: model.members.toLocaleString('en-GB'), caption: `assignments · ${model.unstaffed} site${model.unstaffed === 1 ? '' : 's'} with no one` }}
        />
        <RankedList
          label="Gone quiet"
          info="Active sites ranked by days since their last requisition, or since they were created if they have never raised one."
          items={model.quiet.map((x) => ({
            label: x.site.name,
            // A site that has never raised one has been quiet since it was created.
            value: x.quietDays ?? Math.floor((new Date().getTime() - new Date(x.site.created_at).getTime()) / 86_400_000),
            note: x.quietDays === null ? 'days, never raised one' : 'days quiet',
          }))}
          format="count"
          headline={{ value: model.quiet.length.toLocaleString('en-GB'), caption: `active sites quiet for ${QUIET_DAYS}+ days` }}
          empty="Every active site has raised a requisition recently."
        />
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <MeterList
            label="Site records"
            info="How many site records carry each detail."
            headline={{ value: `${pct(visible.filter((p) => p.code && p.site_location && p.client).length, model.count)}%`, caption: 'have a code, location and client' }}
            meters={[
              { label: 'Code', have: visible.filter((p) => p.code).length, of: model.count, note: 'matches POs reliably' },
              { label: 'Location', have: visible.filter((p) => p.site_location).length, of: model.count, note: 'where deliveries go' },
              { label: 'Client', have: visible.filter((p) => p.client).length, of: model.count, note: 'who the work is for' },
              { label: 'Team', have: model.count - model.unstaffed, of: model.count, note: 'someone assigned' },
            ]}
          />
        </div>
      </div>
    </>
  )
}

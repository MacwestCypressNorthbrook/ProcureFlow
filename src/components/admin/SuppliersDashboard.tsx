'use client'

import { useMemo, useState } from 'react'
import {
  KpiRow,
  KpiTile,
  Segmented,
  compact,
  concentrationInsight,
  ghsFull,
  lastMonths,
  monthKeyOf,
  monthLabel,
  monthOverMonth,
  monthlySpark,
  num,
  pct,
  stableSlices,
} from '@/components/shared/dashboard/kit'
import { GrowthLine } from '@/components/shared/dashboard/time-charts'
import { BreakdownDonut, MeterList, Pareto } from '@/components/shared/dashboard/share-charts'
import { vendorKey, type AdminPurchaseOrder } from './report-types'
import type { SupplierRow } from './SuppliersPanel'

const complete = (s: SupplierRow) => Boolean(s.phone && s.email && s.tin)

/**
 * The Suppliers dashboard: how concentrated the business is on a few vendors
 * (a Pareto of PO spend or requisition lines), what kinds of supplier the
 * directory holds, how complete their records are, and how it has grown.
 */
export default function SuppliersDashboard({
  all,
  visible,
  pos,
}: {
  all: SupplierRow[]
  visible: SupplierRow[]
  pos: AdminPurchaseOrder[]
}) {
  const [measure, setMeasure] = useState<'spend' | 'lines'>('spend')
  const [dimension, setDimension] = useState<'category' | 'status'>('category')

  // A PO belongs to a directory supplier by id, or — for older POs that only
  // carry a typed vendor name — by that name compared loosely.
  const spendBy = useMemo(() => {
    const byId = new Map(all.map((s) => [s.id, s.id]))
    const byName = new Map(all.map((s) => [vendorKey(s.name), s.id]))
    const spend = new Map<string, { value: number; pos: AdminPurchaseOrder[] }>()
    for (const po of pos) {
      const id = (po.supplier_id && byId.get(po.supplier_id)) || byName.get(vendorKey(po.vendor_name))
      if (!id) continue
      const e = spend.get(id) ?? { value: 0, pos: [] }
      e.value += num(po.total_amount)
      e.pos.push(po)
      spend.set(id, e)
    }
    return spend
  }, [all, pos])

  const model = useMemo(() => {
    const visiblePos = visible.flatMap((s) => spendBy.get(s.id)?.pos ?? [])
    const spend = visiblePos.reduce((s, p) => s + num(p.total_amount), 0)
    const inUse = visible.filter((s) => (s.usage_count ?? 0) > 0 || spendBy.has(s.id))

    // Running total of the directory, month by month.
    const months = lastMonths(12)
    const before = visible.filter((s) => monthKeyOf(s.created_at) < months[0]).length
    const added = months.map((m) => visible.filter((s) => monthKeyOf(s.created_at) === m).length)
    const growth = months.map((m, i) => ({
      label: monthLabel(m),
      added: added[i],
      total: before + added.slice(0, i + 1).reduce((a, b) => a + b, 0),
    }))

    return {
      count: visible.length,
      active: visible.filter((s) => s.is_active).length,
      inUse: inUse.length,
      spend,
      complete: visible.filter(complete).length,
      growth,
      pareto: {
        spend: visible.map((s) => ({ label: s.name, value: spendBy.get(s.id)?.value ?? 0 })),
        lines: visible.map((s) => ({ label: s.name, value: s.usage_count ?? 0 })),
      },
      meters: [
        { label: 'Phone', have: visible.filter((s) => s.phone).length, of: visible.length, note: 'can be called' },
        { label: 'Email', have: visible.filter((s) => s.email).length, of: visible.length, note: 'can receive a PO' },
        { label: 'TIN', have: visible.filter((s) => s.tin).length, of: visible.length, note: 'tax-registered on file' },
        { label: 'Contact person', have: visible.filter((s) => s.contact_name).length, of: visible.length, note: 'someone to ask for' },
        { label: 'Address', have: visible.filter((s) => s.address).length, of: visible.length, note: 'deliveries and collections' },
      ],
      sparks: {
        added: monthlySpark(visible, (s) => s.created_at, (ss) => ss.length, (n) => `${n} added`),
        inUse: monthlySpark(visiblePos, (p) => p.created_at, (ps) => new Set(ps.map((p) => p.supplier_id ?? vendorKey(p.vendor_name))).size, (n) => `${n} suppliers on POs`),
        spend: monthlySpark(visiblePos, (p) => p.created_at, (ps) => ps.reduce((s, p) => s + num(p.total_amount), 0), ghsFull),
        complete: monthlySpark(visible.filter(complete), (s) => s.created_at, (ss) => ss.length, (n) => `${n} complete records added`),
      },
    }
  }, [visible, spendBy])

  const slices = useMemo(() => {
    const key = dimension === 'category' ? (s: SupplierRow) => s.category || 'Uncategorised' : (s: SupplierRow) => (s.is_active ? 'Active' : 'Inactive')
    return stableSlices(all, visible, key, () => 1)
  }, [all, visible, dimension])

  return (
    <>
      <KpiRow>
        <KpiTile
          label="Suppliers"
          value={model.count.toLocaleString('en-GB')}
          unit="in directory"
          spark={model.sparks.added}
          info="Vendors in the directory matching the filters. The sparkline counts suppliers added each month."
          trend={monthOverMonth(model.sparks.added, { upIsGood: null })}
          note={`${model.active} active · added this month vs last`}
        />
        <KpiTile
          label="In use"
          value={model.inUse.toLocaleString('en-GB')}
          unit={`of ${model.count}`}
          spark={model.sparks.inUse}
          info="Suppliers named on at least one requisition line or purchase order. The sparkline counts distinct suppliers on POs each month."
          note={`${model.count - model.inUse} never used`}
        />
        <KpiTile
          label="PO spend"
          prefix="GHS"
          value={compact(model.spend)}
          title={ghsFull(model.spend)}
          spark={model.sparks.spend}
          info="Purchase-order value raised to these suppliers, matched by supplier record or, for older POs, by the vendor name typed on the PO."
          trend={monthOverMonth(model.sparks.spend, { percent: true, upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Complete records"
          value={`${pct(model.complete, model.count)}`}
          unit="%"
          spark={model.sparks.complete}
          info="Suppliers with a phone number, an email address and a TIN on file — enough to contact, send a PO to, and pay."
          note={`${model.count - model.complete} missing details`}
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Pareto
            label="Supplier concentration"
            info="Suppliers ranked by their share, with the running total as a line. The fewer columns it takes to cross the dashed 80% line, the more the business leans on a handful of vendors."
            items={measure === 'spend' ? model.pareto.spend : model.pareto.lines}
            format={measure === 'spend' ? 'money' : 'count'}
            nounPlural="suppliers"
            action={
              <Segmented
                label="Measure"
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: 'spend', label: 'PO spend' },
                  { value: 'lines', label: 'Req. lines' },
                ]}
              />
            }
          />
        </div>
        <BreakdownDonut
          label="Directory mix"
          info="Suppliers by category or status. The five largest groups keep their colour as you filter."
          measure="Suppliers"
          format="count"
          noun="supplier"
          slices={slices}
          insight={concentrationInsight(slices, dimension, dimension === 'category' ? 'categories' : 'statuses', 'the directory')}
          dimension={dimension}
          dimensions={[
            { value: 'category', label: 'Category' },
            { value: 'status', label: 'Status' },
          ]}
          onDimension={setDimension}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MeterList
          label="Record health"
          info="How many supplier records carry each detail. A full bar means every supplier shown has it."
          headline={{ value: `${model.complete}`, caption: `of ${model.count} have phone, email and TIN` }}
          meters={model.meters}
        />
        <div className="min-w-0 lg:col-span-2">
          <GrowthLine
            label="Directory growth"
            info="Suppliers in the directory at the end of each month, for the last twelve months."
            points={model.growth}
            noun="supplier"
          />
        </div>
      </div>
    </>
  )
}

'use client'

import { useMemo } from 'react'
import {
  KpiRow,
  KpiTile,
  compact,
  daysBetween,
  ghsFull,
  ghsShort,
  median,
  monthOverMonth,
  monthlySpark,
  num,
  pct,
} from '@/components/shared/dashboard/kit'
import { CalendarHeatmap } from '@/components/shared/dashboard/time-charts'
import { DayHistogram, RankedList, StackedShare, StageBars } from '@/components/shared/dashboard/share-charts'

/** A purchase order as the Finance home queries it. */
export interface FinancePo {
  id: string
  status: string
  total_amount?: number | string | null
  vendor_name?: string | null
  created_at: string
  approved_at?: string | null
  paid_at?: string | null
}

const AWAITING = new Set(['pending_finance', 'partially_paid'])
const CLOSED_OUT = new Set(['rejected', 'cancelled', 'draft'])

/**
 * Finance's home: when money goes out (a payment calendar), what is owed and
 * to whom, and how long payment takes once an order is cleared.
 */
export default function FinanceHomeDashboard({ pos }: { pos: FinancePo[] }) {
  const model = useMemo(() => {
    const amount = (p: FinancePo) => num(p.total_amount)
    const live = pos.filter((p) => !CLOSED_OUT.has(p.status))
    const paid = pos.filter((p) => p.status === 'paid')
    const awaiting = pos.filter((p) => AWAITING.has(p.status))
    const withCc = pos.filter((p) => p.status === 'pending_cost_control')
    const cleared = [...awaiting, ...paid]
    // Payment time runs from the order being cleared for payment, or — for
    // older orders with no approval stamp — from when it was raised.
    const daysToPay = (p: FinancePo) => daysBetween(p.approved_at ?? p.created_at, p.paid_at)
    const payDays = paid.map(daysToPay).filter((d): d is number => d !== null)
    const sum = (ps: FinancePo[]) => ps.reduce((s, p) => s + amount(p), 0)

    const vendors = new Map<string, number>()
    for (const p of awaiting) vendors.set(p.vendor_name || 'No vendor recorded', (vendors.get(p.vendor_name || 'No vendor recorded') ?? 0) + amount(p))

    return {
      paidValue: sum(paid),
      awaitingValue: sum(awaiting),
      clearedValue: sum(cleared),
      liveValue: sum(live),
      awaiting,
      paid,
      withCc,
      payDays,
      medianPay: median(payDays),
      vendors: [...vendors].map(([label, value]) => ({ label, value })),
      days: paid.filter((p) => p.paid_at).map((p) => ({ at: p.paid_at as string, value: amount(p) })),
      steps: [
        { label: 'With Cost Control', note: 'not yet cleared', count: withCc.length, value: sum(withCc) },
        { label: 'Awaiting payment', note: 'cleared, unpaid', count: pos.filter((p) => p.status === 'pending_finance').length, value: sum(pos.filter((p) => p.status === 'pending_finance')) },
        { label: 'Part-paid', note: 'balance still due', count: pos.filter((p) => p.status === 'partially_paid').length, value: sum(pos.filter((p) => p.status === 'partially_paid')) },
        { label: 'Paid', note: 'settled', count: paid.length, value: sum(paid) },
      ],
      sparks: {
        awaiting: monthlySpark(awaiting, (p) => p.approved_at ?? p.created_at, (ps) => ps.length, (n) => `${n} cleared, unpaid`),
        paid: monthlySpark(paid, (p) => p.paid_at, (ps) => sum(ps), ghsFull),
        days: monthlySpark(paid, (p) => p.paid_at, (ps) => median(ps.map(daysToPay).filter((d): d is number => d !== null)) ?? 0, (n) => `${n} days median`),
        settled: monthlySpark(paid, (p) => p.paid_at, (ps) => ps.length, (n) => `${n} settled`),
      },
    }
  }, [pos])

  return (
    <>
      <KpiRow>
        <KpiTile
          label="Awaiting payment"
          value={model.awaiting.length.toLocaleString('en-GB')}
          unit={model.awaiting.length === 1 ? 'order' : 'orders'}
          spark={model.sparks.awaiting}
          info="Purchase orders cleared for payment and not yet settled, including part-paid ones — counted at their full order value, since part-payments are not loaded here. The sparkline shows the month each was cleared."
          note={`${ghsShort(model.awaitingValue)} in order value`}
        />
        <KpiTile
          label="Paid out"
          prefix="GHS"
          value={compact(model.sparks.paid[model.sparks.paid.length - 1]?.value ?? 0)}
          title={ghsFull(model.sparks.paid[model.sparks.paid.length - 1]?.value ?? 0)}
          spark={model.sparks.paid}
          info="Value settled this month, by payment date. The sparkline is each month's payments."
          trend={monthOverMonth(model.sparks.paid, { percent: true, upIsGood: null })}
          note="this month vs last"
        />
        <KpiTile
          label="Days to pay"
          value={model.medianPay === null ? '—' : String(model.medianPay)}
          unit="median"
          spark={model.sparks.days}
          info="Median days from an order being cleared for payment to it being settled. Falling is good. The sparkline is each month's median."
          trend={monthOverMonth(model.sparks.days, { upIsGood: false, suffix: 'd' })}
          note="this month vs last"
        />
        <KpiTile
          label="Settled"
          value={`${pct(model.paidValue, model.clearedValue)}`}
          unit="% of cleared"
          spark={model.sparks.settled}
          info="Of the value cleared for payment, the share already paid. The sparkline counts orders settled each month."
          note={`${model.paid.length} paid · ${ghsShort(model.paidValue)}`}
        />
      </KpiRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <CalendarHeatmap
            label="Payment calendar"
            info="One square per day over the last 26 weeks, darker the more was paid. Switch to Value to shade by cedis rather than the number of payments."
            items={model.days}
            noun="payment"
            valueFormat="money"
          />
        </div>
        <StackedShare
          label="Payables"
          info="Every live purchase order at the step it has reached on the way to being paid."
          steps={model.steps}
          noun="order"
          doneLabel="paid"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StageBars
          label="Money pipeline"
          info="How far committed money has travelled: cleared by Cost Control for payment, then paid."
          format="money"
          stages={[
            { label: 'Committed', note: 'on live purchase orders', value: model.liveValue },
            { label: 'Cleared', note: 'approved for payment', value: model.clearedValue },
            { label: 'Paid', note: 'settled', value: model.paidValue },
          ]}
          footer={[
            { label: 'On unpaid orders', value: ghsShort(model.awaitingValue) },
            { label: 'Not yet cleared', value: ghsShort(Math.max(0, model.liveValue - model.clearedValue)) },
          ]}
        />
        <DayHistogram
          label="Time to pay"
          info="Days from an order being cleared to it being paid. The darker column holds the median."
          days={model.payDays}
          noun="payment"
          caption="median days to pay"
        />
        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <RankedList
            label="Owed to"
            info="Vendors with orders cleared and not yet fully paid, by the value of those orders."
            items={model.vendors}
            format="money"
            headline={{ value: ghsShort(model.awaitingValue), caption: `owed to ${model.vendors.length} vendor${model.vendors.length === 1 ? '' : 's'}` }}
            empty="Nothing is owed right now."
          />
        </div>
      </div>
    </>
  )
}

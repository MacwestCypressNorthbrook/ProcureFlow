import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePageRole } from '@/lib/auth-guard'
import { getSupplierInsights } from '@/lib/supplier-insights'
import { PageContainer, PageHeader, Panel, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG, formatCurrency, formatDate, formatDateShort } from '@/lib/utils'
import { statMoney } from '@/components/shared/stat-presets'
import { FileText, Wallet, CheckCircle2, Layers, Info, Mail, Phone } from 'lucide-react'

export const dynamic = 'force-dynamic'

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })

export default async function SupplierInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePageRole('supply_chain', 'cost_control', 'finance')

  const data = await getSupplierInsights(id)
  if (!data) notFound()

  const { profile, totals, months, items, recent } = data
  const peak = Math.max(...months.map((m) => m.value), 0)
  const average = totals.requisitions > 0 ? totals.requisitioned / totals.requisitions : 0

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        backHref="/mintah/suppliers"
        backLabel="Back to suppliers"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {profile.name}
            {!profile.is_active && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Inactive
              </span>
            )}
          </span>
        }
        subtitle={
          <>
            {[profile.category, profile.contact_name].filter(Boolean).join(' · ') || 'Supplier'}
            {profile.phone && (
              <span className="ml-3 inline-flex items-center gap-1">
                <Phone size={12} /> {profile.phone}
              </span>
            )}
            {profile.email && (
              <span className="ml-3 inline-flex items-center gap-1">
                <Mail size={12} /> {profile.email}
              </span>
            )}
          </>
        }
      />

      <StatGrid
        stats={[
          {
            label: 'Requisitions',
            value: totals.requisitions,
            icon: <FileText size={18} />,
            tone: 'indigo',
            hint: totals.lastDate ? `Last on ${formatDateShort(totals.lastDate)}` : 'None yet',
          },
          {
            label: 'Requisitioned',
            value: statMoney(totals.requisitioned),
            icon: <Layers size={18} />,
            tone: 'blue',
            hint: totals.requisitions > 0 ? `${statMoney(average)} per requisition` : undefined,
          },
          {
            label: 'Completed',
            value: statMoney(totals.completed),
            icon: <CheckCircle2 size={18} />,
            tone: 'emerald',
            hint: 'On requisitions that ran the whole chain',
          },
          {
            label: 'Paid (allocated)',
            value: statMoney(totals.paidShare),
            icon: <Wallet size={18} />,
            tone: 'amber',
            hint: 'This supplier’s share of PO payments',
          },
        ]}
      />

      {totals.requisitions === 0 ? (
        <EmptyState
          title="Nothing supplied yet"
          description="No live requisition has a line assigned to this supplier. Figures appear once Supply Chain prices a requisition with them."
        />
      ) : (
        <>
          <Panel title="Requisitioned per month" bodyClassName="pt-6">
            <div className="flex h-44 items-end gap-2" role="img" aria-label="Requisitioned value per month, last twelve months">
              {months.map((m) => (
                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {m.value > 0 ? statMoney(m.value) : ''}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-primary/80"
                    style={{ height: peak > 0 ? `${Math.max((m.value / peak) * 100, m.value > 0 ? 3 : 0)}%` : 0 }}
                    title={`${monthLabel(m.month)} ${m.month.slice(0, 4)}: ${formatCurrency(m.value)}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Prices by item" bodyClassName="p-0">
              {items.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No priced lines yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Item</th>
                        <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                        <th className="px-3 py-2.5 text-right font-medium">Average</th>
                        <th className="px-3 py-2.5 text-right font-medium">Range</th>
                        <th className="px-4 py-2.5 text-right font-medium">Latest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.description} className="border-b border-border/60 last:border-0">
                          <td className="max-w-[220px] truncate px-4 py-2.5 text-foreground" title={i.description}>
                            {i.description}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {i.quantity.toLocaleString('en-GH')} {i.unit ?? ''}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(i.average)}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {i.lowest === i.highest
                              ? '—'
                              : `${formatCurrency(i.lowest)} – ${formatCurrency(i.highest)}`}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatCurrency(i.latest)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Recent requisitions" bodyClassName="p-0">
              <ul className="divide-y divide-border/60">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/mintah/requests/${r.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{r.purpose}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(r.created_at)}
                          {r.project_name ? ` · ${r.project_name}` : ''} · {r.lines} line{r.lines === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-medium tabular-nums">{formatCurrency(r.value)}</span>
                        <StatusBadge status={r.status} config={REQUEST_STATUS_CONFIG} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Drawn from requisition lines assigned to this supplier; drafts, rejected and cancelled requisitions are
          excluded. Labour and anything without a supplier does not appear. &ldquo;Paid&rdquo; is allocated: a purchase
          order covers a whole requisition, so each supplier on it is credited with its share of the value. Invoices
          are not recorded against suppliers yet.
        </span>
      </p>
    </PageContainer>
  )
}

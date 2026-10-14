import { AlertTriangle, CheckCircle2, Truck } from 'lucide-react'
import { Panel } from '@/components/shared/ui-kit'
import { formatCurrency, cn } from '@/lib/utils'
import type { PurchaseOrder } from '@/lib/types'

interface Line {
  description: string
  line_total: number | string | null
  supplier_id: string | null
  supplier_name: string | null
}

export interface SupplierGroup {
  key: string
  name: string
  lines: string[]
  value: number
}

/** Vendor names are typed freehand on a PO, so compare them loosely. */
export const vendorKey = (name: string | null | undefined) =>
  (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** The requisition's lines, grouped by who supplies them, largest first. */
export function groupBySupplier(items: Line[]): { groups: SupplierGroup[]; unassigned: SupplierGroup | null } {
  const map = new Map<string, SupplierGroup>()
  let unassigned: SupplierGroup | null = null
  for (const item of items) {
    const value = Number(item.line_total) || 0
    if (!item.supplier_id) {
      unassigned ??= { key: 'unassigned', name: 'No supplier assigned', lines: [], value: 0 }
      unassigned.lines.push(item.description)
      unassigned.value += value
      continue
    }
    const group = map.get(item.supplier_id) ?? {
      key: item.supplier_id,
      name: item.supplier_name ?? 'Supplier',
      lines: [],
      value: 0,
    }
    group.lines.push(item.description)
    group.value += value
    map.set(item.supplier_id, group)
  }
  return { groups: [...map.values()].sort((a, b) => b.value - a.value), unassigned }
}

/**
 * Who this requisition is actually buying from.
 *
 * A purchase order is raised per supplier, so a requisition split across three
 * vendors becomes three orders, three deliveries and three invoices. Every
 * reviewer sees that split up front, with each supplier's share and, once the
 * Administrator is raising orders, which supplier is already covered by a PO.
 */
export default function SupplierBreakdownPanel({
  items,
  pos,
  showPoCoverage,
}: {
  items: Line[]
  pos: PurchaseOrder[]
  /** From the Administrator's stage on, when purchase orders are expected. */
  showPoCoverage: boolean
}) {
  const { groups, unassigned } = groupBySupplier(items)
  if (groups.length === 0) return null

  const total = groups.reduce((s, g) => s + g.value, 0) + (unassigned?.value ?? 0)
  const multiple = groups.length > 1
  const posFor = (g: SupplierGroup) => pos.filter((po) => vendorKey(po.vendor_name) === vendorKey(g.name))
  const covered = groups.filter((g) => posFor(g).length > 0).length
  // Orders whose vendor matches no supplier on the requisition — usually a
  // name typed differently in Odoo, sometimes a genuinely different vendor.
  const strayPos = pos.filter((po) => !groups.some((g) => vendorKey(g.name) === vendorKey(po.vendor_name)))

  return (
    <Panel
      title={multiple ? `Suppliers (${groups.length})` : 'Supplier'}
      icon={<Truck size={15} />}
      bodyClassName="p-0"
      action={
        multiple ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Multi-supplier — one PO per supplier
          </span>
        ) : undefined
      }
    >
      {multiple && (
        <p className="border-b border-border bg-amber-500/[0.05] px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          This requisition is sourced from <strong className="text-foreground">{groups.length} suppliers</strong>. Each
          needs its own purchase order, delivery and invoice
          {showPoCoverage && (
            <>
              {' '}— <strong className="text-foreground">{covered} of {groups.length}</strong> covered by a PO so far
            </>
          )}
          .
        </p>
      )}

      <ul className="divide-y divide-border">
        {[...groups, ...(unassigned ? [unassigned] : [])].map((g) => {
          const share = total > 0 ? Math.round((g.value / total) * 100) : 0
          const matched = g.key === 'unassigned' ? [] : posFor(g)
          return (
            <li key={g.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    g.key === 'unassigned' ? 'text-muted-foreground' : 'text-foreground'
                  )}
                >
                  {g.name}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={g.lines.join(', ')}>
                  {g.lines.length} line{g.lines.length === 1 ? '' : 's'}: {g.lines.slice(0, 3).join(', ')}
                  {g.lines.length > 3 ? ` +${g.lines.length - 3} more` : ''}
                </p>
                {multiple && (
                  <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} />
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(g.value)}
                  {multiple && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{share}%</span>}
                </p>
                {showPoCoverage && g.key !== 'unassigned' &&
                  (matched.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 size={11} /> PO {matched.map((po) => `#${po.po_number}`).join(', ')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={11} /> No PO yet
                    </span>
                  ))}
              </div>
            </li>
          )
        })}
      </ul>

      {showPoCoverage && strayPos.length > 0 && (
        <p className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            {strayPos.map((po) => `PO #${po.po_number} (${po.vendor_name || 'no vendor'})`).join(', ')}{' '}
            {strayPos.length === 1 ? 'does' : 'do'} not match a supplier on this requisition by name — check the
            vendor on the PO.
          </span>
        </p>
      )}
    </Panel>
  )
}

'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, formatQuantity } from '@/lib/utils'
import { User, Calendar, Briefcase, Tag, Archive } from '@/lib/icons'

interface RichRequisitionViewProps {
  description: string | null
  fallbackPurpose?: string
  fallbackDate?: string
  /**
   * The requisition's live line items.
   *
   * `description` holds a snapshot captured the moment the requisition was
   * raised, when the engineer had not priced anything — so its totals read
   * zero for the rest of the requisition's life. Rendering that alongside the
   * live figures put the same line on screen twice with two different totals,
   * one of them permanently wrong. When live items are passed they win, and
   * the snapshot is used only for the document's header and details.
   */
  items?: LiveItem[]
  /** Supplier discount applied after the line subtotal. */
  discountAmount?: number
}

export interface LiveItem {
  id?: string
  description: string
  quantity: number | string | null
  unit?: string | null
  unit_price: number | string | null
  line_total: number | string | null
  supplier_name?: string | null
  remarks?: string | null
  category?: string | null
  is_subcontractor?: boolean | null
}

import { extractRequisition, type RichRequisitionData } from '@/lib/requisitions'
export type { RichRequisitionData } from '@/lib/requisitions'
export { extractRequisition, isRichRequisition } from '@/lib/requisitions'

export default function RichRequisitionView({
  description,
  fallbackDate,
  items: liveItems,
  discountAmount = 0,
}: RichRequisitionViewProps) {
  const { data: richData, poNumber } = extractRequisition(description)

  // Fallback: plain text description
  if (!richData) {
    return (
      <div className="surface overflow-hidden rounded-xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Archive size="15" className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Description</h2>
        </div>
        <div className="p-4">
          {description ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </div>
      </div>
    )
  }

  const formatGHS = (value: number) =>
    new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(value)

  // Live items win over the submission snapshot — see the `items` prop.
  const rows = liveItems?.length
    ? liveItems.map((i) => ({
        category: (i.category ?? 'material') as 'material' | 'labour' | 'other',
        isSubcontractor: Boolean(i.is_subcontractor),
        description: i.description,
        quantity: Number(i.quantity) || 0,
        unit: i.unit ?? '',
        unitPrice: Number(i.unit_price) || 0,
        amount: Number(i.line_total) || 0,
        supplierName: i.supplier_name ?? '',
        remarks: i.remarks ?? '',
      }))
    : richData.items

  // Supplier and Remarks are optional on a requisition and usually empty. Held
  // open regardless, they pushed the Amount column past the edge of the panel
  // and clipped the figure that matters most. Render them only when a row
  // actually has something to put there.
  const showSupplier = rows.some((i) => Boolean(i.supplierName))
  const showRemarks = rows.some((i) => Boolean(i.remarks))
  const spanBeforeAmount = 4

  const subtotal = rows.reduce((sum, item) => sum + (item.amount || 0), 0)
  const discount = Number(discountAmount) || 0
  const grandTotal = Math.max(0, subtotal - discount)
  const meta = [
    ['Doc No.', richData.header.docNo],
    ['Version', richData.header.version],
    ['Page', richData.header.page],
  ] as const

  return (
    <div className="surface overflow-hidden rounded-xl">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            {richData.header.companyLogo ? richData.header.companyLogo.substring(0, 2).toUpperCase() : 'MW'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {richData.header.companyLogo || 'MACWEST'}
              </p>
              {poNumber && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                  {poNumber}
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {richData.header.docTitle || 'Requisition Form'}
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 sm:flex sm:gap-6">
          {meta.map(([label, value]) => (
            <div key={label} className="text-left sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-xs font-semibold tabular-nums text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-4 border-b border-border px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
        <Detail icon={<User size="15" />} label="Request Name" value={richData.details.name || '—'} />
        <Detail icon={<Briefcase size="15" />} label="Department" value={richData.details.department || '—'} />
        <Detail icon={<Calendar size="15" />} label="Date" value={richData.details.date || (fallbackDate ? formatDate(fallbackDate) : '—')} />
        {richData.details.project && (
          <Detail icon={<Tag size="15" />} label="Project / Analytics" value={richData.details.project} className="sm:col-span-2 lg:col-span-3" />
        )}
      </div>

      {/* Items */}
      <div className="px-6 py-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Requisition Items</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="h-9 w-10 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item Description</TableHead>
                <TableHead className="h-9 w-16 px-3 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                <TableHead className="h-9 w-24 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit Price</TableHead>
                <TableHead className="h-9 w-28 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                {showSupplier && (
                  <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</TableHead>
                )}
                {showRemarks && (
                  <TableHead className="h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remarks</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item, index) => (
                <TableRow key={index} className="border-border hover:bg-muted/30">
                  <TableCell className="px-3 py-2.5 text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="whitespace-normal break-words px-3 py-2.5 text-sm font-medium text-foreground">
                    {item.category === 'labour' && (
                      <span className="mr-1.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        {item.isSubcontractor ? 'Sub-contractor' : 'Labour'}
                      </span>
                    )}
                    {item.category === 'other' && (
                      <span className="mr-1.5 rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                        Expense
                      </span>
                    )}
                    {item.description}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-center text-xs tabular-nums">
                    {item.quantity ? `${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ''}` : '—'}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-xs tabular-nums">{item.unitPrice ? formatGHS(item.unitPrice) : '—'}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{item.amount ? formatGHS(item.amount) : '—'}</TableCell>
                  {showSupplier && (
                    <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">{item.supplierName || '—'}</TableCell>
                  )}
                  {showRemarks && (
                    <TableCell className="px-3 py-2.5 text-xs text-muted-foreground">{item.remarks || '—'}</TableCell>
                  )}
                </TableRow>
              ))}
              {discount > 0 && (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={spanBeforeAmount} className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subtotal</TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-xs tabular-nums text-foreground">{formatGHS(subtotal)}</TableCell>
                  {showSupplier && <TableCell />}
                  {showRemarks && <TableCell />}
                </TableRow>
              )}
              {discount > 0 && (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={spanBeforeAmount} className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discount</TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-400">− {formatGHS(discount)}</TableCell>
                  {showSupplier && <TableCell />}
                  {showRemarks && <TableCell />}
                </TableRow>
              )}
              <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={spanBeforeAmount} className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total (GHS)</TableCell>
                <TableCell className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-primary">{formatGHS(grandTotal)}</TableCell>
                {showSupplier && <TableCell />}
                {showRemarks && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Notes */}
      {richData.generalNotes && (
        <div className="border-t border-border px-6 py-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">General Notes</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{richData.generalNotes}</p>
        </div>
      )}


    </div>
  )
}

function Detail({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 ${className ?? ''}`}>
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}

function Signature({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="text-center">
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex h-8 items-center justify-center border-b border-dashed border-border pb-1 text-xs font-medium text-foreground/80">
        {value || '—'}
      </div>
      <p className="mt-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{caption}</p>
    </div>
  )
}

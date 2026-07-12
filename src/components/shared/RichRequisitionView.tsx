'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { User, Calendar, Briefcase, Tag, Archive } from '@/lib/icons'

interface RichRequisitionViewProps {
  description: string | null
  fallbackPurpose?: string
  fallbackDate?: string
}

export interface RichRequisitionData {
  type: 'rich_requisition'
  header: {
    companyLogo: string
    docTitle: string
    docNo: string
    version: string
    page: string
  }
  details: {
    name: string
    department: string
    project: string
    date: string
  }
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
    remarks: string
  }>
  signatures: {
    requestedBy: string
    headOfDept: string
    approvedBy: string
    paidBy: string
  }
  generalNotes?: string
}

/** Pull a rich requisition payload out of a description, tolerating a
 *  human-readable prefix such as "[PO#: PO-2026-0472] {…json…}". */
export function extractRequisition(description?: string | null): {
  data: RichRequisitionData | null
  poNumber: string | null
} {
  if (!description) return { data: null, poNumber: null }
  const poMatch = description.match(/\[PO#:\s*([^\]]+)\]/i)
  const poNumber = poMatch ? poMatch[1].trim() : null

  const start = description.indexOf('{')
  const end = description.lastIndexOf('}')
  if (start === -1 || end <= start) return { data: null, poNumber }
  try {
    const parsed = JSON.parse(description.slice(start, end + 1))
    if (parsed && parsed.type === 'rich_requisition') {
      return { data: parsed as RichRequisitionData, poNumber }
    }
  } catch {
    /* not a rich requisition */
  }
  return { data: null, poNumber }
}

export function isRichRequisition(description?: string | null): boolean {
  return extractRequisition(description).data !== null
}

export default function RichRequisitionView({ description, fallbackDate }: RichRequisitionViewProps) {
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

  const grandTotal = richData.items.reduce((sum, item) => sum + (item.amount || 0), 0)
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
                <TableHead className="h-9 w-28 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit Price</TableHead>
                <TableHead className="h-9 w-32 px-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                <TableHead className="hidden h-9 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {richData.items.map((item, index) => (
                <TableRow key={index} className="border-border hover:bg-muted/30">
                  <TableCell className="px-3 py-2.5 text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="px-3 py-2.5 text-sm font-medium text-foreground">{item.description}</TableCell>
                  <TableCell className="px-3 py-2.5 text-center text-xs tabular-nums">{item.quantity || '—'}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-xs tabular-nums">{item.unitPrice ? formatGHS(item.unitPrice) : '—'}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums">{item.amount ? formatGHS(item.amount) : '—'}</TableCell>
                  <TableCell className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{item.remarks || '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={4} className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total (GHS)</TableCell>
                <TableCell className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-primary">{formatGHS(grandTotal)}</TableCell>
                <TableCell className="hidden md:table-cell" />
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

      {/* Signatures */}
      <div className="border-t border-border bg-muted/20 px-6 py-5">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sign-offs &amp; Approvals</p>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Signature label="Requested By" value={richData.signatures.requestedBy} caption="Employee / Initiator" />
          <Signature label="Head of Dept." value={richData.signatures.headOfDept} caption="Departmental Head" />
          <Signature label="Approved By" value={richData.signatures.approvedBy} caption="Executive Approval" />
          <Signature label="Paid By" value={richData.signatures.paidBy} caption="Finance Disbursement" />
        </div>
      </div>
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

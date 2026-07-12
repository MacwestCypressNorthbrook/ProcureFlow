'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { Document, User, Calendar, Briefcase, Tag, Archive } from '@/lib/icons'

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

export default function RichRequisitionView({ description, fallbackPurpose, fallbackDate }: RichRequisitionViewProps) {
  // Parse description as rich data if possible
  let richData: RichRequisitionData | null = null
  if (description) {
    try {
      if (description.trim().startsWith('{')) {
        const parsed = JSON.parse(description)
        if (parsed && parsed.type === 'rich_requisition') {
          richData = parsed as RichRequisitionData
        }
      }
    } catch (e) {
      // Not JSON, fallback to standard description
      console.log('Failed to parse description as JSON, using standard view:', e)
    }
  }

  // Fallback: Standard text description (styled borderless)
  if (!richData) {
    return (
      <div className="space-y-4">
        {description ? (
          <div className="rounded-2xl bg-card/45 backdrop-blur-xl p-6 shadow-sm">
            <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Archive size="14" />
              Description
            </h4>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {description}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-card/25 backdrop-blur-xl p-8 text-center text-muted-foreground text-sm font-medium">
            No description provided.
          </div>
        )}
      </div>
    )
  }

  // Format currency in GHS
  const formatGHS = (value: number) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(value)
  }

  // Calculate grand total
  const grandTotal = richData.items.reduce((sum, item) => sum + (item.amount || 0), 0)

  return (
    <div className="space-y-6">
      {/* Printable / Visual Requisition Sheet (Borderless Floating Glass Design) */}
      <div className="rounded-3xl bg-card/40 backdrop-blur-xl text-card-foreground shadow-[0_30px_80px_rgba(0,0,0,0.04)] dark:shadow-[0_30px_80px_rgba(0,0,0,0.25)] overflow-hidden relative">
        {/* Subtle decorative watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[120px] font-black text-muted/3 opacity-[0.02] select-none pointer-events-none tracking-widest uppercase">
          {richData.header.companyLogo || 'MACWEST'}
        </div>

        {/* Header Block */}
        <div className="p-8 md:p-10 border-b border-border/10 bg-muted/10 relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/85 text-primary-foreground flex items-center justify-center font-bold text-lg shadow-md shadow-primary/10">
                {richData.header.companyLogo ? richData.header.companyLogo.substring(0, 2).toUpperCase() : 'MW'}
              </div>
              <div>
                <h3 className="text-sm font-black tracking-wider text-foreground uppercase">
                  {richData.header.companyLogo || 'MACWEST'}
                </h3>
                <h2 className="text-xl font-bold tracking-tight text-primary">
                  {richData.header.docTitle || 'REQUISITION FORM'}
                </h2>
              </div>
            </div>

            {/* Header Metadata block */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs bg-card/30 backdrop-blur p-4 rounded-xl max-w-xs w-full">
              <span className="text-muted-foreground font-black uppercase tracking-wider text-[9px]">Doc No:</span>
              <span className="font-bold text-right text-foreground">{richData.header.docNo}</span>
              
              <span className="text-muted-foreground font-black uppercase tracking-wider text-[9px]">Version:</span>
              <span className="font-bold text-right text-foreground">{richData.header.version}</span>
              
              <span className="text-muted-foreground font-black uppercase tracking-wider text-[9px]">Page:</span>
              <span className="font-bold text-right text-foreground">{richData.header.page}</span>
            </div>
          </div>
        </div>

        {/* Request Details Block */}
        <div className="p-8 md:p-10 border-b border-border/10">
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-2.5">
              <User size="16" className="text-muted-foreground mt-0.5" />
              <div>
                <span className="text-[10px] font-black text-muted-foreground block uppercase tracking-wider">Request Name</span>
                <span className="text-sm font-bold text-foreground">{richData.details.name || 'Bernard Wiafe'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Briefcase size="16" className="text-muted-foreground mt-0.5" />
              <div>
                <span className="text-[10px] font-black text-muted-foreground block uppercase tracking-wider">Department</span>
                <span className="text-sm font-bold text-foreground">{richData.details.department || 'Operations'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Calendar size="16" className="text-muted-foreground mt-0.5" />
              <div>
                <span className="text-[10px] font-black text-muted-foreground block uppercase tracking-wider">Date</span>
                <span className="text-sm font-bold text-foreground font-mono">
                  {richData.details.date ? richData.details.date : (fallbackDate ? formatDate(fallbackDate) : '')}
                </span>
              </div>
            </div>

            {richData.details.project && (
              <div className="flex items-start gap-2.5 sm:col-span-2 md:col-span-3">
                <Tag size="16" className="text-muted-foreground mt-0.5" />
                <div>
                  <span className="text-[10px] font-black text-muted-foreground block uppercase tracking-wider">Project / Analytics</span>
                  <span className="text-sm font-bold text-foreground">{richData.details.project}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Table items (Borderless Design) */}
        <div className="p-8 md:p-10 overflow-x-auto">
          <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-4">Requisition Items</h4>
          <Table className="border-0">
            <TableHeader>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="w-12 text-center font-bold border-none text-[10px] uppercase tracking-wider">No.</TableHead>
                <TableHead className="font-bold border-none text-[10px] uppercase tracking-wider">Item Description</TableHead>
                <TableHead className="w-20 text-center font-bold border-none text-[10px] uppercase tracking-wider">Qty</TableHead>
                <TableHead className="w-32 text-right font-bold border-none text-[10px] uppercase tracking-wider">Unit Price</TableHead>
                <TableHead className="w-36 text-right font-bold border-none text-[10px] uppercase tracking-wider">Amount</TableHead>
                <TableHead className="font-bold border-none text-[10px] uppercase tracking-wider">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {richData.items.map((item, index) => (
                <TableRow key={index} className="hover:bg-muted/10 border-0 border-b border-border/10">
                  <TableCell className="text-center font-bold text-muted-foreground/60 border-none text-xs">{index + 1}</TableCell>
                  <TableCell className="font-medium max-w-xs break-words border-none text-sm">{item.description}</TableCell>
                  <TableCell className="text-center border-none text-xs font-semibold">{item.quantity || '—'}</TableCell>
                  <TableCell className="text-right border-none text-xs font-mono font-semibold">
                    {item.unitPrice ? formatGHS(item.unitPrice) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-black border-none text-xs font-mono">
                    {item.amount ? formatGHS(item.amount) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs border-none">{item.remarks || '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent border-none">
                <TableCell colSpan={4} className="text-right uppercase tracking-widest text-[9px] font-black text-muted-foreground pt-6 border-none">
                  Total (GHS)
                </TableCell>
                <TableCell className="text-right text-primary text-base font-black font-mono pt-6 border-none">
                  {formatGHS(grandTotal)}
                </TableCell>
                <TableCell className="border-none" />
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* General notes if any */}
        {richData.generalNotes && (
          <div className="px-8 md:px-10 pb-8">
            <div className="rounded-2xl bg-muted/10 p-5">
              <span className="text-[10px] font-black text-muted-foreground block uppercase tracking-wider mb-2">
                General Notes / Explanation
              </span>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-medium">
                {richData.generalNotes}
              </p>
            </div>
          </div>
        )}

        {/* Signatures and approvals */}
        <div className="p-8 md:p-10 bg-muted/5 border-t border-border/10">
          <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-6">Sign-offs & Approvals</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            
            {/* Req by */}
            <div className="space-y-2.5 text-center">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Requested By</span>
              <div className="h-8 flex items-center justify-center text-xs font-bold border-b border-border/30 border-dashed px-2 pb-1 text-foreground/80 font-mono">
                {richData.signatures.requestedBy || '....'}
              </div>
              <span className="text-[9px] text-muted-foreground block font-semibold uppercase tracking-wider">Employee / Initiator</span>
            </div>

            {/* Head of Dept */}
            <div className="space-y-2.5 text-center">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Head of Dept.</span>
              <div className="h-8 flex items-center justify-center text-xs font-bold border-b border-border/30 border-dashed px-2 pb-1 text-foreground/80 font-mono">
                {richData.signatures.headOfDept || '____________________'}
              </div>
              <span className="text-[9px] text-muted-foreground block font-semibold uppercase tracking-wider">Departmental Head</span>
            </div>

            {/* Approved By */}
            <div className="space-y-2.5 text-center">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Approved By</span>
              <div className="h-8 flex items-center justify-center text-xs font-bold border-b border-border/30 border-dashed px-2 pb-1 text-foreground/80 font-mono">
                {richData.signatures.approvedBy || '____________________'}
              </div>
              <span className="text-[9px] text-muted-foreground block font-semibold uppercase tracking-wider">Executive Approval</span>
            </div>

            {/* Paid By */}
            <div className="space-y-2.5 text-center">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block">Paid By</span>
              <div className="h-8 flex items-center justify-center text-xs font-bold border-b border-border/30 border-dashed px-2 pb-1 text-foreground/80 font-mono">
                {richData.signatures.paidBy || '____________________'}
              </div>
              <span className="text-[9px] text-muted-foreground block font-semibold uppercase tracking-wider">Finance Disbursement</span>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  )
}

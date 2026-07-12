'use client'

import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { ChevronRight, FileText, AlertTriangle } from 'lucide-react'
import type { PurchaseOrder } from '@/lib/types'

interface POTableProps {
  pos: PurchaseOrder[]
  hrefBase: string
  showRejection?: boolean
}

export default function POTable({ pos, hrefBase, showRejection = false }: POTableProps) {
  const router = useRouter()

  return (
    <div className="surface overflow-hidden rounded-xl">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Purchase Order
            </TableHead>
            <TableHead className="h-9 px-4 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount
            </TableHead>
            <TableHead className="hidden h-9 px-4 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">
              Qty × Rate
            </TableHead>
            <TableHead className="h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="hidden h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">
              Created
            </TableHead>
            <TableHead className="h-9 w-10 px-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pos.map((po) => (
            <TableRow
              key={po.id}
              onClick={() => router.push(`${hrefBase}/${po.id}`)}
              className="group cursor-pointer border-border last:border-0"
            >
              <TableCell className="max-w-0 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{po.purpose}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      #{po.id.slice(0, 8)}
                      {po.file_name ? ` · ${po.file_name}` : ''}
                    </p>
                    {showRejection && po.sam_rejection_reason && (
                      <p className="mt-1 flex items-center gap-1 truncate text-xs font-medium text-destructive">
                        <AlertTriangle size={11} className="shrink-0" />
                        {po.sam_rejection_reason}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(po.total_amount)}
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-right text-xs tabular-nums text-muted-foreground md:table-cell">
                {po.quantity && po.unit_rate
                  ? `${po.quantity} × ${formatCurrency(po.unit_rate)}`
                  : '—'}
              </TableCell>
              <TableCell className="px-4 py-3">
                <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
              </TableCell>
              <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                {formatDate(po.created_at)}
              </TableCell>
              <TableCell className="px-4 py-3 text-right">
                <ChevronRight
                  size={16}
                  className="text-muted-foreground/50 transition-colors group-hover:text-foreground"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

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
import { extractRequisition } from '@/components/shared/RichRequisitionView'
import { REQUEST_STATUS_CONFIG, formatDate } from '@/lib/utils'
import { ChevronRight, FileText } from 'lucide-react'

interface RequestRow {
  id: string
  purpose: string
  description?: string | null
  guest_name?: string | null
  guest_email?: string | null
  estimated_quantity?: number | null
  estimated_unit_rate?: number | null
  status: string
  created_at: string
  [key: string]: unknown
}

function itemSummary(description?: string | null): string | null {
  if (!description) return null
  const { data } = extractRequisition(description)
  if (data) {
    const count = data.items?.length ?? 0
    const first = data.items?.[0]?.description ?? ''
    return count > 1 ? `${first} +${count - 1} more` : first
  }
  return description
}

export default function RequestTable({
  requests,
  hrefBase,
}: {
  requests: RequestRow[]
  hrefBase: string
}) {
  const router = useRouter()

  return (
    <div className="surface overflow-hidden rounded-xl">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Request
            </TableHead>
            <TableHead className="hidden h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">
              Requester
            </TableHead>
            <TableHead className="hidden h-9 px-4 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">
              Est. Total
            </TableHead>
            <TableHead className="h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="hidden h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">
              Submitted
            </TableHead>
            <TableHead className="h-9 w-10 px-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((req) => {
            const summary = itemSummary(req.description)
            const estTotal =
              req.estimated_quantity && req.estimated_unit_rate
                ? req.estimated_quantity * req.estimated_unit_rate
                : null
            return (
              <TableRow
                key={req.id}
                onClick={() => router.push(`${hrefBase}/${req.id}`)}
                className="group cursor-pointer border-border last:border-0"
              >
                <TableCell className="max-w-0 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <FileText size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{req.purpose}</p>
                      {summary && (
                        <p className="truncate text-xs text-muted-foreground">{summary}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden px-4 py-3 lg:table-cell">
                  <p className="truncate text-sm text-foreground">{req.guest_name || '—'}</p>
                  {req.guest_email && (
                    <p className="truncate text-xs text-muted-foreground">{req.guest_email}</p>
                  )}
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-right text-sm tabular-nums text-foreground md:table-cell">
                  {estTotal !== null ? `$${estTotal.toLocaleString()}` : '—'}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <StatusBadge status={req.status} config={REQUEST_STATUS_CONFIG} />
                </TableCell>
                <TableCell className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                  {formatDate(req.created_at)}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <ChevronRight
                    size={16}
                    className="text-muted-foreground/50 transition-colors group-hover:text-foreground"
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { ArrowRight, User, Message } from '@/lib/icons'
import type { Request } from '@/lib/types'

interface RequestCardProps {
  request: Request
  href: string
}

export default function RequestCard({ request, href }: RequestCardProps) {
  // Parse description for clean text preview if it's rich JSON
  let displayDescription = request.description
  if (request.description && request.description.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(request.description)
      if (parsed && parsed.type === 'rich_requisition') {
        const itemDesc = parsed.items?.[0]?.description || ''
        const itemCount = parsed.items?.length || 0
        const dept = parsed.details?.department ? ` [${parsed.details.department}]` : ''
        displayDescription = itemDesc + (itemCount > 1 ? ` (and ${itemCount - 1} other items)` : '') + dept
      }
    } catch (e) {
      // Fallback to raw description
    }
  }

  const hasPo = request.has_po === true

  return (
    <Card className="group transition-all hover:shadow-md hover:border-primary/20 animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-semibold line-clamp-1">
            {request.purpose}
          </CardTitle>
          <StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />
          {hasPo && (
            <span className="rounded-full bg-emerald-500/20 text-emerald-600 text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider">
              PO attached
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {displayDescription && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {displayDescription}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {request.guest_name && (
            <span className="flex items-center gap-1">
              <User size="12" />
              {request.guest_name}
            </span>
          )}
          {request.guest_email && (
            <span className="flex items-center gap-1">
              <Message size="12" />
              {request.guest_email}
            </span>
          )}
          <span>{formatDate(request.created_at)}</span>
        </div>
        {(request.estimated_quantity || request.estimated_unit_rate) && (
          <div className="mt-2 flex items-center gap-4 text-sm">
            {request.estimated_quantity && (
              <span className="text-muted-foreground">Qty: {request.estimated_quantity}</span>
            )}
            {request.estimated_unit_rate && (
              <span className="text-muted-foreground">Unit: ${request.estimated_unit_rate}</span>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Link href={href} className="w-full">
          <Button
            variant="outline"
            size="sm"
            className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors gap-1.5"
          >
            View Details
            <ArrowRight size="14" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}

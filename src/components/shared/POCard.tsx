'use client'

import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/shared/StatusBadge'
import { PO_STATUS_CONFIG, formatQuantity } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowRight, Document } from '@/lib/icons'
import type { PurchaseOrder } from '@/lib/types'

interface POCardProps {
  po: PurchaseOrder
  href: string
  showActions?: boolean
}

export default function POCard({ po, href, showActions = true }: POCardProps) {
  return (
    <Card className="group transition-all hover:shadow-md hover:border-primary/20 animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-semibold line-clamp-1">
            {po.purpose}
          </CardTitle>
          <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {po.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {po.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold text-foreground">
            {formatCurrency(po.total_amount)}
          </span>
          {po.quantity && po.unit_rate && (
            <span className="text-muted-foreground">
              {formatQuantity(po.quantity)} &times; {formatCurrency(po.unit_rate)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {po.file_name && (
            <span className="flex items-center gap-1">
              <Document size="12" />
              {po.file_name}
            </span>
          )}
          <span>{formatDate(po.created_at)}</span>
        </div>
      </CardContent>
      {showActions && (
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
      )}
    </Card>
  )
}

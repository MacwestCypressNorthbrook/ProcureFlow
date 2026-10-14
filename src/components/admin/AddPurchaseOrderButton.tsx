'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import AttachPODrawer, { type AttachPODrawerProps } from './AttachPODrawer'

/**
 * Attach a further purchase order to a requisition that is already completed —
 * a supplier split out late, or a balance raised in Odoo as its own PO.
 */
export default function AddPurchaseOrderButton({
  requestId,
  requestSummary,
}: {
  requestId: string
  requestSummary: AttachPODrawerProps['requestSummary']
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Plus size={13} />
        Attach another PO
      </button>
      <AttachPODrawer
        isOpen={open}
        onClose={() => setOpen(false)}
        requestId={requestId}
        requestSummary={requestSummary}
        mode="append"
      />
    </>
  )
}

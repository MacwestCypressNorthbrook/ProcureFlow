import { ShoppingBag } from 'lucide-react'
import { Panel, Field } from '@/components/shared/ui-kit'
import StatusBadge from '@/components/shared/StatusBadge'
import PoDocumentActions from '@/components/shared/PoDocumentActions'
import { PO_STATUS_CONFIG, formatCurrency } from '@/lib/utils'
import type { PurchaseOrder } from '@/lib/types'
import PoRowActions from '@/components/admin/PoRowActions'

export interface PurchaseOrderDocument {
  id: string
  file_name: string
  file_url: string
  po_id?: string | null
}

/**
 * Every purchase order raised against a requisition.
 *
 * A requisition sourced from several suppliers is raised as one Odoo PO per
 * vendor, so this lists each with its own number, vendor, amount and document
 * — and a combined total once there is more than one.
 */
export default function PurchaseOrdersPanel({
  pos,
  documents,
  action,
  manageRequestId,
  requestCompleted = false,
}: {
  pos: PurchaseOrder[]
  /** PO documents; matched to their order by `po_id`. */
  documents: PurchaseOrderDocument[]
  /** Rendered in the panel header, e.g. "Attach another PO". */
  action?: React.ReactNode
  /** Set when the viewer may edit and delete these orders (the Administrator). */
  manageRequestId?: string
  requestCompleted?: boolean
}) {
  if (pos.length === 0) return null

  const combined = pos.reduce((sum, po) => sum + (Number(po.total_amount) || 0), 0)
  // Documents recorded before po_id was tracked belong to the only order there was.
  const docFor = (po: PurchaseOrder) =>
    documents.find((d) => d.po_id === po.id) ?? (pos.length === 1 ? documents.find((d) => !d.po_id) : undefined)

  return (
    <Panel
      title={pos.length > 1 ? `Purchase orders (${pos.length})` : 'Purchase order'}
      icon={<ShoppingBag size={15} />}
      action={action}
    >
      <ul className="space-y-4">
        {pos.map((po, i) => {
          const doc = docFor(po)
          return (
            <li
              key={po.id}
              className={i > 0 ? 'border-t border-border pt-4' : undefined}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="PO number">
                  <p className="text-sm font-medium text-foreground">{po.po_number ?? '—'}</p>
                </Field>
                <Field label="Vendor">
                  <p className="text-sm text-foreground">{po.vendor_name ?? '—'}</p>
                </Field>
                <Field label="Amount">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {po.total_amount != null ? formatCurrency(Number(po.total_amount) || 0) : '—'}
                  </p>
                </Field>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
                  {manageRequestId && (
                    <PoRowActions
                      requestId={manageRequestId}
                      po={{
                        id: po.id,
                        po_number: po.po_number ?? null,
                        vendor_name: po.vendor_name ?? null,
                        total_amount: po.total_amount != null ? Number(po.total_amount) : null,
                        file_name: doc?.file_name ?? po.file_name ?? null,
                      }}
                      isLastOnCompleted={requestCompleted && pos.length === 1}
                    />
                  )}
                </div>
                {doc && (
                  <PoDocumentActions documentId={doc.id} fileName={doc.file_name} fileUrl={doc.file_url} />
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {pos.length > 1 && (
        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Combined value
          </span>
          <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(combined)}</span>
        </div>
      )}
    </Panel>
  )
}

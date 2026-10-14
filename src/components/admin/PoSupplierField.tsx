'use client'

import { Input } from '@/components/ui/input'

export interface PoSupplierOption {
  id: string
  name: string
}

export interface PoSupplierValue {
  /** Set when the PO is linked to a supplier in the directory. */
  supplierId: string | null
  /** What the PO document calls the vendor. */
  vendorName: string
}

const OTHER = '__other'

/**
 * Who a purchase order is raised to.
 *
 * Picking one of the requisition's suppliers links the PO to it exactly, which
 * is what supplier coverage, PO-vs-requisitioned variance and invoice matching
 * all rely on. "Another supplier" keeps a typed name for the rare PO raised to
 * someone the requisition never named; the server still links it when the name
 * matches a supplier in the directory.
 */
export default function PoSupplierField({
  suppliers,
  value,
  onChange,
  disabled,
}: {
  suppliers: PoSupplierOption[]
  value: PoSupplierValue
  onChange: (next: PoSupplierValue) => void
  disabled?: boolean
}) {
  if (suppliers.length === 0) {
    return (
      <Input
        placeholder="Vendor name"
        value={value.vendorName}
        onChange={(e) => onChange({ supplierId: null, vendorName: e.target.value })}
        className="h-9 text-xs"
        disabled={disabled}
      />
    )
  }

  const selected = value.supplierId && suppliers.some((s) => s.id === value.supplierId) ? value.supplierId : value.vendorName ? OTHER : ''

  return (
    <div className="space-y-1.5">
      <select
        value={selected}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value
          if (next === OTHER) onChange({ supplierId: null, vendorName: '' })
          else if (!next) onChange({ supplierId: null, vendorName: '' })
          else onChange({ supplierId: next, vendorName: suppliers.find((s) => s.id === next)?.name ?? '' })
        }}
        className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Choose the supplier…</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={OTHER}>Another supplier…</option>
      </select>
      {selected === OTHER && (
        <Input
          autoFocus
          placeholder="Supplier name as on the PO"
          value={value.vendorName}
          onChange={(e) => onChange({ supplierId: null, vendorName: e.target.value })}
          className="h-9 text-xs"
          disabled={disabled}
        />
      )}
    </div>
  )
}

import { extractRequisition } from '@/lib/requisitions'
import { Package, Users, Receipt, Layers } from 'lucide-react'

export type RequisitionType = 'material' | 'labour' | 'other' | 'mixed'

export const REQUISITION_TYPE_CONFIG: Record<
  RequisitionType,
  { label: string; className: string; icon: typeof Package }
> = {
  material: {
    label: 'Materials',
    className: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400',
    icon: Package,
  },
  labour: {
    label: 'Labour',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
    icon: Users,
  },
  other: {
    label: 'Other',
    className: 'bg-teal-500/10 text-teal-600 border-teal-500/20 dark:text-teal-400',
    icon: Receipt,
  },
  mixed: {
    label: 'Mixed',
    className: 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400',
    icon: Layers,
  },
}

/** What a requisition is for, from its line items — legacy rows with no category default to Materials. */
export function requisitionType(description?: string | null): RequisitionType {
  const { data } = extractRequisition(description)
  const items = data?.items
  if (!items || items.length === 0) return 'material'
  // Anything without a category predates the field, when everything was material.
  const kinds = new Set(items.map((i) => (i.category === 'labour' || i.category === 'other' ? i.category : 'material')))
  if (kinds.size > 1) return 'mixed'
  return [...kinds][0] as RequisitionType
}

export function RequisitionTypeBadge({ type }: { type: RequisitionType }) {
  const { label, className, icon: Icon } = REQUISITION_TYPE_CONFIG[type]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>
      <Icon size={11} />
      {label}
    </span>
  )
}

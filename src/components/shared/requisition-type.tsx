import { extractRequisition } from '@/components/shared/RichRequisitionView'
import { Package, Users, Layers } from 'lucide-react'

export type RequisitionType = 'material' | 'labour' | 'mixed'

export const REQUISITION_TYPE_CONFIG: Record<
  RequisitionType,
  { label: string; className: string; icon: typeof Package }
> = {
  material: { label: 'Materials', className: 'bg-orange-500/10 text-orange-600 ', icon: Package },
  labour: { label: 'Labour', className: 'bg-blue-500/10 text-blue-700', icon: Users },
  mixed: { label: 'Mixed', className: 'bg-violet-500/20 text-violet-600 border-violet-500/20', icon: Layers },
}

/** What a requisition is for, from its line items — legacy rows with no category default to Materials. */
export function requisitionType(description?: string | null): RequisitionType {
  const { data } = extractRequisition(description)
  const items = data?.items
  if (!items || items.length === 0) return 'material'
  const hasMaterial = items.some((i) => i.category !== 'labour')
  const hasLabour = items.some((i) => i.category === 'labour')
  if (hasMaterial && hasLabour) return 'mixed'
  return hasLabour ? 'labour' : 'material'
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

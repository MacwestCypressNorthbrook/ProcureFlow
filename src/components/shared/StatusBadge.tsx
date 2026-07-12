import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface StatusBadgeProps {
  status: string
  config: Record<string, { label: string; color: string; dot: string }>
  className?: string
}

export default function StatusBadge({ status, config, className }: StatusBadgeProps) {
  const statusConfig = config[status] ?? {
    label: status,
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    dot: 'bg-gray-400',
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-medium text-xs border',
        statusConfig.color,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', statusConfig.dot)} />
      {statusConfig.label}
    </Badge>
  )
}

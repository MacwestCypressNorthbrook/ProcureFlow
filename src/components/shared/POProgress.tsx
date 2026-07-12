'use client'

import { cn } from '@/lib/utils'

interface POProgressProps {
  status: string
  className?: string
}

const steps = [
  { key: 'pending_sam', label: 'Awaiting Sam', step: 1 },
  { key: 'pending_payment', label: 'Awaiting Payment', step: 2 },
  { key: 'completed', label: 'Completed', step: 3 },
]

const revisionStep = { key: 'revision_required', label: 'Revision Required' }

export default function POProgress({ status, className }: POProgressProps) {
  const isRevision = status === 'revision_required'
  const isCancelled = status === 'cancelled'
  const currentStep = steps.findIndex((s) => s.key === status)
  const activeIndex = isRevision ? -1 : currentStep

  return (
    <div className={cn('flex items-center w-full max-w-lg', className)}>
      {steps.map((step, index) => {
        const isActive = index <= activeIndex
        const isCurrent = index === activeIndex

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'bg-muted text-muted-foreground border-2 border-border',
                  isCurrent && 'ring-4 ring-primary/20',
                  isRevision && index === 0 && 'bg-destructive text-destructive-foreground ring-4 ring-destructive/20'
                )}
              >
                {isRevision && index === 0 ? '!' : step.step}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                  isRevision && index === 0 && 'text-destructive'
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2 mb-5 transition-colors duration-300',
                  index < activeIndex ? 'bg-primary' : 'bg-border',
                  isRevision && index === 0 && 'bg-destructive/30'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

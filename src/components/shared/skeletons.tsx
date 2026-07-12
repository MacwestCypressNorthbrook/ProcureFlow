import { cn } from '@/lib/utils'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { PageContainer } from '@/components/shared/ui-kit'

/** Base shimmer block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

export function StatStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="surface grid grid-cols-2 overflow-hidden rounded-xl sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-border px-4 py-3.5 [&:not(:first-child)]:border-l">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="surface overflow-hidden rounded-xl">
      <div className="border-b border-border px-4 py-2.5">
        <Skeleton className="h-3 w-40" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="hidden h-3 w-24 sm:block" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  )
}

export function PanelSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('surface overflow-hidden rounded-xl', className)}>
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Generic list / dashboard page skeleton (stat strip + table). */
export function ListPageSkeleton({ role, title, stats = true }: { role?: string | null; title?: string; stats?: boolean }) {
  return (
    <DashboardLayout title={title ?? 'Loading…'} role={role}>
      <PageContainer className="space-y-8">
        {stats && <StatStripSkeleton count={4} />}
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <TableSkeleton />
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}

/** Detail page skeleton — header, progress bar, two-column body. */
export function DetailPageSkeleton({ role, title }: { role?: string | null; title?: string }) {
  return (
    <DashboardLayout title={title ?? 'Loading…'} role={role}>
      <PageContainer className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-8 w-full max-w-lg rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <div className="surface overflow-hidden rounded-xl">
              <div className="border-b border-border px-5 py-5">
                <Skeleton className="h-6 w-48" />
              </div>
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-3 gap-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
                <TableSkeleton rows={3} />
              </div>
            </div>
            <PanelSkeleton lines={2} />
          </div>
          <div className="space-y-6">
            <PanelSkeleton lines={2} />
            <PanelSkeleton lines={3} />
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}

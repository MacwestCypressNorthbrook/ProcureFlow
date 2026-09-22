import { DashboardSkeleton } from '@/components/shared/skeletons'

export default function Loading() {
  return <DashboardSkeleton role="superuser" title="Overview" stats={5} />
}

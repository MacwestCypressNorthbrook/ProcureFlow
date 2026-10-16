import Link from 'next/link'
import { requirePageRole } from '@/lib/auth-guard'
import QueueTable from '@/components/shared/QueueTable'
import { PageContainer } from '@/components/shared/ui-kit'
import { getStageInbox, getStageDecisions } from '@/lib/review'
import ReviewerHomeDashboard from '@/components/dashboards/ReviewerHomeDashboard'

export const dynamic = 'force-dynamic'

/**
 * Cost Control's inbox.
 *
 * What is waiting to be audited. The other half — everything this stage has
 * already decided, with the comment that travelled with it — lives at
 * `/cost-control/reviewed`, which every other role has an identical copy of.
 * It used to be a second view on this page, which meant the same record had two
 * implementations that could drift; the tab below now links to the one page.
 */
export default async function CostControlPage() {
  await requirePageRole('cost_control')

  const [pending, decisions] = await Promise.all([
    getStageInbox('cost_control'),
    getStageDecisions('cost_control', { limit: 500 }),
  ])

  const tabs = [
    { id: 'pending', label: 'Awaiting review', count: pending.length, href: '/cost-control', active: true },
    { id: 'reviewed', label: 'Reviewed', count: decisions.length, href: '/cost-control/reviewed', active: false },
  ]

  return (
    <PageContainer className="space-y-6">
      <nav
        className="flex w-fit gap-1 rounded-xl border border-border bg-card p-1"
        aria-label="Cost control views"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab.active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                tab.active ? 'bg-background/20' : 'bg-muted text-muted-foreground'
              }`}
            >
              {tab.count}
            </span>
          </Link>
        ))}
      </nav>

      <div className="space-y-4 sm:space-y-5">
        <ReviewerHomeDashboard role="cost_control" queue={pending} decisions={decisions} hrefBase="/cost-control/requests" />
      </div>

      <QueueTable rows={pending} hrefBase="/cost-control/requests" storageKey="cost-control-queue" />
    </PageContainer>
  )
}

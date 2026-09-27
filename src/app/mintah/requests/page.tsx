import { requirePageCapability } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import RequestTable from '@/components/shared/RequestTable'
import { monthSplit } from '@/components/shared/stat-presets'
import { PageContainer, SectionHeader, StatGrid, EmptyState } from '@/components/shared/ui-kit'
import { CalendarCheck, Clock, Eye, FileText } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function MintahRequestsPage() {
  await requirePageCapability('request:review')

  let allRequests: Record<string, unknown>[] = []

  try {
    // Every requisition, at whatever stage — this page exists for visibility
    // across the whole pipeline. What Supply Chain can actually act on lives
    // in /mintah/queue; the two are deliberately separate so an approved,
    // actionable requisition is never confused with one merely passing by.
    // Capped because the table paginates client-side and nobody scrolls past
    // a few hundred rows.
    allRequests = await query<Record<string, unknown>>(
      `SELECT r.*,
              pr.name AS project_name,
              (po.id IS NOT NULL) AS has_po,
              po.po_number,
              po.status AS po_status
         FROM public.requests r
         LEFT JOIN public.projects pr ON pr.id = r.project_id
         LEFT JOIN LATERAL (
              SELECT id, po_number, status
                FROM public.purchase_orders
               WHERE request_id = r.id
               ORDER BY created_at DESC
               LIMIT 1
         ) po ON true
        ORDER BY r.created_at DESC
        LIMIT 500`
    )
  } catch (err) {
    console.error('Failed to load requests from Neon:', err)
  }

  const awaitingMe = allRequests.filter((r) => r.status === 'pending_supply_chain')
  const upstream = allRequests.filter((r) => r.status === 'pending_lead')
  const month = monthSplit(allRequests.map((r) => (r.created_at as string | null) ?? null))
  const oldestRaised = allRequests
    .map((r) => new Date((r.created_at as string) ?? '').getTime())
    .filter((t) => !Number.isNaN(t))
  const oldest =
    oldestRaised.length > 0
      ? Math.max(0, Math.floor((Date.now() - Math.min(...oldestRaised)) / 86_400_000))
      : null

  return (
    <>
      <PageContainer className="space-y-6">
        <StatGrid
          stats={[
            {
              label: 'Awaiting your action',
              value: awaitingMe.length,
              icon: <Eye size={18} />,
              tone: 'amber',
              badge: awaitingMe.length > 0 ? 'Approved — needs you' : undefined,
              compare: 'Approved by the Project Lead',
              href: '/mintah/queue',
            },
            {
              label: 'Still with the Lead',
              value: upstream.length,
              icon: <FileText size={18} />,
              tone: 'blue',
              compare: 'Not approved yet — view only',
            },
            {
              label: 'Raised this month',
              value: month.thisMonth,
              icon: <CalendarCheck size={18} />,
              tone: 'emerald',
              delta: month.delta,
              compare: month.lastMonth > 0 ? `vs. ${month.lastMonth} last month` : 'No activity last month',
            },
            {
              label: 'Longest waiting',
              value: oldest ? `${oldest}d` : '—',
              icon: <Clock size={18} />,
              tone: oldest !== null && oldest > 7 ? 'red' : 'amber',
              compare: oldest !== null ? 'Since the request was raised' : 'Nothing in the queue',
            },
          ]}
        />

        <section>
          <SectionHeader title="All Requisitions — every stage" count={allRequests.length} />
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Eye size={14} className="mt-0.5 shrink-0" />
            <span>
              Visibility across the whole pipeline, at every stage — including requisitions that are not yours to act on.
              The ones the Project Lead has approved and handed to you are in{' '}
              <Link href="/mintah/queue" className="font-medium text-primary hover:underline">
                Awaiting Review
              </Link>
              . Filter by <span className="font-medium text-foreground">Status</span> to narrow this list.
            </span>
          </p>
          {allRequests.length > 0 ? (
            <RequestTable requests={allRequests as never} hrefBase="/mintah/requests" storageKey="mintah-requests" />
          ) : (
            <EmptyState icon={<FileText size={20} />} title="No requisitions yet" description="Requisitions will appear here once they are raised." />
          )}
        </section>
      </PageContainer>
    </>
  )
}

import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POTable from '@/components/shared/POTable'
import { PageContainer, SectionHeader, StatGrid, DashboardHero, EmptyState } from '@/components/shared/ui-kit'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, Clock, CheckCircle, Archive, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { PurchaseOrder } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function SamPage() {
  const user = await requirePageRole('project_lead', 'cost_control')
  let allPos: PurchaseOrder[] = []

  try {
    allPos = await query<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders ORDER BY created_at DESC`
    )
  } catch (err) {
    console.error('Failed to load POs for review from Neon:', err)
  }

  const pendingCount = allPos.filter((p) => p.status === 'pending_cost_control').length
  const revisionCount = allPos.filter((p) => p.status === 'sent_back').length
  const approvedToday = allPos.filter((p) => {
    const approvedAt = p.approved_at || p.sam_approved_at
    if (!approvedAt) return false
    const today = new Date()
    const approved = new Date(approvedAt)
    return approved.toDateString() === today.toDateString()
  }).length
  const totalReviewed = allPos.filter((p) => (p.approved_by || p.sam_approved_by) === user?.id).length
  const approvedYesterday = allPos.filter((p) => {
    const approvedAt = p.approved_at || p.sam_approved_at
    if (!approvedAt) return false
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return new Date(approvedAt).toDateString() === yesterday.toDateString()
  }).length
  const approvedDelta =
    approvedYesterday > 0 ? ((approvedToday - approvedYesterday) / approvedYesterday) * 100 : undefined

  // Must stay in step with `queue` below (pendingCount + revisionCount) —
  // a header count that disagrees with the table under it stalls approvals.
  const recentPending = allPos.filter(
    (p) => p.status === 'pending_cost_control' || p.status === 'sent_back'
  )

  const queue = pendingCount + revisionCount
  const firstName = user?.name?.split(' ')[0]

  return (
    <DashboardLayout
      title="Approvals & Review"
      subtitle="Review and approve purchase orders and requisitions"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'project_lead'}
    >
      <PageContainer className="space-y-6">
        <DashboardHero
          eyebrow="Approvals"
          title={
            queue === 0
              ? 'You are all caught up'
              : `${queue} decision${queue === 1 ? '' : 's'} waiting on you`
          }
          description={
            queue === 0
              ? firstName
                ? `Nothing needs your signature right now, ${firstName}. New purchase orders will appear here as procurement raises them.`
                : 'Nothing needs your signature right now. New purchase orders will appear here as procurement raises them.'
              : 'Each approval is timestamped and recorded against your name — sign off from any device.'
          }
          meta={[
            { label: `${pendingCount} pending`, tone: pendingCount > 0 ? 'amber' : 'emerald' },
            { label: `${revisionCount} need revision`, tone: revisionCount > 0 ? 'red' : 'slate' },
            { label: `${approvedToday} approved today`, tone: 'emerald' },
          ]}
          actions={
            queue > 0 ? (
              <Link href="/sam/pending">
                <Button className="h-10 gap-1.5 px-4">
                  Start reviewing <ArrowRight size={15} />
                </Button>
              </Link>
            ) : undefined
          }
        />

        <StatGrid
          stats={[
            {
              label: 'Pending approval',
              value: pendingCount,
              icon: <ClipboardCheck size={18} />,
              tone: 'amber',
              hint: 'Waiting for your sign-off',
              badge: pendingCount > 0 ? 'Needs action' : undefined,
              href: '/sam/pending',
            },
            {
              label: 'Needs revision',
              value: revisionCount,
              icon: <Clock size={18} />,
              tone: 'red',
              hint: 'Sent back to procurement',
              href: '/sam/revision',
            },
            {
              label: 'Approved today',
              value: approvedToday,
              icon: <CheckCircle size={18} />,
              tone: 'emerald',
              delta: approvedDelta,
              compare:
                approvedYesterday > 0
                  ? `vs. ${approvedYesterday} yesterday`
                  : 'Nothing approved yesterday',
              href: '/sam/approved',
            },
            {
              label: 'Total reviewed',
              value: totalReviewed,
              icon: <Archive size={18} />,
              tone: 'indigo',
              hint: 'Signed off by you, all time',
              href: '/sam/all',
            },
          ]}
        />

        <section>
          <SectionHeader title="Awaiting Your Review" count={recentPending.length} />
          {recentPending.length > 0 ? (
            <POTable pos={recentPending} hrefBase="/sam" showRejection compact />
          ) : (
            <EmptyState icon={<CheckCircle size={20} />} title="All caught up" description="No purchase orders awaiting your review." />
          )}
        </section>
      </PageContainer>
    </DashboardLayout>
  )
}

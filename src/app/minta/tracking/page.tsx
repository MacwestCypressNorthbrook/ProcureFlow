import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import { PageContainer, StatGrid } from '@/components/shared/ui-kit'
import { monthSplit } from '@/components/shared/stat-presets'
import { FileText, Eye, CheckCircle, XCircle } from 'lucide-react'
import TrackingClient from './TrackingClient'
import type { Request } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TrackingPage() {
  const user = await requirePageRole('engineer')
  let requests: Request[] = []

  if (user?.id) {
    try {
      requests = await query<Request>(
        `SELECT r.*, 
          CASE WHEN po.id IS NOT NULL THEN true ELSE false END AS has_po,
          po.po_number,
          po.status AS po_status
         FROM public.requests r
         LEFT JOIN public.purchase_orders po ON po.request_id = r.id
         WHERE r.created_by = $1
         ORDER BY r.created_at DESC`,
        [user.id]
      )
    } catch (err) {
      console.error('Failed to load tracking requests from Neon:', err)
    }
  }

  const inFlight = requests.filter(
    (r) => r.status === 'pending_lead' || r.status === 'pending_supply_chain'
  ).length
  const converted = requests.filter((r) => r.status === 'completed' || r.status === 'pending_finance' || r.status === 'pending_cost_control').length
  const rejected = requests.filter((r) => r.status === 'rejected').length
  const share = (n: number) => (requests.length > 0 ? n / requests.length : 0)
  const month = monthSplit(requests.map((r) => r.created_at))

  return (
    <>
      <PageContainer className="space-y-6">
        <StatGrid
          stats={[
            {
              label: 'Tracked requests',
              value: requests.length,
              icon: <FileText size={18} />,
              tone: 'indigo',
              delta: month.delta,
              compare: month.lastMonth > 0 ? `vs. ${month.lastMonth} last month` : `${month.thisMonth} raised this month`,
            },
            {
              label: 'Still in flight',
              value: inFlight,
              icon: <Eye size={18} />,
              tone: 'amber',
              share: share(inFlight),
              compare: 'Waiting on procurement or approval',
            },
            {
              label: 'Converted',
              value: converted,
              icon: <CheckCircle size={18} />,
              tone: 'emerald',
              share: share(converted),
              compare: `${Math.round(share(converted) * 100)}% reached a purchase order`,
            },
            {
              label: 'Rejected',
              value: rejected,
              icon: <XCircle size={18} />,
              tone: 'red',
              share: share(rejected),
              compare: rejected > 0 ? 'Check the notes before resubmitting' : 'Nothing rejected',
            },
          ]}
        />
        <TrackingClient requests={requests} />
      </PageContainer>
    </>
  )
}

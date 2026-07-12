import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck, Clock, CheckCircle, Archive } from 'lucide-react'
import Link from 'next/link'
import type { PurchaseOrder } from '@/lib/types'

export default async function SamPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let allPos: PurchaseOrder[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .order('created_at', { ascending: false })
    allPos = (data as PurchaseOrder[]) ?? []
  } catch {}

  const pendingCount = allPos.filter((p) => p.status === 'pending_sam').length
  const revisionCount = allPos.filter((p) => p.status === 'revision_required').length
  const approvedToday = allPos.filter((p) => {
    if (!p.sam_approved_at) return false
    const today = new Date()
    const approved = new Date(p.sam_approved_at)
    return approved.toDateString() === today.toDateString()
  }).length
  const totalReviewed = allPos.filter((p) => p.sam_approved_by === user?.id).length

  const recentPending = allPos
    .filter((p) => p.status === 'pending_sam' || p.status === 'revision_required')
    .slice(0, 6)

  return (
    <DashboardLayout
      title="Sam's Dashboard"
      subtitle="Review and approve purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-slide-up">
          <Link href="/sam/pending">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-primary/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                    <ClipboardCheck size="22" className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{pendingCount}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Pending Approval</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/sam/revision">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-red-500/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <Clock size="22" className="text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{revisionCount}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Needs Revision</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/sam/approved">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-emerald-500/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle size="22" className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{approvedToday}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Approved Today</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/sam/all">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-blue-500/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                    <Archive size="22" className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{totalReviewed}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Total Reviewed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent POs */}
        <section className="animate-slide-up">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Awaiting Your Review</h2>
            {recentPending.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {recentPending.length}
              </Badge>
            )}
          </div>
          {recentPending.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentPending.map((po) => (
                <POCard
                  key={po.id}
                  po={po}
                  href={`/sam/${po.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-12 text-center">
                <p className="text-lg font-bold text-foreground mb-2">All caught up!</p>
                <p className="text-sm text-muted-foreground">No purchase orders awaiting your review.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

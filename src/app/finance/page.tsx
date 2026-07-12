import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard, CheckCircle, DollarSign, Clock } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { PurchaseOrder } from '@/lib/types'

export default async function FinancePage() {
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

  const pendingCount = allPos.filter((p) => p.status === 'pending_payment').length
  const completedThisMonth = allPos.filter((p) => {
    if (!p.paid_at || p.status !== 'completed') return false
    const now = new Date()
    const paid = new Date(p.paid_at)
    return paid.getMonth() === now.getMonth() && paid.getFullYear() === now.getFullYear()
  }).length
  const totalProcessed = allPos.filter((p) => p.status === 'completed').length
  const totalAmount = allPos
    .filter((p) => p.status === 'completed' || p.status === 'pending_payment')
    .reduce((sum, p) => sum + (p.total_amount || 0), 0)

  const pendingPaying = allPos
    .filter((p) => p.status === 'pending_payment')
    .slice(0, 6)

  const recentlyCompleted = allPos
    .filter((p) => p.status === 'completed')
    .slice(0, 6)

  return (
    <DashboardLayout
      title="Finance Dashboard"
      subtitle="Manage and disburse payments for purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-slide-up">
          <Link href="/finance/pending">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-blue-500/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                    <CreditCard size="22" className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{pendingCount}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Pending Payment</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/finance/completed">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-emerald-500/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle size="22" className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{completedThisMonth}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Completed This Month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/finance/completed">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-purple-500/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                    <Clock size="22" className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{totalProcessed}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Total Processed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/finance/all">
            <Card className="glass-card-elevated border-border/40 hover:shadow-md hover:border-amber-500/40 transition-all duration-200 cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                    <DollarSign size="22" className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold tracking-tight">{totalAmount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground font-semibold">Total Amount</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Pending Payments */}
        <section className="mb-10 animate-slide-up">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Pending Payments</h2>
            {pendingPaying.length > 0 && (
              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-200 font-bold">
                {pendingPaying.length}
              </Badge>
            )}
          </div>
          {pendingPaying.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingPaying.map((po) => (
                <POCard
                  key={po.id}
                  po={po}
                  href={`/finance/${po.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-12 text-center">
                <p className="text-lg font-bold text-foreground mb-2">All paid up!</p>
                <p className="text-sm text-muted-foreground">No payments pending at this time.</p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Recently Completed */}
        {recentlyCompleted.length > 0 && (
          <section className="animate-slide-up">
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Recently Completed</h2>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 font-bold">
                {recentlyCompleted.length}
              </Badge>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentlyCompleted.map((po) => (
                <POCard
                  key={po.id}
                  po={po}
                  href={`/finance/${po.id}`}
                  showActions={false}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}

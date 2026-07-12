import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Clock, CheckCircle } from 'lucide-react'

export default async function FinancePage() {
  const user = await getUserFromSession()
  const supabase = await createClient()
  let pos: Record<string, unknown>[] = []
  let completedPos: Record<string, unknown>[] = []

  try {
    const [pendingRes, completedRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('status', 'pending_payment')
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('status', 'completed')
        .order('paid_at', { ascending: false })
        .limit(10),
    ])
    pos = (pendingRes.data as Record<string, unknown>[]) ?? []
    completedPos = (completedRes.data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  return (
    <DashboardLayout
      title="Finance Dashboard"
      subtitle="Verify details and disburse payments for approved purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'finance'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8 animate-slide-up stagger">
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <CreditCard size="22" className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{pos?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Awaiting Payment</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle size="22" className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{completedPos?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Recently Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Payments */}
        <section className="mb-10 animate-slide-up">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Awaiting Payment</h2>
            {pos && pos.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {pos.length}
              </Badge>
            )}
          </div>
          {pos && pos.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
              {pos.map((po) => (
                <POCard
                  key={po.id as string}
                  po={po as unknown as Parameters<typeof POCard>[0]['po']}
                  href={`/finance/${po.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-semibold">
                No POs awaiting payment.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Recently Completed */}
        {completedPos && completedPos.length > 0 && (
          <section className="animate-slide-up">
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Recently Completed</h2>
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {completedPos.length}
              </Badge>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
              {completedPos.map((po) => (
                <POCard
                  key={po.id as string}
                  po={po as unknown as Parameters<typeof POCard>[0]['po']}
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

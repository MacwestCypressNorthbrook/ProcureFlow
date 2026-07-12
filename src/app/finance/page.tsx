import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Card as CardIcon, Clock, TickCircle } from '@/lib/icons'

export default async function FinancePage() {
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
    <div className="min-h-screen mesh-gradient noise-overlay">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            Finance Dashboard
          </h1>
          <p className="text-muted-foreground">
            Process payments for approved Purchase Orders
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8 animate-slide-up stagger">
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <CardIcon size="22" color="#2563eb" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{pos?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground font-medium">Awaiting Payment</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <TickCircle size="22" color="#059669" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{completedPos?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground font-medium">Recently Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Payments */}
        <section className="mb-10 animate-slide-up scroll-reveal">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-semibold">Awaiting Payment</h2>
            {pos && pos.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10">{pos.length}</Badge>
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
              <CardContent className="p-10 text-center text-muted-foreground font-medium">
                No POs awaiting payment.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Recently Completed */}
        {completedPos && completedPos.length > 0 && (
          <section className="animate-slide-up scroll-reveal">
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-xl font-semibold">Recently Completed</h2>
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10">{completedPos.length}</Badge>
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
      </main>
    </div>
  )
}

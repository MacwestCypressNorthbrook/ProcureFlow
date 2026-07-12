import { createClient } from '@/lib/supabase/server'
import Header from '@/components/layout/Header'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardTick, Clock } from '@/lib/icons'

export default async function SamPage() {
  const supabase = await createClient()
  let pos: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .in('status', ['pending_sam', 'revision_required'])
      .order('created_at', { ascending: false })
    pos = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const pendingCount = pos?.filter((p) => p.status === 'pending_sam').length ?? 0
  const revisionCount = pos?.filter((p) => p.status === 'revision_required').length ?? 0

  return (
    <div className="min-h-screen mesh-gradient noise-overlay">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            Sam&apos;s Dashboard
          </h1>
          <p className="text-muted-foreground">
            Review and approve Purchase Orders
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8 animate-slide-up stagger">
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <ClipboardTick size="22" color="#d97706" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground font-medium">Awaiting Approval</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 elastic-hover flecto-reflect scroll-reveal">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                  <Clock size="22" color="#dc2626" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{revisionCount}</p>
                  <p className="text-xs text-muted-foreground font-medium">Needs Revision</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PO List */}
        <section className="animate-slide-up scroll-reveal">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-semibold">Purchase Orders for Review</h2>
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
                  href={`/sam/${po.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-medium">
                No Purchase Orders awaiting your review.
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  )
}

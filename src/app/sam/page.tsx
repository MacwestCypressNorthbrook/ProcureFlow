import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck, Clock } from 'lucide-react'

export default async function SamPage() {
  const user = await getUserFromSession()
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
    <DashboardLayout
      title="Sam's Dashboard"
      subtitle="Review and approve purchase orders awaiting executive sign-off"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'sam'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8 animate-slide-up stagger">
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <ClipboardCheck size="22" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Awaiting Approval</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
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
        </div>

        {/* PO List */}
        <section className="animate-slide-up">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">Purchase Orders for Review</h2>
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
                  href={`/sam/${po.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-semibold">
                No Purchase Orders awaiting your review.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

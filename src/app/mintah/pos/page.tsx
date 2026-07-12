import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Send, AlertTriangle, CheckCircle } from 'lucide-react'

export default async function MintahPOsPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let myPOs: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })

    myPOs = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const stats = {
    total: myPOs.length,
    pendingSam: myPOs.filter((po) => po.status === 'pending_sam').length,
    revision: myPOs.filter((po) => po.status === 'revision_required').length,
    completed: myPOs.filter((po) => po.status === 'completed').length,
  }

  return (
    <DashboardLayout
      title="My Purchase Orders"
      subtitle="Manage all your purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-slide-up">
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                  <ShoppingBag size="22" className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.total}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <Send size="22" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.pendingSam}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Pending Sam</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle size="22" className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.revision}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Revision Needed</p>
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
                  <p className="text-3xl font-bold tracking-tight">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PO Grid */}
        <section className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">All Purchase Orders</h2>
            {myPOs.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {myPOs.length}
              </Badge>
            )}
          </div>
          {myPOs.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {myPOs.map((po) => (
                <POCard
                  key={po.id as string}
                  po={po as unknown as Parameters<typeof POCard>[0]['po']}
                  href={`/mintah/po/${po.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-semibold">
                No purchase orders yet. Convert a request to create your first PO.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

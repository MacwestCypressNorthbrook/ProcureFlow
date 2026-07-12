import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestCard from '@/components/shared/RequestCard'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, ShoppingBag, AlertTriangle, CheckCircle } from 'lucide-react'

export default async function MintahPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let requests: Record<string, unknown>[] = []
  let myPOs: Record<string, unknown>[] = []
  let allPOs: Record<string, unknown>[] = []

  try {
    const [reqsRes, myPoRes, allPoRes] = await Promise.all([
      supabase
        .from('requests')
        .select('*')
        .in('status', ['new', 'reviewing'])
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('created_by', user?.id ?? '')
        .order('created_at', { ascending: false }),
      supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false }),
    ])
    requests = (reqsRes.data as Record<string, unknown>[]) ?? []
    myPOs = (myPoRes.data as Record<string, unknown>[]) ?? []
    allPOs = (allPoRes.data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const stats = {
    newRequests: requests?.length ?? 0,
    myPOs: myPOs?.length ?? 0,
    pendingSam: allPOs?.filter((po) => po.status === 'pending_sam').length ?? 0,
    completed: allPOs?.filter((po) => po.status === 'completed').length ?? 0,
  }

  return (
    <DashboardLayout
      title="Mintah Dashboard"
      subtitle="Review requisitions and manage purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger animate-slide-up">
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <FileText size="22" className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.newRequests}</p>
                  <p className="text-xs text-muted-foreground font-semibold">New Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                  <ShoppingBag size="22" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.myPOs}</p>
                  <p className="text-xs text-muted-foreground font-semibold">My POs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                  <AlertTriangle size="22" className="text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.pendingSam}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Awaiting Sam</p>
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
                  <p className="text-xs text-muted-foreground font-semibold">Completed POs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* New Requests */}
        <section className="mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">New Requests</h2>
            {requests && requests.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {requests.length}
              </Badge>
            )}
          </div>
          {requests && requests.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {requests.map((req) => (
                <RequestCard
                  key={req.id as string}
                  request={req as unknown as Parameters<typeof RequestCard>[0]['request']}
                  href={`/mintah/requests/${req.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center text-muted-foreground font-semibold">
                No new requests to review.
              </CardContent>
            </Card>
          )}
        </section>

        {/* My POs */}
        <section className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold tracking-tight text-foreground">My Purchase Orders</h2>
            {myPOs && myPOs.length > 0 && (
              <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                {myPOs.length}
              </Badge>
            )}
          </div>
          {myPOs && myPOs.length > 0 ? (
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
                No POs created yet. Convert a request to get started.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

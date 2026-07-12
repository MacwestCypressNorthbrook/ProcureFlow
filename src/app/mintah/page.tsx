import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestCard from '@/components/shared/RequestCard'
import POCard from '@/components/shared/POCard'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, ShoppingBag, AlertTriangle, CheckCircle, Eye } from 'lucide-react'
import Link from 'next/link'

export default async function MintahPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let incomingRequests: Record<string, unknown>[] = []
  let reviewingRequests: Record<string, unknown>[] = []
  let myPOs: Record<string, unknown>[] = []

  try {
    const [incomingRes, reviewingRes, poRes] = await Promise.all([
      supabase
        .from('requests')
        .select('*')
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('requests')
        .select('*')
        .eq('status', 'reviewing')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('purchase_orders')
        .select('*')
        .eq('created_by', user?.id ?? '')
        .order('created_at', { ascending: false }),
    ])
    incomingRequests = (incomingRes.data as Record<string, unknown>[]) ?? []
    reviewingRequests = (reviewingRes.data as Record<string, unknown>[]) ?? []
    myPOs = (poRes.data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const stats = {
    newRequests: incomingRequests.length,
    underReview: reviewingRequests.length,
    myPOs: myPOs.length,
    pendingSam: myPOs.filter((po) => po.status === 'pending_sam').length,
    completed: myPOs.filter((po) => po.status === 'completed').length,
  }

  const allIncoming = [...incomingRequests, ...reviewingRequests].slice(0, 6)
  const recentPOs = myPOs.slice(0, 6)

  return (
    <DashboardLayout
      title="Mintah Dashboard"
      subtitle="Review requisitions and manage purchase orders"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'mintah'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8 stagger animate-slide-up">
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
                  <Eye size="22" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-3xl font-bold tracking-tight">{stats.underReview}</p>
                  <p className="text-xs text-muted-foreground font-semibold">Under Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                  <ShoppingBag size="22" className="text-indigo-600 dark:text-indigo-400" />
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
                  <p className="text-xs text-muted-foreground font-semibold">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Incoming Requests */}
        <section className="mb-10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Recent Requests</h2>
              {allIncoming.length > 0 && (
                <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                  {allIncoming.length}
                </Badge>
              )}
            </div>
            <Link
              href="/mintah/requests"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View All
            </Link>
          </div>
          {allIncoming.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allIncoming.map((req) => (
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
                No incoming requests to review.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Recent POs */}
        <section className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">My Purchase Orders</h2>
              {recentPOs.length > 0 && (
                <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                  {recentPOs.length}
                </Badge>
              )}
            </div>
            <Link
              href="/mintah/pos"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View All
            </Link>
          </div>
          {recentPOs.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentPOs.map((po) => (
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

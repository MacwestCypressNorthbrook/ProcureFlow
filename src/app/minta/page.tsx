import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestCard from '@/components/shared/RequestCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, Clock, CheckCircle, Eye, XCircle, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default async function MintaPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let myRequests: Record<string, unknown>[] = []
  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })
    myRequests = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const stats = {
    total: myRequests?.length ?? 0,
    pending: myRequests?.filter((r) => r.status === 'new').length ?? 0,
    reviewing: myRequests?.filter((r) => r.status === 'reviewing').length ?? 0,
    converted: myRequests?.filter((r) => r.status === 'converted').length ?? 0,
    rejected: myRequests?.filter((r) => r.status === 'rejected').length ?? 0,
  }

  const recentRequests = myRequests.slice(0, 5)

  return (
    <DashboardLayout
      title="My Dashboard"
      subtitle="Track your submitted requisitions and their current status"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Quick Action */}
        <div className="flex items-center justify-between mb-8 animate-slide-up">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Overview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Your procurement request summary</p>
          </div>
          <Link href="/request">
            <Button className="gap-1.5">
              <Plus size="15" />
              New Request
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8 stagger animate-slide-up">
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <FileText size="18" className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{stats.total}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <FileText size="18" className="text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{stats.pending}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">New</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Eye size="18" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{stats.reviewing}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">Reviewing</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle size="18" className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{stats.converted}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">Converted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40 hover:shadow-md transition-all duration-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <XCircle size="18" className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{stats.rejected}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Requests */}
        <section className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Recent Requests</h2>
              {recentRequests.length > 0 && (
                <Badge variant="secondary" className="bg-primary/[0.06] text-primary border-primary/10 font-bold">
                  {recentRequests.length}
                </Badge>
              )}
            </div>
            {myRequests.length > 0 && (
              <Link href="/minta/requests" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                View all
                <ArrowRight size="13" />
              </Link>
            )}
          </div>

          {recentRequests.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentRequests.map((req) => (
                <RequestCard
                  key={req.id as string}
                  request={req as unknown as Parameters<typeof RequestCard>[0]['request']}
                  href={`/minta/requests/${req.id}`}
                />
              ))}
            </div>
          ) : (
            <Card className="glass-card border-border/40">
              <CardContent className="p-10 text-center">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/[0.06] mb-4">
                  <FileText size="32" className="text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4 font-semibold">
                  You haven&apos;t submitted any requests yet.
                </p>
                <Link href="/request" className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline">
                  Submit your first request
                  <span className="text-lg">→</span>
                </Link>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

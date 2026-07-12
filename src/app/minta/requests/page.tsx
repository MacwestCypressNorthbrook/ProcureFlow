import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import RequestCard from '@/components/shared/RequestCard'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Clock, Eye, CheckCircle, XCircle } from 'lucide-react'

export default async function MintaRequestsPage() {
  const user = await getUserFromSession()
  const supabase = await createClient()

  let requests: Record<string, unknown>[] = []
  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('created_by', user?.id ?? '')
      .order('created_at', { ascending: false })
    requests = (data as Record<string, unknown>[]) ?? []
  } catch {
    // DB may be unavailable
  }

  const stats = {
    total: requests.length,
    new: requests.filter((r) => r.status === 'new').length,
    reviewing: requests.filter((r) => r.status === 'reviewing').length,
    converted: requests.filter((r) => r.status === 'converted').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  }

  return (
    <DashboardLayout
      title="My Requests"
      subtitle="View and manage all your submitted requisitions"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-4 mb-8 animate-slide-up">
          <Card className="glass-card-elevated border-border/40">
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
          <Card className="glass-card-elevated border-border/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <FileText size="18" className="text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{stats.new}</p>
                  <p className="text-[10px] text-muted-foreground font-semibold">New</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card-elevated border-border/40">
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
          <Card className="glass-card-elevated border-border/40">
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
          <Card className="glass-card-elevated border-border/40">
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

        {/* Requests Grid */}
        <section className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          {requests.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {requests.map((req) => (
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
                  No requests found.
                </p>
                <a href="/request" className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline">
                  Submit your first request
                  <span className="text-lg">→</span>
                </a>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}

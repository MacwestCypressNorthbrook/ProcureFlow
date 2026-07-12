import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Card, CardContent } from '@/components/ui/card'
import { REQUEST_STATUS_CONFIG, formatDate, formatCurrency } from '@/lib/utils'
import { FileText, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const PIPELINE_STAGES = ['new', 'reviewing', 'converted'] as const

const stageColors: Record<string, { active: string; done: string; pending: string }> = {
  new: {
    active: 'bg-blue-500 text-white shadow-md',
    done: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30',
    pending: 'bg-muted/50 text-muted-foreground border border-border/40',
  },
  reviewing: {
    active: 'bg-amber-500 text-white shadow-md',
    done: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30',
    pending: 'bg-muted/50 text-muted-foreground border border-border/40',
  },
  converted: {
    active: 'bg-emerald-500 text-white shadow-md',
    done: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    pending: 'bg-muted/50 text-muted-foreground border border-border/40',
  },
}

function getStageIndex(status: string): number {
  if (status === 'new') return 0
  if (status === 'reviewing') return 1
  if (status === 'converted') return 2
  return -1
}

export default async function TrackingPage() {
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

  return (
    <DashboardLayout
      title="Track Request Status"
      subtitle="Visual pipeline of your requests through the approval workflow"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {requests.length > 0 ? (
          <div className="space-y-4 animate-slide-up">
            {requests.map((req) => {
              const status = req.status as string
              const currentIdx = getStageIndex(status)
              const isRejected = status === 'rejected'
              const isArchived = status === 'archived'

              return (
                <Link key={req.id as string} href={`/minta/requests/${req.id}`}>
                  <Card className="glass-card border-border/40 hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-pointer group">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        {/* Request Info */}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {req.purpose as string}
                          </h3>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>{formatDate(req.created_at as string)}</span>
                            {typeof req.estimated_unit_rate === 'number' && req.estimated_unit_rate && (
                              <span className="font-medium">{formatCurrency(req.estimated_unit_rate as number)}</span>
                            )}
                          </div>
                        </div>

                        {/* Pipeline */}
                        <div className="flex items-center gap-2 shrink-0">
                          {PIPELINE_STAGES.map((stage, i) => {
                            const isDone = currentIdx >= i && currentIdx !== -1
                            const isActive = currentIdx === i
                            const config = stageColors[stage]

                            return (
                              <div key={stage} className="flex items-center gap-2">
                                <div
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                    isActive
                                      ? config.active
                                      : isDone
                                        ? config.done
                                        : config.pending
                                  }`}
                                >
                                  {REQUEST_STATUS_CONFIG[stage]?.label || stage}
                                </div>
                                {i < PIPELINE_STAGES.length - 1 && (
                                  <ArrowRight size="12" className="text-muted-foreground/50" />
                                )}
                              </div>
                            )
                          })}

                          {/* Rejected state */}
                          {isRejected && (
                            <div className="flex items-center gap-2">
                              <ArrowRight size="12" className="text-muted-foreground/50" />
                              <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-500 text-white shadow-md">
                                Rejected
                              </div>
                            </div>
                          )}
                          {isArchived && (
                            <div className="flex items-center gap-2">
                              <ArrowRight size="12" className="text-muted-foreground/50" />
                              <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border/40">
                                Archived
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        ) : (
          <Card className="glass-card border-border/40">
            <CardContent className="p-10 text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/[0.06] mb-4">
                <FileText size="32" className="text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4 font-semibold">
                No requests to track yet.
              </p>
              <a href="/request" className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline">
                Submit your first request
                <span className="text-lg">→</span>
              </a>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}

import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { PageContainer, EmptyState } from '@/components/shared/ui-kit'
import { REQUEST_STATUS_CONFIG, formatDate, formatCurrency } from '@/lib/utils'
import { FileText, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const PIPELINE_STAGES = ['new', 'reviewing', 'converted'] as const

const stageColors: Record<string, { active: string; done: string; pending: string }> = {
  new: {
    active: 'bg-blue-500 text-white',
    done: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    pending: 'bg-muted text-muted-foreground',
  },
  reviewing: {
    active: 'bg-amber-500 text-white',
    done: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    pending: 'bg-muted text-muted-foreground',
  },
  converted: {
    active: 'bg-emerald-500 text-white',
    done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    pending: 'bg-muted text-muted-foreground',
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
  } catch {}

  return (
    <DashboardLayout
      title="Track Request Status"
      subtitle="Visual pipeline of your requests through the approval workflow"
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <PageContainer>
        {requests.length > 0 ? (
          <div className="surface divide-y divide-border overflow-hidden rounded-xl">
            {requests.map((req) => {
              const status = req.status as string
              const currentIdx = getStageIndex(status)
              const isRejected = status === 'rejected'
              const isArchived = status === 'archived'

              return (
                <Link
                  key={req.id as string}
                  href={`/minta/requests/${req.id}`}
                  className="group flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {req.purpose as string}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(req.created_at as string)}</span>
                      {typeof req.estimated_unit_rate === 'number' && req.estimated_unit_rate ? (
                        <span className="tabular-nums">{formatCurrency(req.estimated_unit_rate as number)}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {PIPELINE_STAGES.map((stage, i) => {
                      const isDone = currentIdx >= i && currentIdx !== -1
                      const isActive = currentIdx === i
                      const c = stageColors[stage]
                      return (
                        <div key={stage} className="flex items-center gap-1.5">
                          <span className={`rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${isActive ? c.active : isDone ? c.done : c.pending}`}>
                            {REQUEST_STATUS_CONFIG[stage]?.label || stage}
                          </span>
                          {i < PIPELINE_STAGES.length - 1 && <ArrowRight size={12} className="text-muted-foreground/40" />}
                        </div>
                      )
                    })}
                    {isRejected && (
                      <>
                        <ArrowRight size={12} className="text-muted-foreground/40" />
                        <span className="rounded-md bg-red-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Rejected</span>
                      </>
                    )}
                    {isArchived && (
                      <>
                        <ArrowRight size={12} className="text-muted-foreground/40" />
                        <span className="rounded-md bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Archived</span>
                      </>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={20} />}
            title="Nothing to track yet"
            description="Submit a request to see its progress through the pipeline."
          />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}

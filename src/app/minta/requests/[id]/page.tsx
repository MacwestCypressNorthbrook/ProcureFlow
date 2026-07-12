import { getUserFromSession, createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import StatusBadge from '@/components/shared/StatusBadge'
import { REQUEST_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { FileText, User, MessageSquare, Calendar, DollarSign, Paperclip, Clock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import RequestActions from './RequestActions'

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUserFromSession()
  const supabase = await createClient()

  let requestData: Record<string, unknown> | null = null
  let attachments: Record<string, unknown>[] = []

  try {
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('id', id)
      .single()
    requestData = data

    if (requestData) {
      const { data: attData } = await supabase
        .from('request_attachments')
        .select('*')
        .eq('request_id', id)
        .order('created_at', { ascending: true })
      attachments = (attData as Record<string, unknown>[]) ?? []
    }
  } catch {
    // DB may be unavailable
  }

  if (!requestData) {
    return (
      <DashboardLayout
        title="Request Details"
        user={user ? { name: user.name, email: user.email } : null}
        role={user?.role ?? 'minta'}
      >
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <Card className="glass-card border-border/40">
            <CardContent className="p-10 text-center">
              <p className="text-muted-foreground font-semibold">Request not found.</p>
              <Link href="/minta/requests" className="inline-flex items-center gap-1 text-primary text-sm font-semibold hover:underline mt-3">
                ← Back to requests
              </Link>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    )
  }

  const status = String(requestData.status || '')
  const canEdit = status === 'new' || status === 'reviewing'
  const canDelete = status === 'new'
  const isOwner = requestData.created_by === user?.id

  // Parse description for rich format
  let descriptionText = String(requestData.description || '')
  let richData: { details?: Record<string, unknown>; items?: Array<Record<string, unknown>>; generalNotes?: string; [key: string]: unknown } | null = null
  if (descriptionText.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(descriptionText)
      if (parsed && parsed.type === 'rich_requisition') {
        richData = parsed
        descriptionText = ''
      }
    } catch {
      // Use raw description
    }
  }

  // Build a simple timeline from status
  const timeline = [
    { label: 'Created', date: String(requestData.created_at || ''), done: true },
    { label: 'Under Review', date: status === 'reviewing' || status === 'converted' ? String(requestData.updated_at || '') : null, done: status === 'reviewing' || status === 'converted' },
    { label: 'Converted to PO', date: status === 'converted' ? String(requestData.updated_at || '') : null, done: status === 'converted' },
  ]
  if (status === 'rejected') {
    timeline.push({ label: 'Rejected', date: String(requestData.updated_at || ''), done: true })
  }

  return (
    <DashboardLayout
      title="Request Details"
      subtitle={String(requestData.purpose || '')}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'minta'}
    >
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <Link href="/minta/requests" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size="14" />
          Back to requests
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6 animate-slide-up">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-foreground truncate">{String(requestData.purpose || '')}</h2>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={status} config={REQUEST_STATUS_CONFIG} />
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar size="12" />
                {formatDate(String(requestData.created_at || ''))}
              </span>
            </div>
          </div>
          {isOwner && (canEdit || canDelete) && (
            <RequestActions requestId={id} canEdit={canEdit} canDelete={canDelete} />
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Description */}
            <Card className="glass-card border-border/40">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <FileText size="13" />
                  Description
                </h3>
                {richData ? (
                  <div className="space-y-3">
                    {richData.details && (
                      <div className="flex flex-wrap gap-4 text-xs">
                        {'department' in richData.details && typeof richData.details.department === 'string' && (
                          <span className="text-muted-foreground">Department: <strong className="text-foreground">{richData.details.department}</strong></span>
                        )}
                        {'date' in richData.details && typeof richData.details.date === 'string' && (
                          <span className="text-muted-foreground">Date: <strong className="text-foreground">{richData.details.date}</strong></span>
                        )}
                        {'project' in richData.details && typeof richData.details.project === 'string' && richData.details.project && (
                          <span className="text-muted-foreground">Project: <strong className="text-foreground">{richData.details.project}</strong></span>
                        )}
                      </div>
                    )}
                    {richData.items && Array.isArray(richData.items) && (
                      <div className="overflow-x-auto border border-border/40 rounded-lg">
                        <table className="min-w-full text-xs">
                          <thead className="bg-muted/50 border-b border-border/40">
                            <tr>
                              <th className="px-3 py-2 text-left text-muted-foreground font-semibold">#</th>
                              <th className="px-3 py-2 text-left text-muted-foreground font-semibold">Description</th>
                              <th className="px-3 py-2 text-center text-muted-foreground font-semibold">Qty</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-semibold">Unit Price</th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/30">
                            {(richData.items as Array<Record<string, unknown>>).map((item, i) => (
                              <tr key={i} className="hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2 font-medium text-muted-foreground">{i + 1}</td>
                                <td className="px-3 py-2 font-medium text-foreground">{item.description as string}</td>
                                <td className="px-3 py-2 text-center">{item.quantity as number}</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice as number)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.amount as number)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {richData.generalNotes && (
                      <p className="text-xs text-muted-foreground mt-2">{richData.generalNotes as string}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{descriptionText || 'No description provided.'}</p>
                )}
              </CardContent>
            </Card>

            {/* Attachments */}
            {attachments.length > 0 && (
              <Card className="glass-card border-border/40">
                <CardContent className="p-5">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Paperclip size="13" />
                    Attachments ({attachments.length})
                  </h3>
                  <div className="space-y-2">
                    {attachments.map((att) => (
                      <div key={att.id as string} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText size="14" className="text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{att.file_name as string}</p>
                          {typeof att.file_size === 'number' && att.file_size > 0 && (
                            <p className="text-[10px] text-muted-foreground">{(att.file_size / 1024).toFixed(1)} KB</p>
                          )}
                        </div>
                        {typeof att.file_url === 'string' && att.file_url && (
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-primary hover:underline shrink-0"
                          >
                            View
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Info Card */}
            <Card className="glass-card border-border/40">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Details</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User size="14" className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Requester:</span>
                    <span className="font-medium">{String(requestData.guest_name || '—')}</span>
                  </div>
                  {typeof requestData.guest_email === 'string' && requestData.guest_email && (
                    <div className="flex items-center gap-2 text-sm">
                      <MessageSquare size="14" className="text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{String(requestData.guest_email)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign size="14" className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Est. Cost:</span>
                    <span className="font-bold">{formatCurrency(Number(requestData.estimated_unit_rate) || 0)}</span>
                  </div>
                  {typeof requestData.estimated_quantity === 'number' && requestData.estimated_quantity > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileText size="14" className="text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Quantity:</span>
                      <span className="font-medium">{String(requestData.estimated_quantity)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card className="glass-card border-border/40">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-1.5">
                  <Clock size="13" />
                  Status Timeline
                </h3>
                <div className="space-y-0">
                  {timeline.map((step, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`h-3 w-3 rounded-full border-2 shrink-0 ${step.done ? 'bg-primary border-primary' : 'bg-background border-border/60'}`} />
                        {i < timeline.length - 1 && (
                          <div className={`w-px flex-1 min-h-[20px] ${step.done ? 'bg-primary/40' : 'bg-border/40'}`} />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className={`text-xs font-semibold ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</p>
                        {step.date && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(step.date)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

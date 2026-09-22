import { requirePageRole } from '@/lib/auth-guard'
import { query, queryOne } from '@/lib/db'
import { getRequestItems } from '@/lib/requests'
import DashboardLayout from '@/components/layout/DashboardLayout'
import StatusBadge from '@/components/shared/StatusBadge'
import DocumentList from '@/components/shared/DocumentList'
import RichRequisitionView from '@/components/shared/RichRequisitionView'
import { PageContainer, PageHeader, Panel, Field, EmptyState } from '@/components/shared/ui-kit'
import { REQUEST_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { resolveAttachments } from '@/lib/resolve-file-url'
import { FileText, Paperclip, Clock, Package } from 'lucide-react'
import Link from 'next/link'
import RequestActions from './RequestActions'

export const dynamic = 'force-dynamic'

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('engineer')

  let requestData: Record<string, unknown> | null = null
  let attachments: Record<string, unknown>[] = []
  let items: Awaited<ReturnType<typeof getRequestItems>> = []

  try {
    requestData = await queryOne<Record<string, unknown>>(
      `SELECT r.*, u.name AS requester_name, u.email AS requester_email
         FROM public.requests r
         LEFT JOIN public.users u ON u.id = r.created_by
        WHERE r.id = $1
        LIMIT 1`,
      [id]
    )
    if (requestData) {
      const attData = await query<Record<string, unknown>>(
        `SELECT * FROM public.request_attachments WHERE request_id = $1 ORDER BY created_at ASC`,
        [id]
      )
      attachments = await resolveAttachments(attData)
      items = await getRequestItems(id)
    }
  } catch (err) {
    console.error('Failed to load request detail from Neon:', err)
  }

  if (!requestData) {
    return (
      <DashboardLayout title="Request Details" user={user ? { name: user.name, email: user.email } : null} role={user?.role ?? 'engineer'}>
        <PageContainer>
          <EmptyState
            icon={<FileText size={20} />}
            title="Request not found"
            action={<Link href="/minta/requests" className="text-sm font-medium text-primary hover:underline">Back to requests</Link>}
          />
        </PageContainer>
      </DashboardLayout>
    )
  }

  const status = String(requestData.status || '')
  const canEdit = status === 'new' || status === 'pending' || status === 'reviewing' || status === 'under_review'
  const canDelete = status === 'new' || status === 'pending'
  const isOwner = requestData.created_by === user?.id

  const docs = attachments
    .filter((a) => typeof a.file_url === 'string' && a.file_url)
    .map((a) => ({
      id: String(a.id),
      file_name: String(a.file_name || 'Document'),
      file_url: String(a.file_url),
      created_at: typeof a.created_at === 'string' ? a.created_at : undefined,
    }))

  const timeline = [
    { label: 'Created', date: String(requestData.created_at || ''), done: true },
    { label: 'Under Review', date: status === 'reviewing' || status === 'under_review' || status === 'converted' ? String(requestData.updated_at || '') : null, done: status === 'reviewing' || status === 'under_review' || status === 'converted' },
    { label: 'Converted to PO', date: status === 'converted' ? String(requestData.updated_at || '') : null, done: status === 'converted' },
  ]
  if (status === 'rejected') timeline.push({ label: 'Rejected', date: String(requestData.updated_at || ''), done: true })

  return (
    <DashboardLayout
      title="Request Details"
      subtitle={String(requestData.purpose || '')}
      user={user ? { name: user.name, email: user.email } : null}
      role={user?.role ?? 'engineer'}
    >
      <PageContainer className="space-y-6">
        <PageHeader
          backHref="/minta/requests"
          backLabel="Back to requests"
          title={String(requestData.purpose || '')}
          subtitle={`Submitted ${formatDate(String(requestData.created_at || ''))}`}
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={status} config={REQUEST_STATUS_CONFIG} />
              {isOwner && (canEdit || canDelete) && <RequestActions requestId={id} canEdit={canEdit} canDelete={canDelete} />}
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main */}
          <div className="min-w-0 space-y-6">
            <RichRequisitionView
              description={String(requestData.description || '')}
              fallbackPurpose={String(requestData.purpose || '')}
              fallbackDate={String(requestData.created_at || '')}
            />

            <Panel title={`Materials${items.length ? ` (${items.length})` : ''}`} icon={<Package size={16} />}>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No material lines on this request.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Description</th>
                        <th className="py-2 px-3 text-right font-medium">Qty</th>
                        <th className="py-2 px-3 text-right font-medium">Unit price</th>
                        <th className="py-2 pl-3 text-right font-medium">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-foreground">{item.description}</p>
                            {item.supplier_name && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.supplier_name}</p>
                            )}
                            {item.remarks && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.remarks}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-foreground">
                            {Number(item.quantity)}{item.unit ? ` ${item.unit}` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-foreground">
                            {formatCurrency(Number(item.unit_price))}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-foreground">
                            {formatCurrency(Number(item.line_total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={3} className="py-2.5 pr-3 text-right text-xs font-medium text-muted-foreground">
                          Total
                        </td>
                        <td className="py-2.5 pl-3 text-right font-semibold tabular-nums text-foreground">
                          {formatCurrency(Number(requestData.total_amount) || 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title={`Attachments${docs.length ? ` (${docs.length})` : ''}`} icon={<Paperclip size={16} />}>
              <DocumentList docs={docs} emptyLabel="No attachments on this request." />
            </Panel>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Panel title="Details">
              <div className="space-y-3">
                <Field label="Requester"><p className="text-sm font-semibold text-foreground">{String(requestData.requester_name || requestData.guest_name || '—')}</p></Field>
                {Boolean(requestData.requester_email || requestData.guest_email) && (
                  <Field label="Email"><p className="text-sm font-semibold text-foreground">{String(requestData.requester_email || requestData.guest_email)}</p></Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Est. Cost"><p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(Number(requestData.estimated_unit_rate) || 0)}</p></Field>
                  {typeof requestData.estimated_quantity === 'number' && requestData.estimated_quantity > 0 && (
                    <Field label="Quantity"><p className="text-sm font-semibold tabular-nums text-foreground">{String(requestData.estimated_quantity)}</p></Field>
                  )}
                </div>
              </div>
            </Panel>

            <Panel title="Status Timeline" icon={<Clock size={16} />}>
              <div className="space-y-0">
                {timeline.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`h-3 w-3 shrink-0 rounded-full border-2 ${step.done ? 'border-primary bg-primary' : 'border-border bg-card'}`} />
                      {i < timeline.length - 1 && <div className={`min-h-[22px] w-px flex-1 ${step.done ? 'bg-primary/40' : 'bg-border'}`} />}
                    </div>
                    <div className="pb-4">
                      <p className={`text-xs font-semibold ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</p>
                      {step.date && <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(step.date)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}

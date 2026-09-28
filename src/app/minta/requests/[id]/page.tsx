import { requirePageRole, isElevated } from '@/lib/auth-guard'
import { query, queryOne } from '@/lib/db'
import { getRequestItems } from '@/lib/requests'
import StatusBadge from '@/components/shared/StatusBadge'
import DocumentList from '@/components/shared/DocumentList'
import RichRequisitionView from '@/components/shared/RichRequisitionView'
import { PageContainer, PageHeader, Panel, Field, EmptyState } from '@/components/shared/ui-kit'
import { REQUEST_STATUS_CONFIG, PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { resolveAttachments } from '@/lib/resolve-file-url'
import { FileText, Paperclip, Clock, Package, Receipt } from 'lucide-react'
import Link from 'next/link'
import RequestActions from './RequestActions'
import ApprovalPanel, { type ApprovalEntry } from '@/components/shared/ApprovalPanel'
import StageProgress from '@/components/shared/StageProgress'
import RequisitionTimeline from '@/components/shared/RequisitionTimeline'
import RemindButton from '@/components/shared/RemindButton'
import { currentStage } from '@/lib/workflow'
import type { PurchaseOrder } from '@/lib/types'
import { getPaymentPosition, listPayments } from '@/lib/payments'

export const dynamic = 'force-dynamic'

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageRole('engineer')

  let requestData: Record<string, unknown> | null = null
  let attachments: Record<string, unknown>[] = []
  let items: Awaited<ReturnType<typeof getRequestItems>> = []
  let po: PurchaseOrder | null = null
  let approvalHistory: ApprovalEntry[] = []

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
      // Independent lookups, fired together — one network round trip instead
      // of four serial ones (this used to also re-fetch the request row,
      // items and attachments a second time via getReviewBundle).
      const [attData, itemRows, poRow, historyRows] = await Promise.all([
        query<Record<string, unknown>>(
          `SELECT * FROM public.request_attachments WHERE request_id = $1 ORDER BY created_at ASC`,
          [id]
        ),
        getRequestItems(id),
        queryOne<PurchaseOrder>(
          `SELECT * FROM public.purchase_orders WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [id]
        ),
        query<ApprovalEntry>(
          `SELECT a.id, a.stage, a.action, a.comment, a.created_at, u.name AS performer_name
             FROM public.request_approvals a
             LEFT JOIN public.users u ON u.id = a.performed_by
            WHERE a.request_id = $1
            ORDER BY a.created_at DESC`,
          [id]
        ),
      ])
      attachments = await resolveAttachments(attData)
      items = itemRows
      po = poRow
      approvalHistory = historyRows
    }
  } catch (err) {
    console.error('Failed to load request detail from Neon:', err)
  }

  if (!requestData) {
    return (
      <>
        <PageContainer>
          <EmptyState
            icon={<FileText size={20} />}
            title="Request not found"
            action={<Link href="/minta/requests" className="text-sm font-medium text-primary hover:underline">Back to requests</Link>}
          />
        </PageContainer>
      </>
    )
  }

  const status = String(requestData.status || '')
  // A requisition is the requester's to change only before the first review
  // picks it up, or once a reviewer has sent it back.
  const canEdit = status === 'draft' || status === 'pending_lead' || status === 'sent_back'
  const canDelete = status === 'draft' || status === 'pending_lead'
  const isOwner =
    (requestData.created_by
      ? requestData.created_by === user?.id
      : requestData.guest_email === user?.email || user?.role === 'engineer') ||
    isElevated(user?.role)

  const payment = po ? await getPaymentPosition(po.id, Number(po.total_amount) || 0) : null
  const poPayments = po ? await listPayments(po.id) : []

  const reviewStage = currentStage(status, (requestData.sent_back_to as string | null) ?? null)

  // `estimated_unit_rate` only holds a value when a requisition has exactly one
  // line, so it reads zero for anything larger — the stored total is the figure
  // that means something. Quantity × rate is the fallback for rows raised
  // before totals were recorded.
  const storedTotal = Number(requestData.total_amount)
  const legacyTotal =
    Number(requestData.estimated_quantity) * Number(requestData.estimated_unit_rate)
  const requisitionTotal = storedTotal > 0 ? storedTotal : Number.isFinite(legacyTotal) ? legacyTotal : 0

  const docs = attachments
    .filter((a) => typeof a.file_url === 'string' && a.file_url)
    .map((a) => ({
      id: String(a.id),
      file_name: String(a.file_name || 'Document'),
      file_url: String(a.file_url),
      created_at: typeof a.created_at === 'string' ? a.created_at : undefined,
    }))


  return (
    <>
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

            <Panel title={`Materials & Labour${items.length ? ` (${items.length})` : ''}`} icon={<Package size={16} />}>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No material or labour lines on this request.</p>
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
                            <p className="font-medium text-foreground">
                              {item.category === 'labour' && (
                                <span className="mr-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600">
                                  Labour
                                </span>
                              )}
                              {item.description}
                            </p>
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

            <Panel title="Progress">
              <StageProgress
                status={status}
                sentBackTo={(requestData.sent_back_to as string | null) ?? null}
              />
            </Panel>

            {po && (
              <Panel title="Purchase Order" icon={<Receipt size={16} />}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO number</p>
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {po.po_number || 'Not yet numbered'}
                      </p>
                    </div>
                    <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="PO amount">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(Number(po.total_amount) || 0)}
                      </p>
                    </Field>
                    <Field label={payment && payment.paid > 0 && !payment.settled ? 'Outstanding' : 'Payment'}>
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {payment && payment.settled
                          ? formatDate(po.paid_at)
                          : payment && payment.paid > 0
                            ? formatCurrency(payment.outstanding)
                            : 'Not yet paid'}
                      </p>
                    </Field>
                  </div>

                  {payment && payment.paid > 0 && !payment.settled && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Part payment received
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatCurrency(payment.paid)} of {formatCurrency(payment.total)} paid.{' '}
                        {formatCurrency(payment.outstanding)} is still with Finance.
                      </p>
                    </div>
                  )}

                  {poPayments.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Payments
                      </p>
                      <ul className="space-y-1">
                        {poPayments.map((p) => (
                          <li key={p.id} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatCurrency(Number(p.amount))}
                            </span>
                            <span className="text-muted-foreground">{formatDate(p.paid_at)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Quote this PO number with Finance or Supply Chain when following up on payment.
                  </p>
                </div>
              </Panel>
            )}

            <Panel title={`Attachments${docs.length ? ` (${docs.length})` : ''}`} icon={<Paperclip size={16} />}>
              <DocumentList docs={docs} emptyLabel="No attachments on this request." />
            </Panel>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/*
              The requester acts here only when a reviewer sent it back: the
              panel carries the comment trail that explains why, and the
              resubmit that puts it back in front of them.
            */}
            <ApprovalPanel
              requestId={id}
              stage={reviewStage}
              canAct={isOwner && requestData.status === 'sent_back'}
              isRequester
              sentBack={requestData.status === 'sent_back'}
              documents={[]}
              history={approvalHistory}
              showDocuments={false}
            />

            <Panel title="Details">
              <div className="space-y-3">
                <Field label="Requester"><p className="text-sm font-semibold text-foreground">{String(requestData.requester_name || requestData.guest_name || '—')}</p></Field>
                {Boolean(requestData.requester_email || requestData.guest_email) && (
                  <Field label="Email"><p className="text-sm font-semibold text-foreground">{String(requestData.requester_email || requestData.guest_email)}</p></Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Total value">
                    <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(requisitionTotal)}</p>
                  </Field>
                  {items.length > 0 && (
                    <Field label="Lines">
                      <p className="text-sm font-semibold tabular-nums text-foreground">{items.length}</p>
                    </Field>
                  )}
                </div>
              </div>
            </Panel>

            <Panel title="Status Timeline" icon={<Clock size={16} />}>
              <RequisitionTimeline
                status={status}
                sentBackTo={(requestData.sent_back_to as string | null) ?? null}
                sentBackAt={(requestData.sent_back_at as string | null) ?? null}
                createdAt={String(requestData.created_at || '')}
                history={approvalHistory}
              />

              {isOwner && (
                <div className="mt-2 border-t border-border pt-4">
                  <RemindButton
                    requestId={id}
                    status={status}
                    sentBackTo={(requestData.sent_back_to as string | null) ?? null}
                  />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Sends an email and in-app alert to whoever is holding it. Once every 6 hours.
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </PageContainer>
    </>
  )
}

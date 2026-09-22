import Link from 'next/link'
import { notFound } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import StageProgress from '@/components/shared/StageProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import { PageContainer, PageHeader, Panel, Field } from '@/components/shared/ui-kit'
import { getReviewBundle } from '@/lib/review'
import { REQUEST_STATUS_CONFIG, PO_STATUS_CONFIG, formatCurrency, formatDate } from '@/lib/utils'
import { currentStage, STAGES, canActAt } from '@/lib/workflow'
import { isElevated } from '@/lib/roles'
import type { ResolvedUser } from '@/lib/auth/server'
import { ArrowLeft, ShoppingBag } from 'lucide-react'

/**
 * One requisition, as any stage of the chain sees it.
 *
 * Every reviewer gets the same screen — the requisition, its line items, the
 * documents and the full approval history — so nobody decides on less
 * information than the stage before them. Only the action buttons differ, and
 * they are driven by whether this user holds the current stage.
 */
export default async function StageReview({
  requestId,
  user,
  backHref,
  backLabel = 'Back to queue',
}: {
  requestId: string
  user: ResolvedUser
  backHref: string
  backLabel?: string
}) {
  const bundle = await getReviewBundle(requestId)
  if (!bundle) notFound()

  const { request, items, po, documents, history } = bundle
  const stage = currentStage(request.status, request.sent_back_to)
  const isRequester = request.created_by === user.id
  const holdsStage =
    stage === 'requester'
      ? isRequester || isElevated(user.role)
      : stage !== null && canActAt(user.role, stage)

  const total = items.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0)

  return (
    <DashboardLayout
      title={request.purpose}
      subtitle={stage ? `Currently with ${STAGES[stage].label}` : 'Closed'}
      user={{ name: user.name, email: user.email }}
      role={user.role}
    >
      <PageContainer className="space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          {backLabel}
        </Link>

        <PageHeader
          title={request.purpose}
          subtitle={
            <>
              Raised by {request.requester_name ?? request.guest_name ?? 'Unknown'} ·{' '}
              {formatDate(request.created_at)}
              {request.project_name ? ` · ${request.project_name}` : ''}
            </>
          }
          actions={<StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />}
        />

        <section className="surface rounded-xl p-4 sm:p-5">
          <StageProgress status={request.status} sentBackTo={request.sent_back_to} />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <Panel title="Requisition" bodyClassName="p-0">
              <div className="grid gap-4 border-b border-border p-4 sm:grid-cols-3">
                <Field label="Department">
                  <p className="text-sm text-foreground">{request.department ?? '—'}</p>
                </Field>
                <Field label="Project site">
                  <p className="text-sm text-foreground">{request.project_name ?? '—'}</p>
                </Field>
                <Field label="Total value">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(total || request.total_amount || 0)}
                  </p>
                </Field>
              </div>

              {items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5">Material</th>
                        <th className="w-24 px-3 py-2.5">Qty</th>
                        <th className="w-32 px-3 py-2.5">Unit price</th>
                        <th className="w-40 px-3 py-2.5">Supplier</th>
                        <th className="w-32 px-4 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-t border-border align-top">
                          <td className="px-4 py-3">
                            <p className="text-sm text-foreground">{item.description}</p>
                            {item.remarks && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.remarks}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm tabular-nums text-foreground">
                            {item.quantity} {item.unit ?? ''}
                          </td>
                          <td className="px-3 py-3 text-sm tabular-nums text-foreground">
                            {formatCurrency(Number(item.unit_price))}
                          </td>
                          <td className="px-3 py-3 text-sm text-muted-foreground">
                            {item.supplier_name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-foreground">
                            {formatCurrency(Number(item.line_total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  {request.description ?? 'No line items were recorded.'}
                </p>
              )}
            </Panel>

            {po && (
              <Panel title="Purchase order" icon={<ShoppingBag size={15} />}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="PO number">
                    <p className="text-sm font-medium text-foreground">{po.po_number ?? '—'}</p>
                  </Field>
                  <Field label="Vendor">
                    <p className="text-sm text-foreground">{po.vendor_name ?? '—'}</p>
                  </Field>
                  <Field label="Amount">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(Number(po.total_amount) || 0)}
                    </p>
                  </Field>
                </div>
                <div className="mt-4">
                  <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
                </div>
              </Panel>
            )}

            {request.notes && (
              <Panel title="Requester's notes">
                <p className="text-sm leading-relaxed text-muted-foreground">{request.notes}</p>
              </Panel>
            )}
          </div>

          <div className="space-y-6">
            <ApprovalPanel
              requestId={request.id}
              stage={stage}
              canAct={holdsStage}
              isRequester={stage === 'requester'}
              sentBack={request.status === 'sent_back'}
              documents={documents}
              history={history}
            />
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}

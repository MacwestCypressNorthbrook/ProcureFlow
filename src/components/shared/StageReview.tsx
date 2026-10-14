import Link from 'next/link'
import { notFound } from 'next/navigation'
import ApprovalPanel from '@/components/shared/ApprovalPanel'
import RecordPaymentPanel from '@/components/shared/RecordPaymentPanel'
import { getPaymentPosition, listPayments } from '@/lib/payments'
import StageProgress from '@/components/shared/StageProgress'
import StatusBadge from '@/components/shared/StatusBadge'
import PurchaseOrdersPanel from '@/components/shared/PurchaseOrdersPanel'
import SupplierBreakdownPanel, { vendorKey } from '@/components/shared/SupplierBreakdownPanel'
import AddPurchaseOrderButton from '@/components/admin/AddPurchaseOrderButton'
import MaterialsPricingPanel from '@/components/shared/MaterialsPricingPanel'
import { PageContainer, PageHeader, Panel, Field } from '@/components/shared/ui-kit'
import { getReviewBundle } from '@/lib/review'
import { extractRequisition } from '@/lib/requisitions'
import { query } from '@/lib/db'
import type { SupplierOption } from '@/components/shared/SupplierPicker'
import { REQUEST_STATUS_CONFIG, formatCurrency, formatDate, cn } from '@/lib/utils'
import { currentStage, STAGES, canActAt } from '@/lib/workflow'
import { isElevated, can } from '@/lib/roles'
import { UrgentBadge, UrgentBanner } from '@/components/shared/UrgentBadge'
import type { ResolvedUser } from '@/lib/auth/server'
import RecordNavigator from '@/components/shared/RecordNavigator'
import SupplierInvoicesPanel, { type InvoiceSupplier } from '@/components/shared/SupplierInvoicesPanel'
import { getRequestInvoices } from '@/lib/supplier-invoices'
import { ArrowLeft, ShoppingBag, RotateCcw, CheckCircle2, StickyNote, Calculator } from 'lucide-react'
import {
  CostControlInvoicesSection,
  CostControlAuditTable,
} from '@/components/cost-control/CostControlAuditSection'

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
  queueBase = backHref,
}: {
  requestId: string
  user: ResolvedUser
  backHref: string
  backLabel?: string
  /** The queue's route, where the Previous / Next order was recorded. Defaults to `backHref`. */
  queueBase?: string
}) {
  const bundle = await getReviewBundle(requestId)
  if (!bundle) notFound()

  const { request, items, po, pos, documents, history } = bundle
  const stage = currentStage(request.status, request.sent_back_to)
  const isRequester = request.created_by === user.id
  const holdsStage =
    stage === 'requester'
      ? isRequester || isElevated(user.role)
      : stage !== null && canActAt(user.role, stage)

  // Supply Chain is the one stage that edits money on the requisition — every
  // other stage only ever reads what's here.
  const canEditPricing = stage === 'supply_chain' && holdsStage
  const suppliers = canEditPricing
    ? await query<SupplierOption>(
      `SELECT id, name, category, contact_name, phone
           FROM public.suppliers
          WHERE is_active
          ORDER BY name ASC`
    )
    : []

  // Once a purchase order exists, every stage from here on can see how much of
  // it has actually been disbursed — Finance is the only one that can add to it.
  const payment = po ? await getPaymentPosition(po.id, Number(po.total_amount) || 0) : null
  const payments = po ? await listPayments(po.id) : []
  const canPay = stage === 'finance' && holdsStage

  // Supplier invoices: who the requisition asks to supply, against what has been
  // invoiced. `null` means migration 016 is not applied, so the panel stays out.
  const invoices = await getRequestInvoices(requestId)
  const invoiceSuppliers: InvoiceSupplier[] = []
  for (const item of items) {
    if (!item.supplier_id) continue
    const found = invoiceSuppliers.find((s) => s.id === item.supplier_id)
    const amount = Number(item.line_total) || 0
    if (found) found.requisitioned += amount
    else invoiceSuppliers.push({ id: item.supplier_id, name: item.supplier_name ?? 'Supplier', requisitioned: amount })
  }
  const canRecordInvoice =
    holdsStage && can(user.role, 'invoice:record') && (stage === 'supply_chain' || stage === 'cost_control' || isElevated(user.role))

  /**
   * Does the right-hand rail have anything in it?
   *
   * It carries the decision panel and the payment position. A reader who does
   * not hold this stage gets neither, leaving a single collapsed history card
   * marooned in a 368px column beside a full page of content. When that is the
   * case the layout drops to one column and the history falls to the bottom at
   * full width, so the space goes to the material instead of to a void.
   */
  const railHasDecision = holdsStage || Boolean(po && payment)
  const twoColumn = cn(
    'grid gap-6 2xl:gap-8',
    railHasDecision && 'lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_368px]'
  )
  const railClass = cn('space-y-6', railHasDecision && 'lg:sticky lg:top-20 lg:self-start')

  const subtotal = items.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0)
  const discountAmount = Number(request.discount_amount) || 0
  const total = Math.max(0, subtotal - discountAmount)
  const suggestedSupplier =
    items.find((i) => i.supplier_name)?.supplier_name ??
    ((request as unknown as Record<string, unknown>).vendor_name as string | undefined) ??
    ''
  const poDocs = documents.filter((d) => d.source === 'po')
  const supplierSplits = invoiceSuppliers.map((s) => ({ name: s.name, amount: s.requisitioned }))
  const requestSummary = {
    purpose: request.purpose,
    department: request.department ?? undefined,
    projectName: request.project_name ?? undefined,
    totalAmount: Number(total || request.total_amount || 0),
    currency: request.currency ?? 'GHS',
    suggestedSupplier,
    itemCount: items.length,
    supplierSplits,
  }
  // A completed requisition can still take further purchase orders — a
  // supplier split out late — from whoever raises them.
  const canAppendPo = request.status === 'completed' && can(user.role, 'request:convert')
  // Attached orders stay correctable — edit, re-upload, delete — while the
  // requisition is with the Administrator or after they closed it.
  const canManagePo =
    (request.status === 'pending_admin' || request.status === 'completed') && can(user.role, 'request:convert')
  // Adding to a closed requisition starts from the suppliers no PO covers yet.
  const uncoveredSplits = supplierSplits.filter(
    (s) => !pos.some((po) => vendorKey(po.vendor_name) === vendorKey(s.name))
  )
  const purchaseOrders = (
    <PurchaseOrdersPanel
      pos={pos}
      documents={poDocs}
      manageRequestId={canManagePo ? request.id : undefined}
      requestCompleted={request.status === 'completed'}
      action={
        canAppendPo ? (
          <AddPurchaseOrderButton
            requestId={request.id}
            requestSummary={{ ...requestSummary, supplierSplits: uncoveredSplits }}
          />
        ) : undefined
      }
    />
  )
  const supplierNames = supplierSplits.map((s) => s.name)
  const isSentBackToSupplyChain = request.status === 'sent_back' && request.sent_back_to === 'supply_chain'
  const lastReturnEntry = history.find((h) => h.action === 'sent_back')
  const acceptedInvoices = documents.filter((d) => d.status === 'accepted')
  const declinedInvoices = documents.filter((d) => d.status === 'declined')

  // `requests.description` normally holds a rich-requisition JSON document, not
  // prose. The line items panel already renders its contents, so only the
  // author's own notes are worth showing as text — printing the raw payload put
  // a wall of JSON on the page.
  const richDoc = extractRequisition(request.description)

  /**
   * The requester's justification, from wherever it actually lives.
   *
   * The new-request form writes it into the rich-requisition document as
   * `generalNotes`; it never populates `requests.notes`, which is only set on
   * older rows. Reading `request.notes` alone meant the note rendered for
   * nobody — so check both, newest storage first.
   */
  const requesterNote = request.notes?.trim() || richDoc.data?.generalNotes?.trim() || null

  /**
   * A plain-text description, for rows that predate the rich document. For a
   * rich requisition the line items panel already renders its contents and its
   * prose IS the note above, so there is nothing left to show separately.
   */
  const descriptionText = richDoc.data ? null : request.description?.trim() || null

  const isUrgent = request.is_urgent === true
  // Only the Project Lead escalates, and only while the requisition is still
  // theirs — see `request:urgent` in lib/roles.ts.
  const canEscalate = stage === 'lead' && holdsStage && can(user.role, 'request:urgent')

  // Supply Chain is the stage that puts a number on the requisition. Once it
  // has, every other stage — the Project Lead above all, who justified the work
  // before anyone had priced it — wants to see what it came to. The panel is
  // therefore shown to everyone EXCEPT Supply Chain, who are already editing
  // these numbers in the table below and do not need them repeated.
  const pricedLines = items.filter((i) => Number(i.unit_price) > 0)
  const isPriced = pricedLines.length > 0
  const showValuation = isPriced && stage !== 'supply_chain'
  const pricedBy = history.find((h) => h.stage === 'supply_chain' && h.action === 'approved')

  return (
    <>
      <PageContainer className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={14} />
            {backLabel}
          </Link>
          <RecordNavigator base={queueBase} currentId={request.id} />
        </div>

        <PageHeader
          title={request.purpose}
          subtitle={
            <>
              {stage ? `Currently with ${STAGES[stage].label}` : 'Closed'} · Raised by{' '}
              {request.requester_name ?? request.guest_name ?? 'Unknown'} ·{' '}
              {formatDate(request.created_at)}
              {request.project_name ? ` · ${request.project_name}` : ''}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {isUrgent && <UrgentBadge />}
              <StatusBadge status={request.status} config={REQUEST_STATUS_CONFIG} />
            </div>
          }
        />

        {/* Escalation and position on the chain are both "where does this
            stand" — they belong on one line rather than as two stacked bands
            pushing the material down the page. Without an escalation the
            timeline is wayfinding only, so it loses the card. */}
        {isUrgent ? (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <UrgentBanner
              className="lg:flex-1"
              reason={request.urgent_reason}
              markedBy={request.urgent_marked_by_name}
              markedAt={request.urgent_marked_at}
            />
            <nav
              aria-label="Approval stage"
              className="flex items-center overflow-x-auto rounded-2xl border border-border bg-card px-4 py-3 lg:w-auto lg:shrink-0"
            >
              <StageProgress status={request.status} sentBackTo={request.sent_back_to} />
            </nav>
          </div>
        ) : (
          <nav aria-label="Approval stage" className="-mt-2 overflow-x-auto pb-1">
            <StageProgress status={request.status} sentBackTo={request.sent_back_to} />
          </nav>
        )}

        <SupplierBreakdownPanel
          items={items}
          pos={pos}
          showPoCoverage={request.status === 'pending_admin' || request.status === 'completed'}
        />

        {stage === 'supply_chain' && holdsStage && (
          <div className="space-y-4">
            {isSentBackToSupplyChain ? (
              <div className="rounded-xl border border-orange-500/35 bg-orange-500/[0.05] p-4 sm:p-5 text-sm shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400">
                    <RotateCcw size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-foreground text-sm sm:text-base">
                        Action Required: Returned by Cost Control
                      </h3>
                      <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 dark:text-orange-300">
                        Revision Needed
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cost Control ({lastReturnEntry?.performer_name || 'Cost Control'}) returned this requisition for rate or invoice revisions on {formatDate(lastReturnEntry?.created_at || request.updated_at)}.
                    </p>

                    {lastReturnEntry?.comment && (
                      <div className="mt-2.5 rounded-lg border border-orange-500/25 bg-background/80 p-3 text-xs">
                        <span className="font-semibold text-orange-700 dark:text-orange-400">Cost Control Return Feedback:</span>
                        <p className="mt-1 italic text-foreground leading-relaxed">&ldquo;{lastReturnEntry.comment}&rdquo;</p>
                      </div>
                    )}

                    <p className="mt-2.5 text-xs text-foreground font-medium">
                      👉 Update line item rates or renegotiate discounts in the table below, replace any rejected quotes in the Documents panel, then click <strong>&ldquo;Resubmit to Cost Control&rdquo;</strong>.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4 sm:p-5 text-sm">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <ShoppingBag size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">Supply Chain Pricing & Quotations</h3>
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        Supply Chain Review
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      Enter unit pricing for each line item below, apply any supplier discounts, and attach supporting vendor invoices/quotations in the right-hand panel. Once pricing is saved and invoices are attached, approve to forward directly to Cost Control.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {suggestedSupplier && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-foreground shadow-xs">
                          <span className="text-muted-foreground">Supplier:</span> <strong className="font-semibold">{suggestedSupplier}</strong>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-foreground shadow-xs">
                        <span className="text-muted-foreground">Calculated Total:</span> <strong className="font-semibold">{formatCurrency(total || request.total_amount || 0)}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-foreground shadow-xs">
                        <span className="text-muted-foreground">Line Items:</span> <strong className="font-semibold">{items.length} item{items.length === 1 ? '' : 's'}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cost Control Invoice Decisions Showcase for Supply Chain */}
            {(acceptedInvoices.length > 0 || declinedInvoices.length > 0) && (
              <div className="rounded-xl border border-border bg-card p-4 text-xs shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                    <h4 className="font-bold text-foreground text-sm">
                      Cost Control Invoice Audit Status
                    </h4>
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {acceptedInvoices.length} Accepted • {declinedInvoices.length} Declined
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {acceptedInvoices.map((doc) => (
                    <div key={doc.id} className="flex flex-col gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-2.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate font-bold text-foreground text-xs" title={doc.file_name}>
                          {doc.file_name}
                        </span>
                        <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          Accepted
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Acknowledged by <strong className="text-foreground">{doc.reviewer_name || 'Cost Control'}</strong>
                      </p>
                    </div>
                  ))}

                  {declinedInvoices.map((doc) => (
                    <div key={doc.id} className="flex flex-col gap-1 rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-2.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate font-bold text-foreground text-xs" title={doc.file_name}>
                          {doc.file_name}
                        </span>
                        <span className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          Declined
                        </span>
                      </div>
                      {doc.review_notes && (
                        <p className="text-[11px] text-rose-700 dark:text-rose-300 italic">
                          Reason: {doc.review_notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {stage === 'admin' && holdsStage && (
          <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4 sm:p-5 text-sm">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShoppingBag size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">Final authorization</h3>
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    Last stage
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  This requisition has cleared the Project Lead, Supply Chain and Cost Control — you are the last stage. Review the materials and the audited rates below, generate the Purchase Order in <strong>Odoo</strong>, then attach the PDF and its reference in the panel on the right. That authorizes the requisition, closes it, and notifies everyone who worked on it.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {supplierNames.length > 0 && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-foreground shadow-xs"
                      title={supplierNames.join(', ')}
                    >
                      <span className="text-muted-foreground">
                        {supplierNames.length > 1 ? `${supplierNames.length} suppliers:` : 'Supplier:'}
                      </span>{' '}
                      <strong className="font-semibold">
                        {supplierNames.slice(0, 3).join(', ')}
                        {supplierNames.length > 3 ? ` +${supplierNames.length - 3}` : ''}
                      </strong>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-foreground shadow-xs">
                    <span className="text-muted-foreground">Grand Total:</span> <strong className="font-semibold">{formatCurrency(total || request.total_amount || 0)}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1 text-foreground shadow-xs">
                    <span className="text-muted-foreground">Items:</span> <strong className="font-semibold">{items.length} line item{items.length === 1 ? '' : 's'}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 'cost_control' ? (
          <div className="space-y-6">
            {/*
              Materials on the left, documents in a column beside them.

              Stacked, a forty-line requisition pushed the vendor invoices off
              the bottom of the screen — and those two things are read together:
              you check a rate against the quote it came from. Side by side, the
              documents stay put however long the table grows. The decision sits
              under them, so everything the reviewer acts on is in one column.
            */}
            {/*
              Three tracks, in the order the work is done: what is being
              authorized, what it is being authorized against, and the call.

              Below `lg` they stack in that same reading order. At `lg` the
              decision takes a fixed column and spans both rows, with the
              materials above the documents beside it. At `2xl` there is room
              for all three side by side, so the documents move up into the
              middle track — that is the width where the materials table stops
              having to share a column with anything.

              Explicit placement rather than DOM order, so one set of markup
              serves all three arrangements.
            */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 2xl:gap-8">
              <div className="min-w-0 space-y-6 lg:col-span-8 lg:col-start-1 lg:row-start-1 2xl:col-span-6">
                <CostControlAuditTable
                  items={items}
                  notes={requesterNote}
                  discountAmount={discountAmount}
                  totalAmount={total || request.total_amount || 0}
                />
              </div>

              <div className="min-w-0 space-y-6 lg:col-span-8 lg:col-start-1 lg:row-start-2 2xl:col-span-3 2xl:col-start-7 2xl:row-start-1">
                <CostControlInvoicesSection
                  requestId={request.id}
                  documents={documents}
                  canAct={holdsStage}
                  department={request.department}
                  projectName={request.project_name}
                  compact
                />
              </div>

              {/*
                The decision stays pinned. Sticking the whole column does not
                work once it is taller than the viewport — the primary action
                just scrolls away with everything else. Pinning this panel on
                its own keeps "Approve to Administration" in view at all times.
              */}
              <div
                id="decision"
                className="flex scroll-mt-24 flex-col gap-6 lg:sticky lg:top-20 lg:z-10 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:row-span-2 2xl:col-span-3 2xl:col-start-10 2xl:row-span-1"
              >
                <ApprovalPanel
                  requestId={request.id}
                  stage={stage}
                  canAct={holdsStage}
                  queueBase={queueBase}
                  isRequester={false}
                  sentBack={request.status === 'sent_back'}
                  documents={documents}
                  history={history}
                  po={po}
                  showDocuments={false}
                  showHistory={false}
                  requestSummary={requestSummary}
                  isUrgent={isUrgent}
                  canEscalate={canEscalate}
                />

                {po && payment && (
                  <RecordPaymentPanel
                    poId={po.id}
                    total={payment.total}
                    paid={payment.paid}
                    outstanding={payment.outstanding}
                    payments={payments.map((p) => ({
                      id: p.id,
                      amount: Number(p.amount),
                      reference: p.reference,
                      note: p.note,
                      paid_at: String(p.paid_at),
                      paid_by_name: p.paid_by_name,
                    }))}
                    canPay={canPay}
                  />
                )}
              </div>
            </div>

            {/*
              Phone and tablet: the decision is at the end of a long page, so a
              bar pinned to the bottom edge keeps it one tap away — the iOS
              toolbar pattern. From `lg` the rail's pinned panel does this job
              and the bar is hidden. Only shown to whoever holds the stage.
            */}
            {holdsStage && (
              <>
                <div aria-hidden className="h-20 lg:hidden" />
                <div
                  className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 px-4 pt-3 backdrop-blur-xl lg:hidden pointer-fine:md:left-[116px]"
                  style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
                >
                  <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-muted-foreground">Authorizing</p>
                      <p className="truncate text-base font-semibold tabular-nums text-foreground">
                        {formatCurrency(Number(total || request.total_amount || 0))}
                      </p>
                    </div>
                    <a
                      href="#decision"
                      className="inline-flex h-11 shrink-0 items-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                    >
                      Review &amp; decide
                    </a>
                  </div>
                </div>
              </>
            )}

            {/* The record, at the foot of the page. */}
            <ApprovalPanel
              requestId={request.id}
              stage={stage}
              canAct={false}
              isRequester={false}
              documents={documents}
              history={history}
              po={po}
              showDocuments={false}
            />

            {purchaseOrders}
          </div>
        ) : (
          /*
            The reviewer's eye goes to the materials and the requester's notes —
            those two decide the outcome, and everything else is reference. So
            the main column takes every pixel the decision rail does not need:
            the rail is fixed at a readable width rather than a proportion, and
            it sticks, so scrolling a forty-line requisition never scrolls the
            approve button off the screen. Below `lg` the rail drops underneath
            and both run full width.
          */
          <div className={twoColumn}>
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

                {requesterNote && (
                  <div className="border-b border-border bg-muted/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Requester&rsquo;s note
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {requesterNote}
                    </p>
                  </div>
                )}

                {items.length > 0 ? (
                  <MaterialsPricingPanel
                    requestId={request.id}
                    items={items}
                    suppliers={suppliers}
                    discountAmount={discountAmount}
                    canEdit={canEditPricing}
                  />
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    {request.description ?? 'No line items were recorded.'}
                  </p>
                )}
              </Panel>

              {/* {showValuation && (
                <Panel
                  title="Supply Chain valuation"
                  icon={<Calculator size={15} />}
                  bodyClassName="p-0"
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      What Supply Chain priced this requisition at
                      {pricedBy?.performer_name ? ` (${pricedBy.performer_name})` : ''}
                      {pricedBy?.created_at ? ` on ${formatDate(pricedBy.created_at)}` : ''}.
                    </p>
                  </div>
                  <div className="grid gap-px bg-border sm:grid-cols-3">
                    <div className="bg-card p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Lines priced
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {pricedLines.length}
                        <span className="text-sm font-normal text-muted-foreground"> of {items.length}</span>
                      </p>
                    </div>
                    <div className="bg-card p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Subtotal
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {formatCurrency(subtotal)}
                      </p>
                      {discountAmount > 0 && (
                        <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          less {formatCurrency(discountAmount)} discount
                        </p>
                      )}
                    </div>
                    <div className="bg-card p-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Computed total
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(total || request.total_amount || 0)}
                      </p>
                      {suggestedSupplier && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={suggestedSupplier}>
                          {suggestedSupplier}
                        </p>
                      )}
                    </div>
                  </div>
                </Panel>
              )} */}

              {purchaseOrders}

              {descriptionText && items.length > 0 && (
                <Panel title="Description" icon={<StickyNote size={15} />}>
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                    {descriptionText}
                  </p>
                </Panel>
              )}
            </div>

            {/* Sticks below the 64px header so the decision is always reachable. */}
            <div className={railClass}>
              {po && payment && (
                <RecordPaymentPanel
                  poId={po.id}
                  total={payment.total}
                  paid={payment.paid}
                  outstanding={payment.outstanding}
                  payments={payments.map((p) => ({
                    id: p.id,
                    amount: Number(p.amount),
                    reference: p.reference,
                    note: p.note,
                    paid_at: String(p.paid_at),
                    paid_by_name: p.paid_by_name,
                  }))}
                  canPay={canPay}
                />
              )}

              <ApprovalPanel
                requestId={request.id}
                stage={stage}
                canAct={holdsStage}
                queueBase={queueBase}
                isRequester={stage === 'requester'}
                sentBack={request.status === 'sent_back'}
                documents={documents}
                history={history}
                po={po}
                showDocuments={true}
                requestSummary={requestSummary}
                isUrgent={isUrgent}
                canEscalate={canEscalate}
              />
            </div>
          </div>
        )}

        {invoices && (invoiceSuppliers.length > 0 || invoices.length > 0) && (
          <SupplierInvoicesPanel
            requestId={request.id}
            invoices={invoices}
            suppliers={invoiceSuppliers}
            documents={documents.filter((d) => d.source === 'request').map((d) => ({ id: d.id, file_name: d.file_name }))}
            canRecord={canRecordInvoice}
            canVerify={can(user.role, 'invoice:verify')}
            viewerId={user.id}
            viewerIsElevated={isElevated(user.role)}
          />
        )}
      </PageContainer>
    </>
  )
}


/**
 * ProcureFlow transactional email.
 *
 * One template, themed per event. Everything is table-based with inline styles
 * because that is the only thing Outlook, Gmail's clipper and Apple Mail all
 * agree on — no flexbox, no grid, no external stylesheet, no web fonts.
 *
 * The layout is fixed and the theme is the only thing that moves: a coloured
 * hero, a set of key facts, the line items, whatever the reviewer said, the
 * chain strip showing where the requisition now sits, and one call to action.
 * Every event therefore reads the same way, which is the point — someone who
 * has seen one of these can read all of them at a glance.
 */

export type WorkflowEventType =
  /** A requisition has landed at a stage and is waiting on them. */
  | 'requisition_submitted'
  /** Project Lead escalation — bypasses the bundled digest. */
  | 'urgent_escalation'
  /** A purchase order was attached to the requisition. */
  | 'po_attached'
  | 'po_approved'
  | 'po_sent_back'
  /** Cost Control picked this vendor invoice. */
  | 'invoice_accepted'
  /** Cost Control rejected this vendor invoice. */
  | 'invoice_declined'
  /** A vendor invoice was received and logged against the requisition. */
  | 'invoice_acknowledged'
  /** Administration closed the requisition — the end of the chain. */
  | 'requisition_completed'
  | 'payment_complete'
  | 'converted'

export interface WorkflowItemLine {
  description: string
  quantity: number | string
  unit?: string | null
  unit_price?: number | string | null
  line_total?: number | string | null
}

/** A document named in the email, with whatever Cost Control decided about it. */
export interface WorkflowDocumentLine {
  file_name: string
  status?: 'pending' | 'accepted' | 'declined' | null
  reviewer_name?: string | null
  review_notes?: string | null
}

/** One step of the chain strip. */
export interface WorkflowChainStep {
  label: string
  state: 'done' | 'here' | 'waiting'
}

export interface WorkflowEmailData {
  eventType: WorkflowEventType
  recipientName?: string | null
  recipientRole?: string | null

  // Requisition context
  requestId: string
  requestPurpose: string
  requestDescription?: string | null
  department?: string | null
  projectName?: string | null
  projectLocation?: string | null
  requesterName?: string | null
  requesterEmail?: string | null
  requestDate?: string | Date | null
  /** The requester's own notes — often the part that actually explains the ask. */
  notes?: string | null

  // Escalation
  isUrgent?: boolean | null
  urgentReason?: string | null

  // Purchase order context
  poId?: string | null
  poNumber?: string | null
  vendorName?: string | null
  totalAmount?: number | null
  currency?: string | null
  quantity?: number | string | null
  unitRate?: number | string | null
  discountAmount?: number | null

  items?: WorkflowItemLine[]
  documents?: WorkflowDocumentLine[]
  /** Where the requisition sits, rendered as a strip under the summary. */
  chain?: WorkflowChainStep[]

  // Decision details
  performerName?: string | null
  performerRole?: string | null
  performerEmail?: string | null
  actionTimestamp?: string | Date | null
  comments?: string | null
  /** The stage the requisition is now waiting on, when that is the news. */
  awaitingStageLabel?: string | null

  actionUrl: string
}

/* ============================================================
   Primitives
   ============================================================ */

const INK = '#0f172a'
const BODY = '#334155'
const MUTED = '#64748b'
const FAINT = '#94a3b8'
const LINE = '#e2e8f0'
const WASH = '#f8fafc'
const PAGE = '#eef2f6'

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/**
 * Is this a serialized document rather than something a person wrote?
 *
 * `requests.description` carries a rich-requisition JSON payload. The
 * dispatcher parses it out, but a caller building `WorkflowEmailData` by hand
 * could still pass it straight through, and a wall of raw JSON in a customer's
 * inbox is the worst possible failure for a template like this. Cheap to check,
 * so check it here too.
 */
function looksLikeJson(value?: string | null): boolean {
  if (!value) return false
  const t = value.trim()
  return (t.startsWith('{') && t.endsWith('}')) || t.includes('"type":"rich_requisition"')
}

function esc(value?: string | null): string {
  if (!value) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Ghana cedis, always. ProcureFlow does not transact in anything else. */
function formatMoney(amount?: number | null, currency = 'GHS'): string {
  if (amount == null || isNaN(Number(amount))) return '—'
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: currency || 'GHS',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(amount))
}

function formatDate(date?: string | Date | null): string {
  const d = date ? new Date(date) : new Date()
  if (isNaN(d.getTime())) return String(date ?? '')
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ============================================================
   Themes
   ============================================================ */

interface StatusTheme {
  /** The single accent the whole email is built around. */
  accent: string
  /** A pale wash of the accent for the hero band. */
  wash: string
  /** A mid tone of the accent for the hero's hairline. */
  edge: string
  /** Accent-on-wash text that still passes contrast. */
  onWash: string
  badge: string
  title: string
  subtitle: string
  button: string
  /** Heading above the comment block, when there is one. */
  noteTitle: string
}

const THEMES: Record<WorkflowEventType, StatusTheme> = {
  requisition_submitted: {
    accent: '#2563eb',
    wash: '#eff6ff',
    edge: '#bfdbfe',
    onWash: '#1e40af',
    badge: 'AWAITING YOUR REVIEW',
    title: 'A requisition is waiting on you',
    subtitle:
      'It has cleared the stage before yours and is now in your queue. Review the lines, the documents and the value below, then approve it or send it back with a reason.',
    button: 'Open the requisition',
    noteTitle: 'Note from the previous stage',
  },
  urgent_escalation: {
    accent: '#dc2626',
    wash: '#fef2f2',
    edge: '#fecaca',
    onWash: '#991b1b',
    badge: 'URGENT — EMERGENCY APPROVAL',
    title: 'Urgent requisition — act now',
    subtitle:
      'The Project Lead has escalated this requisition for emergency approval. It has skipped the batched notification and come straight to you. Site work is being held up on it.',
    button: 'Review it now',
    noteTitle: 'Why this was escalated',
  },
  po_attached: {
    accent: '#7c3aed',
    wash: '#f5f3ff',
    edge: '#ddd6fe',
    onWash: '#5b21b6',
    badge: 'PURCHASE ORDER ATTACHED',
    title: 'A purchase order is now on this requisition',
    subtitle:
      'The official purchase order has been attached and is visible to everyone on this requisition. The reference and the committed value are below.',
    button: 'View the purchase order',
    noteTitle: 'Note from Administration',
  },
  po_approved: {
    accent: '#059669',
    wash: '#ecfdf5',
    edge: '#a7f3d0',
    onWash: '#065f46',
    badge: 'APPROVED',
    title: 'Purchase order approved',
    subtitle:
      'Cost Control has audited the rates and the vendor invoices and cleared this purchase order. It now goes to Administration for final authorization.',
    button: 'View the approved order',
    noteTitle: "Cost Control's notes",
  },
  po_sent_back: {
    accent: '#d97706',
    wash: '#fffbeb',
    edge: '#fde68a',
    onWash: '#92400e',
    badge: 'ACTION REQUIRED',
    title: 'Sent back for revision',
    subtitle:
      'This was returned to you rather than rejected — it can still proceed once the points below are addressed. Make the changes and resubmit.',
    button: 'Revise and resubmit',
    noteTitle: 'What needs to change',
  },
  invoice_accepted: {
    accent: '#059669',
    wash: '#ecfdf5',
    edge: '#a7f3d0',
    onWash: '#065f46',
    badge: 'VENDOR INVOICE ACCEPTED',
    title: 'Cost Control accepted a vendor invoice',
    subtitle:
      'The invoice below has been audited and accepted as the basis for this purchase. Any alternative quotes on the requisition were recorded as not selected.',
    button: 'View the accepted invoice',
    noteTitle: "Cost Control's audit notes",
  },
  invoice_declined: {
    accent: '#e11d48',
    wash: '#fff1f2',
    edge: '#fecdd3',
    onWash: '#9f1239',
    badge: 'VENDOR INVOICE DECLINED',
    title: 'A vendor invoice was declined',
    subtitle:
      'Cost Control has rejected the invoice below. A revised quote is needed before this requisition can move on.',
    button: 'Attach a revised quote',
    noteTitle: 'Reason for declining',
  },
  invoice_acknowledged: {
    accent: '#0891b2',
    wash: '#ecfeff',
    edge: '#a5f3fc',
    onWash: '#155e75',
    badge: 'INVOICE RECEIVED',
    title: 'Vendor invoice acknowledged',
    subtitle:
      'The invoice has been received and logged against this requisition. It will be audited by Cost Control as part of the next review.',
    button: 'View the requisition',
    noteTitle: 'Note recorded with the invoice',
  },
  requisition_completed: {
    accent: '#0d9488',
    wash: '#f0fdfa',
    edge: '#99f6e4',
    onWash: '#115e59',
    badge: 'COMPLETED',
    title: 'Requisition completed',
    subtitle:
      'Administration has given final authorization and closed this requisition. Every stage of the chain has now signed off and the purchase order attached to it is final.',
    button: 'View the closed requisition',
    noteTitle: "Administration's closing notes",
  },
  payment_complete: {
    accent: '#0d9488',
    wash: '#f0fdfa',
    edge: '#99f6e4',
    onWash: '#115e59',
    badge: 'PAYMENT DISBURSED',
    title: 'Payment completed',
    subtitle: 'The payment against this purchase order has been processed and settled in full.',
    button: 'View the payment record',
    noteTitle: 'Notes on the disbursement',
  },
  converted: {
    accent: '#4f46e5',
    wash: '#eef2ff',
    edge: '#c7d2fe',
    onWash: '#3730a3',
    badge: 'PO GENERATED',
    title: 'Requisition converted to a purchase order',
    subtitle:
      'The requisition has been reviewed and turned into an official purchase order. The reference is below.',
    button: 'Track the purchase order',
    noteTitle: 'Note from Administration',
  },
}

/** Urgent overrides whatever the event's own theme would have been. */
function themeFor(data: WorkflowEmailData): StatusTheme {
  const base = THEMES[data.eventType] ?? THEMES.requisition_submitted
  if (data.isUrgent && data.eventType !== 'urgent_escalation') {
    return {
      ...base,
      accent: THEMES.urgent_escalation.accent,
      wash: THEMES.urgent_escalation.wash,
      edge: THEMES.urgent_escalation.edge,
      onWash: THEMES.urgent_escalation.onWash,
      badge: `URGENT · ${base.badge}`,
    }
  }
  return base
}

/* ============================================================
   Subject
   ============================================================ */

export function buildWorkflowEmailSubject(data: WorkflowEmailData): string {
  const ref = data.requestId ? `#${data.requestId.slice(0, 8).toUpperCase()}` : ''
  const po = data.poNumber ? ` [PO ${data.poNumber}]` : ''
  const raw = data.requestPurpose || 'Requisition'
  const purpose = `"${raw.length > 48 ? `${raw.slice(0, 48)}…` : raw}"`
  const urgent = data.isUrgent ? '[URGENT] ' : ''

  switch (data.eventType) {
    case 'requisition_submitted':
      return `${urgent}[Review needed] ${purpose} is waiting on you (${ref})`
    case 'urgent_escalation':
      return `[URGENT] ${purpose} escalated for emergency approval (${ref})`
    case 'po_attached':
      return `${urgent}[PO attached]${po} ${purpose} (${ref})`
    case 'po_approved':
      return `${urgent}[Approved]${po} ${purpose} cleared Cost Control (${ref})`
    case 'po_sent_back':
      return `${urgent}[Action required]${po} ${purpose} sent back for revision`
    case 'invoice_accepted':
      return `${urgent}[Invoice accepted]${po} Vendor invoice accepted for ${purpose}`
    case 'invoice_declined':
      return `${urgent}[Invoice declined]${po} Revised quote needed for ${purpose}`
    case 'invoice_acknowledged':
      return `${urgent}[Invoice received] Vendor invoice logged against ${purpose}`
    case 'requisition_completed':
      return `${urgent}[Completed]${po} ${purpose} authorized and closed (${ref})`
    case 'payment_complete':
      return `[Paid]${po} Payment completed for ${purpose}`
    case 'converted':
      return `[Converted]${po} ${purpose} converted to a purchase order`
  }
}

/* ============================================================
   Section builders
   ============================================================ */

/** A labelled fact. Two of these sit side by side in the summary grid. */
function fact(label: string, value: string): string {
  return `
    <td width="50%" style="padding: 0 0 10px 0; vertical-align: top;">
      <div style="font-size: 11px; font-weight: 700; color: ${FAINT}; text-transform: uppercase; letter-spacing: 0.06em;">${label}</div>
      <div style="font-size: 14px; color: ${INK}; font-weight: 600; margin-top: 3px; line-height: 1.4;">${value}</div>
    </td>`
}

/** The chain strip: where the requisition sits, as five small pills. */
function chainHtml(steps: WorkflowChainStep[] | undefined, theme: StatusTheme): string {
  if (!steps || steps.length === 0) return ''
  const pills = steps
    .map((step) => {
      const style =
        step.state === 'here'
          ? `background-color: ${theme.accent}; color: #ffffff; border: 1px solid ${theme.accent};`
          : step.state === 'done'
            ? `background-color: ${WASH}; color: ${MUTED}; border: 1px solid ${LINE};`
            : `background-color: #ffffff; color: ${FAINT}; border: 1px solid ${LINE};`
      const mark = step.state === 'done' ? '&#10003; ' : ''
      return `<td style="padding: 0 4px 0 0;"><div style="${style} border-radius: 20px; padding: 5px 11px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;">${mark}${esc(step.label)}</div></td>`
    })
    .join('')

  return `
    <div style="margin: 0 0 22px 0;">
      <div style="font-size: 11px; font-weight: 700; color: ${FAINT}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">Approval chain</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>${pills}</tr></table>
    </div>`
}

function itemsHtml(data: WorkflowEmailData, theme: StatusTheme): string {
  const items = data.items ?? []
  if (items.length === 0) return ''

  const shown = items.slice(0, 10)
  const rows = shown
    .map((item, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : WASH
      const qty = `${item.quantity ?? 1}${item.unit ? ` ${esc(String(item.unit))}` : ''}`
      const rate =
        item.unit_price != null ? formatMoney(Number(item.unit_price), data.currency || 'GHS') : '—'
      const total =
        item.line_total != null ? formatMoney(Number(item.line_total), data.currency || 'GHS') : '—'
      return `
        <tr style="background-color: ${bg};">
          <td style="padding: 11px 14px; font-size: 13px; color: ${INK}; font-weight: 500; border-top: 1px solid ${LINE}; line-height: 1.45;">${esc(item.description)}</td>
          <td style="padding: 11px 10px; font-size: 13px; color: ${BODY}; text-align: center; border-top: 1px solid ${LINE}; white-space: nowrap;">${esc(qty)}</td>
          <td style="padding: 11px 10px; font-size: 13px; color: ${BODY}; text-align: right; border-top: 1px solid ${LINE}; white-space: nowrap;">${rate}</td>
          <td style="padding: 11px 14px; font-size: 13px; color: ${INK}; font-weight: 700; text-align: right; border-top: 1px solid ${LINE}; white-space: nowrap;">${total}</td>
        </tr>`
    })
    .join('')

  const discount = Number(data.discountAmount) || 0
  const discountRow =
    discount > 0
      ? `<tr><td colspan="3" style="padding: 9px 14px; font-size: 12px; color: ${MUTED}; text-align: right; border-top: 1px solid ${LINE};">Discount applied</td>
         <td style="padding: 9px 14px; font-size: 13px; color: #b45309; font-weight: 600; text-align: right; border-top: 1px solid ${LINE}; white-space: nowrap;">− ${formatMoney(discount, data.currency || 'GHS')}</td></tr>`
      : ''

  const totalRow =
    data.totalAmount != null
      ? `<tr style="background-color: ${WASH};">
           <td colspan="3" style="padding: 12px 14px; font-size: 12px; font-weight: 700; color: ${MUTED}; text-align: right; text-transform: uppercase; letter-spacing: 0.05em; border-top: 2px solid ${LINE};">Total</td>
           <td style="padding: 12px 14px; font-size: 15px; font-weight: 800; color: ${theme.accent}; text-align: right; border-top: 2px solid ${LINE}; white-space: nowrap;">${formatMoney(data.totalAmount, data.currency || 'GHS')}</td>
         </tr>`
      : ''

  const more =
    items.length > shown.length
      ? `<p style="font-size: 11px; color: ${FAINT}; margin: 8px 0 0 0; text-align: right;">+ ${items.length - shown.length} more line${items.length - shown.length === 1 ? '' : 's'} in ProcureFlow</p>`
      : ''

  const head = (label: string, align: string) =>
    `<th align="${align}" style="padding: 10px 14px; font-size: 10px; font-weight: 700; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.06em;">${label}</th>`

  return `
    <div style="margin: 0 0 22px 0;">
      <div style="font-size: 11px; font-weight: 700; color: ${FAINT}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">Materials &amp; line items</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: separate; border-spacing: 0; border: 1px solid ${LINE}; border-radius: 10px; overflow: hidden;">
        <thead><tr style="background-color: ${WASH};">
          ${head('Description', 'left')}${head('Qty', 'center')}${head('Unit rate', 'right')}${head('Line total', 'right')}
        </tr></thead>
        <tbody>${rows}${discountRow}${totalRow}</tbody>
      </table>
      ${more}
    </div>`
}

function documentsHtml(data: WorkflowEmailData): string {
  const docs = data.documents ?? []
  if (docs.length === 0) return ''

  const rows = docs
    .slice(0, 8)
    .map((doc) => {
      const pill =
        doc.status === 'accepted'
          ? `<span style="background-color: #059669; color: #ffffff; border-radius: 20px; padding: 3px 9px; font-size: 10px; font-weight: 700; white-space: nowrap;">ACCEPTED</span>`
          : doc.status === 'declined'
            ? `<span style="background-color: #e11d48; color: #ffffff; border-radius: 20px; padding: 3px 9px; font-size: 10px; font-weight: 700; white-space: nowrap;">DECLINED</span>`
            : `<span style="background-color: #fef3c7; color: #92400e; border-radius: 20px; padding: 3px 9px; font-size: 10px; font-weight: 700; white-space: nowrap;">PENDING</span>`
      const note = doc.review_notes
        ? `<div style="font-size: 11px; color: ${MUTED}; font-style: italic; margin-top: 3px; line-height: 1.45;">${esc(doc.review_notes)}</div>`
        : ''
      const by = doc.reviewer_name
        ? `<div style="font-size: 11px; color: ${FAINT}; margin-top: 2px;">Reviewed by ${esc(doc.reviewer_name)}</div>`
        : ''
      return `
        <tr>
          <td style="padding: 10px 14px; border-top: 1px solid ${LINE};">
            <div style="font-size: 13px; color: ${INK}; font-weight: 600; line-height: 1.4;">${esc(doc.file_name)}</div>
            ${by}${note}
          </td>
          <td align="right" style="padding: 10px 14px; border-top: 1px solid ${LINE}; vertical-align: top;">${pill}</td>
        </tr>`
    })
    .join('')

  return `
    <div style="margin: 0 0 22px 0;">
      <div style="font-size: 11px; font-weight: 700; color: ${FAINT}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">Attached documents</div>
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: separate; border-spacing: 0; border: 1px solid ${LINE}; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

/** The reviewer's own words — the part people open the email for. */
function noteHtml(data: WorkflowEmailData, theme: StatusTheme): string {
  const body = data.eventType === 'urgent_escalation' ? data.urgentReason || data.comments : data.comments
  if (!body) return ''

  const nextSteps =
    data.eventType === 'po_sent_back'
      ? `<div style="font-size: 12px; color: ${theme.onWash}; line-height: 1.55; margin-top: 12px; padding-top: 11px; border-top: 1px solid ${theme.edge};"><strong>What to do next:</strong> open the requisition, make the amendments or attach the missing document, then resubmit it. It returns to the stage that sent it back, not to the start of the chain.</div>`
      : ''

  return `
    <div style="background-color: ${theme.wash}; border: 1px solid ${theme.edge}; border-radius: 10px; padding: 16px 18px; margin: 0 0 22px 0;">
      <div style="font-size: 11px; font-weight: 700; color: ${theme.accent}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 7px;">${esc(theme.noteTitle)}</div>
      <div style="font-size: 14px; color: ${INK}; line-height: 1.6;">&ldquo;${esc(body)}&rdquo;</div>
      ${nextSteps}
    </div>`
}

/** The requester's notes. Called out because reviewers ask for it by name. */
function requesterNotesHtml(data: WorkflowEmailData): string {
  if (!data.notes) return ''
  return `
    <div style="background-color: ${WASH}; border: 1px solid ${LINE}; border-radius: 10px; padding: 15px 18px; margin: 0 0 22px 0;">
      <div style="font-size: 11px; font-weight: 700; color: ${FAINT}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;">Additional notes from the requester</div>
      <div style="font-size: 14px; color: ${BODY}; line-height: 1.6;">${esc(data.notes)}</div>
    </div>`
}

/* ============================================================
   HTML
   ============================================================ */

export function renderWorkflowEmailHtml(data: WorkflowEmailData): string {
  const theme = themeFor(data)
  const subject = buildWorkflowEmailSubject(data)
  const blurb = looksLikeJson(data.requestDescription) ? null : data.requestDescription
  const greeting = data.recipientName ? esc(data.recipientName.split(' ')[0]) : 'there'
  const ref = data.requestId ? data.requestId.slice(0, 8).toUpperCase() : 'REQ'
  const amount = formatMoney(data.totalAmount, data.currency || 'GHS')
  const poRef = data.poNumber
    ? esc(data.poNumber)
    : data.poId
      ? `PO-${data.poId.slice(0, 8).toUpperCase()}`
      : 'Not yet raised'

  const urgentBar = data.isUrgent
    ? `<tr><td style="background-color: #dc2626; padding: 11px 28px; text-align: center;">
         <span style="font-size: 12px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 0.1em;">&#9888; Urgent — emergency approval requested</span>
       </td></tr>`
    : ''

  const awaiting = data.awaitingStageLabel
    ? `<div style="font-size: 13px; color: ${theme.onWash}; margin-top: 10px; font-weight: 600;">Now waiting on: ${esc(data.awaitingStageLabel)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${PAGE}; font-family: ${FONT}; -webkit-font-smoothing: antialiased; color: ${BODY}; width: 100%;">

<div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: ${PAGE}; opacity: 0;">
  ${esc(theme.title)} — ${esc(data.requestPurpose)} · ${amount}
</div>

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${PAGE}; padding: 28px 12px;">
<tr><td align="center">

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; background-color: #ffffff; border: 1px solid ${LINE}; border-radius: 16px; overflow: hidden; box-shadow: 0 6px 24px rgba(15, 23, 42, 0.07);">

  <!-- Masthead -->
  <tr><td style="background-color: ${INK}; padding: 20px 28px;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td>
        <div style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1.2;">Procure<span style="color: #38bdf8;">Flow</span></div>
        <div style="font-size: 11px; color: ${FAINT}; margin-top: 3px;">Spend &amp; procurement workflow</div>
      </td>
      <td align="right" style="vertical-align: middle;">
        <span style="display: inline-block; padding: 5px 11px; background-color: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.16); border-radius: 7px; font-size: 11px; font-weight: 700; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${ref}</span>
      </td>
    </tr></table>
  </td></tr>

  ${urgentBar}

  <!-- Hero -->
  <tr><td style="background-color: ${theme.wash}; border-bottom: 1px solid ${theme.edge}; padding: 26px 28px;">
    <div style="display: inline-block; padding: 5px 11px; background-color: ${theme.accent}; color: #ffffff; border-radius: 20px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em;">${esc(theme.badge)}</div>
    <h1 style="margin: 12px 0 8px 0; font-size: 23px; font-weight: 800; color: ${INK}; line-height: 1.25; letter-spacing: -0.02em;">${esc(theme.title)}</h1>
    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: ${theme.onWash};">${esc(theme.subtitle)}</p>
    ${awaiting}
  </td></tr>

  <!-- Body -->
  <tr><td style="padding: 26px 28px 8px 28px;">

    <p style="font-size: 15px; color: ${BODY}; line-height: 1.6; margin: 0 0 20px 0;">Hello <strong style="color: ${INK};">${greeting}</strong>,</p>

    <!-- What it is -->
    <div style="border: 1px solid ${LINE}; border-radius: 12px; padding: 18px 20px; margin: 0 0 22px 0;">
      <div style="font-size: 11px; font-weight: 700; color: ${FAINT}; text-transform: uppercase; letter-spacing: 0.06em;">Requisition</div>
      <div style="font-size: 18px; font-weight: 700; color: ${INK}; line-height: 1.35; margin: 5px 0 0 0; letter-spacing: -0.01em;">${esc(data.requestPurpose)}</div>
      ${blurb ? `<p style="font-size: 13px; color: ${MUTED}; line-height: 1.6; margin: 8px 0 0 0;">${esc(blurb)}</p>` : ''}
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px; padding-top: 14px; border-top: 1px solid ${LINE};">
        <tr>
          ${fact('Project site', `${esc(data.projectName || 'General operations')}${data.projectLocation ? ` <span style="font-weight: 400; color: ${MUTED};">(${esc(data.projectLocation)})</span>` : ''}`)}
          ${fact('Raised by', esc(data.requesterName || 'Team member'))}
        </tr>
        <tr>
          ${fact('Department', esc(data.department || 'Procurement'))}
          ${fact('PO reference', `<span style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${poRef}</span>`)}
        </tr>
      </table>
    </div>

    <!-- Money -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 22px 0;">
      <tr>
        <td width="50%" style="padding-right: 7px; vertical-align: top;">
          <div style="background-color: ${theme.wash}; border: 1px solid ${theme.edge}; border-radius: 10px; padding: 15px 16px;">
            <div style="font-size: 10px; font-weight: 700; color: ${theme.onWash}; text-transform: uppercase; letter-spacing: 0.06em;">Total value</div>
            <div style="font-size: 21px; font-weight: 800; color: ${theme.accent}; margin-top: 5px; letter-spacing: -0.02em;">${amount}</div>
            <div style="font-size: 11px; color: ${MUTED}; margin-top: 3px;">${esc(data.currency || 'GHS')}${data.items?.length ? ` · ${data.items.length} line${data.items.length === 1 ? '' : 's'}` : ''}</div>
          </div>
        </td>
        <td width="50%" style="padding-left: 7px; vertical-align: top;">
          <div style="background-color: #ffffff; border: 1px solid ${LINE}; border-radius: 10px; padding: 15px 16px;">
            <div style="font-size: 10px; font-weight: 700; color: ${FAINT}; text-transform: uppercase; letter-spacing: 0.06em;">Vendor / supplier</div>
            <div style="font-size: 15px; font-weight: 700; color: ${INK}; margin-top: 5px; line-height: 1.35;">${esc(data.vendorName || 'Not yet sourced')}</div>
            <div style="font-size: 11px; color: ${MUTED}; margin-top: 3px;">${data.quantity ? `Qty ${esc(String(data.quantity))}${data.unitRate ? ` @ ${formatMoney(Number(data.unitRate), data.currency || 'GHS')}` : ''}` : 'Awaiting sourcing'}</div>
          </div>
        </td>
      </tr>
    </table>

    ${chainHtml(data.chain, theme)}
    ${noteHtml(data, theme)}
    ${requesterNotesHtml(data)}
    ${itemsHtml(data, theme)}
    ${documentsHtml(data)}

    <!-- CTA -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 26px 0 16px 0;">
      <tr><td align="center">
        <a href="${esc(data.actionUrl)}" target="_blank" style="background-color: ${theme.accent}; color: #ffffff; display: inline-block; padding: 15px 36px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 10px; letter-spacing: 0.01em;">${esc(theme.button)} &rarr;</a>
      </td></tr>
    </table>

    <p style="font-size: 11px; color: ${FAINT}; text-align: center; margin: 0 0 20px 0; line-height: 1.6;">
      If the button does not work, paste this into your browser:<br>
      <a href="${esc(data.actionUrl)}" style="color: ${MUTED}; word-break: break-all;">${esc(data.actionUrl)}</a>
    </p>

    <!-- Audit line -->
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid ${LINE}; padding-top: 15px;">
      <tr>
        <td style="font-size: 12px; color: ${MUTED}; line-height: 1.5;">Action by <strong style="color: ${INK};">${esc(data.performerName || 'ProcureFlow')}</strong>${data.performerRole ? ` · ${esc(data.performerRole.replace(/_/g, ' '))}` : ''}</td>
        <td align="right" style="font-size: 12px; color: ${FAINT}; white-space: nowrap;">${formatDate(data.actionTimestamp)}</td>
      </tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background-color: ${WASH}; border-top: 1px solid ${LINE}; padding: 20px 28px; text-align: center;">
    <p style="font-size: 12px; color: ${MUTED}; margin: 0 0 5px 0; font-weight: 600;">ProcureFlow — spend control and procurement tracking</p>
    <p style="font-size: 11px; color: ${FAINT}; margin: 0; line-height: 1.6;">You are receiving this because you are a stakeholder on this requisition. This is an automated workflow notification.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

/* ============================================================
   Plain text
   ============================================================ */

export function renderWorkflowEmailText(data: WorkflowEmailData): string {
  const theme = themeFor(data)
  const greeting = data.recipientName ? data.recipientName.split(' ')[0] : 'there'
  const amount = formatMoney(data.totalAmount, data.currency || 'GHS')
  const poRef = data.poNumber || (data.poId ? `PO-${data.poId.slice(0, 8).toUpperCase()}` : 'Not yet raised')
  const rule = '─'.repeat(52)

  const lines: (string | null)[] = [
    theme.badge,
    rule,
    '',
    `Hello ${greeting},`,
    '',
    theme.title,
    theme.subtitle,
    '',
  ]

  if (data.isUrgent) {
    lines.push('*** URGENT — EMERGENCY APPROVAL REQUESTED ***', '')
  }

  lines.push(
    rule,
    'REQUISITION',
    rule,
    `Purpose:     ${data.requestPurpose}`,
    looksLikeJson(data.requestDescription) ? null : data.requestDescription ? `Details:     ${data.requestDescription}` : null,
    `Reference:   ${data.requestId}`,
    `PO ref:      ${poRef}`,
    `Project:     ${data.projectName || 'General operations'}${data.projectLocation ? ` (${data.projectLocation})` : ''}`,
    `Department:  ${data.department || 'Procurement'}`,
    `Raised by:   ${data.requesterName || 'Team member'}`,
    `Total:       ${amount}`,
    data.vendorName ? `Vendor:      ${data.vendorName}` : null,
    data.awaitingStageLabel ? `Waiting on:  ${data.awaitingStageLabel}` : null,
    ''
  )

  if (data.chain?.length) {
    const strip = data.chain
      .map((s) => (s.state === 'here' ? `[${s.label}]` : s.state === 'done' ? `${s.label} ✓` : s.label))
      .join('  >  ')
    lines.push(rule, 'APPROVAL CHAIN', rule, strip, '')
  }

  const note = data.eventType === 'urgent_escalation' ? data.urgentReason || data.comments : data.comments
  if (note) {
    lines.push(rule, theme.noteTitle.toUpperCase(), rule, `"${note}"`, '')
  }

  if (data.notes) {
    lines.push(rule, 'ADDITIONAL NOTES FROM THE REQUESTER', rule, data.notes, '')
  }

  if (data.items?.length) {
    lines.push(rule, 'MATERIALS & LINE ITEMS', rule)
    for (const item of data.items.slice(0, 10)) {
      const total = item.line_total != null ? formatMoney(Number(item.line_total), data.currency || 'GHS') : '—'
      lines.push(`- ${item.description}`)
      lines.push(`    Qty ${item.quantity ?? 1}${item.unit ? ` ${item.unit}` : ''} · ${total}`)
    }
    const discount = Number(data.discountAmount) || 0
    if (discount > 0) lines.push(`  Discount: -${formatMoney(discount, data.currency || 'GHS')}`)
    lines.push(`  TOTAL: ${amount}`, '')
  }

  if (data.documents?.length) {
    lines.push(rule, 'ATTACHED DOCUMENTS', rule)
    for (const doc of data.documents.slice(0, 8)) {
      lines.push(`- ${doc.file_name} [${(doc.status || 'pending').toUpperCase()}]`)
      if (doc.review_notes) lines.push(`    ${doc.review_notes}`)
    }
    lines.push('')
  }

  lines.push(
    rule,
    theme.button.toUpperCase(),
    rule,
    data.actionUrl,
    '',
    `Action by: ${data.performerName || 'ProcureFlow'}${data.performerRole ? ` (${data.performerRole.replace(/_/g, ' ')})` : ''}`,
    `Date:      ${formatDate(data.actionTimestamp)}`,
    '',
    '--',
    'ProcureFlow — spend control and procurement tracking'
  )

  // Only the conditional rows are dropped; the empty strings are the blank
  // lines that keep the plain-text version readable.
  return lines.filter((l): l is string => l !== null).join('\n')
}

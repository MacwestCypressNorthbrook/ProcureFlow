/**
 * ProcureFlow High-End Transactional Email Templates
 *
 * Tailored for key workflow milestones:
 * - PO Approved
 * - PO Sent Back (with feedback/rejection reason)
 * - Payment Complete (disbursement confirmed)
 * - Converted to PO (from requisition)
 */

export type WorkflowEventType =
  | 'po_approved'
  | 'po_sent_back'
  | 'payment_complete'
  | 'converted'

export interface WorkflowItemLine {
  description: string
  quantity: number | string
  unit?: string | null
  unit_price?: number | string | null
  line_total?: number | string | null
}

export interface WorkflowEmailData {
  eventType: WorkflowEventType
  recipientName?: string | null
  recipientRole?: string | null

  // Requisition context (The submitted request)
  requestId: string
  requestPurpose: string
  requestDescription?: string | null
  department?: string | null
  projectName?: string | null
  projectLocation?: string | null
  requesterName?: string | null
  requesterEmail?: string | null
  requestDate?: string | Date | null

  // Purchase Order context
  poId?: string | null
  poNumber?: string | null
  vendorName?: string | null
  totalAmount?: number | null
  currency?: string | null
  quantity?: number | string | null
  unitRate?: number | string | null

  // Line items (if requisition or PO has itemized breakdown)
  items?: WorkflowItemLine[]

  // Action / Decision details
  performerName?: string | null
  performerRole?: string | null
  performerEmail?: string | null
  actionTimestamp?: string | Date | null
  comments?: string | null // e.g. send back reason or reviewer note

  // CTA link
  actionUrl: string
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
  if (!date) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const d = new Date(date)
  if (isNaN(d.getTime())) return String(date)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface StatusTheme {
  primaryColor: string
  secondaryColor: string
  borderColor: string
  textColor: string
  bannerTitle: string
  bannerSubtitle: string
  badgeLabel: string
  iconSvg: string
  buttonText: string
  highlightTitle?: string
}

function getStatusTheme(eventType: WorkflowEventType): StatusTheme {
  switch (eventType) {
    case 'po_approved':
      return {
        primaryColor: '#059669', // Emerald 600
        secondaryColor: '#ecfdf5', // Emerald 50
        borderColor: '#a7f3d0', // Emerald 200
        textColor: '#065f46', // Emerald 800
        bannerTitle: 'Purchase Order Approved',
        bannerSubtitle: 'The purchase order has been reviewed and cleared by Cost Control. It is now queued for Finance disbursement.',
        badgeLabel: 'APPROVED',
        iconSvg: `&#10003;`,
        buttonText: 'View Approved PO',
        highlightTitle: 'Cost Control Approval Cleared',
      }
    case 'po_sent_back':
      return {
        primaryColor: '#d97706', // Amber 600
        secondaryColor: '#fffbeb', // Amber 50
        borderColor: '#fde68a', // Amber 200
        textColor: '#92400e', // Amber 800
        bannerTitle: 'Action Required: Order Sent Back',
        bannerSubtitle: 'This order was sent back for revision. Please review the notes below and update the details to proceed.',
        badgeLabel: 'REVISION REQUIRED',
        iconSvg: `&#8634;`,
        buttonText: 'Revise & Resubmit',
        highlightTitle: 'Reviewer Feedback & Instructions',
      }
    case 'payment_complete':
      return {
        primaryColor: '#0d9488', // Teal 600
        secondaryColor: '#f0fdfa', // Teal 50
        borderColor: '#99f6e4', // Teal 200
        textColor: '#115e59', // Teal 800
        bannerTitle: 'Payment Completed & Disbursed',
        bannerSubtitle: 'Finance has processed the payment for this purchase order. The requisition lifecycle is now fully settled.',
        badgeLabel: 'PAYMENT DISBURSED',
        iconSvg: `&#10004;`,
        buttonText: 'View Payment Record',
        highlightTitle: 'Disbursement Confirmation',
      }
    case 'converted':
    default:
      return {
        primaryColor: '#4f46e5', // Indigo 600
        secondaryColor: '#eef2ff', // Indigo 50
        borderColor: '#c7d2fe', // Indigo 200
        textColor: '#3730a3', // Indigo 800
        bannerTitle: 'Requisition Converted to PO',
        bannerSubtitle: 'Your submitted requisition has been reviewed and converted into an official Purchase Order by Administration.',
        badgeLabel: 'PO GENERATED',
        iconSvg: `&#128196;`,
        buttonText: 'Track Purchase Order',
        highlightTitle: 'Purchase Order Generated',
      }
  }
}

/**
 * Builds the subject line for the email.
 */
export function buildWorkflowEmailSubject(data: WorkflowEmailData): string {
  const shortReq = data.requestId ? `#${data.requestId.slice(0, 8)}` : ''
  const poRef = data.poNumber ? ` [PO #${data.poNumber}]` : ''
  const purpose = data.requestPurpose ? `"${data.requestPurpose.slice(0, 45)}${data.requestPurpose.length > 45 ? '...' : ''}"` : 'Requisition'

  switch (data.eventType) {
    case 'po_approved':
      return `[Approved]${poRef} ${purpose} cleared for payment (${shortReq})`
    case 'po_sent_back':
      return `[Action Required]${poRef} ${purpose} sent back for revision`
    case 'payment_complete':
      return `[Paid]${poRef} Payment completed for ${purpose}`
    case 'converted':
      return `[Converted to PO]${poRef} ${purpose} converted from requisition`
  }
}

/**
 * Generates modern, bulletproof HTML for the email.
 */
export function renderWorkflowEmailHtml(data: WorkflowEmailData): string {
  const theme = getStatusTheme(data.eventType)
  const greeting = data.recipientName ? esc(data.recipientName.split(' ')[0]) : 'Team Member'
  const subject = buildWorkflowEmailSubject(data)
  const formattedAmount = formatMoney(data.totalAmount, data.currency || 'GHS')
  const shortReqId = data.requestId ? data.requestId.slice(0, 8).toUpperCase() : 'REQ'
  const poBadge = data.poNumber ? esc(data.poNumber) : data.poId ? `PO-${data.poId.slice(0, 8).toUpperCase()}` : 'PENDING'
  const projectDisplay = data.projectName ? esc(data.projectName) : 'General Operations'
  const locationDisplay = data.projectLocation ? ` (${esc(data.projectLocation)})` : ''
  const submitterDisplay = data.requesterName ? esc(data.requesterName) : 'Team Member'
  const performerDisplay = data.performerName ? esc(data.performerName) : 'Procurement Officer'
  const performerRoleDisplay = data.performerRole ? ` (${esc(data.performerRole.replace(/_/g, ' '))})` : ''
  const timestampDisplay = formatDate(data.actionTimestamp || new Date())

  // Line items table HTML (if items are provided)
  let itemsTableHtml = ''
  if (data.items && data.items.length > 0) {
    const rows = data.items.slice(0, 8).map((item, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc'
      const qtyUnit = `${item.quantity || 1}${item.unit ? ` ${esc(item.unit)}` : ''}`
      const unitRate = item.unit_price != null ? formatMoney(Number(item.unit_price), data.currency || 'GHS') : '—'
      const lineTotal = item.line_total != null ? formatMoney(Number(item.line_total), data.currency || 'GHS') : '—'

      return `
        <tr style="background-color: ${bg}; border-bottom: 1px solid #edf2f7;">
          <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; font-weight: 500;">
            ${esc(item.description)}
          </td>
          <td style="padding: 10px 12px; font-size: 13px; color: #475569; text-align: center;">
            ${esc(qtyUnit)}
          </td>
          <td style="padding: 10px 12px; font-size: 13px; color: #475569; text-align: right;">
            ${unitRate}
          </td>
          <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 600; text-align: right;">
            ${lineTotal}
          </td>
        </tr>
      `
    }).join('')

    itemsTableHtml = `
      <div style="margin: 20px 0 0 0;">
        <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
          Itemized Requisition Breakdown
        </div>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
              <th align="left" style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Item / Description</th>
              <th align="center" style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Qty</th>
              <th align="right" style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Unit Rate</th>
              <th align="right" style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        ${data.items.length > 8 ? `<p style="font-size: 11px; color: #94a3b8; margin: 6px 0 0 0; text-align: right;">+ ${data.items.length - 8} additional items in ProcureFlow</p>` : ''}
      </div>
    `
  }

  // Action / Feedback Card (especially critical for "Sent Back")
  let actionCardHtml = ''
  if (data.eventType === 'po_sent_back') {
    actionCardHtml = `
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 13px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.05em;">
            Reason for Send-Back & Instructions
          </span>
        </div>
        <p style="font-size: 14px; line-height: 1.6; color: #78350f; margin: 0 0 12px 0; font-style: italic; background-color: #fef3c7; padding: 10px 14px; border-radius: 6px;">
          "${esc(data.comments || 'Revisions required by reviewer before this order can proceed.')}"
        </p>
        <div style="font-size: 12px; color: #92400e; line-height: 1.5;">
          <strong>Next steps:</strong> Open the requisition using the button below, make the necessary amendments or upload missing documentation, and resubmit.
        </div>
      </div>
    `
  } else if (data.comments) {
    actionCardHtml = `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${theme.primaryColor}; border-radius: 8px; padding: 14px 16px; margin: 20px 0;">
        <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">
          Reviewer Notes
        </div>
        <p style="font-size: 14px; color: #1e293b; margin: 0; line-height: 1.5;">
          "${esc(data.comments)}"
        </p>
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <!-- Preheader text for email clients -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #f1f5f9;">
    ${esc(theme.bannerTitle)}: ${esc(data.requestPurpose)} (${formattedAmount}) - ProcureFlow Notification
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);">
          
          <!-- Header Bar -->
          <tr>
            <td style="background-color: #0f172a; padding: 20px 28px; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="display: inline-block; vertical-align: middle;">
                      <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">Procure<span style="color: #38bdf8;">Flow</span></span>
                      <span style="display: block; font-size: 11px; color: #94a3b8; font-weight: 400; margin-top: 2px;">Spend & Procurement Workflow</span>
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; padding: 4px 10px; background-color: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; font-size: 11px; font-weight: 600; color: #e2e8f0; letter-spacing: 0.02em;">
                      ${shortReqId}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Status Hero Banner -->
          <tr>
            <td style="background-color: ${theme.secondaryColor}; border-bottom: 2px solid ${theme.borderColor}; padding: 22px 28px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="display: inline-block; padding: 4px 10px; background-color: ${theme.primaryColor}; color: #ffffff; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">
                      ${theme.badgeLabel}
                    </div>
                    <h1 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                      ${theme.bannerTitle}
                    </h1>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: ${theme.textColor};">
                      ${theme.bannerSubtitle}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td style="padding: 28px 28px 24px 28px;">
              <p style="font-size: 15px; color: #334155; line-height: 1.5; margin: 0 0 16px 0;">
                Hello <strong>${greeting}</strong>,
              </p>

              <!-- Requisition Summary Card (Tailored to Request Submitted) -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                  Requisition Overview
                </div>
                <div style="font-size: 17px; font-weight: 700; color: #0f172a; line-height: 1.4; margin-bottom: 6px;">
                  ${esc(data.requestPurpose)}
                </div>
                ${data.requestDescription ? `<p style="font-size: 13px; color: #475569; line-height: 1.5; margin: 0 0 12px 0;">${esc(data.requestDescription)}</p>` : ''}
                
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 8px;">
                  <tr>
                    <td style="font-size: 12px; color: #64748b; padding-bottom: 4px;" width="50%">
                      <strong>Project Site:</strong> ${projectDisplay}${locationDisplay}
                    </td>
                    <td style="font-size: 12px; color: #64748b; padding-bottom: 4px;" width="50%">
                      <strong>PO Reference:</strong> <span style="font-family: monospace; font-weight: 600; color: #0f172a;">${poBadge}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size: 12px; color: #64748b;" width="50%">
                      <strong>Requested By:</strong> ${submitterDisplay}
                    </td>
                    <td style="font-size: 12px; color: #64748b;" width="50%">
                      <strong>Department:</strong> ${esc(data.department || 'Procurement')}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Financial & Metric 2x2 Grid -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td width="50%" style="padding-right: 8px; vertical-align: top;">
                    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                      <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Total Committed Amount</div>
                      <div style="font-size: 18px; font-weight: 800; color: ${theme.primaryColor}; margin-top: 4px;">
                        ${formattedAmount}
                      </div>
                      <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Currency: ${esc(data.currency || 'GHS')}</div>
                    </div>
                  </td>
                  <td width="50%" style="padding-left: 8px; vertical-align: top;">
                    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                      <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Selected Vendor / Supplier</div>
                      <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${esc(data.vendorName || 'Pending Final Vendor')}
                      </div>
                      <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                        ${data.quantity ? `Qty: ${data.quantity}${data.unitRate ? ` @ ${formatMoney(Number(data.unitRate), data.currency || 'GHS')}` : ''}` : 'Sourced Vendor'}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Reviewer Feedback / Sent-Back Notice (if applicable) -->
              ${actionCardHtml}

              <!-- Itemized Table (if available) -->
              ${itemsTableHtml}

              <!-- Call to Action Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="${esc(data.actionUrl)}" target="_blank" style="background-color: ${theme.primaryColor}; color: #ffffff; display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.12); text-align: center; letter-spacing: 0.01em;">
                      ${theme.buttonText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Direct Link Fallback -->
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0 0 20px 0; line-height: 1.5;">
                Button not working? Paste this link in your browser:<br />
                <a href="${esc(data.actionUrl)}" style="color: #64748b; word-break: break-all; text-decoration: underline;">${esc(data.actionUrl)}</a>
              </p>

              <!-- Audit Trail Information Box -->
              <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 20px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="font-size: 12px; color: #64748b;">
                      <strong>Action Performed By:</strong> ${performerDisplay}${performerRoleDisplay}
                    </td>
                    <td align="right" style="font-size: 12px; color: #94a3b8;">
                      ${timestampDisplay}
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center;">
              <p style="font-size: 12px; color: #64748b; margin: 0 0 6px 0; font-weight: 500;">
                ProcureFlow — Automated Enterprise Spend Control & Procurement Tracking
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0; line-height: 1.5;">
                This is an automated workflow notification tailored to your active requisition. You received this because you are an authorized stakeholder on this procurement cycle.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Generates an executive plaintext version for text-only email clients.
 */
export function renderWorkflowEmailText(data: WorkflowEmailData): string {
  const theme = getStatusTheme(data.eventType)
  const greeting = data.recipientName ? data.recipientName.split(' ')[0] : 'Team Member'
  const formattedAmount = formatMoney(data.totalAmount, data.currency || 'GHS')
  const poBadge = data.poNumber || (data.poId ? `PO-${data.poId.slice(0, 8).toUpperCase()}` : 'PENDING')
  const timestamp = formatDate(data.actionTimestamp || new Date())

  const lines = [
    `==================================================`,
    `PROCUREFLOW NOTIFICATION: ${theme.badgeLabel}`,
    `==================================================`,
    '',
    `Hello ${greeting},`,
    '',
    `${theme.bannerTitle}`,
    `${theme.bannerSubtitle}`,
    '',
    `--------------------------------------------------`,
    `REQUISITION DETAILS:`,
    `--------------------------------------------------`,
    `Purpose:       ${data.requestPurpose}`,
    data.requestDescription ? `Description:   ${data.requestDescription}` : '',
    `Request ID:    ${data.requestId}`,
    `PO Reference:  ${poBadge}`,
    `Project:       ${data.projectName || 'General Operations'}${data.projectLocation ? ` (${data.projectLocation})` : ''}`,
    `Requested By:  ${data.requesterName || 'Team Member'}`,
    `Total Amount:  ${formattedAmount} (${data.currency || 'GHS'})`,
    data.vendorName ? `Vendor:        ${data.vendorName}` : '',
    '',
  ]

  if (data.comments) {
    lines.push(
      `--------------------------------------------------`,
      data.eventType === 'po_sent_back' ? `REASON FOR SEND-BACK:` : `REVIEWER NOTES:`,
      `--------------------------------------------------`,
      `"${data.comments}"`,
      ''
    )
  }

  if (data.items && data.items.length > 0) {
    lines.push(
      `--------------------------------------------------`,
      `ITEMIZED BREAKDOWN:`,
      `--------------------------------------------------`
    )
    for (const item of data.items) {
      const lineTotal = item.line_total != null ? formatMoney(Number(item.line_total), data.currency || 'GHS') : '—'
      lines.push(`- ${item.description}: Qty ${item.quantity || 1} ${item.unit || ''} | Total: ${lineTotal}`)
    }
    lines.push('')
  }

  lines.push(
    `--------------------------------------------------`,
    `ACTION:`,
    `--------------------------------------------------`,
    `Open in ProcureFlow: ${data.actionUrl}`,
    '',
    `Action by: ${data.performerName || 'Procurement Officer'}${data.performerRole ? ` (${data.performerRole})` : ''}`,
    `Date:      ${timestamp}`,
    '',
    `--`,
    `ProcureFlow Spend & Procurement Workflow`,
    `Automated enterprise notification`
  )

  return lines.filter(Boolean).join('\n')
}

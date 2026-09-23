import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { sendEmail } from '@/lib/email/client'
import {
  buildWorkflowEmailSubject,
  renderWorkflowEmailHtml,
  renderWorkflowEmailText,
  type WorkflowEmailData,
  type WorkflowEventType,
} from '@/lib/email/templates/workflow-email'

export async function POST(request: NextRequest) {
  const guard = await requireRole('administrator', 'super_user')
  if (guard.error) return guard.error

  if (!guard.user.email) {
    return NextResponse.json({ error: 'Current user has no email address configured' }, { status: 400 })
  }

  let body: { eventType?: WorkflowEventType } = {}
  try {
    body = await request.json()
  } catch {
    // empty body
  }

  const eventType = body.eventType || 'po_approved'
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  const data: WorkflowEmailData = {
    eventType,
    recipientName: guard.user.name || 'Team Member',
    recipientRole: guard.user.role,

    // Tailored request fields
    requestId: 'REQ-DEMO-2026',
    requestPurpose: 'Industrial Air Conditioning & HVAC Overhaul for Main Server Room',
    requestDescription: 'Urgent cooling equipment replacement to maintain server room temperature below 21°C.',
    department: 'Infrastructure & Engineering',
    projectName: 'Takoradi Port Substation',
    projectLocation: 'Takoradi Complex B',
    requesterName: guard.user.name || 'Lead Site Engineer',
    requesterEmail: guard.user.email,
    requestDate: new Date().toISOString(),

    poId: 'PO-DEMO-009',
    poNumber: 'PO-2026-0711',
    vendorName: 'Apex Thermal & Climate Solutions Ltd.',
    totalAmount: 42500,
    currency: 'GHS',
    quantity: 2,
    unitRate: 21250,

    items: [
      {
        description: 'Daikin 60,000 BTU Inverter Standing Packaged AC Unit',
        quantity: 2,
        unit: 'Units',
        unit_price: 18500,
        line_total: 37000,
      },
      {
        description: 'Copper piping, refrigerant charge R410A & heavy-duty brackets',
        quantity: 1,
        unit: 'Lot',
        unit_price: 3500,
        line_total: 3500,
      },
      {
        description: 'Certified electrical connection, ducting and commissioning',
        quantity: 1,
        unit: 'Service',
        unit_price: 2000,
        line_total: 2000,
      },
    ],

    performerName: guard.user.name || 'Cost Controller',
    performerRole:
      eventType === 'payment_complete'
        ? 'finance'
        : eventType === 'po_sent_back' || eventType === 'po_approved'
        ? 'cost_control'
        : 'administrator',
    actionTimestamp: new Date(),
    comments:
      eventType === 'po_sent_back'
        ? 'Please request an updated delivery timeline from Apex Thermal. Server room installation cannot conflict with Monday maintenance window.'
        : eventType === 'po_approved'
        ? 'Technical specifications verified against facility requirements. Approved for payment processing.'
        : eventType === 'payment_complete'
        ? 'Bank transfer released under Voucher #PV-8831. Full settlement completed.'
        : 'PO generated and forwarded for cost control approval.',

    actionUrl: `${appUrl}/minta/tracking`,
  }

  const subject = `[TEST] ${buildWorkflowEmailSubject(data)}`
  const html = renderWorkflowEmailHtml(data)
  const text = renderWorkflowEmailText(data)

  const result = await sendEmail({
    to: guard.user.email,
    subject,
    html,
    text,
  })

  return NextResponse.json({
    success: result.success,
    mocked: result.mocked,
    id: result.id,
    error: result.error,
    recipient: guard.user.email,
  })
}

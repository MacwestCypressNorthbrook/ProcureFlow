import {
  buildWorkflowEmailSubject,
  renderWorkflowEmailHtml,
  renderWorkflowEmailText,
  type WorkflowEmailData,
} from './src/lib/email/templates/workflow-email'

const events = ['po_approved', 'po_sent_back', 'payment_complete', 'converted'] as const

for (const eventType of events) {
  const data: WorkflowEmailData = {
    eventType,
    recipientName: 'Kofi Annan',
    recipientRole: 'engineer',
    requestId: 'REQ-12345678-ABCD',
    requestPurpose: 'Diesel Generator Maintenance Parts & Lubricants',
    requestDescription: 'Standard 250hr overhaul kit for Site A prime generator.',
    department: 'Plant Maintenance',
    projectName: 'Takoradi Harbor Works',
    projectLocation: 'Berth 3',
    requesterName: 'Kofi Annan',
    requesterEmail: 'kofi@site.com',
    requestDate: '2026-09-22T10:00:00Z',
    poId: 'PO-98765432-EFGH',
    poNumber: 'PO-2026-042',
    vendorName: 'Cummins West Africa Ltd',
    totalAmount: 18500.5,
    currency: 'GHS',
    quantity: 3,
    unitRate: 6166.83,
    items: [
      { description: 'High-viscosity fuel filter set', quantity: 6, unit: 'pcs', unit_price: 350, line_total: 2100 },
      { description: 'Synthetic 15W-40 lube oil drums (208L)', quantity: 2, unit: 'drums', unit_price: 5200, line_total: 10400 },
      { description: 'Coolant additive pack & pump seal kit', quantity: 1, unit: 'kit', unit_price: 6000.5, line_total: 6000.5 },
    ],
    performerName: 'Ebenezer Mensah',
    performerRole: 'cost_control',
    actionTimestamp: new Date(),
    comments: eventType === 'po_sent_back' ? 'Oil specification does not match generator manual. Please change to API CI-4 grade.' : 'Approved against approved budget.',
    actionUrl: 'http://localhost:3000/minta/requests/REQ-12345678-ABCD',
  }

  const subject = buildWorkflowEmailSubject(data)
  const html = renderWorkflowEmailHtml(data)
  const text = renderWorkflowEmailText(data)

  console.log(`\n=== EVENT: ${eventType} ===`)
  console.log(`Subject: ${subject}`)
  console.log(`HTML length: ${html.length} chars`)
  console.log(`Contains purpose: ${html.includes('Diesel Generator Maintenance Parts')}`)
  console.log(`Contains project: ${html.includes('Takoradi Harbor Works')}`)
  console.log(`Contains line items: ${html.includes('Synthetic 15W-40 lube oil')}`)
  console.log(`Text preview:\n${text.slice(0, 260)}...\n`)
}

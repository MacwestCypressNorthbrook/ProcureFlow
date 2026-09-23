import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'
import { queryOne, query } from '@/lib/db'
import {
  buildWorkflowEmailSubject,
  renderWorkflowEmailHtml,
  renderWorkflowEmailText,
  type WorkflowEmailData,
  type WorkflowEventType,
} from '@/lib/email/templates/workflow-email'
import type { Request as DbRequest, PurchaseOrder, Project, RequestItem } from '@/lib/types'

export async function GET(request: NextRequest) {
  const guard = await requireRole('administrator', 'super_user')
  if (guard.error) return guard.error

  const searchParams = request.nextUrl.searchParams
  const eventType = (searchParams.get('type') || 'po_approved') as WorkflowEventType
  const selectedRequestId = searchParams.get('requestId')

  let req: DbRequest | null = null
  let po: PurchaseOrder | null = null
  let project: Project | null = null
  let items: RequestItem[] = []

  if (selectedRequestId) {
    req = await queryOne<DbRequest>(`SELECT * FROM public.requests WHERE id = $1 LIMIT 1`, [selectedRequestId])
  } else {
    // Pick the most recent request with a PO or any recent request
    req = await queryOne<DbRequest>(
      `SELECT r.* FROM public.requests r
       JOIN public.purchase_orders po ON po.request_id = r.id
       ORDER BY r.created_at DESC LIMIT 1`
    )
    if (!req) {
      req = await queryOne<DbRequest>(`SELECT * FROM public.requests ORDER BY created_at DESC LIMIT 1`)
    }
  }

  if (req) {
    po = await queryOne<PurchaseOrder>(
      `SELECT * FROM public.purchase_orders WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.id]
    )
    if (req.project_id) {
      project = await queryOne<Project>(`SELECT * FROM public.projects WHERE id = $1 LIMIT 1`, [req.project_id])
    }
    items = await query<RequestItem>(
      `SELECT * FROM public.request_items WHERE request_id = $1 ORDER BY position ASC LIMIT 10`,
      [req.id]
    )
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')

  const data: WorkflowEmailData = {
    eventType,
    recipientName: guard.user.name || 'Alex Morgan',
    recipientRole: guard.user.role,

    // Requisition details tailored to the request
    requestId: req?.id || 'a3c8e9f1-4b21-4d1a-9692-0b2a3c4d5e6f',
    requestPurpose: req?.purpose || 'High-Capacity Backup Diesel Generator (500kVA)',
    requestDescription:
      req?.description ||
      'Heavy-duty commercial generator required for primary power backup during Phase 2 grid maintenance.',
    department: req?.department || 'Site Operations',
    projectName: project?.name || 'Accra Harbour Expansion Phase 2',
    projectLocation: project?.site_location || 'Accra Central Site 4',
    requesterName: req?.guest_name || 'Kwame Mensah',
    requesterEmail: req?.guest_email || 'kwame.mensah@siteops.internal',
    requestDate: req?.created_at || new Date(Date.now() - 3600000 * 48).toISOString(),

    // PO context
    poId: po?.id || 'f4b1c2d3-e4f5-6789-0abc-def123456789',
    poNumber: po?.po_number || 'PO-2026-0842',
    vendorName: po?.vendor_name || 'West Coast Industrial Equipment Ltd.',
    totalAmount:
      po?.total_amount != null
        ? Number(po.total_amount)
        : req?.total_amount != null
        ? Number(req.total_amount)
        : 68500,
    currency: req?.currency || 'GHS',
    quantity: po?.quantity || req?.estimated_quantity || 1,
    unitRate: po?.unit_rate || req?.estimated_unit_rate || 68500,

    items:
      items.length > 0
        ? items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
            line_total: i.line_total,
          }))
        : [
            {
              description: 'Caterpillar 500kVA Standby Generator Set with Soundproof Enclosure',
              quantity: 1,
              unit: 'Unit',
              unit_price: 54000,
              line_total: 54000,
            },
            {
              description: 'Automatic Transfer Switch (ATS) 800A 3-Phase',
              quantity: 1,
              unit: 'Set',
              unit_price: 9500,
              line_total: 9500,
            },
            {
              description: 'On-site rigging, installation, testing and commissioning',
              quantity: 1,
              unit: 'Service',
              unit_price: 5000,
              line_total: 5000,
            },
          ],

    performerName: guard.user.name || 'Adjoa Boakye',
    performerRole:
      eventType === 'payment_complete'
        ? 'finance'
        : eventType === 'po_sent_back' || eventType === 'po_approved'
        ? 'cost_control'
        : 'administrator',
    actionTimestamp: new Date(),
    comments:
      eventType === 'po_sent_back'
        ? 'The vendor quote submitted does not include VAT invoice breakdown and manufacturer warranty certificate. Please attach the signed 2-year warranty schedule and resubmit for approval.'
        : eventType === 'po_approved'
        ? 'Cost Control evaluation completed and approved against Q3 Capex budget code 4100-OPS.'
        : eventType === 'payment_complete'
        ? 'Transfer completed via Bank Wire Transfer (Ref: TR-9482910) to vendor account.'
        : 'Official PO generated from requisition. Sourcing from approved vendor list.',

    actionUrl: `${appUrl}/minta/tracking`,
  }

  const subject = buildWorkflowEmailSubject(data)
  const html = renderWorkflowEmailHtml(data)
  const text = renderWorkflowEmailText(data)

  return NextResponse.json({
    data: {
      eventType,
      subject,
      html,
      text,
      previewData: data,
    },
  })
}

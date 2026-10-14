import { requirePageRole } from '@/lib/auth-guard'
import { can } from '@/lib/roles'
import { query } from '@/lib/db'
import { getRequestWindowSettings } from '@/lib/settings'
import { getNotificationSettings } from '@/lib/notification-settings'
import AdminClient, { type AuditEntry, type AdminRequestRow } from '@/components/admin/AdminClient'
import type { AdminPurchaseOrder, AdminInvoice } from '@/components/admin/report-types'
import { poHasSupplierColumn } from '@/lib/po-supplier'
import type { SupplierRow } from '@/components/admin/SuppliersPanel'
import type {
  ProjectWithMemberCount,
  UserWithProjects,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const user = await requirePageRole('administrator', 'super_user')

  // People and the audit trail are Super User data. Fetching them for an
  // Administrator would ship the rows in the RSC payload even with the tab
  // hidden, so the queries are skipped outright.
  const maySeeUsers = can(user.role, 'admin:users')
  const maySeeAudit = can(user.role, 'admin:audit')
  const maySeePreferences = can(user.role, 'admin:preferences')

  // Which supplier a PO covers: its supplier_id once migration 017 is applied
  // and the PO carries one; otherwise its vendor name, normalized. Built here
  // because the column may not exist yet on a database the code reaches first.
  const nameMatch = `regexp_replace(lower(COALESCE(po.vendor_name, '')), '[^a-z0-9]', '', 'g') = regexp_replace(lower(COALESCE(s.name, '')), '[^a-z0-9]', '', 'g') AND regexp_replace(lower(COALESCE(po.vendor_name, '')), '[^a-z0-9]', '', 'g') <> ''`
  const poMatchesSupplier = (await poHasSupplierColumn())
    ? `(CASE WHEN po.supplier_id IS NOT NULL THEN po.supplier_id = s.id ELSE ${nameMatch} END)`
    : `(${nameMatch})`

  // Supplier invoices live in a table that migration 016 adds; until it is
  // applied the Invoices tab simply shows nothing rather than breaking the page.
  const invoicesPromise = query<AdminInvoice>(
    `SELECT si.id, si.request_id, si.supplier_id, si.invoice_number, si.invoice_date, si.amount,
            si.status, si.notes, si.created_at, si.verified_at,
            s.name AS supplier_name,
            r.purpose AS request_purpose,
            r.status AS request_status,
            pr.name AS project_name,
            COALESCE(eu.name, r.guest_name) AS engineer_name,
            rb.name AS recorded_by_name,
            vb.name AS verified_by_name,
            ra.id AS attachment_id,
            ra.file_name AS attachment_name,
            ra.file_url AS attachment_url,
            (SELECT string_agg(po.po_number, ', ' ORDER BY po.created_at)
               FROM public.purchase_orders po
              WHERE po.request_id = si.request_id
                AND ${poMatchesSupplier}) AS po_numbers,
            (SELECT COALESCE(SUM(ri.line_total), 0) FROM public.request_items ri
              WHERE ri.request_id = si.request_id AND ri.supplier_id = si.supplier_id) AS supplier_requisitioned
       FROM public.supplier_invoices si
       JOIN public.suppliers s ON s.id = si.supplier_id
       LEFT JOIN public.requests r ON r.id = si.request_id
       LEFT JOIN public.projects pr ON pr.id = r.project_id
       LEFT JOIN public.users eu ON eu.id = r.created_by
       LEFT JOIN public.users rb ON rb.id = si.recorded_by
       LEFT JOIN public.users vb ON vb.id = si.verified_by
       LEFT JOIN public.request_attachments ra ON ra.id = si.attachment_id
      ORDER BY si.invoice_date DESC, si.created_at DESC
      LIMIT 2000`
  ).catch((err) => {
    console.error('Supplier invoices unavailable for the admin report:', err)
    return [] as AdminInvoice[]
  })

  const [users, projects, suppliers, requests, pos, auditTrail, requestWindow, notificationSettings] = await Promise.all([
    maySeeUsers
      ? query<UserWithProjects>(
      `SELECT u.*,
              COALESCE(
                json_agg(
                  json_build_object('id', p.id, 'name', p.name, 'code', p.code)
                  ORDER BY p.name
                ) FILTER (WHERE p.id IS NOT NULL),
                '[]'
              ) AS projects
         FROM public.users u
         LEFT JOIN public.project_members pm ON pm.user_id = u.id
         LEFT JOIN public.projects p ON p.id = pm.project_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT 500`
        )
      : Promise.resolve([]),
    query<ProjectWithMemberCount>(
      `SELECT p.*, COUNT(pm.user_id)::int AS member_count
         FROM public.projects p
         LEFT JOIN public.project_members pm ON pm.project_id = p.id
        GROUP BY p.id
        ORDER BY p.status = 'archived', p.name ASC`
    ),
    query<SupplierRow>(
      `SELECT s.*, COUNT(ri.id)::int AS usage_count
         FROM public.suppliers s
         LEFT JOIN public.request_items ri ON ri.supplier_id = s.id
        GROUP BY s.id
        ORDER BY s.is_active DESC, s.name ASC`
    ),
    query<AdminRequestRow>(
      // Everything the Requests tab filters and exports on: who raised it, which
      // stage holds it and since when, and every purchase order against it.
      `SELECT r.*,
              pr.name AS project_name,
              u.name AS requester_name,
              u.email AS requester_email,
              COALESCE(
                (SELECT MAX(a.created_at) FROM public.request_approvals a WHERE a.request_id = r.id),
                r.created_at
              ) AS stage_since,
              po.id AS po_id,
              po.po_number,
              po.status AS po_status,
              po.vendor_name AS po_vendor_name,
              po.total_amount AS po_amount,
              pos.po_count,
              pos.po_numbers
       FROM public.requests r
       LEFT JOIN public.projects pr ON pr.id = r.project_id
       LEFT JOIN public.users u ON u.id = r.created_by
       LEFT JOIN LATERAL (
         SELECT id, po_number, status, vendor_name, total_amount
         FROM public.purchase_orders
         WHERE request_id = r.id
         ORDER BY created_at DESC
         LIMIT 1
       ) po ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS po_count,
                string_agg(po_number, ', ' ORDER BY created_at) AS po_numbers
         FROM public.purchase_orders
         WHERE request_id = r.id
       ) pos ON true
       ORDER BY r.created_at DESC
       LIMIT 1000`
    ),
    query<AdminPurchaseOrder>(
      // Everything a purchase-order report depends on, resolved in one pass. A
      // PO is matched to "its" supplier lines by vendor name, normalized the way
      // the UI's vendorKey() does, since POs do not store a supplier id.
      `SELECT po.*,
              r.purpose AS request_purpose,
              r.status AS request_status,
              r.created_at AS request_created_at,
              r.total_amount AS request_total,
              r.department,
              pr.name AS project_name,
              pr.code AS project_code,
              COALESCE(eu.name, r.guest_name) AS engineer_name,
              cb.name AS raised_by_name,
              (SELECT COALESCE(SUM(pp.amount), 0) FROM public.po_payments pp WHERE pp.po_id = po.id) AS paid_amount,
              (SELECT COUNT(*)::int FROM public.po_attachments pa WHERE pa.po_id = po.id) AS document_count,
              doc.id AS document_id,
              doc.file_name AS document_name,
              (SELECT COUNT(*)::int FROM public.purchase_orders o WHERE o.request_id = po.request_id) AS sibling_count,
              (SELECT string_agg(DISTINCT s.name, ', ')
                 FROM public.request_items ri JOIN public.suppliers s ON s.id = ri.supplier_id
                WHERE ri.request_id = po.request_id) AS requisition_suppliers,
              sl.line_count AS supplier_line_count,
              sl.items AS supplier_items,
              sl.value AS supplier_requisitioned
         FROM public.purchase_orders po
         LEFT JOIN public.requests r ON r.id = po.request_id
         LEFT JOIN public.projects pr ON pr.id = r.project_id
         LEFT JOIN public.users eu ON eu.id = r.created_by
         LEFT JOIN public.users cb ON cb.id = po.created_by
         LEFT JOIN LATERAL (
              SELECT pa.id, pa.file_name FROM public.po_attachments pa
               WHERE pa.po_id = po.id ORDER BY pa.created_at DESC LIMIT 1
         ) doc ON true
         LEFT JOIN LATERAL (
              SELECT COUNT(*)::int AS line_count,
                     string_agg(ri.description, '; ' ORDER BY ri.position) AS items,
                     COALESCE(SUM(ri.line_total), 0) AS value
                FROM public.request_items ri
                JOIN public.suppliers s ON s.id = ri.supplier_id
               WHERE ri.request_id = po.request_id
                 AND ${poMatchesSupplier}
         ) sl ON true
        ORDER BY po.created_at DESC
        LIMIT 2000`
    ),
    maySeeAudit
      ? query<AuditEntry>(
      `SELECT a.*,
              json_build_object('id', po.id, 'purpose', po.purpose, 'status', po.status) as po,
              json_build_object('id', u.id, 'name', u.name, 'email', u.email) as performer
       FROM public.po_audit_trail a
       LEFT JOIN public.purchase_orders po ON po.id = a.po_id
       LEFT JOIN public.users u ON u.id = a.performed_by
       ORDER BY a.created_at DESC
       LIMIT 100`
        )
      : Promise.resolve([]),
    maySeePreferences ? getRequestWindowSettings() : Promise.resolve({ blockedDays: [] }),
    maySeePreferences ? getNotificationSettings() : Promise.resolve(null),
  ])


  const invoices = await invoicesPromise

  return (
    <AdminClient
      user={{ name: user.name, email: user.email }}
      role={user.role}
      users={users}
      projects={projects}
      suppliers={suppliers}
      requests={requests}
      pos={pos}
      invoices={invoices}
      auditTrail={auditTrail}
      requestWindowBlockedDays={requestWindow.blockedDays}
      notificationRoles={notificationSettings?.roles ?? null}
    />
  )
}

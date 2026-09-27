import { requirePageRole } from '@/lib/auth-guard'
import { can } from '@/lib/roles'
import { query } from '@/lib/db'
import { getRequestWindowSettings, getLeadDigestSettings } from '@/lib/settings'
import AdminClient, { type AuditEntry } from '@/components/admin/AdminClient'
import type { SupplierRow } from '@/components/admin/SuppliersPanel'
import type {
  Request,
  PurchaseOrder,
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

  const [users, projects, suppliers, requests, pos, auditTrail, requestWindow, leadDigest] = await Promise.all([
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
    query<Request & { po_id?: string | null; po_number?: string | null; po_status?: string | null; po_vendor_name?: string | null; po_amount?: number | null }>(
      `SELECT r.*,
              pr.name AS project_name,
              po.id as po_id,
              po.po_number as po_number,
              po.status as po_status,
              po.vendor_name as po_vendor_name,
              po.total_amount as po_amount
       FROM public.requests r
       LEFT JOIN public.projects pr ON pr.id = r.project_id
       LEFT JOIN LATERAL (
         SELECT id, po_number, status, vendor_name, total_amount
         FROM public.purchase_orders
         WHERE request_id = r.id
         ORDER BY created_at DESC
         LIMIT 1
       ) po ON true
       ORDER BY r.created_at DESC
       LIMIT 200`
    ),
    query<PurchaseOrder>(`SELECT * FROM public.purchase_orders ORDER BY created_at DESC LIMIT 200`),
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
    maySeePreferences ? getLeadDigestSettings() : Promise.resolve({ enabled: true, dayOfWeek: 4, lastSentOn: null }),
  ])

  return (
    <AdminClient
      user={{ name: user.name, email: user.email }}
      role={user.role}
      users={users}
      projects={projects}
      suppliers={suppliers}
      requests={requests}
      pos={pos}
      auditTrail={auditTrail}
      requestWindowBlockedDays={requestWindow.blockedDays}
      leadDigestEnabled={leadDigest.enabled}
      leadDigestDayOfWeek={leadDigest.dayOfWeek}
    />
  )
}

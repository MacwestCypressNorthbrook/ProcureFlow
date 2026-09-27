import { requirePageRole } from '@/lib/auth-guard'
import { query } from '@/lib/db'
import SupplierDirectory, { type SupplierRow } from '@/components/shared/SupplierDirectory'
import { PageContainer, SectionHeader } from '@/components/shared/ui-kit'
import { Info } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function SupplyChainSuppliersPage() {
  await requirePageRole('supply_chain')

  let suppliers: SupplierRow[] = []

  try {
    // Line count comes along so Supply Chain can see who is actually used;
    // it is the one figure that tells a live supplier from a dormant record.
    suppliers = await query<SupplierRow>(
      `SELECT s.id, s.name, s.category, s.contact_name, s.phone, s.email, s.address,
              s.is_active, s.created_at,
              (SELECT COUNT(*)::int FROM public.request_items ri WHERE ri.supplier_id = s.id) AS usage_count
         FROM public.suppliers s
        ORDER BY s.created_at DESC`
    )
  } catch (err) {
    console.error('Failed to load suppliers from Neon:', err)
  }

  return (
    <PageContainer className="space-y-6">
      <section>
        <SectionHeader title="Suppliers" count={suppliers.length} />
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            The supplier directory, for picking and contacting vendors while you price a requisition. Suppliers are
            maintained by the Administrator, so this list is read-only &mdash; a vendor that is missing can still be
            added from the supplier picker on the requisition itself.
          </span>
        </p>
        <SupplierDirectory suppliers={suppliers} />
      </section>
    </PageContainer>
  )
}

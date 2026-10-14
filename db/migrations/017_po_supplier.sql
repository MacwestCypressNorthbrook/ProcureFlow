-- 017 — a purchase order names its supplier by id
--
-- An Odoo PO is raised to one supplier, and a multi-supplier requisition gets
-- one PO per supplier. Until now the PO only carried `vendor_name`, typed
-- freehand, so every "which supplier does this PO cover" question — supplier
-- coverage on the review screen, PO-vs-requisitioned variance, invoices against
-- a PO — was answered by comparing names, and "Kofi & Sons Ltd" in Odoo did not
-- match "Kofi and Sons" in ProcureFlow.
--
-- `supplier_id` makes the link exact. `vendor_name` stays: it is what the PO
-- document says, and it is the only thing older POs have.
--
-- Additive only, so it is safe to apply before OR after the code: the code
-- checks for the column and falls back to name matching until it exists.

-- One transaction, so a failure part-way never leaves the trigger disabled.
BEGIN;

ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_supplier_id ON public.purchase_orders (supplier_id);

-- The backfill is bookkeeping, not an edit: keep each PO's updated_at as it was.
ALTER TABLE public.purchase_orders DISABLE TRIGGER set_purchase_orders_updated_at;

-- Backfill: link each existing PO to the supplier on its own requisition whose
-- name matches the PO's vendor, ignoring case, spacing and punctuation. Only an
-- unambiguous match is taken; anything else stays NULL and keeps working by name.
WITH candidates AS (
    SELECT po.id AS po_id, s.id AS supplier_id
      FROM public.purchase_orders po
      JOIN public.request_items ri ON ri.request_id = po.request_id
      JOIN public.suppliers s ON s.id = ri.supplier_id
     WHERE po.supplier_id IS NULL
       AND regexp_replace(lower(COALESCE(po.vendor_name, '')), '[^a-z0-9]', '', 'g') <> ''
       AND regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(po.vendor_name), '[^a-z0-9]', '', 'g')
     GROUP BY po.id, s.id
),
unambiguous AS (
    SELECT po_id, MIN(supplier_id::text)::uuid AS supplier_id
      FROM candidates
     GROUP BY po_id
    HAVING COUNT(*) = 1
)
UPDATE public.purchase_orders po
   SET supplier_id = u.supplier_id
  FROM unambiguous u
 WHERE po.id = u.po_id;

ALTER TABLE public.purchase_orders ENABLE TRIGGER set_purchase_orders_updated_at;

COMMIT;

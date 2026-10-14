-- 018 — link the purchase orders migration 017 left unlinked
--
-- 017 only linked a PO when its vendor matched a supplier on that PO's OWN
-- requisition lines. Labour and hire lines rarely name a supplier, so a PO paid
-- to a labour contractor stayed unlinked even where the contractor is in the
-- supplier directory. This widens the match to the whole directory.
--
-- Still only an unambiguous match: exactly one supplier whose name normalizes
-- to the PO's vendor name. Anything else stays NULL and keeps working by name.
--
-- Idempotent — it only touches rows where supplier_id IS NULL — so it is safe
-- to re-run, and safe on any environment.

BEGIN;

-- The backfill is bookkeeping, not an edit: keep each PO's updated_at as it was.
ALTER TABLE public.purchase_orders DISABLE TRIGGER set_purchase_orders_updated_at;

WITH matched AS (
    SELECT po.id AS po_id, MIN(s.id::text)::uuid AS supplier_id
      FROM public.purchase_orders po
      JOIN public.suppliers s
        ON regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(po.vendor_name), '[^a-z0-9]', '', 'g')
     WHERE po.supplier_id IS NULL
       AND regexp_replace(lower(COALESCE(po.vendor_name, '')), '[^a-z0-9]', '', 'g') <> ''
     GROUP BY po.id
    HAVING COUNT(*) = 1
)
UPDATE public.purchase_orders po
   SET supplier_id = m.supplier_id
  FROM matched m
 WHERE po.id = m.po_id;

ALTER TABLE public.purchase_orders ENABLE TRIGGER set_purchase_orders_updated_at;

COMMIT;

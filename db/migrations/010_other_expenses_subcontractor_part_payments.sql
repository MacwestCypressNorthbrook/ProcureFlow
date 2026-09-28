-- ── 1. Expenses that are neither material nor labour ───────────────────────
-- Site costs like permits, haulage or plant hire. Stored as an ordinary line
-- with quantity 1, so `unit_price` carries the amount and `line_total` still
-- computes — no separate money path to keep in step.
ALTER TABLE public.request_items DROP CONSTRAINT IF EXISTS request_items_category_check;
ALTER TABLE public.request_items
    ADD CONSTRAINT request_items_category_check CHECK (category IN ('material', 'labour', 'other'));

-- ── 2. Labour rendered by a sub-contractor ─────────────────────────────────
-- The flag is on the line, because one requisition can mix its own gangs with
-- subcontracted work.
ALTER TABLE public.request_items
    ADD COLUMN IF NOT EXISTS is_subcontractor BOOLEAN NOT NULL DEFAULT false;

-- Supporting paperwork belongs to the line it evidences, not to the whole
-- requisition — a requisition with three subcontracted lines needs three sets.
-- Nullable: ordinary requisition attachments keep hanging off the header.
ALTER TABLE public.request_attachments
    ADD COLUMN IF NOT EXISTS request_item_id UUID REFERENCES public.request_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_request_attachments_item ON public.request_attachments(request_item_id);

-- ── 3. Part payments ───────────────────────────────────────────────────────
-- A purchase order is settled by one or more disbursements. The PO's paid
-- figure is the SUM of these rows, never a boolean — `paid_at` on the PO now
-- means "settled in full", and the ledger below is the truth.
CREATE TABLE IF NOT EXISTS public.po_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    amount NUMERIC(16, 2) NOT NULL CHECK (amount > 0),
    reference TEXT,
    note TEXT,
    paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_payments_po ON public.po_payments(po_id, paid_at DESC);

-- A part-paid purchase order is neither awaiting payment nor settled.
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (
    status IN (
        'draft',
        'pending_cost_control',
        'pending_finance',
        'partially_paid',
        'sent_back',
        'paid',
        'rejected',
        'cancelled',
        -- legacy values kept so historic rows still satisfy the constraint
        'pending_approval',
        'approved'
    )
);

-- Purchase orders already settled before this migration get one ledger row for
-- their full value, so every paid PO reconciles against po_payments.
INSERT INTO public.po_payments (po_id, amount, note, paid_by, paid_at)
SELECT po.id, po.total_amount, 'Recorded before part payments were supported', po.paid_by,
       COALESCE(po.paid_at, po.updated_at)
  FROM public.purchase_orders po
 WHERE po.status = 'paid'
   AND COALESCE(po.total_amount, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.po_payments p WHERE p.po_id = po.id);

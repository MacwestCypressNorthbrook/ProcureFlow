-- ============================================================
-- 002 — Six-stage approval chain
--
-- Requester → Project Lead → Supply Chain → Administrator (creates the PO)
-- → Cost Control → Finance.
--
-- A send-back returns the item to the stage immediately before the one that
-- bounced it; once fixed, it resumes at the stage that bounced it rather than
-- walking the whole chain again. `sent_back_to` records who holds it now,
-- `return_to_stage` where it resumes.
-- ============================================================

-- ── Requests ────────────────────────────────────────────────
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS sent_back_to TEXT;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS return_to_stage TEXT;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS sent_back_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS sent_back_at TIMESTAMPTZ;

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;

-- Converted requests follow their purchase order's stage; everything else maps
-- onto the front of the chain, since no stage before the Project Lead existed.
UPDATE public.requests r
   SET status = CASE
     WHEN po.status IN ('paid', 'completed') THEN 'completed'
     WHEN po.status IN ('approved', 'pending_payment') THEN 'pending_finance'
     WHEN po.status IN ('sent_back', 'revision_required') THEN 'sent_back'
     ELSE 'pending_cost_control'
   END
  FROM public.purchase_orders po
 WHERE po.request_id = r.id
   AND r.status IN ('converted', 'approved');

UPDATE public.requests
   SET status = CASE status
     WHEN 'draft' THEN 'draft'
     WHEN 'rejected' THEN 'rejected'
     WHEN 'cancelled' THEN 'cancelled'
     WHEN 'completed' THEN 'completed'
     WHEN 'sent_back' THEN 'sent_back'
     WHEN 'pending_lead' THEN 'pending_lead'
     WHEN 'pending_supply_chain' THEN 'pending_supply_chain'
     WHEN 'pending_admin' THEN 'pending_admin'
     WHEN 'pending_cost_control' THEN 'pending_cost_control'
     WHEN 'pending_finance' THEN 'pending_finance'
     -- 'pending', 'new', 'under_review', 'reviewing', and any converted row
     -- with no purchase order: back to the first reviewer.
     ELSE 'pending_lead'
   END;

-- A request sitting with the requester needs a holder recorded.
UPDATE public.requests
   SET sent_back_to = COALESCE(sent_back_to, 'requester'),
       return_to_stage = COALESCE(return_to_stage, 'lead')
 WHERE status = 'sent_back';

ALTER TABLE public.requests ADD CONSTRAINT requests_status_check CHECK (
    status IN (
        'draft',
        'pending_lead',
        'pending_supply_chain',
        'pending_admin',
        'pending_cost_control',
        'pending_finance',
        'sent_back',
        'completed',
        'rejected',
        'cancelled'
    )
);

CREATE INDEX IF NOT EXISTS idx_requests_sent_back_to ON public.requests(sent_back_to);

-- ── Purchase orders ─────────────────────────────────────────
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS sent_back_to TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS return_to_stage TEXT;

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

UPDATE public.purchase_orders
   SET status = CASE status
     WHEN 'draft' THEN 'draft'
     WHEN 'rejected' THEN 'rejected'
     WHEN 'cancelled' THEN 'cancelled'
     WHEN 'paid' THEN 'paid'
     WHEN 'completed' THEN 'paid'
     WHEN 'approved' THEN 'pending_finance'
     WHEN 'pending_payment' THEN 'pending_finance'
     WHEN 'sent_back' THEN 'sent_back'
     WHEN 'revision_required' THEN 'sent_back'
     WHEN 'pending_finance' THEN 'pending_finance'
     WHEN 'pending_cost_control' THEN 'pending_cost_control'
     -- 'pending_approval' and the legacy 'pending_sam': Cost Control reviews
     -- the purchase order before Finance sees it.
     ELSE 'pending_cost_control'
   END;

UPDATE public.purchase_orders
   SET sent_back_to = COALESCE(sent_back_to, 'admin'),
       return_to_stage = COALESCE(return_to_stage, 'cost_control')
 WHERE status = 'sent_back';

ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (
    status IN (
        'draft',
        'pending_cost_control',
        'pending_finance',
        'sent_back',
        'paid',
        'rejected',
        'cancelled'
    )
);

-- ── Approval trail ──────────────────────────────────────────
-- One row per decision, across both the request and its purchase order, so the
-- whole chain reads as a single history with the comment that came with it.
CREATE TABLE IF NOT EXISTS public.request_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    stage TEXT NOT NULL,
    action TEXT NOT NULL CHECK (
        action IN ('submitted', 'approved', 'sent_back', 'resubmitted', 'po_created', 'paid', 'rejected')
    ),
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_approvals_request ON public.request_approvals(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_approvals_po ON public.request_approvals(po_id);

-- Seed the trail so migrated rows are not blank: record the original submission.
INSERT INTO public.request_approvals (request_id, stage, action, performed_by, comment, created_at)
SELECT r.id, 'requester', 'submitted', r.created_by, 'Migrated from the previous workflow.', r.created_at
  FROM public.requests r
 WHERE NOT EXISTS (
     SELECT 1 FROM public.request_approvals a WHERE a.request_id = r.id
 );

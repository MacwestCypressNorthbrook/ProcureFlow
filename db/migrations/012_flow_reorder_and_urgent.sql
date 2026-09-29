-- ============================================================
-- 012 — Cost Control before Administration, and urgent requisitions
--
-- Two changes, both of which move the end of the chain:
--
-- 1. The chain is now
--      Requester → Project Lead → Supply Chain → Cost Control → Administrator
--    Cost Control audits the rates and the vendor invoices Supply Chain
--    attached, and only then does the Administrator do their part and close
--    the requisition. Administration is the terminal stage; nothing follows it.
--
-- 2. A Project Lead can mark a requisition urgent. An urgent requisition still
--    walks the same chain, but Supply Chain is notified at once — in-app and by
--    email — instead of waiting for the bundled stage digest.
-- ============================================================

-- ── 1. Re-point rows that were sitting at the old Administrator stage ───────
-- Under the old order the Administrator sat between Supply Chain and Cost
-- Control, so a row at `pending_admin` had cleared Supply Chain but not Cost
-- Control. Under the new order that is exactly `pending_cost_control`.
UPDATE public.requests
   SET status = 'pending_cost_control',
       updated_at = now()
 WHERE status = 'pending_admin';

-- A row sent back TO the old admin stage belongs with Supply Chain now, since
-- that is the stage immediately before Cost Control.
UPDATE public.requests
   SET sent_back_to = 'supply_chain',
       return_to_stage = 'cost_control',
       updated_at = now()
 WHERE status = 'sent_back'
   AND sent_back_to = 'admin';

-- Anything that was going to RESUME at the old admin stage resumes at Cost
-- Control instead.
UPDATE public.requests
   SET return_to_stage = 'cost_control',
       updated_at = now()
 WHERE return_to_stage = 'admin';

UPDATE public.purchase_orders
   SET sent_back_to = 'supply_chain',
       return_to_stage = 'cost_control',
       updated_at = now()
 WHERE status = 'sent_back'
   AND sent_back_to = 'admin';

-- ── 2. Urgent requisitions ──────────────────────────────────────────────────
-- Flagged by the Project Lead at their own stage. `urgent_reason` is required
-- by the API rather than the schema, so a legacy row is never made invalid.
ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS urgent_reason TEXT,
    ADD COLUMN IF NOT EXISTS urgent_marked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS urgent_marked_at TIMESTAMPTZ;

-- Urgent items are pulled to the top of every queue, so the queue's sort key
-- leads with this column.
CREATE INDEX IF NOT EXISTS idx_requests_urgent_status
    ON public.requests(is_urgent DESC, status, created_at DESC);

-- ── 3. The approval trail gains two actions ─────────────────────────────────
-- `marked_urgent` records the Project Lead's emergency escalation; `completed`
-- records the Administrator closing the requisition at the end of the chain.
-- Both are written by the transition endpoint, and the old CHECK rejects them.
ALTER TABLE public.request_approvals DROP CONSTRAINT IF EXISTS request_approvals_action_check;
ALTER TABLE public.request_approvals ADD CONSTRAINT request_approvals_action_check CHECK (
    action IN (
        'submitted',
        'approved',
        'sent_back',
        'resubmitted',
        'po_created',
        'marked_urgent',
        'completed',
        'paid',
        'rejected'
    )
);

-- ── 4. Purchase order status vocabulary ─────────────────────────────────────
-- Administration signs the purchase order off at the end of the chain, so an
-- order can now sit at 'pending_admin' while it is saved but not yet
-- authorized. Every value the live constraint already permits is repeated
-- here deliberately: re-adding a CHECK REPLACES it, so omitting a value
-- silently revokes it. 'partially_paid' in particular is what the part-payment
-- work in migration 010 writes, and dropping it would break that feature the
-- next time a part payment was recorded.
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (
    status IN (
        -- current vocabulary
        'draft',
        'pending_cost_control',
        'pending_admin',
        'pending_finance',
        'partially_paid',
        'sent_back',
        'approved',
        'paid',
        'rejected',
        'cancelled',
        -- legacy, still present on older rows
        'pending_approval'
    )
);

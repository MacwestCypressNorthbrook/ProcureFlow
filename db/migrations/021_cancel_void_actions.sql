-- 021 — record cancelling and voiding a requisition in its approval trail
--
-- `cancelled` is written when a requisition is withdrawn before a purchase
-- order exists; `voided` when one that was already completed is reversed and
-- its purchase orders cancelled with it. The status itself is `cancelled` in
-- both cases — requests_status_check already permits it.
--
-- Re-adding a CHECK replaces it, so every value the live constraint permits
-- (as of migration 014) is repeated here; omitting one would silently revoke it.
--
-- Apply BEFORE deploying the code that writes these actions.

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
        'rejected',
        'items_removed',
        'edited',
        'cancelled',
        'voided'
    )
);

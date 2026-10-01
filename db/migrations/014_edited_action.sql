-- 014 — record edits to a requisition in its approval trail
--
-- Editing a requisition replaces every line item and its total. Leads and
-- elevated roles may do that at any stage, so without a trail entry the amount
-- a reviewer approved could change afterwards with no record of who changed it
-- or from what. `edited` is written by PUT /api/requests/[id], with the change
-- in totals and line count in the comment.
--
-- Re-adding a CHECK replaces it, so every value the live constraint permits
-- (as of migration 013) is repeated here; omitting one would silently revoke it.
--
-- Apply BEFORE deploying the code that writes `edited`: until then every
-- requisition edit would fail the constraint.

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
        'edited'
    )
);

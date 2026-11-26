-- 022 — record recalling an approval in the approval trail
--
-- `recalled` is written when whoever moved a requisition forward (a reviewer
-- who approved it, or the requester who submitted it) pulls it back before the
-- next stage has acted on it. See src/lib/recall.ts.
--
-- Re-adding a CHECK replaces it, so every value the live constraint permits
-- (as of migration 021) is repeated here; omitting one would silently revoke it.
--
-- Apply BEFORE deploying the code that writes this action.

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
        'voided',
        'recalled'
    )
);

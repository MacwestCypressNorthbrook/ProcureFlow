-- 013 — record Supply Chain removing materials from a requisition
--
-- Supply Chain can now drop line items that will not be procured. The line is
-- deleted outright, so without an entry in the approval trail nobody later in
-- the chain — or the engineer who raised it — could tell a material had ever
-- been requested. `items_removed` is written by the pricing endpoint, with the
-- removed materials listed in the comment.
--
-- Re-adding a CHECK replaces it, so every value the live constraint permits
-- (as of migration 012) is repeated here; omitting one would silently revoke it.

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
        'items_removed'
    )
);

-- One-off: "edited" history rows made by an engineer (the requester role) were filed under the stage holding the requisition, so they
-- read as e.g. "Project Lead · <engineer>". Refile them under 'requester'.
-- Run the SELECT first; the UPDATE touches exactly the rows it lists.

-- 1) Dry run
SELECT ra.id, ra.request_id, ra.stage, u.name, u.role, ra.comment, ra.created_at
FROM public.request_approvals ra
JOIN public.users u ON u.id = ra.performed_by
WHERE ra.action = 'edited'
  AND ra.stage <> 'requester'
  AND ra.po_id IS NULL
  AND lower(u.role) IN ('engineer', 'employee', 'minta')
ORDER BY ra.created_at;

-- 2) Apply (same WHERE)
BEGIN;
UPDATE public.request_approvals ra
SET stage = 'requester'
FROM public.users u
WHERE u.id = ra.performed_by
  AND ra.action = 'edited'
  AND ra.stage <> 'requester'
  AND ra.po_id IS NULL
  AND lower(u.role) IN ('engineer', 'employee', 'minta');
-- Expect 2 rows for Richard Agyei's requisition (plus any similar ones listed
-- in the dry run). COMMIT if the count matches, otherwise ROLLBACK.
COMMIT;

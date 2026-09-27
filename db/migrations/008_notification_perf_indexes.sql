-- The notifications endpoint is polled by every open session (NotificationBell),
-- making "WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50" the single
-- most frequently executed query in the app. A composite index lets Postgres
-- walk straight to a user's newest rows instead of filtering then sorting.
-- The lone user_id index this replaces in practice is now redundant for that
-- query but is left in place in case anything else filters on user_id alone.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- getStageDecisions (the "what has this stage already decided" log) filters by
-- stage and orders by created_at; nothing indexed that combination before.
CREATE INDEX IF NOT EXISTS idx_request_approvals_stage_created ON public.request_approvals(stage, created_at DESC);

-- 015 — collect emails for roles that receive a daily or weekly digest
--
-- Email delivery is now configured per role in Admin (immediately, daily,
-- weekly, or off; see src/lib/notification-settings.ts). For a role on a digest,
-- each email it would have been sent is held here instead, and the dispatcher
-- (run off the reminders cron) sends one collated email per person on the
-- configured day and hour, then deletes the rows it sent.
--
-- Kept apart from `notifications` on purpose: users can clear their in-app
-- notifications at any time, and that must not empty their pending digest.
--
-- Idempotent: safe to re-run. Apply BEFORE deploying the code that writes here.

CREATE TABLE IF NOT EXISTS public.email_digest_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- Groups a digest's updates under the requisition they are about.
    request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_digest_queue_user ON public.email_digest_queue(user_id, queued_at);

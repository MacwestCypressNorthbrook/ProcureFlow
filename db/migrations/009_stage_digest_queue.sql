-- Holds requisitions that just cleared a review stage, waiting to be bundled
-- into one email to the next stage instead of firing one email per approval.
--
-- A stage's holders still get an in-app notification the instant each item
-- moves to them (see `notifyStage` in the transition route); this table only
-- feeds the emailed summary. The dispatcher (dispatchStageDigests, run off
-- the same cron as reminders and the Lead digest) sends the batch once
-- nothing new has landed for a short "quiet period", or once a maximum wait
-- has passed — whichever comes first — then clears the rows it sent.
CREATE TABLE IF NOT EXISTS public.stage_digest_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage TEXT NOT NULL,
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (stage, request_id)
);

CREATE INDEX IF NOT EXISTS idx_stage_digest_queue_stage ON public.stage_digest_queue(stage, queued_at);

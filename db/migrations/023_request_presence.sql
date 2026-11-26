-- 023 — who currently has a requisition open at the stage that holds it
--
-- Advisory only: it tells a reviewer "Daniel has this open" so two people at
-- the same stage do not work the same requisition. It never blocks an action —
-- the transition route's status guard is what stops a double decision.
--
-- Written only by user activity (opening the page, interacting with it), never
-- by a timer, so it adds no compute wake-ups of its own. A row is "live" while
-- last_seen_at is within the TTL in src/lib/presence.ts; stale rows are simply
-- ignored on read and pruned opportunistically on write — no cleanup job.
--
-- The app tolerates this table being absent (it shows no presence), so this
-- migration may be applied before or after the code deploys.

CREATE TABLE IF NOT EXISTS public.request_presence (
    request_id   UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stage        TEXT NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_request_presence_last_seen
    ON public.request_presence (last_seen_at);

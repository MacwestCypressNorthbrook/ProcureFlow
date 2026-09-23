-- ============================================================
-- 004 — Rate limiting buckets
--
-- Counters live in Postgres rather than in process memory because the app runs
-- serverless: every instance would otherwise keep its own count, and an
-- attacker spreading requests across instances would never hit a limit.
--
-- One row per (bucket, window). Old windows are disposable; a periodic delete
-- keeps the table small.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
    bucket TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

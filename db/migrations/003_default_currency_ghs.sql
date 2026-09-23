-- ============================================================
-- 003 — Ghana cedis is the organisation's currency
--
-- The schema defaulted new requisitions to USD while every screen formatted
-- amounts as GHS, so a row created without an explicit currency claimed to be
-- dollars. Existing rows are corrected: no amount in this system was ever
-- entered or approved in dollars.
-- ============================================================

ALTER TABLE public.requests ALTER COLUMN currency SET DEFAULT 'GHS';

UPDATE public.requests SET currency = 'GHS' WHERE currency IS NULL OR currency = 'USD';

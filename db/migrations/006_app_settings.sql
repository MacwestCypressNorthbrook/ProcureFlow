-- Generic workspace settings, key/value.
--
-- First user: the requisition submission window (which weekdays engineers may
-- raise a new requisition on — a Super User-configurable break, not a
-- hardcoded one) but any future workspace-wide toggle can live here without a
-- new table or migration.
--
-- Idempotent: safe to re-run against an existing ProcureFlow database.

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

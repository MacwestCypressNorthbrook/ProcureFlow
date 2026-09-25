-- Supply Chain pricing.
--
-- Engineers may submit a requisition with materials but no prices — they
-- often don't know what the market rate or a specific vendor's quote is.
-- Supply Chain fills in the unit price (and supplier) per line once they've
-- sourced the materials, and may apply one overall discount off the
-- materials subtotal (e.g. a vendor discount on a bulk quote) before the
-- requisition's total is computed.
--
-- Idempotent: safe to re-run against an existing ProcureFlow database.

ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

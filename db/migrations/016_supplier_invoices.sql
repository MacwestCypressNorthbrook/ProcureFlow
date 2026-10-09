-- 016 — supplier invoices as records, not just files
--
-- Until now an invoice was an attachment on a requisition: nothing said which
-- supplier issued it, its number, its date or its amount, so spend could not be
-- reconciled per supplier and the same invoice could be paid twice unnoticed.
--
-- One row per invoice. `attachment_id` optionally ties it to the uploaded
-- document, but the row stands on its own: a document can arrive later or on
-- paper. Recorded by Supply Chain or Cost Control; Cost Control marks it
-- verified once checked against the document.
--
-- The unique index on (supplier, invoice number) is the duplicate-payment
-- control: the same number from the same supplier cannot be recorded twice,
-- on this requisition or any other. Case and surrounding spaces are ignored.
--
-- Additive only — no existing table or constraint changes — so it is safe to
-- apply before OR after the code. The code tolerates the table being absent and
-- simply hides the invoices panel until it exists.

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    amount NUMERIC(16, 2) NOT NULL CHECK (amount > 0),
    attachment_id UUID REFERENCES public.request_attachments(id) ON DELETE SET NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'verified')),
    recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_invoices_unique_number
    ON public.supplier_invoices (supplier_id, lower(btrim(invoice_number)));
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_request ON public.supplier_invoices (request_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_date ON public.supplier_invoices (supplier_id, invoice_date DESC);

DROP TRIGGER IF EXISTS set_supplier_invoices_updated_at ON public.supplier_invoices;
CREATE TRIGGER set_supplier_invoices_updated_at
    BEFORE UPDATE ON public.supplier_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

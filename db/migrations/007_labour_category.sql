-- Requisition lines can now be materials or labour, so engineers can request
-- labourers/artisans for a service alongside (or instead of) materials.
ALTER TABLE public.request_items
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'material'
    CHECK (category IN ('material', 'labour'));

CREATE INDEX IF NOT EXISTS idx_request_items_category ON public.request_items(category);

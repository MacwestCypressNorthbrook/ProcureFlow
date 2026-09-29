-- Migration 011: Cost Control Invoice Audit & Multi-Vendor Review
-- Tracks invoice review status, notes, and reviewer info for attached vendor documents

ALTER TABLE public.request_attachments
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

CREATE INDEX IF NOT EXISTS idx_request_attachments_request_status
  ON public.request_attachments(request_id, status);

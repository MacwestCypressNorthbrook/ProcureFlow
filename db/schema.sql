-- Neon PostgreSQL Schema for ProcureFlow
-- Region: AWS US East 2 (Ohio)
-- Project: procureflow

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
-- Roles: engineer, supply_chain, finance, cost_control, project_lead, super_user, administrator
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'engineer' CHECK (
        role IN (
            'engineer',
            'supply_chain',
            'finance',
            'cost_control',
            'project_lead',
            'super_user',
            'administrator',
            'adminstrator'
        )
    ),
    company_id UUID,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 2. Requests Table
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose TEXT NOT NULL,
    description TEXT,
    department TEXT,
    estimated_quantity NUMERIC,
    estimated_unit_rate NUMERIC,
    total_amount NUMERIC,
    currency TEXT DEFAULT 'GHS',
    guest_name TEXT,
    guest_email TEXT,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('draft', 'pending', 'under_review', 'approved', 'rejected', 'converted', 'cancelled')
    ),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_created_by ON public.requests(created_by);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON public.requests(created_at DESC);

-- 3. Request Attachments (stored in Neon Object Storage: supporting_documents)
CREATE TABLE IF NOT EXISTS public.request_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_attachments_request_id ON public.request_attachments(request_id);

-- 4. Purchase Orders Table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT UNIQUE,
    request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL,
    purpose TEXT NOT NULL,
    description TEXT,
    vendor_name TEXT,
    quantity NUMERIC,
    unit_rate NUMERIC,
    total_amount NUMERIC,
    file_path TEXT,
    file_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (
        status IN ('draft', 'pending_approval', 'approved', 'rejected', 'paid', 'sent_back', 'cancelled')
    ),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    paid_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_request_id ON public.purchase_orders(request_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_created_by ON public.purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_po_created_at ON public.purchase_orders(created_at DESC);

-- 5. PO Attachments Table (stored in Neon Object Storage: supporting_documents)
CREATE TABLE IF NOT EXISTS public.po_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_attachments_po_id ON public.po_attachments(po_id);

-- 6. PO Audit Trail Table
CREATE TABLE IF NOT EXISTS public.po_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_audit_trail_po_id ON public.po_audit_trail(po_id);
CREATE INDEX IF NOT EXISTS idx_po_audit_trail_created_at ON public.po_audit_trail(created_at DESC);

-- 7. PO Comments Table
CREATE TABLE IF NOT EXISTS public.po_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_name TEXT,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_comments_po_id ON public.po_comments(po_id);
CREATE INDEX IF NOT EXISTS idx_po_comments_created_at ON public.po_comments(created_at ASC);

-- 8. In-App Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'approval', 'reminder', 'warning', 'success')),
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- 9. Reminders Table
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('request', 'purchase_order')),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT,
    due_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'dismissed', 'cancelled')),
    sent_at TIMESTAMPTZ,
    last_sent_via TEXT CHECK (last_sent_via IN ('email_resend', 'email_smtp', 'in_app')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_status_due ON public.reminders(status, due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_target ON public.reminders(target_type, target_id);

-- 10. Auto-update updated_at timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_requests_updated_at ON public.requests;
CREATE TRIGGER set_requests_updated_at
    BEFORE UPDATE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER set_purchase_orders_updated_at
    BEFORE UPDATE ON public.purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_reminders_updated_at ON public.reminders;
CREATE TRIGGER set_reminders_updated_at
    BEFORE UPDATE ON public.reminders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 11. Projects, suppliers and requisition line items
-- (mirrors db/migrations/001_projects_suppliers_items.sql)

-- ── Projects (a.k.a. project sites) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    site_location TEXT,
    client TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'archived')),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_name ON public.projects(name);

-- ── Project membership (many-to-many: a user works across several sites) ────
CREATE TABLE IF NOT EXISTS public.project_members (
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);

-- ── Suppliers / vendors ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    tin TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness so "Ashanti Steel" and "ashanti steel" cannot both exist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_name_unique ON public.suppliers(lower(name));
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(is_active);

-- ── User lifecycle ──────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- ── Requisition header gains a project site ─────────────────────────────────
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requests_project_id ON public.requests(project_id);

-- ── Requisition line items (material, qty, unit price, supplier) ────────────
-- line_total is generated: the database is the single source of truth for money.
CREATE TABLE IF NOT EXISTS public.request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    unit TEXT,
    unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    line_total NUMERIC(16, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_items_request ON public.request_items(request_id, position);
CREATE INDEX IF NOT EXISTS idx_request_items_supplier ON public.request_items(supplier_id);

-- ── updated_at triggers for the new tables ──────────────────────────────────
DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER set_suppliers_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── Sam approval columns on purchase_orders ─────────────────────────────────
-- The approval routes and every PO detail view read these, so their absence
-- breaks approve / send-back / reject outright. They deliberately sit beside
-- approved_by / approved_at / rejection_reason, which the same routes also
-- write; the pair is redundant and worth consolidating in a later pass.
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS sam_approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS sam_approved_at TIMESTAMPTZ;
ALTER TABLE public.purchase_orders
    ADD COLUMN IF NOT EXISTS sam_rejection_reason TEXT;

-- ── Request status vocabulary ───────────────────────────────────────────────
-- The stage-based workflow in src/lib/workflow.ts is the source of truth for
-- these values. The original CHECK predates it and rejects every new status,
-- which blocks raising a requisition outright. Legacy values are kept so rows
-- written before the workflow landed still satisfy the constraint.
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_status_check CHECK (
    status IN (
        -- current workflow
        'draft',
        'pending_lead',
        'pending_supply_chain',
        'pending_admin',
        'pending_cost_control',
        'pending_finance',
        'sent_back',
        'completed',
        'rejected',
        'cancelled',
        -- legacy
        'pending',
        'under_review',
        'approved',
        'converted'
    )
);

-- ── Labour lines on a requisition ────────────────────────────────────────
-- (mirrors db/migrations/007_labour_category.sql)
-- Engineers can request labour (labourers/artisans for a service) alongside
-- or instead of materials on the same requisition.
ALTER TABLE public.request_items
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'material'
    CHECK (category IN ('material', 'labour'));

CREATE INDEX IF NOT EXISTS idx_request_items_category ON public.request_items(category);

-- ── Notification & decision-log performance indexes ─────────────────────────
-- (mirrors db/migrations/008_notification_perf_indexes.sql)
-- The notifications endpoint is polled by every open session, making
-- "WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50" the single most
-- frequently executed query in the app — a composite index lets Postgres walk
-- straight to a user's newest rows instead of filtering then sorting.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_approvals_stage_created ON public.request_approvals(stage, created_at DESC);

-- ── Stage digest queue ───────────────────────────────────────────────────────
-- (mirrors db/migrations/009_stage_digest_queue.sql)
-- Requisitions that just cleared a stage, waiting to be bundled into one email
-- to the next stage instead of one email per approval. See dispatchStageDigests.
CREATE TABLE IF NOT EXISTS public.stage_digest_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage TEXT NOT NULL,
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (stage, request_id)
);

CREATE INDEX IF NOT EXISTS idx_stage_digest_queue_stage ON public.stage_digest_queue(stage, queued_at);

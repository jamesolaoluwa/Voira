-- Migration: Create admin_audit_log table
-- Purpose: Immutable audit trail of all admin actions

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who performed the action
    admin_id UUID NOT NULL,
    admin_email TEXT NOT NULL,  -- Denormalized for readability

    -- What action occurred
    action TEXT NOT NULL,       -- e.g. 'credits_adjusted', 'user_disabled'
    target_type TEXT NOT NULL,  -- 'user', 'session', 'draft'
    target_id UUID,

    -- Contextual details
    details JSONB NOT NULL DEFAULT '{}',

    -- Optional request metadata
    ip_address TEXT,

    -- Timestamp (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- Indexes
-- =====================

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id
ON public.admin_audit_log(admin_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_email
ON public.admin_audit_log(admin_email);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
ON public.admin_audit_log(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action
ON public.admin_audit_log(action);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
ON public.admin_audit_log(created_at DESC);

-- =====================
-- Row Level Security
-- =====================

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs
CREATE POLICY "Admins can read audit logs"
ON public.admin_audit_log
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.admin_emails
        WHERE email = auth.jwt()->>'email'
    )
);

-- Only service role can insert audit logs (backend only)
CREATE POLICY "Service role can insert audit logs"
ON public.admin_audit_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- No UPDATE or DELETE policies — logs are immutable by design

-- =====================
-- Documentation
-- =====================

COMMENT ON TABLE public.admin_audit_log IS
'Immutable log of all admin actions. Consider retention policy if table grows large.';

COMMENT ON COLUMN public.admin_audit_log.admin_email IS
'Denormalized for readability and incident response';

COMMENT ON COLUMN public.admin_audit_log.details IS
'Flexible JSON payload: old/new values, reasons, metadata';

COMMIT;

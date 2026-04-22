-- Migration: Add user_agent to admin_audit_log
-- Purpose: Track which client/browser was used for admin actions

BEGIN;

ALTER TABLE public.admin_audit_log
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Comment for documentation
COMMENT ON COLUMN public.admin_audit_log.user_agent IS
'HTTP User-Agent header for forensic analysis (e.g., browser, OS, application)';

COMMIT;

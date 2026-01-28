-- Migration: Add is_disabled fields to user_profiles
-- Purpose: Allow admins to soft-disable user accounts safely

BEGIN;

-- Add soft-disable flag
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Timestamp when the disable occurred
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

-- Admin who disabled the account
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS disabled_by UUID;

-- Reason for disabling (admin-provided)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS disabled_reason TEXT;

-- Optional foreign key (soft reference, non-cascading)
-- NOTE: This is intentionally NOT ON DELETE CASCADE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_user_profiles_disabled_by'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD CONSTRAINT fk_user_profiles_disabled_by
    FOREIGN KEY (disabled_by)
    REFERENCES auth.users(id);
  END IF;
END $$;

-- Index for filtering active vs disabled users
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_disabled
ON public.user_profiles(is_disabled);

-- Optional partial index for admin views (disabled users only)
CREATE INDEX IF NOT EXISTS idx_user_profiles_disabled_only
ON public.user_profiles(disabled_at)
WHERE is_disabled = TRUE;

-- Documentation
COMMENT ON COLUMN public.user_profiles.is_disabled IS
'Soft disable flag - prevents user from performing actions';

COMMENT ON COLUMN public.user_profiles.disabled_at IS
'Timestamp when user was disabled';

COMMENT ON COLUMN public.user_profiles.disabled_by IS
'Admin user ID who disabled the account';

COMMENT ON COLUMN public.user_profiles.disabled_reason IS
'Admin-provided reason for disabling the account';

COMMIT;

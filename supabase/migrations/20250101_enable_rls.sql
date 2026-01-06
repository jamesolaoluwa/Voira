-- Migration: Enable RLS and create policies for all tables
-- Run in Supabase SQL editor as project admin
-- IMPORTANT: Test policies after applying to ensure users can only access their own data

BEGIN;

-- ============================================
-- RECORDINGS RLS POLICIES
-- ============================================
ALTER TABLE IF EXISTS public.recordings ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own recordings
CREATE POLICY recordings_select_owner ON public.recordings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can INSERT recordings with their own user_id
CREATE POLICY recordings_insert_owner ON public.recordings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can UPDATE their own recordings
CREATE POLICY recordings_update_owner ON public.recordings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can DELETE their own recordings
CREATE POLICY recordings_delete_owner ON public.recordings
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- USER_PROFILES RLS POLICIES
-- ============================================
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own profile
CREATE POLICY user_profiles_select_owner ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can INSERT their own profile (with their user_id)
CREATE POLICY user_profiles_insert_owner ON public.user_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can UPDATE their own profile (but NOT credits - backend enforces this)
-- Note: Backend should validate credits changes server-side
CREATE POLICY user_profiles_update_owner ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users cannot DELETE their profile (CASCADE from auth.users handles this)

-- ============================================
-- ADMIN_EMAILS RLS POLICIES (LOCKED DOWN)
-- ============================================
ALTER TABLE IF EXISTS public.admin_emails ENABLE ROW LEVEL SECURITY;

-- NO SELECT for authenticated or anon users (backend-only access)
CREATE POLICY admin_emails_no_select ON public.admin_emails
  FOR SELECT
  USING (false);

-- NO INSERT for authenticated or anon users (backend-only via service_role)
CREATE POLICY admin_emails_no_insert ON public.admin_emails
  FOR INSERT
  WITH CHECK (false);

-- NO UPDATE for authenticated or anon users
CREATE POLICY admin_emails_no_update ON public.admin_emails
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- NO DELETE for authenticated or anon users
CREATE POLICY admin_emails_no_delete ON public.admin_emails
  FOR DELETE
  USING (false);

-- ============================================
-- CREDITS_LEDGER RLS POLICIES
-- ============================================
ALTER TABLE IF EXISTS public.credits_ledger ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own ledger entries (read-only audit trail)
CREATE POLICY credits_ledger_select_owner ON public.credits_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users CANNOT INSERT ledger entries (backend-only via service_role)
CREATE POLICY credits_ledger_no_insert ON public.credits_ledger
  FOR INSERT
  WITH CHECK (false);

-- Users CANNOT UPDATE ledger entries (immutable audit trail)
CREATE POLICY credits_ledger_no_update ON public.credits_ledger
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- Users CANNOT DELETE ledger entries (immutable audit trail)
CREATE POLICY credits_ledger_no_delete ON public.credits_ledger
  FOR DELETE
  USING (false);

-- ============================================
-- VOICE_PROFILES RLS POLICIES (if not already applied)
-- ============================================
-- Note: These may already exist from previous migration
-- If they do, this will error but that's fine - policies are idempotent

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'voice_profiles' AND policyname = 'voice_profiles_insert_owner'
  ) THEN
    ALTER TABLE IF EXISTS public.voice_profiles ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY voice_profiles_insert_owner ON public.voice_profiles
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    
    CREATE POLICY voice_profiles_manage_owner ON public.voice_profiles
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

COMMIT;


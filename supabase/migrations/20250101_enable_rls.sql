-- Migration: Enable RLS and create policies for core tables
-- Run in Supabase SQL editor as project admin
-- IMPORTANT: Test policies after applying to ensure users can only access their own data
-- Note: admin_emails and voice_profiles RLS are handled in later migrations

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

COMMIT;


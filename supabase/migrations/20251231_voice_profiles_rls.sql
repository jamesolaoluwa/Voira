-- RLS and policy setup for voice_profiles and admin_emails
-- Run in Supabase SQL editor as project admin (NOT from client-side code)

BEGIN;

------------------------------------------------------------
-- voice_profiles RLS
------------------------------------------------------------

ALTER TABLE IF EXISTS public.voice_profiles
  ENABLE ROW LEVEL SECURITY;

-- Replace insert policy
DROP POLICY IF EXISTS voice_profiles_insert_owner ON public.voice_profiles;
CREATE POLICY voice_profiles_insert_owner
  ON public.voice_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Replace select policy
DROP POLICY IF EXISTS voice_profiles_select_owner ON public.voice_profiles;
CREATE POLICY voice_profiles_select_owner
  ON public.voice_profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Replace update policy
DROP POLICY IF EXISTS voice_profiles_update_owner ON public.voice_profiles;
CREATE POLICY voice_profiles_update_owner
  ON public.voice_profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Replace delete policy
DROP POLICY IF EXISTS voice_profiles_delete_owner ON public.voice_profiles;
CREATE POLICY voice_profiles_delete_owner
  ON public.voice_profiles
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

------------------------------------------------------------
-- admin_emails RLS (highly restricted)
------------------------------------------------------------

ALTER TABLE IF EXISTS public.admin_emails
  ENABLE ROW LEVEL SECURITY;

-- Replace select (block public reads)
DROP POLICY IF EXISTS admin_emails_no_public_read ON public.admin_emails;
CREATE POLICY admin_emails_no_public_read
  ON public.admin_emails
  FOR SELECT
  USING (false);

-- Replace insert (service role only)
DROP POLICY IF EXISTS admin_emails_insert_service ON public.admin_emails;
CREATE POLICY admin_emails_insert_service
  ON public.admin_emails
  FOR INSERT
  WITH CHECK ((auth.role() = 'service_role'));

-- Replace update (explicitly block)
DROP POLICY IF EXISTS admin_emails_no_update ON public.admin_emails;
CREATE POLICY admin_emails_no_update
  ON public.admin_emails
  FOR UPDATE
  USING (false);

-- Replace delete (explicitly block)
DROP POLICY IF EXISTS admin_emails_no_delete ON public.admin_emails;
CREATE POLICY admin_emails_no_delete
  ON public.admin_emails
  FOR DELETE
  USING (false);

COMMIT;
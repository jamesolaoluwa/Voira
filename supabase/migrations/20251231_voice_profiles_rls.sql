-- RLS and policy setup for voice_profiles and admin_emails
-- Run these statements in Supabase SQL editor as a project admin (NOT from client-side code)

-- Enable RLS on voice_profiles
ALTER TABLE IF EXISTS public.voice_profiles ENABLE ROW LEVEL SECURITY;

-- Allow owners to insert their own profile (authenticated users)
CREATE POLICY voice_profiles_insert_owner ON public.voice_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow owners to select/update/delete their own profiles
CREATE POLICY voice_profiles_manage_owner ON public.voice_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- If you want server-side processes to read all voice_profiles (e.g., admin job), use a service role key server-side only.

-- Secure sensitive admin_emails table: disallow public reads
ALTER TABLE IF EXISTS public.admin_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_emails_no_public_read ON public.admin_emails
  FOR SELECT
  USING (false);

-- Allow insertions only via a server role or a specific function (example uses service role)
CREATE POLICY admin_emails_insert_service ON public.admin_emails
  FOR INSERT
  USING (auth.role() = 'service_role');

-- Note: adjust policies to fit your auth setup. Be careful testing RLS - ensure server-side tooling uses service_role key.

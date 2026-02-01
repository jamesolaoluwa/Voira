-- Migration: Create trigger to auto-create user_profiles on signup
BEGIN;

CREATE OR REPLACE FUNCTION public.create_user_profile_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id,
    full_name,
    role,
    credits_remaining,
    credits_reset_at,
    reference_uploads_remaining,
    reference_uploads_reset_at,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      'User'
    ),
    'free_user',
    10,
    NOW() + INTERVAL '30 days',
    1,
    NOW() + INTERVAL '30 days',
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_user_profile_on_signup ON auth.users;

CREATE TRIGGER create_user_profile_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_profile_on_signup();

-- Backfill existing users who don't have profiles yet
INSERT INTO public.user_profiles (user_id, full_name, role, credits_remaining, credits_reset_at, reference_uploads_remaining, reference_uploads_reset_at, created_at, updated_at)
SELECT u.id AS user_id,
       COALESCE(
         u.raw_user_meta_data->>'full_name',
         u.raw_user_meta_data->>'name',
         split_part(u.email, '@', 1)
       ) AS full_name,
       'free_user'::text AS role,
       10 AS credits_remaining,
       NOW() + INTERVAL '30 days' AS credits_reset_at,
       1 AS reference_uploads_remaining,
       NOW() + INTERVAL '30 days' AS reference_uploads_reset_at,
       NOW() AS created_at,
       NOW() AS updated_at
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Update existing profiles that have NULL or empty full_name
UPDATE public.user_profiles p
SET full_name = COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      split_part(u.email, '@', 1)
    ),
    updated_at = NOW()
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.full_name IS NULL OR p.full_name = '');

COMMIT;
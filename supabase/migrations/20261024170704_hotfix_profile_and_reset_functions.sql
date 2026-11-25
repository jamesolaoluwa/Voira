-- Phase 0 hotfix: close admin self-escalation and paid-credit reset bug.
-- Live get_or_create_user_profile / check_and_reset_credits still trusted
-- raw_user_meta_data->>'role'. Backend calls them with the service-role key,
-- so enforce_user_profiles_guard cannot stop the insert.

-- 1) Profile creation: never trust user-editable raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.get_or_create_user_profile(p_user_id uuid)
RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles;
BEGIN
  SELECT * INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  INSERT INTO public.user_profiles (
    user_id, role, credits_remaining, monthly_credit_allowance,
    credits_reset_at, reference_uploads_remaining, reference_uploads_reset_at, email
  )
  SELECT p_user_id, 'free_user', 10, 10,
         (date_trunc('month', now()) + interval '1 month')::timestamptz,
         1,
         (date_trunc('month', now()) + interval '1 month')::timestamptz,
         au.email
  FROM auth.users au WHERE au.id = p_user_id
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;
  RETURN v_profile;
END;
$$;

-- 2) Monthly reset: refill to the Stripe-managed allowance, not a metadata role.
CREATE OR REPLACE FUNCTION public.check_and_reset_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowance integer;
BEGIN
  SELECT COALESCE(monthly_credit_allowance, 10) INTO v_allowance
  FROM public.user_profiles
  WHERE user_id = p_user_id
    AND (credits_reset_at IS NULL OR credits_reset_at <= now());
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.user_profiles
  SET credits_remaining           = v_allowance,
      credits_used_this_period    = 0,
      credits_reset_at            = (date_trunc('month', now()) + interval '1 month')::timestamptz,
      reference_uploads_remaining = CASE WHEN v_allowance > 10 THEN 999999 ELSE 1 END,
      reference_uploads_reset_at  = (date_trunc('month', now()) + interval '1 month')::timestamptz,
      last_credit_reset_at        = now(),
      updated_at                  = now()
  WHERE user_id = p_user_id
    AND (credits_reset_at IS NULL OR credits_reset_at <= now());

  IF FOUND THEN
    INSERT INTO public.credits_ledger (user_id, amount, reason, balance_after)
    VALUES (p_user_id, v_allowance, 'monthly_reset', v_allowance);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_user_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_reset_credits(uuid)    FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_or_create_user_profile(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.check_and_reset_credits(uuid)    TO service_role;

-- 3) Audit log column the backend already writes (every insert currently fails).
ALTER TABLE public.admin_audit_log ADD COLUMN IF NOT EXISTS user_agent text;

-- 4) Trigger-only SECURITY DEFINER functions should not be callable via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.create_default_voice_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_profiles_guard()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_non_service()   FROM PUBLIC, anon, authenticated;

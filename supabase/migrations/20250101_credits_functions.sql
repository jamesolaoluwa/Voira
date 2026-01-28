BEGIN;

-- Function to get or create user profile with default credits
CREATE OR REPLACE FUNCTION public.get_or_create_user_profile(p_user_id uuid)
RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.user_profiles;
  v_role text;
  v_default_credits integer;
  v_default_reference_uploads integer;
BEGIN
  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE user_id = p_user_id;

  IF v_profile IS NOT NULL THEN
    RETURN v_profile;
  END IF;

  SELECT COALESCE(
    (raw_user_meta_data->>'role')::text,
    'free_user'
  )
  INTO v_role
  FROM auth.users
  WHERE id = p_user_id;

  IF v_role = 'premium_user' OR v_role = 'admin' THEN
    v_default_credits := 120;
    v_default_reference_uploads := 999999;
  ELSE
    v_default_credits := 10;
    v_default_reference_uploads := 1;
  END IF;

  INSERT INTO public.user_profiles (
    user_id,
    role,
    credits_remaining,
    credits_reset_at,
    reference_uploads_remaining,
    reference_uploads_reset_at
  ) VALUES (
    p_user_id,
    v_role,
    v_default_credits,
    (date_trunc('month', now()) + interval '1 month')::timestamptz,
    v_default_reference_uploads,
    (date_trunc('month', now()) + interval '1 month')::timestamptz
  )
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

-- Function to check if credits need monthly reset
CREATE OR REPLACE FUNCTION public.check_and_reset_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.user_profiles;
  v_role text;
  v_new_credits integer;
  v_new_reference_uploads integer;
BEGIN
  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE user_id = p_user_id;

  IF v_profile IS NULL THEN
    RETURN;
  END IF;

  IF v_profile.credits_reset_at IS NULL OR v_profile.credits_reset_at <= now() THEN
    SELECT COALESCE(
      (raw_user_meta_data->>'role')::text,
      'free_user'
    )
    INTO v_role
    FROM auth.users
    WHERE id = p_user_id;

    IF v_role = 'premium_user' OR v_role = 'admin' THEN
      v_new_credits := 120;
      v_new_reference_uploads := 999999;
    ELSE
      v_new_credits := 10;
      v_new_reference_uploads := 1;
    END IF;

    UPDATE public.user_profiles
    SET
      credits_remaining = v_new_credits,
      credits_reset_at = (date_trunc('month', now()) + interval '1 month')::timestamptz,
      reference_uploads_remaining = v_new_reference_uploads,
      reference_uploads_reset_at = (date_trunc('month', now()) + interval '1 month')::timestamptz,
      updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.credits_ledger (
      user_id,
      amount,
      reason,
      balance_after
    ) VALUES (
      p_user_id,
      v_new_credits,
      'monthly_reset',
      v_new_credits
    );
  END IF;
END;
$$;

COMMIT;

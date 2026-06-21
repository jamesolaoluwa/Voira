-- Phase 0 — Security hardening (privilege escalation / data integrity)
--
-- Confirmed against the LIVE Supabase schema (the repo migrations were stale):
--   * user_profiles UPDATE/INSERT RLS only checks user_id; a trg_block_role_change
--     trigger already protects `role`, but credits/subscription/stripe/disabled
--     columns were still self-editable by any authenticated user via PostgREST.
--   * atomic_decrement_credits / deduct_credit had no guard against negative
--     p_amount (negative -> increases balance) and were EXECUTE-able by anon +
--     authenticated.
--   * check_and_reset_credits + get_or_create_user_profile trusted
--     auth.users.raw_user_meta_data->>'role' to grant 120 credits.
--   * check_and_reset_credits + block_role_change lacked a locked search_path.
--   * credits_ledger / admin_audit_log had no DB-level immutability (service_role
--     bypasses the deny RLS policies).
--
-- This migration is idempotent and safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Lock down privileged columns on user_profiles for non-service callers.
--    Replaces the narrow trg_block_role_change (role-only) trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_user_profiles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trusted server paths (service-role key) may set anything.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A user creating their own profile always gets free-tier defaults.
    -- Tier/credit grants only ever happen server-side (Stripe webhook / admin).
    NEW.role := 'free_user';
    NEW.credits_remaining := 10;
    NEW.monthly_credit_allowance := 10;
    NEW.credits_used_this_period := 0;
    NEW.reference_uploads_remaining := 1;
    NEW.subscription_status := 'inactive';
    NEW.subscription_plan := 'free';
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.subscription_current_period_end := NULL;
    NEW.is_disabled := false;
    NEW.disabled_at := NULL;
    NEW.disabled_by := NULL;
    NEW.disabled_reason := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: reject any change to billing / credit / role / account-status columns.
  IF (NEW.role IS DISTINCT FROM OLD.role)
     OR (NEW.credits_remaining IS DISTINCT FROM OLD.credits_remaining)
     OR (NEW.monthly_credit_allowance IS DISTINCT FROM OLD.monthly_credit_allowance)
     OR (NEW.credits_used_this_period IS DISTINCT FROM OLD.credits_used_this_period)
     OR (NEW.credits_reset_at IS DISTINCT FROM OLD.credits_reset_at)
     OR (NEW.last_credit_reset_at IS DISTINCT FROM OLD.last_credit_reset_at)
     OR (NEW.reference_uploads_remaining IS DISTINCT FROM OLD.reference_uploads_remaining)
     OR (NEW.reference_uploads_reset_at IS DISTINCT FROM OLD.reference_uploads_reset_at)
     OR (NEW.subscription_status IS DISTINCT FROM OLD.subscription_status)
     OR (NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan)
     OR (NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end)
     OR (NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id)
     OR (NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id)
     OR (NEW.is_disabled IS DISTINCT FROM OLD.is_disabled)
     OR (NEW.disabled_at IS DISTINCT FROM OLD.disabled_at)
     OR (NEW.disabled_by IS DISTINCT FROM OLD.disabled_by)
     OR (NEW.disabled_reason IS DISTINCT FROM OLD.disabled_reason)
  THEN
    RAISE EXCEPTION 'Modifying billing/credit/role/account-status columns is not permitted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_role_change ON public.user_profiles;
DROP TRIGGER IF EXISTS trg_enforce_user_profiles_guard ON public.user_profiles;
CREATE TRIGGER trg_enforce_user_profiles_guard
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_profiles_guard();

DROP FUNCTION IF EXISTS public.block_role_change();

-- ---------------------------------------------------------------------------
-- 2) Stop trusting user metadata for credit grants; lock search_path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_user_profile(p_user_id uuid)
RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles;
  v_email text;
BEGIN
  SELECT * INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;
  IF v_profile IS NOT NULL THEN
    RETURN v_profile;
  END IF;

  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = p_user_id;

  -- Always free tier on creation. Upgrades come only from Stripe webhooks/admin.
  INSERT INTO public.user_profiles (
    user_id, role, credits_remaining, monthly_credit_allowance,
    credits_reset_at, reference_uploads_remaining, reference_uploads_reset_at, email
  ) VALUES (
    p_user_id, 'free_user', 10, 10,
    (date_trunc('month', now()) + interval '1 month')::timestamptz,
    1,
    (date_trunc('month', now()) + interval '1 month')::timestamptz,
    v_email
  )
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_and_reset_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.user_profiles;
  v_allowance integer;
  v_new_reference_uploads integer;
BEGIN
  SELECT * INTO v_profile FROM public.user_profiles WHERE user_id = p_user_id;
  IF v_profile IS NULL THEN
    RETURN;
  END IF;

  IF v_profile.credits_reset_at IS NULL OR v_profile.credits_reset_at <= now() THEN
    -- Reset to the Stripe-managed allowance, never to a metadata-derived value.
    v_allowance := COALESCE(v_profile.monthly_credit_allowance, 10);
    v_new_reference_uploads := CASE WHEN v_allowance > 10 THEN 999999 ELSE 1 END;

    UPDATE public.user_profiles
    SET credits_remaining = v_allowance,
        credits_used_this_period = 0,
        credits_reset_at = (date_trunc('month', now()) + interval '1 month')::timestamptz,
        reference_uploads_remaining = v_new_reference_uploads,
        reference_uploads_reset_at = (date_trunc('month', now()) + interval '1 month')::timestamptz,
        last_credit_reset_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO public.credits_ledger (user_id, amount, reason, balance_after)
    VALUES (p_user_id, v_allowance, 'monthly_reset', v_allowance);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Reject non-positive amounts in credit deduction (negative -> credit grant).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_decrement_credits(p_user_id uuid, p_amount integer DEFAULT 1, p_reason text DEFAULT 'usage'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_balance integer;
    v_new_balance integer;
    v_rows_affected integer;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'atomic_decrement_credits: p_amount must be a positive integer (got %)', p_amount;
    END IF;

    UPDATE public.user_profiles
    SET credits_remaining = credits_remaining - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
      AND credits_remaining >= p_amount
    RETURNING credits_remaining
    INTO v_new_balance;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
        SELECT credits_remaining INTO v_old_balance
        FROM public.user_profiles WHERE user_id = p_user_id;

        IF v_old_balance IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'user_not_found',
                'message', 'User profile does not exist');
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits',
                'message', 'Insufficient credits',
                'credits_remaining', v_old_balance, 'credits_required', p_amount);
        END IF;
    END IF;

    v_old_balance := v_new_balance + p_amount;

    BEGIN
        INSERT INTO public.credits_ledger (user_id, amount, reason, balance_after)
        VALUES (p_user_id, -p_amount, p_reason, v_new_balance);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[atomic_decrement_credits] Ledger insert failed: user_id=%, amount=%, reason=%, error=%',
            p_user_id, p_amount, p_reason, SQLERRM;
    END;

    RETURN jsonb_build_object('success', true, 'credits_remaining', v_new_balance,
        'credits_deducted', p_amount, 'reason', p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id uuid, p_amount integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_remaining INTEGER;
  v_updated_rows INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'deduct_credit: p_amount must be a positive integer (got %)', p_amount;
  END IF;

  SELECT role INTO v_role FROM public.user_profiles WHERE user_id = p_user_id;

  IF v_role = 'admin' THEN
    RETURN jsonb_build_object('success', TRUE, 'remaining', 999999, 'error', NULL);
  END IF;

  UPDATE public.user_profiles
  SET credits_used_this_period = credits_used_this_period + p_amount,
      credits_remaining = credits_remaining - p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND credits_remaining >= p_amount;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    SELECT credits_remaining INTO v_remaining FROM public.user_profiles WHERE user_id = p_user_id;
    IF v_remaining IS NULL THEN
      RETURN jsonb_build_object('success', FALSE, 'remaining', NULL, 'error', 'user_not_found');
    ELSE
      RETURN jsonb_build_object('success', FALSE, 'remaining', v_remaining, 'error', 'insufficient_credits');
    END IF;
  END IF;

  SELECT credits_remaining INTO v_remaining FROM public.user_profiles WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', TRUE, 'remaining', v_remaining, 'error', NULL);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3b) Atomic credit refund (reserve-then-work pattern). A single UPDATE avoids
--     the lost-update race of a read-modify-write. Caps at monthly allowance so
--     a refund can never inflate a balance beyond entitlement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_refund_credits(p_user_id uuid, p_amount integer DEFAULT 1, p_reason text DEFAULT 'refund'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_balance integer;
    v_rows_affected integer;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'atomic_refund_credits: p_amount must be a positive integer (got %)', p_amount;
    END IF;

    UPDATE public.user_profiles
    SET credits_remaining = LEAST(
            credits_remaining + p_amount,
            COALESCE(monthly_credit_allowance, credits_remaining + p_amount)
        ),
        credits_used_this_period = GREATEST(0, COALESCE(credits_used_this_period, 0) - p_amount),
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING credits_remaining
    INTO v_new_balance;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
    END IF;

    BEGIN
        INSERT INTO public.credits_ledger (user_id, amount, reason, balance_after)
        VALUES (p_user_id, p_amount, p_reason, v_new_balance);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[atomic_refund_credits] Ledger insert failed: user_id=%, amount=%, error=%',
            p_user_id, p_amount, SQLERRM;
    END;

    RETURN jsonb_build_object('success', true, 'credits_remaining', v_new_balance,
        'credits_refunded', p_amount, 'reason', p_reason);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Revoke EXECUTE on privileged SECURITY DEFINER / billing RPCs from clients.
--    The backend calls these only via the service-role key.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.atomic_refund_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.atomic_decrement_credits(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credit(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_reset_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_user_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_or_create_user_settings(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_remaining_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_user_credits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_subscription_from_stripe(text, text, text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_subscription(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.atomic_refund_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_decrement_credits(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credit(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_reset_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_user_profile(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_user_settings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_remaining_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_user_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_subscription_from_stripe(text, text, text, text, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_subscription(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Make credits_ledger and admin_audit_log append-only at the DB level
--    (RLS deny policies do not stop the service-role key).
--    UPDATE is forbidden for everyone; DELETE only for service_role (GDPR).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_update_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; UPDATE is not allowed', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_delete_non_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION '% is append-only; DELETE is not allowed', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_credits_ledger_no_update ON public.credits_ledger;
CREATE TRIGGER trg_credits_ledger_no_update
  BEFORE UPDATE ON public.credits_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_update_append_only();

DROP TRIGGER IF EXISTS trg_credits_ledger_no_delete ON public.credits_ledger;
CREATE TRIGGER trg_credits_ledger_no_delete
  BEFORE DELETE ON public.credits_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_non_service();

DROP TRIGGER IF EXISTS trg_admin_audit_log_no_update ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_no_update
  BEFORE UPDATE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_update_append_only();

DROP TRIGGER IF EXISTS trg_admin_audit_log_no_delete ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_no_delete
  BEFORE DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_non_service();

COMMIT;

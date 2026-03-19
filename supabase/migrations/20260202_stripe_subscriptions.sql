-- Migration: Add Stripe subscription fields to user_profiles
-- Date: 2026-02-02
-- Updated: 2026-02-07 (addressed race conditions, security, atomicity)
-- Purpose: Support Stripe billing integration with credit management

BEGIN;

-- =============================================================================
-- PHASE 1: Add columns (non-blocking in Postgres 11+)
-- =============================================================================

-- Add subscription-related columns to user_profiles
-- Note: Columns with constant defaults don't rewrite the table in Postgres 11+
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive' 
  CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'canceled', 'trialing')),
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free' 
  CHECK (subscription_plan IN ('free', 'pro_monthly', 'pro_yearly', 'pro_plus_monthly', 'pro_plus_yearly')),
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS monthly_credit_allowance INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS credits_used_this_period INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_credit_reset_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================================================
-- PHASE 2: Create indexes
-- =============================================================================

-- Index for webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer_id 
ON public.user_profiles(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

-- Index for webhook lookups by stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_subscription_id 
ON public.user_profiles(stripe_subscription_id) 
WHERE stripe_subscription_id IS NOT NULL;

-- Index for subscription status queries (excludes inactive for partial index efficiency)
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status 
ON public.user_profiles(subscription_status) 
WHERE subscription_status != 'inactive';

-- =============================================================================
-- PHASE 3: Migrate existing data
-- =============================================================================

-- Update existing users based on their current `role` column (not subscription_plan)
-- This ensures the UPDATE works correctly regardless of column default timing
UPDATE public.user_profiles
SET 
  monthly_credit_allowance = CASE 
    WHEN role = 'premium_user' THEN 60 
    WHEN role = 'premium_plus_user' THEN 200
    ELSE 10 
  END,
  subscription_plan = CASE 
    WHEN role = 'premium_user' THEN 'pro_monthly'
    WHEN role = 'premium_plus_user' THEN 'pro_plus_monthly'
    ELSE 'free' 
  END,
  subscription_status = CASE 
    WHEN role IN ('premium_user', 'premium_plus_user') THEN 'active'
    ELSE 'inactive'
  END,
  -- Explicitly set credits_remaining to match new allowance
  -- Use GREATEST to not reduce if user somehow has more credits
  credits_remaining = GREATEST(
    COALESCE(credits_remaining, 0),
    CASE 
      WHEN role = 'premium_user' THEN 60 
      WHEN role = 'premium_plus_user' THEN 200
      ELSE 10 
    END
  ),
  credits_used_this_period = 0,
  last_credit_reset_at = NOW()
WHERE monthly_credit_allowance IS NULL 
   OR monthly_credit_allowance = 10;  -- Only update users with default/null allowance

-- =============================================================================
-- PHASE 4: Create functions (SECURITY DEFINER with explicit search_path)
-- =============================================================================

-- Function to reset credits monthly (called by webhook on period renewal)
-- SERVER-ONLY: Not granted to authenticated users
CREATE OR REPLACE FUNCTION public.reset_user_credits(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET 
    credits_used_this_period = 0,
    last_credit_reset_at = NOW(),
    credits_remaining = monthly_credit_allowance,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- Function to get remaining credits for a user (read-only, safe for clients)
CREATE OR REPLACE FUNCTION public.get_remaining_credits(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE  -- Mark as STABLE since it only reads data
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT GREATEST(0, COALESCE(monthly_credit_allowance, 10) - COALESCE(credits_used_this_period, 0))
  INTO v_remaining
  FROM public.user_profiles
  WHERE user_id = p_user_id;
  
  -- Return 0 if user not found
  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- Function to deduct credits atomically (RACE-CONDITION SAFE)
-- Uses single UPDATE with WHERE check to prevent overspend
-- Admins (role = 'admin') bypass credit deduction entirely
-- SERVER-ONLY: Not granted to authenticated users
CREATE OR REPLACE FUNCTION public.deduct_credit(p_user_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_remaining INTEGER;
  v_updated_rows INTEGER;
BEGIN
  -- First check if user is admin - they always succeed without deduction
  SELECT role INTO v_role
  FROM public.user_profiles
  WHERE user_id = p_user_id;
  
  IF v_role = 'admin' THEN
    -- Admins bypass credit deduction entirely
    RETURN jsonb_build_object(
      'success', TRUE,
      'remaining', 999999,
      'error', NULL
    );
  END IF;

  -- For non-admins, perform atomic deduction
  -- Single UPDATE with WHERE check prevents race conditions
  UPDATE public.user_profiles
  SET 
    credits_used_this_period = credits_used_this_period + p_amount,
    credits_remaining = credits_remaining - p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND credits_remaining >= p_amount;
  
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  
  IF v_updated_rows = 0 THEN
    -- Either user not found or insufficient credits
    SELECT credits_remaining INTO v_remaining
    FROM public.user_profiles
    WHERE user_id = p_user_id;
    
    IF v_remaining IS NULL THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'remaining', NULL,
        'error', 'user_not_found'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', FALSE,
        'remaining', v_remaining,
        'error', 'insufficient_credits'
      );
    END IF;
  END IF;
  
  -- Get updated remaining credits
  SELECT credits_remaining INTO v_remaining
  FROM public.user_profiles
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'remaining', v_remaining,
    'error', NULL
  );
END;
$$;

-- Function to update subscription from Stripe webhook data
-- Returns success/failure instead of raising exception (graceful webhook handling)
-- SERVER-ONLY: Not granted to authenticated users
CREATE OR REPLACE FUNCTION public.update_subscription_from_stripe(
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_status TEXT,
  p_plan TEXT,
  p_period_end TIMESTAMPTZ,
  p_credit_allowance INTEGER
)
RETURNS BOOLEAN  -- Changed from VOID to BOOLEAN for success indication
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_allowance INTEGER;
  v_old_remaining INTEGER;
  v_user_id UUID;
BEGIN
  -- Get current allowance and user_id
  SELECT user_id, COALESCE(monthly_credit_allowance, 10), COALESCE(credits_remaining, 0)
  INTO v_user_id, v_old_allowance, v_old_remaining
  FROM public.user_profiles
  WHERE stripe_customer_id = p_stripe_customer_id;
  
  -- Return FALSE if customer not found (don't crash webhook)
  IF NOT FOUND THEN
    RAISE WARNING 'update_subscription_from_stripe: No user found with stripe_customer_id: %', p_stripe_customer_id;
    RETURN FALSE;
  END IF;
  
  -- Update subscription fields
  UPDATE public.user_profiles
  SET 
    stripe_subscription_id = p_stripe_subscription_id,
    subscription_status = p_status,
    subscription_plan = p_plan,
    subscription_current_period_end = p_period_end,
    monthly_credit_allowance = p_credit_allowance,
    -- If upgrading allowance, give user the bonus credits immediately
    credits_remaining = CASE 
      WHEN p_credit_allowance > v_old_allowance 
      THEN v_old_remaining + (p_credit_allowance - v_old_allowance)
      ELSE v_old_remaining
    END,
    -- Update role for backward compatibility
    role = CASE 
      WHEN p_plan IN ('pro_monthly', 'pro_yearly') THEN 'premium_user'
      WHEN p_plan IN ('pro_plus_monthly', 'pro_plus_yearly') THEN 'premium_plus_user'
      ELSE 'free_user'
    END,
    updated_at = NOW()
  WHERE stripe_customer_id = p_stripe_customer_id;
  
  RETURN TRUE;
END;
$$;

-- Function to handle subscription cancellation (downgrade to free)
-- SERVER-ONLY: Not granted to authenticated users
CREATE OR REPLACE FUNCTION public.cancel_subscription(p_stripe_customer_id TEXT)
RETURNS BOOLEAN  -- Changed from VOID to BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET 
    subscription_status = 'canceled',
    subscription_plan = 'free',
    monthly_credit_allowance = 10,
    -- Don't immediately reduce credits - let them use what they have until period ends
    role = 'free_user',
    updated_at = NOW()
  WHERE stripe_customer_id = p_stripe_customer_id;
  
  RETURN FOUND;
END;
$$;

-- =============================================================================
-- PHASE 5: Grant/Revoke permissions
-- =============================================================================

-- get_remaining_credits: Safe for clients (read-only)
GRANT EXECUTE ON FUNCTION public.get_remaining_credits(UUID) TO authenticated;

-- deduct_credit: SERVER-ONLY (prevents client-side credit manipulation)
-- Revoke from PUBLIC, grant only to service_role
REVOKE EXECUTE ON FUNCTION public.deduct_credit(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credit(UUID, INTEGER) TO service_role;

-- update_subscription_from_stripe: SERVER-ONLY (webhook handler)
REVOKE EXECUTE ON FUNCTION public.update_subscription_from_stripe(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_subscription_from_stripe(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER) TO service_role;

-- cancel_subscription: SERVER-ONLY (webhook handler)
REVOKE EXECUTE ON FUNCTION public.cancel_subscription(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_subscription(TEXT) TO service_role;

-- reset_user_credits: SERVER-ONLY (cron job or webhook)
REVOKE EXECUTE ON FUNCTION public.reset_user_credits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_credits(UUID) TO service_role;

COMMIT;


BEGIN;

-- ------------------------------------------------------------------
-- Defense in Depth: Prevent negative credit balances at the DB level
-- ------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'credits_remaining_non_negative'
    ) THEN
        ALTER TABLE public.user_profiles
        ADD CONSTRAINT credits_remaining_non_negative
        CHECK (credits_remaining >= 0);
    END IF;
END $$;

-- ------------------------------------------------------------------
-- Atomic Credit Deduction Function (Race-Safe, Production-Grade)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_decrement_credits(
    p_user_id uuid,
    p_amount integer DEFAULT 1,
    p_reason text DEFAULT 'usage'
)
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
    -- Atomic UPDATE: succeeds only if sufficient credits exist
    UPDATE public.user_profiles
    SET
        credits_remaining = credits_remaining - p_amount,
        updated_at = now()
    WHERE
        user_id = p_user_id
        AND credits_remaining >= p_amount
    RETURNING credits_remaining
    INTO v_new_balance;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Handle insufficient credits or missing user
    IF v_rows_affected = 0 THEN
        SELECT credits_remaining
        INTO v_old_balance
        FROM public.user_profiles
        WHERE user_id = p_user_id;

        IF v_old_balance IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'user_not_found',
                'message', 'User profile does not exist'
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'insufficient_credits',
                'message', 'Insufficient credits',
                'credits_remaining', v_old_balance,
                'credits_required', p_amount
            );
        END IF;
    END IF;

    -- Compute previous balance explicitly (more maintainable)
    v_old_balance := v_new_balance + p_amount;

    -- Non-blocking ledger logging
    BEGIN
        INSERT INTO public.credits_ledger (
            user_id,
            amount,
            reason,
            balance_after
        ) VALUES (
            p_user_id,
            -p_amount,
            p_reason,
            v_new_balance
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING
            '[atomic_decrement_credits] Ledger insert failed: user_id=%, amount=%, reason=%, error=%',
            p_user_id, p_amount, p_reason, SQLERRM;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'credits_remaining', v_new_balance,
        'credits_deducted', p_amount,
        'reason', p_reason
    );
END;
$$;

-- ------------------------------------------------------------------
-- Permissions: Lock execution down to backend service role only
-- ------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.atomic_decrement_credits(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atomic_decrement_credits(uuid, integer, text) TO service_role;

COMMENT ON FUNCTION public.atomic_decrement_credits IS
'Atomically decrements user credits using a single UPDATE with WHERE clause.
Prevents race conditions and negative balances.
Uses SECURITY DEFINER with locked search_path.
Returns structured JSON result.';

COMMIT;

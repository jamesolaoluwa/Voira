"""Credits management and enforcement.

BUG-005 FIX (2026-01-26):
Credit deduction is now ATOMIC at the database level using the
`atomic_decrement_credits` Postgres function. This prevents:
- Race conditions between concurrent requests
- Credits going negative
- Double-spend exploits

The function uses a single UPDATE with WHERE clause:
    UPDATE ... SET credits = credits - 1 WHERE credits >= 1

This guarantees that only one concurrent request can "win" the credit.
"""
from db import supabase
from typing import Optional
import logging

logger = logging.getLogger(__name__)


async def check_and_reset_credits(user_id: str) -> dict:
    """
    Check if user's credits need monthly reset and reset if needed.
    Returns updated user profile.
    """
    # Call the database function to check and reset credits
    try:
        result = supabase.rpc("check_and_reset_credits", {"p_user_id": user_id}).execute()
        # Function doesn't return a value, so we fetch the profile
    except Exception:
        pass  # Function may not exist yet, continue
    
    # Get or create user profile
    profile_result = supabase.rpc("get_or_create_user_profile", {"p_user_id": user_id}).execute()
    if profile_result.data:
        return profile_result.data[0]
    
    # Fallback: direct query
    response = supabase.table("user_profiles").select("*").eq("user_id", user_id).execute()
    if response.data:
        return response.data[0]
    
    # Create default profile for new users (free tier: 10 credits/month).
    # monthly_credit_allowance + credits_reset_at enable calendar-month resets
    # via check_and_reset_credits even without the phase0 migration applied.
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    if now.month == 12:
        credits_reset_at = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        credits_reset_at = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

    insert_response = supabase.table("user_profiles").insert({
        "user_id": user_id,
        "role": "free_user",
        "credits_remaining": 10,
        "monthly_credit_allowance": 10,
        "subscription_plan": "free",
        "subscription_status": "inactive",
        "credits_reset_at": credits_reset_at.isoformat(),
        "reference_uploads_remaining": 1,
    }).execute()
    
    return insert_response.data[0] if insert_response.data else {}


async def check_credits_available(user_id: str, required: int = 1, is_admin: bool = False) -> tuple[bool, dict]:
    """
    Check if user has enough credits.
    Returns (has_credits: bool, profile: dict).
    Admins bypass credit checks.
    """
    if is_admin:
        return True, {}
    
    profile = await check_and_reset_credits(user_id)
    credits_remaining = profile.get("credits_remaining", 0)
    
    return credits_remaining >= required, profile


async def decrement_credits(user_id: str, amount: int = 1, reason: str = "usage", is_admin: bool = False) -> dict:
    """
    Atomically decrement user credits using database-level locking.
    
    BUG-005 FIX: Uses `atomic_decrement_credits` Postgres function which:
    - Performs check and decrement in a single atomic UPDATE
    - Prevents race conditions between concurrent requests
    - Prevents credits from going negative
    - Logs to credits_ledger within the same transaction
    
    Args:
        user_id: User's UUID
        amount: Number of credits to deduct (default: 1)
        reason: Reason for deduction (for ledger logging)
        is_admin: If True, bypasses credit deduction
    
    Returns:
        dict with deduction result:
        - On success: {"success": True, "credits_remaining": int, ...}
        - On failure: {"success": False, "error": str, ...}
    
    Raises:
        ValueError: If atomic deduction fails (insufficient credits or user not found)
    """
    if is_admin:
        return {"success": True, "credits_remaining": None, "admin_bypass": True}
    
    # First ensure profile exists and check for monthly reset
    await check_and_reset_credits(user_id)
    
    # Use atomic database function for deduction
    try:
        result = supabase.rpc(
            "atomic_decrement_credits",
            {
                "p_user_id": user_id,
                "p_amount": amount,
                "p_reason": reason
            }
        ).execute()
        
        if result.data:
            deduction_result = result.data
            
            if deduction_result.get("success"):
                logger.info(
                    f"[Credits:AtomicDeduct] Success: user={user_id}, "
                    f"amount={amount}, reason={reason}, "
                    f"remaining={deduction_result.get('credits_remaining')}"
                )
                return deduction_result
            else:
                # Deduction failed (insufficient credits or user not found)
                error = deduction_result.get("error", "unknown")
                logger.warning(
                    f"[Credits:AtomicDeduct] Failed: user={user_id}, "
                    f"amount={amount}, error={error}, "
                    f"remaining={deduction_result.get('credits_remaining')}"
                )
                raise ValueError(
                    f"Credit deduction failed: {deduction_result.get('message', error)}"
                )
        else:
            raise ValueError("Atomic deduction returned no data")
            
    except ValueError:
        # Insufficient credits / user not found - propagate to caller.
        raise
    except Exception as e:
        # The atomic RPC is required in all environments. Do NOT silently fall
        # back to a non-atomic path (that reintroduces the BUG-005 race).
        logger.error(f"[Credits:AtomicDeduct] RPC error for user {user_id}: {e}")
        raise


async def refund_credits(user_id: str, amount: int = 1, reason: str = "refund") -> None:
    """
    Best-effort refund of previously-reserved credits when the paid operation
    fails after the credit was deducted.

    Used by the reserve-then-work pattern: we deduct atomically up front (which
    is race-safe) and refund here if the downstream work raises. This keeps the
    "users don't pay for failures" guarantee while preventing double-spend.

    Not security critical (returns a user's own credit), so a read-modify-write
    is acceptable here. The DB trigger caps credits at the monthly allowance.
    """
    try:
        result = supabase.table("user_profiles").select(
            "credits_remaining, monthly_credit_allowance"
        ).eq("user_id", user_id).single().execute()
        if not result.data:
            return
        current = result.data.get("credits_remaining", 0) or 0
        allowance = result.data.get("monthly_credit_allowance")
        new_balance = current + amount
        if allowance is not None:
            new_balance = min(new_balance, allowance)

        supabase.table("user_profiles").update(
            {"credits_remaining": new_balance}
        ).eq("user_id", user_id).execute()

        try:
            supabase.table("credits_ledger").insert({
                "user_id": user_id,
                "amount": amount,
                "reason": reason,
                "balance_after": new_balance,
            }).execute()
        except Exception:
            pass  # Ledger logging failure shouldn't break refund.
        logger.info(f"[Credits:Refund] Refunded {amount} credit(s) to user {user_id}")
    except Exception as e:
        logger.error(f"[Credits:Refund] Failed to refund credits for user {user_id}: {e}")



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
    
    # Create default profile for new users
    # NOTE: Admin status is NOT inferred from user_metadata.
    # Admins are designated ONLY by setting user_profiles.role = 'admin' directly.
    # New users always start as 'free_user' with 10 credits.
    # Premium users get higher credits via subscription (Stripe webhook updates).
    insert_response = supabase.table("user_profiles").insert({
        "user_id": user_id,
        "role": "free_user",
        "credits_remaining": 10,
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
            
    except Exception as e:
        # If atomic function doesn't exist yet, fall back to legacy behavior
        # This allows gradual migration - remove this fallback after migration is applied
        if "function" in str(e).lower() and "does not exist" in str(e).lower():
            logger.warning(
                f"[Credits:Fallback] atomic_decrement_credits not available, "
                f"using legacy deduction for user={user_id}"
            )
            return await _legacy_decrement_credits(user_id, amount, reason)
        raise


async def _legacy_decrement_credits(user_id: str, amount: int, reason: str) -> dict:
    """
    Legacy (non-atomic) credit deduction.
    
    WARNING: This has a race condition (BUG-005).
    Only used as fallback if atomic_decrement_credits DB function is not available.
    Remove this function after migration is applied to all environments.
    """
    profile = await check_and_reset_credits(user_id)
    current_credits = profile.get("credits_remaining", 0)
    new_credits = max(0, current_credits - amount)
    
    # Update profile (NOT ATOMIC - race condition possible)
    update_response = supabase.table("user_profiles").update({
        "credits_remaining": new_credits,
    }).eq("user_id", user_id).execute()
    
    # Log to ledger
    try:
        supabase.table("credits_ledger").insert({
            "user_id": user_id,
            "amount": -amount,
            "reason": reason,
            "balance_after": new_credits,
        }).execute()
    except Exception:
        pass  # Logging failure shouldn't break the flow
    
    return {
        "success": True,
        "credits_remaining": new_credits,
        "legacy_fallback": True
    }

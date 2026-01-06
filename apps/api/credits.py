"""Credits management and enforcement."""
from db import supabase
from typing import Optional


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
    
    # Create default profile
    user_response = supabase.auth.admin.get_user_by_id(user_id)
    user = user_response.user
    role = user.user_metadata.get("role") if user.user_metadata else "free_user"
    
    default_credits = 120 if role in ["premium_user", "admin"] else 10
    default_reference_uploads = 999999 if role in ["premium_user", "admin"] else 1
    
    insert_response = supabase.table("user_profiles").insert({
        "user_id": user_id,
        "role": role,
        "credits_remaining": default_credits,
        "reference_uploads_remaining": default_reference_uploads,
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


async def decrement_credits(user_id: str, amount: int = 1, reason: str = "recording_saved", is_admin: bool = False) -> dict:
    """
    Decrement user credits and log to ledger.
    Admins bypass credit decrements.
    Returns updated profile.
    """
    if is_admin:
        return {}
    
    profile = await check_and_reset_credits(user_id)
    current_credits = profile.get("credits_remaining", 0)
    new_credits = max(0, current_credits - amount)
    
    # Update profile
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
    
    return update_response.data[0] if update_response.data else profile


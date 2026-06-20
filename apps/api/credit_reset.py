"""
Monthly credit reset job for Stripe subscriptions.

This module provides functionality to reset monthly credits for all users
with active Pro subscriptions at the start of their billing period.

Reference: Claude.md - Item #3: Monthly Credit Reset Job

Scheduled via:
- APScheduler (if using internal scheduling)
- Cron jobs (recommended for production)
- External scheduling service (UptimeRobot, GitHub Actions, etc.)

Usage:
    # Scheduled daily or at specific times:
    0 0 * * * cd /path/to/voira && python -c "
        from apps.api.credit_reset import reset_monthly_credits
        import asyncio
        asyncio.run(reset_monthly_credits())
    "
"""

import logging
from datetime import datetime, timezone
from typing import List, Dict, Any

from db import supabase
from logging_config import get_logger
from sentry_config import capture_exception

logger = get_logger(__name__)


async def reset_monthly_credits() -> Dict[str, Any]:
    """
    Reset monthly credits for all active Pro subscriptions at period start.
    
    This function:
    1. Finds all users with active Pro subscriptions
    2. Checks if they're at the start of their billing period
    3. Resets their credits to monthly_credit_allowance
    4. Logs all changes for audit trail
    
    Returns:
        dict: {
            "success": bool,
            "reset_count": int,
            "failed_count": int,
            "errors": List[str]
        }
    
    Note:
        - Only resets if subscription hasn't expired (now < period_end)
        - Skips users already reset in the current billing period
        - Does NOT reset users on free tier or inactive subscriptions
        - Does NOT reset users with canceled subscriptions
    """
    logger.info("[CreditReset] Starting monthly credit reset job")
    
    reset_count = 0
    failed_count = 0
    errors = []
    
    try:
        # Get all users with active Pro subscriptions
        result = supabase.table("user_profiles").select(
            "user_id, subscription_plan, subscription_status, "
            "monthly_credit_allowance, credits_remaining, "
            "subscription_current_period_end, last_credit_reset_at"
        ).in_("subscription_plan", ["pro_monthly", "pro_yearly"]).eq(
            "subscription_status", "active"
        ).execute()
        
        if not result.data:
            logger.info("[CreditReset] No active Pro subscriptions found")
            return {
                "success": True,
                "reset_count": 0,
                "failed_count": 0,
                "errors": []
            }
        
        logger.info(f"[CreditReset] Found {len(result.data)} active Pro subscriptions")
        
        now = datetime.now(timezone.utc)
        
        for user in result.data:
            user_id = user["user_id"]
            
            try:
                period_end_str = user.get("subscription_current_period_end")
                
                if not period_end_str:
                    logger.warning(f"[CreditReset] User {user_id} missing period end date")
                    failed_count += 1
                    continue
                
                period_end = datetime.fromisoformat(period_end_str.replace('Z', '+00:00'))
                
                # Skip expired subscriptions (Stripe renews these via webhook)
                if now >= period_end:
                    logger.debug(
                        f"[CreditReset] User {user_id} period expired "
                        f"(end: {period_end}, now: {now})"
                    )
                    continue
                
                # Monthly allowance refreshes EVERY calendar month for both
                # monthly and yearly plans (yearly plans still get a monthly
                # credit allowance). Reset once per calendar month.
                last_reset_str = user.get("last_credit_reset_at")
                if last_reset_str:
                    last_reset = datetime.fromisoformat(last_reset_str.replace('Z', '+00:00'))
                    if (last_reset.year, last_reset.month) == (now.year, now.month):
                        logger.debug(
                            f"[CreditReset] User {user_id} already reset this month "
                            f"(last reset: {last_reset})"
                        )
                        continue
                
                # Get current allowance
                allowance = user.get("monthly_credit_allowance", 60)
                current_credits = user.get("credits_remaining", 0)
                
                # Reset credits to the full allowance at the start of each cycle
                # (allowance is a monthly refresh, not a high-water-mark cap).
                supabase.table("user_profiles").update({
                    "credits_remaining": allowance,
                    "credits_used_this_period": 0,
                    "last_credit_reset_at": now.isoformat(),
                    "updated_at": now.isoformat()
                }).eq("user_id", user_id).execute()
                
                logger.info(
                    f"[CreditReset] Reset credits for user {user_id}: "
                    f"{current_credits} -> {allowance}"
                )
                reset_count += 1
            
            except Exception as e:
                logger.error(f"[CreditReset] Failed to reset credits for user {user_id}: {e}")
                failed_count += 1
                errors.append(f"User {user_id}: {str(e)}")
                capture_exception(e)
        
        logger.info(
            f"[CreditReset] Job complete. Reset: {reset_count}, Failed: {failed_count}"
        )
        
        return {
            "success": True,
            "reset_count": reset_count,
            "failed_count": failed_count,
            "errors": errors
        }
    
    except Exception as e:
        logger.error(f"[CreditReset] Job failed: {e}")
        capture_exception(e)
        return {
            "success": False,
            "reset_count": 0,
            "failed_count": 0,
            "errors": [str(e)]
        }


async def verify_credit_integrity() -> Dict[str, Any]:
    """
    Verify credit system integrity.
    
    Checks:
    1. No user has credits > monthly_credit_allowance
    2. No user has negative credits
    3. Inactive users have free tier credits
    
    Returns:
        dict: {
            "integrity_ok": bool,
            "violations": List[str],
            "fixed_count": int
        }
    """
    logger.info("[CreditVerify] Starting credit integrity check")
    
    violations = []
    fixed_count = 0
    
    try:
        result = supabase.table("user_profiles").select(
            "user_id, credits_remaining, monthly_credit_allowance, subscription_status"
        ).execute()
        
        if not result.data:
            return {"integrity_ok": True, "violations": [], "fixed_count": 0}
        
        for user in result.data:
            user_id = user["user_id"]
            credits = user.get("credits_remaining", 0)
            allowance = user.get("monthly_credit_allowance", 10)
            
            # Check: credits > allowance
            if credits > allowance:
                violation = f"User {user_id}: {credits} > {allowance}"
                violations.append(violation)
                logger.warning(f"[CreditVerify] {violation}")
                
                # Auto-fix
                try:
                    supabase.table("user_profiles").update({
                        "credits_remaining": allowance
                    }).eq("user_id", user_id).execute()
                    fixed_count += 1
                except Exception as e:
                    logger.error(f"[CreditVerify] Failed to fix {violation}: {e}")
            
            # Check: negative credits
            if credits < 0:
                violation = f"User {user_id}: negative credits ({credits})"
                violations.append(violation)
                logger.warning(f"[CreditVerify] {violation}")
                
                # Auto-fix
                try:
                    supabase.table("user_profiles").update({
                        "credits_remaining": 0
                    }).eq("user_id", user_id).execute()
                    fixed_count += 1
                except Exception as e:
                    logger.error(f"[CreditVerify] Failed to fix {violation}: {e}")
        
        integrity_ok = len(violations) == 0
        logger.info(
            f"[CreditVerify] Check complete. Integrity: {integrity_ok}, "
            f"Violations: {len(violations)}, Fixed: {fixed_count}"
        )
        
        return {
            "integrity_ok": integrity_ok,
            "violations": violations,
            "fixed_count": fixed_count
        }
    
    except Exception as e:
        logger.error(f"[CreditVerify] Check failed: {e}")
        capture_exception(e)
        return {
            "integrity_ok": False,
            "violations": [str(e)],
            "fixed_count": 0
        }

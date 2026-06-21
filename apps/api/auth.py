"""
Authentication utilities for JWT validation.

READ vs WRITE ACCESS PATTERN
============================
This module provides two levels of user authentication:

1. get_current_user() - READ OPERATIONS
   - Validates JWT only
   - Disabled users CAN still access
   - Use for: viewing profiles, reading transcripts, listing history
   - A disabled user should still see their own data for transparency

2. get_active_user() - WRITE OPERATIONS
   - Validates JWT AND checks is_disabled flag
   - Disabled users are BLOCKED with 403
   - Use for: creating sessions, recording, consuming credits, any mutations
   - Prevents disabled users from consuming resources

WebSocket variants:
- get_user_from_websocket_token() - read-level for WebSocket
- get_active_user_from_websocket_token() - write-level for WebSocket

When adding new endpoints, choose the appropriate dependency based on whether
the operation is read-only (use get_current_user) or mutates state/consumes
resources (use get_active_user).
"""

import logging
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import httpx
from supabase import Client
from db import supabase
from config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
):
    """
    Validate Supabase JWT and return user info.
    Raises 401 if invalid or missing token.
    """
    token = credentials.credentials

    try:
        # Verify token with Supabase REST API
        async with httpx.AsyncClient() as client:
            verify_response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
                timeout=10.0,
            )

            if verify_response.status_code != 200:
                raise HTTPException(
                    status_code=401, detail="Invalid authentication token"
                )

            user_data = verify_response.json()
            user_id = user_data.get("id")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid user data")

        # Get user profile (authoritative source for role)
        profile_response = (
            supabase.table("user_profiles").select("*").eq("user_id", user_id).execute()
        )
        profile = profile_response.data[0] if profile_response.data else None

        user_metadata = user_data.get("user_metadata", {})

        # Role comes from user_profiles (authoritative), NOT from JWT user_metadata
        # user_metadata.role is legacy and should not be trusted for admin checks
        profile_role = profile.get("role") if profile else None

        return {
            "id": user_id,
            "email": user_data.get("email"),
            "full_name": user_metadata.get("full_name"),
            "role": profile_role or "free_user",
            "credits_remaining": profile.get("credits_remaining") if profile else 10,
            "monthly_credit_allowance": (
                profile.get("monthly_credit_allowance") if profile else 10
            ),
            "credits_reset_at": profile.get("credits_reset_at") if profile else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        # Log details server-side; return a generic message to the client.
        logger.error(f"[Auth] Authentication error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


async def check_is_admin(user: dict) -> bool:
    """
    Check if user is admin by querying user_profiles.role.

    SINGLE SOURCE OF TRUTH: Admin status is determined ONLY by
    public.user_profiles.role = 'admin'. Do NOT use:
    - admin_emails table (not an authorization source at runtime)
    - JWT user_metadata.role (not authoritative for admin)

    The DB-level enforcement point is deduct_credit(), which also
    checks user_profiles.role = 'admin' for credit bypass.
    """
    if not user or not user.get("id"):
        return False

    try:
        response = (
            supabase.table("user_profiles")
            .select("role")
            .eq("user_id", user["id"])
            .execute()
        )
        if response.data and len(response.data) > 0:
            return response.data[0].get("role") == "admin"
        return False
    except Exception:
        return False


async def get_user_from_websocket_token(token: str):
    """
    Validate Supabase JWT token from WebSocket connection.
    Used for authenticating WebSocket connections (can't use HTTPBearer).

    Args:
        token: JWT token from WebSocket query param or header

    Returns:
        User dictionary with id, email, role, etc.

    Raises:
        HTTPException: If token is invalid
    """
    if not token or not token.strip():
        logger.warning("[WebSocket Auth] Empty or whitespace-only token provided")
        raise HTTPException(
            status_code=401, detail="Missing or empty authentication token"
        )

    # Log token presence (masked for security)
    token_preview = f"{token[:10]}..." if len(token) > 10 else "***"
    logger.debug(
        f"[WebSocket Auth] Validating token: {token_preview} (length: {len(token)})"
    )

    try:
        # Verify token with Supabase REST API
        async with httpx.AsyncClient() as client:
            verify_response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key,
                },
                timeout=10.0,
            )

            if verify_response.status_code != 200:
                logger.warning(
                    f"[WebSocket Auth] Token validation failed: Supabase returned status {verify_response.status_code}"
                )
                logger.debug(
                    f"[WebSocket Auth] Response body: {verify_response.text[:200]}"
                )
                raise HTTPException(
                    status_code=401, detail="Invalid authentication token"
                )

            user_data = verify_response.json()
            user_id = user_data.get("id")
            if not user_id:
                logger.warning(
                    "[WebSocket Auth] Token validation returned invalid user data (no user_id)"
                )
                raise HTTPException(status_code=401, detail="Invalid user data")

            logger.debug(
                f"[WebSocket Auth] Token validated successfully for user {user_id}"
            )

        # Get user profile (authoritative source for role)
        profile_response = (
            supabase.table("user_profiles").select("*").eq("user_id", user_id).execute()
        )
        profile = profile_response.data[0] if profile_response.data else None

        user_metadata = user_data.get("user_metadata", {})

        # Role comes from user_profiles (authoritative), NOT from JWT user_metadata
        profile_role = profile.get("role") if profile else None

        return {
            "id": user_id,
            "email": user_data.get("email"),
            "full_name": user_metadata.get("full_name"),
            "role": profile_role or "free_user",
            "credits_remaining": profile.get("credits_remaining") if profile else 10,
            "monthly_credit_allowance": (
                profile.get("monthly_credit_allowance") if profile else 10
            ),
            "credits_reset_at": profile.get("credits_reset_at") if profile else None,
        }
    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.error("[WebSocket Auth] Timeout while validating token with Supabase")
        raise HTTPException(status_code=401, detail="Authentication timeout")
    except Exception as e:
        logger.error(
            f"[WebSocket Auth] Unexpected error during token validation: {type(e).__name__}: {str(e)}"
        )
        raise HTTPException(status_code=401, detail="Authentication failed")


async def check_user_disabled(user_id: str) -> bool:
    """
    Check if a user account is disabled.

    Args:
        user_id: The user's ID

    Returns:
        True if user is disabled, False otherwise
    """
    try:
        result = (
            supabase.table("user_profiles")
            .select("is_disabled")
            .eq("user_id", user_id)
            .single()
            .execute()
        )

        return result.data.get("is_disabled", False) if result.data else False
    except Exception as e:
        # Fail CLOSED: if we cannot verify the account status, treat the user as
        # disabled so a DB/network outage cannot grant disabled users access.
        logger.warning(
            f"[Auth] Failed to check disabled status for user {user_id}: {e}"
        )
        raise HTTPException(
            status_code=503, detail="Unable to verify account status. Please try again."
        )


async def get_active_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
):
    """
    Get current user and verify they are not disabled.

    Use this dependency for endpoints that disabled users should NOT access:
    - Creating sessions
    - Recording audio
    - Consuming credits
    - Any write operations

    Raises:
        HTTPException 401: If not authenticated
        HTTPException 403: If user account is disabled
    """
    user = await get_current_user(credentials)

    is_disabled = await check_user_disabled(user["id"])
    if is_disabled:
        logger.warning(f"[Auth] Disabled user attempted action: user_id={user['id']}")
        raise HTTPException(
            status_code=403,
            detail="Your account has been disabled. Please contact support.",
        )

    return user


async def get_user_by_id(user_id: str) -> dict:
    """Load user profile by ID (for WS ticket auth — no JWT round-trip)."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")

    profile_response = (
        supabase.table("user_profiles").select("*").eq("user_id", user_id).execute()
    )
    profile = profile_response.data[0] if profile_response.data else None

    return {
        "id": user_id,
        "email": profile.get("email") if profile else None,
        "full_name": profile.get("full_name") if profile else None,
        "role": (profile.get("role") if profile else None) or "free_user",
        "credits_remaining": profile.get("credits_remaining") if profile else 10,
        "monthly_credit_allowance": (
            profile.get("monthly_credit_allowance") if profile else 10
        ),
        "credits_reset_at": profile.get("credits_reset_at") if profile else None,
    }


async def get_active_user_from_websocket_ticket(ticket: str):
    """Validate short-lived WS ticket and verify user is not disabled."""
    from ws_tickets import verify_ws_ticket

    user_id = verify_ws_ticket(ticket)
    if not user_id:
        raise HTTPException(
            status_code=401, detail="Invalid or expired WebSocket ticket"
        )

    user = await get_user_by_id(user_id)
    is_disabled = await check_user_disabled(user_id)
    if is_disabled:
        logger.warning(
            f"[WebSocket Auth] Disabled user attempted WebSocket connection: user_id={user_id}"
        )
        raise HTTPException(
            status_code=403,
            detail="Your account has been disabled. Please contact support.",
        )
    return user


async def get_active_user_from_websocket_token(token: str):
    """
    Validate WebSocket token AND verify user is not disabled.

    Use this for WebSocket endpoints that disabled users should NOT access.
    Returns user dict if valid and active, raises HTTPException otherwise.

    Args:
        token: JWT token from WebSocket query param

    Returns:
        User dictionary with id, email, role, etc.

    Raises:
        HTTPException 401: If token is invalid
        HTTPException 403: If user account is disabled
    """
    user = await get_user_from_websocket_token(token)

    is_disabled = await check_user_disabled(user["id"])
    if is_disabled:
        logger.warning(
            f"[WebSocket Auth] Disabled user attempted WebSocket connection: user_id={user['id']}"
        )
        raise HTTPException(
            status_code=403,
            detail="Your account has been disabled. Please contact support.",
        )

    return user

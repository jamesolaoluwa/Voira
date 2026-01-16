"""Authentication utilities for JWT validation."""
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


async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
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
                    "apikey": settings.supabase_anon_key
                },
                timeout=10.0
            )
            
            if verify_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid authentication token")
            
            user_data = verify_response.json()
            user_id = user_data.get("id")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid user data")
        
        # Get user profile
        profile_response = supabase.table("user_profiles").select("*").eq("user_id", user_id).execute()
        profile = profile_response.data[0] if profile_response.data else None
        
        user_metadata = user_data.get("user_metadata", {})
        
        return {
            "id": user_id,
            "email": user_data.get("email"),
            "full_name": user_metadata.get("full_name"),
            "role": user_metadata.get("role", "free_user"),
            "credits_remaining": profile.get("credits_remaining") if profile else 10,
            "credits_reset_at": profile.get("credits_reset_at") if profile else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


async def check_is_admin(user: dict) -> bool:
    """
    Check if user is admin by querying admin_emails table.
    Uses service_role key (backend only).
    Returns True only if email exists in admin_emails.
    """
    if not user or not user.get("email"):
        return False
    
    email = user["email"].lower().strip()
    
    try:
        # Query admin_emails using service_role (bypasses RLS)
        response = supabase.table("admin_emails").select("email").eq("email", email).execute()
        return len(response.data) > 0
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
        raise HTTPException(status_code=401, detail="Missing or empty authentication token")
    
    # Log token presence (masked for security)
    token_preview = f"{token[:10]}..." if len(token) > 10 else "***"
    logger.debug(f"[WebSocket Auth] Validating token: {token_preview} (length: {len(token)})")
    
    try:
        # Verify token with Supabase REST API
        async with httpx.AsyncClient() as client:
            verify_response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_anon_key
                },
                timeout=10.0
            )
            
            if verify_response.status_code != 200:
                logger.warning(f"[WebSocket Auth] Token validation failed: Supabase returned status {verify_response.status_code}")
                logger.debug(f"[WebSocket Auth] Response body: {verify_response.text[:200]}")
                raise HTTPException(status_code=401, detail="Invalid authentication token")
            
            user_data = verify_response.json()
            user_id = user_data.get("id")
            if not user_id:
                logger.warning("[WebSocket Auth] Token validation returned invalid user data (no user_id)")
                raise HTTPException(status_code=401, detail="Invalid user data")
            
            logger.debug(f"[WebSocket Auth] Token validated successfully for user {user_id}")
        
        # Get user profile
        profile_response = supabase.table("user_profiles").select("*").eq("user_id", user_id).execute()
        profile = profile_response.data[0] if profile_response.data else None
        
        user_metadata = user_data.get("user_metadata", {})
        
        return {
            "id": user_id,
            "email": user_data.get("email"),
            "full_name": user_metadata.get("full_name"),
            "role": user_metadata.get("role", "free_user"),
            "credits_remaining": profile.get("credits_remaining") if profile else 10,
            "credits_reset_at": profile.get("credits_reset_at") if profile else None,
        }
    except HTTPException:
        raise
    except httpx.TimeoutException:
        logger.error("[WebSocket Auth] Timeout while validating token with Supabase")
        raise HTTPException(status_code=401, detail="Authentication timeout")
    except Exception as e:
        logger.error(f"[WebSocket Auth] Unexpected error during token validation: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


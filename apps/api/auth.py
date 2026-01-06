"""Authentication utilities for JWT validation."""
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import httpx
from supabase import Client
from db import supabase
from config import settings

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


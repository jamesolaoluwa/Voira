"""
Admin Dashboard API Router.

SECURITY:
- ALL routes use require_admin() dependency
- Admin check is server-side via user_profiles.role = 'admin'
- All write operations are logged to admin_audit_log
- No content/audio data is exposed

RATE LIMITING:
- Admin routes use the same rate limiter as user routes
- Additional per-admin tracking for abuse prevention
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from auth import get_current_user, check_is_admin
from db import supabase
from config import settings
from admin_models import (
    # Pagination
    PaginationParams,
    # User models
    AdminUserSummary,
    AdminUserDetail,
    AdminUserListResponse,
    AdminUserFilters,
    # Session models
    AdminSessionSummary,
    AdminSessionListResponse,
    AdminSessionFilters,
    # Draft models
    AdminDraftSummary,
    AdminDraftListResponse,
    AdminDraftFilters,
    # Analytics
    AdminAnalytics,
    # Audit log
    AdminAuditLogEntry,
    AdminAuditLogResponse,
    AdminAuditLogFilters,
    AdminAuditLogStats,
    # Action models
    CreditAdjustmentRequest,
    UserDisableRequest,
    AdminActionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# =============================================================================
# Admin Dependency
# =============================================================================

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency that enforces admin access.
    
    SECURITY: This is the ONLY way to gate admin endpoints.
    Never rely on frontend checks alone.
    
    Returns:
        User dict if admin
        
    Raises:
        HTTPException 403 if not admin
    """
    is_admin = await check_is_admin(user)
    if not is_admin:
        logger.warning(
            "[Admin] Unauthorized access attempt by user_id=%s email=%s",
            user.get("id"),
            user.get("email")
        )
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )
    return user


# =============================================================================
# Audit Logging Utility
# =============================================================================

async def create_audit_log(
    admin: dict,
    action: str,
    target_type: str,
    target_id: Optional[str],
    details: dict,
    request: Optional[Request] = None,
) -> str:
    """
    Create an audit log entry for admin actions.
    
    This function MUST be called for all write operations.
    
    Captures:
    - Admin ID and email
    - Action and target information
    - Before/after state in details
    - Request metadata (IP, user agent)
    - Timestamp (automatic from DB)
    
    Returns:
        The created audit log entry ID
    """
    ip_address = None
    user_agent = None
    
    if request:
        # Get IP from X-Forwarded-For or direct connection
        ip_address = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not ip_address:
            ip_address = request.client.host if request.client else None
        
        # Get user agent for forensic purposes
        user_agent = request.headers.get("User-Agent", None)
    
    try:
        result = supabase.table("admin_audit_log").insert({
            "admin_id": admin["id"],
            "admin_email": admin["email"],
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details,
            "ip_address": ip_address,
            "user_agent": user_agent,
        }).execute()
        
        audit_id = result.data[0]["id"] if result.data else None
        
        logger.info(
            "[Admin:Audit] action=%s admin=%s target_type=%s target_id=%s audit_id=%s",
            action,
            admin["email"],
            target_type,
            target_id,
            audit_id
        )
        
        return audit_id
        
    except Exception as e:
        # Audit log failure should NOT block the operation, but must be logged
        logger.error(
            "[Admin:Audit] FAILED to create audit log: action=%s admin=%s error=%s",
            action,
            admin["email"],
            str(e)
        )
        # NOTE: We don't raise here to avoid blocking admin operations
        # But this should trigger an alert in production monitoring
        return None


# =============================================================================
# Helper: Check if user is disabled
# =============================================================================

async def check_user_disabled(user: dict) -> bool:
    """
    Check if a user is disabled.
    
    This should be called in user-facing endpoints to block disabled users.
    """
    try:
        result = supabase.table("user_profiles").select(
            "is_disabled"
        ).eq("user_id", user["id"]).single().execute()
        
        return result.data.get("is_disabled", False) if result.data else False
    except Exception:
        return False


# =============================================================================
# Users Endpoints
# =============================================================================

@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    admin: dict = Depends(require_admin),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_disabled: Optional[bool] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """
    List all users with pagination and filters.
    
    Admin only. Returns metadata, never content.
    """
    try:
        # Build query for user_profiles
        # NOTE: email is NOT in user_profiles, it's in auth.users
        # We'll need to fetch emails separately or accept they may be missing
        query = supabase.table("user_profiles").select(
            "user_id, full_name, role, credits_remaining, credits_reset_at, "
            "created_at, is_disabled, disabled_at",
            count="exact"
        )
        
        # Apply filters (skip email search since it's not in this table)
        # TODO: To search by email, we'd need to join with auth.users
        
        if role:
            query = query.eq("role", role)
        
        if is_disabled is not None:
            query = query.eq("is_disabled", is_disabled)
        
        # Apply sorting
        # NOTE: Validate sort_by to prevent injection
        allowed_sort_fields = ["created_at", "credits_remaining", "role"]
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"
        
        query = query.order(sort_by, desc=(sort_order == "desc"))
        
        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Handle empty result
        if not result.data:
            logger.info("[Admin] list_users returned empty dataset")
            return AdminUserListResponse(
                users=[],
                page=page,
                per_page=per_page,
                total_count=0,
                total_pages=1,
                has_next=False,
                has_prev=page > 1,
            )
        
        # Get total count
        total_count = result.count if result.count is not None else len(result.data)
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Fetch emails from auth.users for display
        # This is a separate query since email is not in user_profiles
        user_ids = [row["user_id"] for row in result.data if row.get("user_id")]
        user_emails = {}
        
        if user_ids:
            try:
                # Use Supabase auth admin API to get user emails
                auth_users = supabase.auth.admin.list_users()
                if auth_users and hasattr(auth_users, 'users'):
                    for auth_user in auth_users.users:
                        if auth_user.id in user_ids:
                            user_emails[auth_user.id] = auth_user.email or "unknown"
            except Exception as auth_err:
                logger.warning(f"[Admin] Failed to fetch user emails from auth: {auth_err}")
                # Continue without emails - use "unknown" fallback
        
        # Map to response model with safe defaults
        users = []
        for row in result.data:
            user_id = row.get("user_id")
            if not user_id:
                logger.warning("[Admin] Skipping user_profile row with missing user_id")
                continue
                
            users.append(AdminUserSummary(
                id=user_id,
                email=user_emails.get(user_id, "unknown"),
                full_name=row.get("full_name"),
                role=row.get("role") or "free_user",
                credits_remaining=row.get("credits_remaining") or 0,
                credits_reset_at=row.get("credits_reset_at"),
                created_at=row.get("created_at") or datetime.utcnow(),
                is_disabled=row.get("is_disabled") or False,
                disabled_at=row.get("disabled_at"),
            ))
        
        return AdminUserListResponse(
            users=users,
            page=page,
            per_page=per_page,
            total_count=total_count,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to list users: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: str,
    admin: dict = Depends(require_admin),
):
    """
    Get detailed information about a specific user.
    
    Admin only. Returns metadata and aggregates, never content.
    """
    try:
        # Get user profile (email is NOT in user_profiles)
        user_result = supabase.table("user_profiles").select(
            "user_id, full_name, role, credits_remaining, credits_reset_at, "
            "created_at, is_disabled, disabled_at, disabled_by, disabled_reason"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = user_result.data
        
        # Fetch email from auth.users
        user_email = "unknown"
        try:
            auth_user = supabase.auth.admin.get_user_by_id(user_id)
            if auth_user and hasattr(auth_user, 'user') and auth_user.user:
                user_email = auth_user.user.email or "unknown"
        except Exception as auth_err:
            logger.warning(f"[Admin] Failed to fetch email for user {user_id}: {auth_err}")
        
        # Get session count from recordings table (sessions is an alias)
        session_count = 0
        try:
            sessions_result = supabase.table("recordings").select(
                "id", count="exact"
            ).eq("user_id", user_id).execute()
            session_count = sessions_result.count if sessions_result.count else 0
        except Exception as sess_err:
            logger.warning(f"[Admin] Failed to count sessions for user {user_id}: {sess_err}")
        
        # Get draft count
        draft_count = 0
        try:
            drafts_result = supabase.table("drafts").select(
                "id", count="exact"
            ).eq("user_id", user_id).execute()
            draft_count = drafts_result.count if drafts_result.count else 0
        except Exception as draft_err:
            logger.warning(f"[Admin] Failed to count drafts for user {user_id}: {draft_err}")
        
        # Get last active (most recent recording or draft)
        last_active_at = None
        try:
            last_session = supabase.table("recordings").select(
                "created_at"
            ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
            
            if last_session.data:
                last_active_at = last_session.data[0].get("created_at")
        except Exception:
            pass  # Non-critical, continue
        
        try:
            last_draft = supabase.table("drafts").select(
                "updated_at"
            ).eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
            
            if last_draft.data:
                draft_time = last_draft.data[0].get("updated_at")
                if draft_time and (not last_active_at or draft_time > last_active_at):
                    last_active_at = draft_time
        except Exception:
            pass  # Non-critical, continue
        
        # NOTE: total_transcription_minutes would require aggregating session data
        # For V1, we skip this to avoid expensive queries
        total_transcription_minutes = 0.0
        
        return AdminUserDetail(
            id=user.get("user_id") or user_id,
            email=user_email,
            full_name=user.get("full_name"),
            role=user.get("role") or "free_user",
            credits_remaining=user.get("credits_remaining") or 0,
            credits_reset_at=user.get("credits_reset_at"),
            created_at=user.get("created_at") or datetime.utcnow(),
            is_disabled=user.get("is_disabled") or False,
            disabled_at=user.get("disabled_at"),
            disabled_by=user.get("disabled_by"),
            disabled_reason=user.get("disabled_reason"),
            session_count=session_count,
            draft_count=draft_count,
            last_active_at=last_active_at,
            total_transcription_minutes=total_transcription_minutes,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to get user {user_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user details")


@router.post("/users/{user_id}/credits", response_model=AdminActionResponse)
async def adjust_user_credits(
    user_id: str,
    request_body: CreditAdjustmentRequest,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """
    Adjust a user's credit balance.
    
    AUDITED: All credit adjustments are logged with reason.
    """
    try:
        # Get current credits (email is NOT in user_profiles)
        user_result = supabase.table("user_profiles").select(
            "credits_remaining"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        old_credits = user_result.data.get("credits_remaining") or 0
        new_credits = request_body.new_credits
        
        # Try to get email for audit log (non-critical)
        target_email = "unknown"
        try:
            auth_user = supabase.auth.admin.get_user_by_id(user_id)
            if auth_user and hasattr(auth_user, 'user') and auth_user.user:
                target_email = auth_user.user.email or "unknown"
        except Exception:
            pass  # Non-critical
        
        # Update credits
        supabase.table("user_profiles").update({
            "credits_remaining": new_credits
        }).eq("user_id", user_id).execute()
        
        # Create audit log
        audit_id = await create_audit_log(
            admin=admin,
            action="credits_adjusted",
            target_type="user",
            target_id=user_id,
            details={
                "old_credits": old_credits,
                "new_credits": new_credits,
                "reason": request_body.reason,
                "target_email": target_email,
            },
            request=request,
        )
        
        logger.info(
            "[Admin] Credits adjusted: user=%s old=%d new=%d by=%s reason=%s",
            user_id, old_credits, new_credits, admin.get("email", "unknown"), request_body.reason
        )
        
        return AdminActionResponse(
            success=True,
            message=f"Credits adjusted from {old_credits} to {new_credits}",
            audit_log_id=audit_id,
            updated_credits=new_credits,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to adjust credits for {user_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to adjust credits")


@router.post("/users/{user_id}/disable", response_model=AdminActionResponse)
async def disable_user(
    user_id: str,
    request_body: UserDisableRequest,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """
    Disable a user account.
    
    Disabled users cannot:
    - Start new sessions
    - Record audio
    - Consume credits
    
    AUDITED: All disable actions are logged with reason.
    """
    try:
        # Check if user exists and isn't already disabled (email NOT in user_profiles)
        user_result = supabase.table("user_profiles").select(
            "is_disabled"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        if user_result.data.get("is_disabled"):
            raise HTTPException(status_code=400, detail="User is already disabled")
        
        # Prevent self-disable
        if user_id == admin.get("id"):
            raise HTTPException(status_code=400, detail="Cannot disable your own account")
        
        # Try to get email for audit log (non-critical)
        target_email = "unknown"
        try:
            auth_user = supabase.auth.admin.get_user_by_id(user_id)
            if auth_user and hasattr(auth_user, 'user') and auth_user.user:
                target_email = auth_user.user.email or "unknown"
        except Exception:
            pass
        
        # Update user
        supabase.table("user_profiles").update({
            "is_disabled": True,
            "disabled_at": datetime.utcnow().isoformat(),
            "disabled_by": admin.get("id"),
            "disabled_reason": request_body.reason,
        }).eq("user_id", user_id).execute()
        
        # Create audit log
        audit_id = await create_audit_log(
            admin=admin,
            action="user_disabled",
            target_type="user",
            target_id=user_id,
            details={
                "reason": request_body.reason,
                "target_email": target_email,
            },
            request=request,
        )
        
        logger.info(
            "[Admin] User disabled: user=%s by=%s reason=%s",
            user_id, admin.get("email", "unknown"), request_body.reason
        )
        
        return AdminActionResponse(
            success=True,
            message="User account disabled",
            audit_log_id=audit_id,
            updated_is_disabled=True,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to disable user {user_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to disable user")


@router.post("/users/{user_id}/enable", response_model=AdminActionResponse)
async def enable_user(
    user_id: str,
    request: Request,
    admin: dict = Depends(require_admin),
):
    """
    Re-enable a disabled user account.
    
    AUDITED: All enable actions are logged.
    """
    try:
        # Check if user exists and is disabled (email NOT in user_profiles)
        user_result = supabase.table("user_profiles").select(
            "is_disabled, disabled_reason"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not user_result.data.get("is_disabled"):
            raise HTTPException(status_code=400, detail="User is not disabled")
        
        # Try to get email for audit log (non-critical)
        target_email = "unknown"
        previous_reason = user_result.data.get("disabled_reason")
        try:
            auth_user = supabase.auth.admin.get_user_by_id(user_id)
            if auth_user and hasattr(auth_user, 'user') and auth_user.user:
                target_email = auth_user.user.email or "unknown"
        except Exception:
            pass
        
        # Update user
        supabase.table("user_profiles").update({
            "is_disabled": False,
            "disabled_at": None,
            "disabled_by": None,
            "disabled_reason": None,
        }).eq("user_id", user_id).execute()
        
        # Create audit log
        audit_id = await create_audit_log(
            admin=admin,
            action="user_enabled",
            target_type="user",
            target_id=user_id,
            details={
                "target_email": target_email,
                "previous_disable_reason": previous_reason,
            },
            request=request,
        )
        
        logger.info(
            "[Admin] User enabled: user=%s by=%s",
            user_id, admin.get("email", "unknown")
        )
        
        return AdminActionResponse(
            success=True,
            message="User account enabled",
            audit_log_id=audit_id,
            updated_is_disabled=False,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to enable user {user_id}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to enable user")


# =============================================================================
# Sessions Endpoint (queries 'recordings' table)
# =============================================================================

@router.get("/sessions", response_model=AdminSessionListResponse)
async def list_sessions(
    admin: dict = Depends(require_admin),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    session_type: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """
    List all sessions with pagination and filters.
    
    Admin only. Returns METADATA ONLY, never transcript or audio.
    NOTE: Sessions are stored in the 'recordings' table.
    """
    try:
        # Build query - explicitly exclude content fields
        # NOTE: The table is 'recordings', not 'sessions'
        # Column mapping: type -> session_type, title -> title
        query = supabase.table("recordings").select(
            "id, user_id, title, type, duration_seconds, "
            "words_per_minute, created_at, updated_at",
            count="exact"
        )
        
        # Apply filters
        if user_id:
            query = query.eq("user_id", user_id)
        
        if session_type:
            query = query.eq("type", session_type)
        
        # Apply sorting
        # NOTE: word_count doesn't exist in recordings, use words_per_minute
        allowed_sort_fields = ["created_at", "updated_at", "duration_seconds"]
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"
        
        query = query.order(sort_by, desc=(sort_order == "desc"))
        
        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Handle empty result
        if not result.data:
            logger.info("[Admin] list_sessions returned empty dataset")
            return AdminSessionListResponse(
                sessions=[],
                page=page,
                per_page=per_page,
                total_count=0,
                total_pages=1,
                has_next=False,
                has_prev=page > 1,
            )
        
        # Get total count
        total_count = result.count if result.count is not None else len(result.data)
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Get user emails for denormalization (from auth, not user_profiles)
        user_ids = list(set(row.get("user_id") for row in result.data if row.get("user_id")))
        user_emails = {}
        if user_ids:
            try:
                auth_users = supabase.auth.admin.list_users()
                if auth_users and hasattr(auth_users, 'users'):
                    for auth_user in auth_users.users:
                        if auth_user.id in user_ids:
                            user_emails[auth_user.id] = auth_user.email or "unknown"
            except Exception as auth_err:
                logger.warning(f"[Admin] Failed to fetch user emails: {auth_err}")
        
        # Map to response model with safe defaults
        sessions = []
        for row in result.data:
            sessions.append(AdminSessionSummary(
                id=row.get("id") or "unknown",
                user_id=row.get("user_id") or "unknown",
                user_email=user_emails.get(row.get("user_id"), "unknown"),
                title=row.get("title"),
                session_type=row.get("type"),  # Column is 'type', not 'session_type'
                style=None,  # Not in recordings table schema
                duration_seconds=row.get("duration_seconds"),
                word_count=row.get("words_per_minute"),  # Using words_per_minute as proxy
                created_at=row.get("created_at") or datetime.utcnow(),
                updated_at=row.get("updated_at"),
            ))
        
        return AdminSessionListResponse(
            sessions=sessions,
            page=page,
            per_page=per_page,
            total_count=total_count,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to list sessions: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sessions")


# =============================================================================
# Drafts Endpoint
# =============================================================================

@router.get("/drafts", response_model=AdminDraftListResponse)
async def list_drafts(
    admin: dict = Depends(require_admin),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """
    List all drafts with pagination and filters.
    
    Admin only. Returns METADATA ONLY, never transcript content.
    """
    try:
        # Build query - explicitly exclude content fields
        # NOTE: Column is 'name' not 'title' in drafts table
        query = supabase.table("drafts").select(
            "id, user_id, name, question, created_at, updated_at",
            count="exact"
        )
        
        # Apply filters
        if user_id:
            query = query.eq("user_id", user_id)
        
        # Apply sorting
        allowed_sort_fields = ["created_at", "updated_at"]
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"
        
        query = query.order(sort_by, desc=(sort_order == "desc"))
        
        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Handle empty result
        if not result.data:
            logger.info("[Admin] list_drafts returned empty dataset")
            return AdminDraftListResponse(
                drafts=[],
                page=page,
                per_page=per_page,
                total_count=0,
                total_pages=1,
                has_next=False,
                has_prev=page > 1,
            )
        
        # Get total count
        total_count = result.count if result.count is not None else len(result.data)
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Get user emails for denormalization (from auth)
        user_ids = list(set(row.get("user_id") for row in result.data if row.get("user_id")))
        user_emails = {}
        if user_ids:
            try:
                auth_users = supabase.auth.admin.list_users()
                if auth_users and hasattr(auth_users, 'users'):
                    for auth_user in auth_users.users:
                        if auth_user.id in user_ids:
                            user_emails[auth_user.id] = auth_user.email or "unknown"
            except Exception as auth_err:
                logger.warning(f"[Admin] Failed to fetch user emails: {auth_err}")
        
        # Map to response model with safe defaults
        drafts = []
        for row in result.data:
            drafts.append(AdminDraftSummary(
                id=row.get("id") or "unknown",
                user_id=row.get("user_id") or "unknown",
                user_email=user_emails.get(row.get("user_id"), "unknown"),
                title=row.get("name"),  # Column is 'name' not 'title'
                question=row.get("question"),
                word_count=None,  # Not in drafts table schema
                created_at=row.get("created_at") or datetime.utcnow(),
                updated_at=row.get("updated_at") or row.get("created_at") or datetime.utcnow(),
            ))
        
        return AdminDraftListResponse(
            drafts=drafts,
            page=page,
            per_page=per_page,
            total_count=total_count,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to list drafts: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch drafts")


# =============================================================================
# Analytics Endpoint
# =============================================================================

@router.get("/analytics", response_model=AdminAnalytics)
async def get_analytics(
    admin: dict = Depends(require_admin),
):
    """
    Get aggregate analytics for the admin dashboard.
    
    All values are aggregates - no PII or individual user data.
    Safe when tables are empty - all metrics default to 0.
    
    NOTE: These are real-time queries. If performance becomes an issue,
    consider materialized views or caching.
    """
    try:
        now = datetime.utcnow()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Initialize all metrics to safe defaults
        total_users = 0
        disabled_users = 0
        active_users_24h = 0
        active_users_7d = 0
        total_sessions = 0
        sessions_today = 0
        sessions_7d = 0
        total_drafts = 0
        
        # User metrics (safe queries)
        try:
            total_users_result = supabase.table("user_profiles").select(
                "user_id", count="exact"
            ).execute()
            total_users = total_users_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count total users: {e}")
        
        try:
            disabled_users_result = supabase.table("user_profiles").select(
                "user_id", count="exact"
            ).eq("is_disabled", True).execute()
            disabled_users = disabled_users_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count disabled users: {e}")
        
        # Active users (had a recording/session in timeframe)
        # NOTE: Table is 'recordings', not 'sessions'
        try:
            active_24h_result = supabase.table("recordings").select(
                "user_id"
            ).gte("created_at", day_ago.isoformat()).execute()
            if active_24h_result.data:
                active_users_24h = len(set(s.get("user_id") for s in active_24h_result.data if s.get("user_id")))
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count active users 24h: {e}")
        
        try:
            active_7d_result = supabase.table("recordings").select(
                "user_id"
            ).gte("created_at", week_ago.isoformat()).execute()
            if active_7d_result.data:
                active_users_7d = len(set(s.get("user_id") for s in active_7d_result.data if s.get("user_id")))
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count active users 7d: {e}")
        
        # Session metrics (from recordings table)
        try:
            total_sessions_result = supabase.table("recordings").select(
                "id", count="exact"
            ).execute()
            total_sessions = total_sessions_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count total sessions: {e}")
        
        try:
            sessions_today_result = supabase.table("recordings").select(
                "id", count="exact"
            ).gte("created_at", today_start.isoformat()).execute()
            sessions_today = sessions_today_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count sessions today: {e}")
        
        try:
            sessions_7d_result = supabase.table("recordings").select(
                "id", count="exact"
            ).gte("created_at", week_ago.isoformat()).execute()
            sessions_7d = sessions_7d_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count sessions 7d: {e}")
        
        # Draft metrics
        try:
            total_drafts_result = supabase.table("drafts").select(
                "id", count="exact"
            ).execute()
            total_drafts = total_drafts_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:Analytics] Failed to count total drafts: {e}")
        
        # Log if all data is empty (fresh DB)
        if total_users == 0 and total_sessions == 0 and total_drafts == 0:
            logger.info("[Admin:Analytics] Fresh DB detected - returning zeroed metrics")
        
        return AdminAnalytics(
            total_users=total_users,
            active_users_24h=active_users_24h,
            active_users_7d=active_users_7d,
            disabled_users=disabled_users,
            total_sessions=total_sessions,
            total_drafts=total_drafts,
            sessions_today=sessions_today,
            sessions_7d=sessions_7d,
            avg_session_duration_seconds=None,  # TODO: Implement with SQL AVG
            total_transcription_minutes=None,  # TODO: Implement if needed
            total_credits_consumed_today=0,  # TODO: Track in separate table
            total_credits_consumed_7d=0,
            generated_at=now,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to generate analytics: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate analytics")


# =============================================================================
# Audit Log Endpoint
# =============================================================================

@router.get("/audit-log", response_model=AdminAuditLogResponse)
async def get_audit_log(
    admin: dict = Depends(require_admin),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    admin_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
):
    """
    View the admin audit log.
    
    Admin only. Shows all admin actions with full details.
    Safe when table is empty or doesn't exist yet.
    """
    try:
        # Build query
        query = supabase.table("admin_audit_log").select(
            "id, admin_id, admin_email, action, target_type, target_id, "
            "details, ip_address, created_at",
            count="exact"
        )
        
        # Apply filters
        if admin_id:
            query = query.eq("admin_id", admin_id)
        
        if action:
            query = query.eq("action", action)
        
        if target_type:
            query = query.eq("target_type", target_type)
        
        if target_id:
            query = query.eq("target_id", target_id)
        
        # Always sort by created_at desc (most recent first)
        query = query.order("created_at", desc=True)
        
        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Handle empty result
        if not result.data:
            logger.info("[Admin] get_audit_log returned empty dataset")
            return AdminAuditLogResponse(
                entries=[],
                page=page,
                per_page=per_page,
                total_count=0,
                total_pages=1,
                has_next=False,
                has_prev=page > 1,
            )
        
        # Get total count
        total_count = result.count if result.count is not None else len(result.data)
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Map to response model with safe defaults
        entries = []
        for row in result.data:
            entries.append(AdminAuditLogEntry(
                id=row.get("id") or "unknown",
                admin_id=row.get("admin_id") or "unknown",
                admin_email=row.get("admin_email") or "unknown",
                action=row.get("action") or "unknown",
                target_type=row.get("target_type") or "unknown",
                target_id=row.get("target_id"),
                details=row.get("details") or {},
                ip_address=row.get("ip_address"),
                created_at=row.get("created_at") or datetime.utcnow(),
            ))
        
        return AdminAuditLogResponse(
            entries=entries,
            page=page,
            per_page=per_page,
            total_count=total_count,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1,
        )
        
    except Exception as e:
        logger.error(f"[Admin] Failed to fetch audit log: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit log")


@router.get("/audit-log/stats", response_model=AdminAuditLogStats)
async def get_audit_log_stats(
    admin: dict = Depends(require_admin),
):
    """
    Get audit log statistics for growth monitoring.
    
    Returns:
        - Total entries
        - Entries in last 24h, 7d, 30d
        - Oldest/newest timestamps
        - Unique admin count
        - Action breakdown
    
    Use this to monitor audit log growth and plan retention policies.
    Safe when table is empty.
    """
    try:
        now = datetime.utcnow()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        # Initialize safe defaults
        total_entries = 0
        entries_last_24h = 0
        entries_last_7d = 0
        entries_last_30d = 0
        oldest_entry_at = None
        newest_entry_at = None
        unique_admins = 0
        action_breakdown = {}
        
        # Total count
        try:
            total_result = supabase.table("admin_audit_log").select(
                "id", count="exact"
            ).execute()
            total_entries = total_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to count total: {e}")
        
        # Entries in last 24h
        try:
            day_result = supabase.table("admin_audit_log").select(
                "id", count="exact"
            ).gte("created_at", day_ago.isoformat()).execute()
            entries_last_24h = day_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to count 24h: {e}")
        
        # Entries in last 7d
        try:
            week_result = supabase.table("admin_audit_log").select(
                "id", count="exact"
            ).gte("created_at", week_ago.isoformat()).execute()
            entries_last_7d = week_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to count 7d: {e}")
        
        # Entries in last 30d
        try:
            month_result = supabase.table("admin_audit_log").select(
                "id", count="exact"
            ).gte("created_at", month_ago.isoformat()).execute()
            entries_last_30d = month_result.count or 0
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to count 30d: {e}")
        
        # Oldest entry
        try:
            oldest_result = supabase.table("admin_audit_log").select(
                "created_at"
            ).order("created_at", desc=False).limit(1).execute()
            if oldest_result.data:
                oldest_entry_at = oldest_result.data[0].get("created_at")
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to get oldest: {e}")
        
        # Newest entry
        try:
            newest_result = supabase.table("admin_audit_log").select(
                "created_at"
            ).order("created_at", desc=True).limit(1).execute()
            if newest_result.data:
                newest_entry_at = newest_result.data[0].get("created_at")
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to get newest: {e}")
        
        # Unique admins
        try:
            admins_result = supabase.table("admin_audit_log").select(
                "admin_id"
            ).execute()
            if admins_result.data:
                unique_admin_ids = set(row.get("admin_id") for row in admins_result.data if row.get("admin_id"))
                unique_admins = len(unique_admin_ids)
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to count unique admins: {e}")
        
        # Action breakdown
        try:
            actions_result = supabase.table("admin_audit_log").select(
                "action"
            ).execute()
            if actions_result.data:
                for row in actions_result.data:
                    action = row.get("action") or "unknown"
                    action_breakdown[action] = action_breakdown.get(action, 0) + 1
        except Exception as e:
            logger.warning(f"[Admin:AuditStats] Failed to get action breakdown: {e}")
        
        # Log if empty
        if total_entries == 0:
            logger.info("[Admin:AuditStats] Empty audit log - returning zeroed stats")
        
        return AdminAuditLogStats(
            total_entries=total_entries,
            entries_last_24h=entries_last_24h,
            entries_last_7d=entries_last_7d,
            entries_last_30d=entries_last_30d,
            oldest_entry_at=oldest_entry_at,
            newest_entry_at=newest_entry_at,
            unique_admins=unique_admins,
            action_breakdown=action_breakdown,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Admin] Failed to fetch audit log stats: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit log stats")


# =============================================================================
# Credit Management (Item #3: Monthly Credit Reset Job)
# =============================================================================

@router.post("/credits/reset-monthly")
async def admin_reset_monthly_credits(admin: dict = Depends(require_admin)):
    """
    Manually trigger monthly credit reset for all Pro subscriptions.
    
    Normally this runs via cron job, but admins can trigger manually.
    
    Reference: Claude.md - Item #3: Monthly Credit Reset Job
    
    Returns:
        {
            "success": bool,
            "reset_count": int,
            "failed_count": int,
            "errors": List[str]
        }
    """
    try:
        from credit_reset import reset_monthly_credits
        
        logger.info(f"[Admin] Manually triggering credit reset (admin: {admin['id']})")
        
        result = await reset_monthly_credits()
        
        # Log the admin action
        await create_audit_log(
            admin=admin,
            action="credits_reset_monthly",
            target_type="system",
            target_id=None,
            details={
                "reset_count": result.get("reset_count"),
                "failed_count": result.get("failed_count"),
                "errors": result.get("errors")
            }
        )
        
        return result
    
    except Exception as e:
        logger.error(f"[Admin] Failed to reset credits: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset credits")


@router.get("/credits/verify-integrity")
async def admin_verify_credit_integrity(admin: dict = Depends(require_admin)):
    """
    Verify credit system integrity and auto-fix violations.
    
    Checks:
    - No user has credits > monthly_credit_allowance
    - No user has negative credits
    
    Auto-fixes violations by capping/resetting credits.
    
    Reference: Claude.md - Item #2: Credit Overflow Protection
    
    Returns:
        {
            "integrity_ok": bool,
            "violations": List[str],
            "fixed_count": int
        }
    """
    try:
        from credit_reset import verify_credit_integrity
        
        logger.info(f"[Admin] Running credit integrity check (admin: {admin['id']})")
        
        result = await verify_credit_integrity()
        
        # Log the admin action
        await create_audit_log(
            admin=admin,
            action="credits_verify_integrity",
            target_type="system",
            target_id=None,
            details={
                "integrity_ok": result.get("integrity_ok"),
                "violation_count": len(result.get("violations", [])),
                "fixed_count": result.get("fixed_count")
            }
        )
        
        return result
    
    except Exception as e:
        logger.error(f"[Admin] Failed to verify credit integrity: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify credit integrity")

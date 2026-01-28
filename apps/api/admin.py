"""
Admin Dashboard API Router.

SECURITY:
- ALL routes use require_admin() dependency
- Admin check is server-side via admin_emails table
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
    
    Returns:
        The created audit log entry ID
    """
    ip_address = None
    if request:
        # Get IP from X-Forwarded-For or direct connection
        ip_address = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not ip_address:
            ip_address = request.client.host if request.client else None
    
    try:
        result = supabase.table("admin_audit_log").insert({
            "admin_id": admin["id"],
            "admin_email": admin["email"],
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details,
            "ip_address": ip_address,
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
        # Build query
        query = supabase.table("user_profiles").select(
            "user_id, email, full_name, role, credits_remaining, credits_reset_at, "
            "created_at, is_disabled, disabled_at",
            count="exact"
        )
        
        # Apply filters
        if search:
            # Search by email (case-insensitive)
            query = query.ilike("email", f"%{search}%")
        
        if role:
            query = query.eq("role", role)
        
        if is_disabled is not None:
            query = query.eq("is_disabled", is_disabled)
        
        # Apply sorting
        # NOTE: Validate sort_by to prevent injection
        allowed_sort_fields = ["created_at", "email", "credits_remaining", "role"]
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"
        
        query = query.order(sort_by, desc=(sort_order == "desc"))
        
        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Get total count
        total_count = result.count if result.count is not None else 0
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Map to response model
        users = []
        for row in result.data:
            users.append(AdminUserSummary(
                id=row["user_id"],
                email=row["email"],
                full_name=row.get("full_name"),
                role=row.get("role", "free_user"),
                credits_remaining=row.get("credits_remaining", 0),
                credits_reset_at=row.get("credits_reset_at"),
                created_at=row["created_at"],
                is_disabled=row.get("is_disabled", False),
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
        
    except Exception as e:
        logger.error(f"[Admin] Failed to list users: {e}")
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
        # Get user profile
        user_result = supabase.table("user_profiles").select(
            "user_id, email, full_name, role, credits_remaining, credits_reset_at, "
            "created_at, is_disabled, disabled_at, disabled_by, disabled_reason"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = user_result.data
        
        # Get session count
        sessions_result = supabase.table("sessions").select(
            "id", count="exact"
        ).eq("user_id", user_id).execute()
        session_count = sessions_result.count if sessions_result.count else 0
        
        # Get draft count
        drafts_result = supabase.table("drafts").select(
            "id", count="exact"
        ).eq("user_id", user_id).execute()
        draft_count = drafts_result.count if drafts_result.count else 0
        
        # Get last active (most recent session or draft)
        last_session = supabase.table("sessions").select(
            "created_at"
        ).eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        
        last_draft = supabase.table("drafts").select(
            "updated_at"
        ).eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
        
        last_active_at = None
        if last_session.data:
            last_active_at = last_session.data[0]["created_at"]
        if last_draft.data:
            draft_time = last_draft.data[0]["updated_at"]
            if not last_active_at or draft_time > last_active_at:
                last_active_at = draft_time
        
        # NOTE: total_transcription_minutes would require aggregating session data
        # For V1, we skip this to avoid expensive queries
        total_transcription_minutes = 0.0
        
        return AdminUserDetail(
            id=user["user_id"],
            email=user["email"],
            full_name=user.get("full_name"),
            role=user.get("role", "free_user"),
            credits_remaining=user.get("credits_remaining", 0),
            credits_reset_at=user.get("credits_reset_at"),
            created_at=user["created_at"],
            is_disabled=user.get("is_disabled", False),
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
        logger.error(f"[Admin] Failed to get user {user_id}: {e}")
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
        # Get current credits
        user_result = supabase.table("user_profiles").select(
            "credits_remaining, email"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        old_credits = user_result.data.get("credits_remaining", 0)
        new_credits = request_body.new_credits
        
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
                "target_email": user_result.data.get("email"),
            },
            request=request,
        )
        
        logger.info(
            "[Admin] Credits adjusted: user=%s old=%d new=%d by=%s reason=%s",
            user_id, old_credits, new_credits, admin["email"], request_body.reason
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
        logger.error(f"[Admin] Failed to adjust credits for {user_id}: {e}")
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
        # Check if user exists and isn't already disabled
        user_result = supabase.table("user_profiles").select(
            "is_disabled, email"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        if user_result.data.get("is_disabled"):
            raise HTTPException(status_code=400, detail="User is already disabled")
        
        # Prevent self-disable
        if user_id == admin["id"]:
            raise HTTPException(status_code=400, detail="Cannot disable your own account")
        
        # Update user
        supabase.table("user_profiles").update({
            "is_disabled": True,
            "disabled_at": datetime.utcnow().isoformat(),
            "disabled_by": admin["id"],
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
                "target_email": user_result.data.get("email"),
            },
            request=request,
        )
        
        logger.info(
            "[Admin] User disabled: user=%s by=%s reason=%s",
            user_id, admin["email"], request_body.reason
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
        logger.error(f"[Admin] Failed to disable user {user_id}: {e}")
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
        # Check if user exists and is disabled
        user_result = supabase.table("user_profiles").select(
            "is_disabled, email, disabled_reason"
        ).eq("user_id", user_id).single().execute()
        
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not user_result.data.get("is_disabled"):
            raise HTTPException(status_code=400, detail="User is not disabled")
        
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
                "target_email": user_result.data.get("email"),
                "previous_disable_reason": user_result.data.get("disabled_reason"),
            },
            request=request,
        )
        
        logger.info(
            "[Admin] User enabled: user=%s by=%s",
            user_id, admin["email"]
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
        logger.error(f"[Admin] Failed to enable user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to enable user")


# =============================================================================
# Sessions Endpoint
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
    """
    try:
        # Build query - explicitly exclude content fields
        # NOTE: We select specific fields to ensure we never accidentally expose content
        query = supabase.table("sessions").select(
            "id, user_id, title, session_type, style, duration_seconds, "
            "word_count, created_at, updated_at",
            count="exact"
        )
        
        # Apply filters
        if user_id:
            query = query.eq("user_id", user_id)
        
        if session_type:
            query = query.eq("session_type", session_type)
        
        # Apply sorting
        allowed_sort_fields = ["created_at", "updated_at", "duration_seconds", "word_count"]
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"
        
        query = query.order(sort_by, desc=(sort_order == "desc"))
        
        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Get total count
        total_count = result.count if result.count is not None else 0
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Get user emails for denormalization
        user_ids = list(set(row["user_id"] for row in result.data))
        user_emails = {}
        if user_ids:
            users_result = supabase.table("user_profiles").select(
                "user_id, email"
            ).in_("user_id", user_ids).execute()
            user_emails = {u["user_id"]: u["email"] for u in users_result.data}
        
        # Map to response model
        sessions = []
        for row in result.data:
            sessions.append(AdminSessionSummary(
                id=row["id"],
                user_id=row["user_id"],
                user_email=user_emails.get(row["user_id"], "unknown"),
                title=row.get("title"),
                session_type=row.get("session_type"),
                style=row.get("style"),
                duration_seconds=row.get("duration_seconds"),
                word_count=row.get("word_count"),
                created_at=row["created_at"],
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
        
    except Exception as e:
        logger.error(f"[Admin] Failed to list sessions: {e}")
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
        query = supabase.table("drafts").select(
            "id, user_id, title, question, word_count, created_at, updated_at",
            count="exact"
        )
        
        # Apply filters
        if user_id:
            query = query.eq("user_id", user_id)
        
        # Apply sorting
        allowed_sort_fields = ["created_at", "updated_at", "word_count"]
        if sort_by not in allowed_sort_fields:
            sort_by = "created_at"
        
        query = query.order(sort_by, desc=(sort_order == "desc"))
        
        # Apply pagination
        offset = (page - 1) * per_page
        query = query.range(offset, offset + per_page - 1)
        
        result = query.execute()
        
        # Get total count
        total_count = result.count if result.count is not None else 0
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Get user emails for denormalization
        user_ids = list(set(row["user_id"] for row in result.data))
        user_emails = {}
        if user_ids:
            users_result = supabase.table("user_profiles").select(
                "user_id, email"
            ).in_("user_id", user_ids).execute()
            user_emails = {u["user_id"]: u["email"] for u in users_result.data}
        
        # Map to response model
        drafts = []
        for row in result.data:
            drafts.append(AdminDraftSummary(
                id=row["id"],
                user_id=row["user_id"],
                user_email=user_emails.get(row["user_id"], "unknown"),
                title=row.get("title"),
                question=row.get("question"),
                word_count=row.get("word_count"),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
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
        
    except Exception as e:
        logger.error(f"[Admin] Failed to list drafts: {e}")
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
    
    NOTE: These are real-time queries. If performance becomes an issue,
    consider materialized views or caching.
    """
    try:
        now = datetime.utcnow()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # User metrics
        total_users_result = supabase.table("user_profiles").select(
            "user_id", count="exact"
        ).execute()
        total_users = total_users_result.count or 0
        
        disabled_users_result = supabase.table("user_profiles").select(
            "user_id", count="exact"
        ).eq("is_disabled", True).execute()
        disabled_users = disabled_users_result.count or 0
        
        # Active users (had a session in timeframe)
        # NOTE: This could be expensive on large datasets
        active_24h_result = supabase.table("sessions").select(
            "user_id"
        ).gte("created_at", day_ago.isoformat()).execute()
        active_users_24h = len(set(s["user_id"] for s in active_24h_result.data))
        
        active_7d_result = supabase.table("sessions").select(
            "user_id"
        ).gte("created_at", week_ago.isoformat()).execute()
        active_users_7d = len(set(s["user_id"] for s in active_7d_result.data))
        
        # Session metrics
        total_sessions_result = supabase.table("sessions").select(
            "id", count="exact"
        ).execute()
        total_sessions = total_sessions_result.count or 0
        
        sessions_today_result = supabase.table("sessions").select(
            "id", count="exact"
        ).gte("created_at", today_start.isoformat()).execute()
        sessions_today = sessions_today_result.count or 0
        
        sessions_7d_result = supabase.table("sessions").select(
            "id", count="exact"
        ).gte("created_at", week_ago.isoformat()).execute()
        sessions_7d = sessions_7d_result.count or 0
        
        # Draft metrics
        total_drafts_result = supabase.table("drafts").select(
            "id", count="exact"
        ).execute()
        total_drafts = total_drafts_result.count or 0
        
        # Average session duration
        # NOTE: Simplified - a proper implementation would use SQL AVG()
        avg_duration = None
        
        return AdminAnalytics(
            total_users=total_users,
            active_users_24h=active_users_24h,
            active_users_7d=active_users_7d,
            disabled_users=disabled_users,
            total_sessions=total_sessions,
            total_drafts=total_drafts,
            sessions_today=sessions_today,
            sessions_7d=sessions_7d,
            avg_session_duration_seconds=avg_duration,
            total_transcription_minutes=None,  # TODO: Implement if needed
            total_credits_consumed_today=0,  # TODO: Track in separate table
            total_credits_consumed_7d=0,
            generated_at=now,
        )
        
    except Exception as e:
        logger.error(f"[Admin] Failed to generate analytics: {e}")
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
        
        # Get total count
        total_count = result.count if result.count is not None else 0
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        # Map to response model
        entries = []
        for row in result.data:
            entries.append(AdminAuditLogEntry(
                id=row["id"],
                admin_id=row["admin_id"],
                admin_email=row["admin_email"],
                action=row["action"],
                target_type=row["target_type"],
                target_id=row.get("target_id"),
                details=row.get("details", {}),
                ip_address=row.get("ip_address"),
                created_at=row["created_at"],
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
    """
    try:
        now = datetime.utcnow()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        # Total count
        total_result = supabase.table("admin_audit_log").select(
            "id", count="exact"
        ).execute()
        total_entries = total_result.count or 0
        
        # Entries in last 24h
        day_result = supabase.table("admin_audit_log").select(
            "id", count="exact"
        ).gte("created_at", day_ago.isoformat()).execute()
        entries_last_24h = day_result.count or 0
        
        # Entries in last 7d
        week_result = supabase.table("admin_audit_log").select(
            "id", count="exact"
        ).gte("created_at", week_ago.isoformat()).execute()
        entries_last_7d = week_result.count or 0
        
        # Entries in last 30d
        month_result = supabase.table("admin_audit_log").select(
            "id", count="exact"
        ).gte("created_at", month_ago.isoformat()).execute()
        entries_last_30d = month_result.count or 0
        
        # Oldest entry
        oldest_result = supabase.table("admin_audit_log").select(
            "created_at"
        ).order("created_at", desc=False).limit(1).execute()
        oldest_entry_at = oldest_result.data[0]["created_at"] if oldest_result.data else None
        
        # Newest entry
        newest_result = supabase.table("admin_audit_log").select(
            "created_at"
        ).order("created_at", desc=True).limit(1).execute()
        newest_entry_at = newest_result.data[0]["created_at"] if newest_result.data else None
        
        # Unique admins
        # Note: Supabase doesn't support distinct count easily, so we fetch unique admin_ids
        admins_result = supabase.table("admin_audit_log").select(
            "admin_id"
        ).execute()
        unique_admin_ids = set(row["admin_id"] for row in admins_result.data if row.get("admin_id"))
        unique_admins = len(unique_admin_ids)
        
        # Action breakdown
        actions_result = supabase.table("admin_audit_log").select(
            "action"
        ).execute()
        action_breakdown = {}
        for row in actions_result.data:
            action = row.get("action", "unknown")
            action_breakdown[action] = action_breakdown.get(action, 0) + 1
        
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
        
    except Exception as e:
        logger.error(f"[Admin] Failed to fetch audit log stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit log stats")

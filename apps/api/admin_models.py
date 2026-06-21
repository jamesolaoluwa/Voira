"""
Admin-only Pydantic models for the Admin Dashboard.

SECURITY PRINCIPLE: Explicit allow-lists only.
Every field exposed to admins is intentionally listed here.
No reuse of user-facing models to prevent accidental data exposure.

NEVER INCLUDE IN ADMIN RESPONSES:
- transcript_text, refined_text (privacy)
- audio_url, audio_blob (privacy)
- password hashes (security)
- auth tokens (security)
- raw LLM responses (cost/privacy)
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# =============================================================================
# Pagination
# =============================================================================


class PaginationParams(BaseModel):
    """Common pagination parameters."""

    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    per_page: int = Field(
        default=50, ge=1, le=100, description="Items per page (max 100)"
    )


class PaginatedResponse(BaseModel):
    """Base class for paginated responses."""

    page: int
    per_page: int
    total_count: int
    total_pages: int
    has_next: bool
    has_prev: bool


# =============================================================================
# User Models (Admin View)
# =============================================================================


class AdminUserSummary(BaseModel):
    """
    User data exposed to admins in list view.

    ALLOW-LIST: Only these fields are returned.
    """

    id: str
    email: str
    full_name: Optional[str] = None
    role: str
    credits_remaining: int
    credits_reset_at: Optional[datetime] = None
    created_at: datetime
    is_disabled: bool = False
    disabled_at: Optional[datetime] = None

    # Computed/aggregated fields (optional, for list view)
    session_count: Optional[int] = None
    last_active_at: Optional[datetime] = None


class AdminUserDetail(BaseModel):
    """
    Extended user detail for single-user view.

    ALLOW-LIST: Only these fields are returned.
    """

    id: str
    email: str
    full_name: Optional[str] = None
    role: str
    credits_remaining: int
    credits_reset_at: Optional[datetime] = None
    created_at: datetime
    is_disabled: bool = False
    disabled_at: Optional[datetime] = None
    disabled_by: Optional[str] = None
    disabled_reason: Optional[str] = None

    # Aggregated stats
    session_count: int = 0
    draft_count: int = 0
    last_active_at: Optional[datetime] = None
    total_transcription_minutes: float = 0.0


class AdminUserListResponse(PaginatedResponse):
    """Paginated list of users for admin view."""

    users: List[AdminUserSummary]


# =============================================================================
# Session Models (Admin View - METADATA ONLY)
# =============================================================================


class AdminSessionSummary(BaseModel):
    """
    Session metadata for admin view.

    EXPLICITLY EXCLUDED:
    - transcript_text
    - refined_text
    - audio_url
    - analysis_result
    """

    id: str
    user_id: str
    user_email: str  # Denormalized for display
    title: Optional[str] = None
    session_type: Optional[str] = None
    style: Optional[str] = None
    duration_seconds: Optional[int] = None
    word_count: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class AdminSessionListResponse(PaginatedResponse):
    """Paginated list of sessions for admin view."""

    sessions: List[AdminSessionSummary]


# =============================================================================
# Draft Models (Admin View - METADATA ONLY)
# =============================================================================


class AdminDraftSummary(BaseModel):
    """
    Draft metadata for admin view.

    EXPLICITLY EXCLUDED:
    - transcript_text
    - audio_url
    """

    id: str
    user_id: str
    user_email: str  # Denormalized for display
    title: Optional[str] = None
    question: Optional[str] = None  # Question text is OK (not user content)
    word_count: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class AdminDraftListResponse(PaginatedResponse):
    """Paginated list of drafts for admin view."""

    drafts: List[AdminDraftSummary]


# =============================================================================
# Analytics Models
# =============================================================================


class AdminAnalytics(BaseModel):
    """
    Aggregate analytics for admin dashboard.

    All values are aggregates - no PII or individual user data.
    """

    # User metrics
    total_users: int
    active_users_24h: int
    active_users_7d: int
    disabled_users: int

    # Content metrics
    total_sessions: int
    total_drafts: int
    sessions_today: int
    sessions_7d: int

    # Usage metrics
    avg_session_duration_seconds: Optional[float] = None
    total_transcription_minutes: Optional[float] = None

    # Credit metrics
    total_credits_consumed_today: int = 0
    total_credits_consumed_7d: int = 0

    # Timestamp
    generated_at: datetime


# =============================================================================
# Audit Log Models
# =============================================================================


class AdminAuditLogEntry(BaseModel):
    """Single audit log entry."""

    id: str
    admin_id: str
    admin_email: str
    action: str
    target_type: str
    target_id: Optional[str] = None
    details: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    created_at: datetime


class AdminAuditLogResponse(PaginatedResponse):
    """Paginated audit log."""

    entries: List[AdminAuditLogEntry]


# =============================================================================
# Admin Action Request/Response Models
# =============================================================================


class CreditAdjustmentRequest(BaseModel):
    """Request to adjust a user's credits."""

    new_credits: int = Field(..., ge=0, le=10000, description="New credit balance")
    reason: str = Field(
        ...,
        min_length=10,
        max_length=500,
        description="Reason for adjustment (required)",
    )


class UserDisableRequest(BaseModel):
    """Request to disable a user account."""

    reason: str = Field(
        ...,
        min_length=10,
        max_length=500,
        description="Reason for disabling (required)",
    )


class AdminActionResponse(BaseModel):
    """Response for admin write operations."""

    success: bool
    message: str
    audit_log_id: Optional[str] = None

    # Include updated state where relevant
    updated_credits: Optional[int] = None
    updated_is_disabled: Optional[bool] = None


# =============================================================================
# Filter/Search Parameters
# =============================================================================


class AdminUserFilters(BaseModel):
    """Filters for user list."""

    search: Optional[str] = Field(None, description="Search by email or name")
    role: Optional[str] = Field(None, description="Filter by role")
    is_disabled: Optional[bool] = Field(None, description="Filter by disabled status")
    sort_by: str = Field("created_at", description="Sort field")
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="Sort order")


class AdminSessionFilters(BaseModel):
    """Filters for session list."""

    user_id: Optional[str] = Field(None, description="Filter by user ID")
    session_type: Optional[str] = Field(None, description="Filter by type")
    sort_by: str = Field("created_at", description="Sort field")
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="Sort order")


class AdminDraftFilters(BaseModel):
    """Filters for draft list."""

    user_id: Optional[str] = Field(None, description="Filter by user ID")
    sort_by: str = Field("created_at", description="Sort field")
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="Sort order")


class AdminAuditLogFilters(BaseModel):
    """Filters for audit log."""

    admin_id: Optional[str] = Field(None, description="Filter by admin ID")
    action: Optional[str] = Field(None, description="Filter by action type")
    target_type: Optional[str] = Field(None, description="Filter by target type")
    target_id: Optional[str] = Field(None, description="Filter by target ID")
    sort_order: str = Field(
        "desc", pattern="^(asc|desc)$", description="Sort order (always by created_at)"
    )


class AdminAuditLogStats(BaseModel):
    """Statistics for audit log growth monitoring."""

    total_entries: int = Field(..., description="Total audit log entries")
    entries_last_24h: int = Field(..., description="Entries created in last 24 hours")
    entries_last_7d: int = Field(..., description="Entries created in last 7 days")
    entries_last_30d: int = Field(..., description="Entries created in last 30 days")
    oldest_entry_at: Optional[datetime] = Field(
        None, description="Timestamp of oldest entry"
    )
    newest_entry_at: Optional[datetime] = Field(
        None, description="Timestamp of newest entry"
    )
    unique_admins: int = Field(
        ..., description="Number of unique admins who have taken actions"
    )
    action_breakdown: dict = Field(
        default_factory=dict, description="Count of entries by action type"
    )

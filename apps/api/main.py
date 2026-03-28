"""
FastAPI Backend for Voira
Handles authentication, sessions, admin checks, and transcription.
"""

import json
import asyncio
import re
import os
import uuid
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from typing import List, Optional
from auth import get_current_user, get_active_user, check_is_admin, security, get_user_from_websocket_token, get_active_user_from_websocket_token
from models import (
    SessionCreate, SessionResponse, UserResponse, AdminCheckResponse,
    TranscribeResponse, RefineRequest, RefineResponse, AnalyzeRequest, AnalyzeResponse,
    FileUploadResponse, AudioUploadResponse,
    InterviewRefinementRequest, InterviewRefinementResponse, FeedbackItem,
    DraftCreate, DraftUpdate, DraftResponse
)
from storage import storage_service, StorageService
from credits import check_credits_available, decrement_credits, check_and_reset_credits
from rate_limit import (
    rate_limit_middleware, 
    rate_limit_check, 
    close_redis,
    initialize_rate_limiter,
    get_rate_limiter_status,
)
from db import supabase, log_slow_query
from config import settings
from transcription import (
    transcribe_audio,
    UnsupportedFileTypeError,
    FileTooLargeError,
    TranscriptionProviderError
)
from providers.deepgram_streaming import DeepgramStreamingProvider
from providers.deepgram_webm import DeepgramWebmProvider
from datetime import datetime
from llm_refinement import refine_transcript, analyze_and_refine, refine_interview_response
import time

# Initialize logging FIRST (before any other imports that might log)
from logging_config import setup_logging, get_logger, set_request_id, get_request_id
setup_logging()
logger = get_logger(__name__)

# Initialize Sentry error tracking
from sentry_config import init_sentry, capture_exception, set_user_context, clear_user_context
init_sentry()

# Import health check module
from health import get_all_health_checks, is_ready, get_overall_status

# Import admin router
from admin import router as admin_router

# Import Stripe billing router
from stripe_billing import router as billing_router, webhook_router as stripe_webhook_router

app = FastAPI(
    title="Voira API",
    description="Backend API for Voira voice coaching platform",
    version="1.0.0",
)


# =============================================================================
# Security Middleware
# =============================================================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next):
        # Generate request ID for tracing
        request_id = set_request_id()
        
        # Check request size limit
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.max_request_size:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"},
                headers={"X-Request-ID": request_id},
            )
        
        try:
            response = await call_next(request)
        except Exception as e:
            # Capture unhandled exceptions
            capture_exception(e, extra={
                "request_id": request_id,
                "path": request.url.path,
                "method": request.method,
            })
            raise
        
        # Add security headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Add HSTS header in production
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply rate limiting to all requests."""
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path.startswith("/health"):
            return await call_next(request)
        
        # Get identifier (user ID from auth header, or IP address)
        identifier = request.client.host if request.client else "unknown"
        
        # Check rate limit
        allowed, rate_headers = await rate_limit_check(
            identifier=identifier,
            path=request.url.path,
        )
        
        if not allowed:
            # Must include CORS headers in 429 responses for browser compatibility
            origin = request.headers.get("origin", "")
            cors_headers = {}
            if origin in settings.cors_origins_list:
                cors_headers = {
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                }
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."},
                headers={**rate_headers, **cors_headers},
            )
        
        response = await call_next(request)
        
        # Add rate limit headers to response
        for key, value in rate_headers.items():
            response.headers[key] = value
        
        return response


# =============================================================================
# Startup and Shutdown Events
# =============================================================================

@app.on_event("startup")
async def startup_validation():
    """
    Validate required environment variables on application startup.
    This ensures the app fails fast with clear errors if configuration is missing.
    NEVER log or print secret values (keys, tokens, etc.)
    """
    logger.info(f"Application starting in {settings.env} environment")
    
    # Check required configuration
    missing_vars = []
    warnings = []
    
    # Required: Supabase
    if not settings.supabase_url:
        missing_vars.append("SUPABASE_URL")
    if not settings.supabase_service_role_key:
        missing_vars.append("SUPABASE_SERVICE_ROLE_KEY")
    
    # Warn about optional but important config
    if not settings.openai_api_key:
        warnings.append("OPENAI_API_KEY not set - LLM refinement will not work")
    elif not settings.openai_api_key.startswith('sk-'):
        warnings.append("OPENAI_API_KEY may be invalid (should start with 'sk-')")
    
    if not settings.deepgram_api_key:
        warnings.append("DEEPGRAM_API_KEY not set - transcription will not work")
    
    if settings.is_production:
        if not settings.sentry_dsn:
            warnings.append("SENTRY_DSN not set - error tracking disabled in production")
        # Note: Redis validation is now handled by initialize_rate_limiter()
        
        # CORS validation for production
        cors_origins = settings.cors_origins_list
        if not cors_origins:
            missing_vars.append("CORS_ORIGINS (required in production)")
        elif all(("localhost" in o or "127.0.0.1" in o) for o in cors_origins):
            warnings.append(
                "CORS_ORIGINS contains only localhost origins - "
                "set to 'https://heyvoira.com' for production"
            )
    
    # Log CORS configuration (safe to log origins)
    logger.info(f"CORS allowed origins: {settings.cors_origins_list}")
    
    # Log warnings
    for warning in warnings:
        logger.warning(warning)
    
    # Fail on missing required vars
    if missing_vars:
        error_msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    # Validate Supabase URL format
    if settings.supabase_url and not settings.supabase_url.startswith(("http://", "https://")):
        logger.warning("SUPABASE_URL should start with http:// or https://")
    
    # Initialize rate limiter (fails fast in production if Redis unavailable)
    await initialize_rate_limiter()
    
    logger.info("Startup validation complete")


@app.on_event("shutdown")
async def shutdown():
    """Clean up resources on shutdown."""
    logger.info("Application shutting down...")
    await close_redis()
    # Close cache connections
    try:
        from cache import close_cache
        await close_cache()
    except ImportError:
        pass
    logger.info("Shutdown complete")

# =============================================================================
# Middleware (order matters - first added = outermost)
# =============================================================================

# Import additional middleware
from middleware import TimeoutMiddleware, PerformanceLoggingMiddleware, ErrorHandlingMiddleware

# =============================================================================
# CORS Configuration
# =============================================================================
# Production: Set CORS_ORIGINS=https://heyvoira.com in Render env vars
# Development: Defaults to localhost:5173 (Vite dev server)
#
# IMPORTANT:
# - allow_credentials=True requires explicit origins (no wildcards)
# - This is required for Supabase auth cookies to work
# - CORS middleware must be registered BEFORE routers
# =============================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # Explicit origins only, no wildcards
    allow_credentials=True,                     # Required for Supabase auth
    allow_methods=["*"],                        # Allow all HTTP methods
    allow_headers=["*"],                        # Allow all headers
    expose_headers=[
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
        "X-Response-Time",
    ],
)

# Error handling middleware (outermost - catches all errors)
app.add_middleware(ErrorHandlingMiddleware)

# Performance logging middleware
app.add_middleware(PerformanceLoggingMiddleware)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# Timeout middleware (innermost - wraps actual request handling)
app.add_middleware(TimeoutMiddleware)

# =============================================================================
# Include Admin Router
# =============================================================================
# NOTE: Admin routes are isolated under /admin prefix
# All admin routes use require_admin() dependency for security
app.include_router(admin_router)

# =============================================================================
# Include Billing Router
# =============================================================================
# NOTE: Billing routes are isolated under /billing prefix
# Webhook endpoint has no auth (verified via Stripe signature)
app.include_router(billing_router)

# Also mount webhook at /webhooks/stripe (matches Stripe dashboard config)
app.include_router(stripe_webhook_router)


# =============================================================================
# Health Check Endpoints
# =============================================================================

@app.get("/health")
async def health():
    """
    Basic liveness check.
    Returns 200 if the application is running.
    Use this for container liveness probes.
    """
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """
    Readiness check with dependency verification.
    Returns 200 if the application is ready to serve traffic.
    Returns 503 if critical dependencies are unavailable.
    Use this for container readiness probes.
    """
    checks = await get_all_health_checks()
    ready = is_ready(checks)
    status = get_overall_status(checks)
    
    response = {
        "status": status,
        "ready": ready,
        "checks": checks,
        "environment": settings.env,
    }
    
    if not ready:
        raise HTTPException(status_code=503, detail=response)
    
    return response


@app.get("/health/dependencies")
async def health_dependencies():
    """
    Detailed dependency health status.
    Returns status of all external dependencies.
    Useful for debugging and monitoring dashboards.
    """
    checks = await get_all_health_checks()
    return {
        "status": get_overall_status(checks),
        "dependencies": checks,
        "environment": settings.env,
        "version": "1.0.0",
    }


# =============================================================================
# API Version Endpoint
# =============================================================================

from api_versioning import get_version_info

@app.get("/api/versions")
async def api_versions():
    """
    Get information about supported API versions.
    
    Returns current version, supported versions, and deprecation status.
    """
    return get_version_info()


@app.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """Get current authenticated user info."""
    return UserResponse(
        id=user["id"],
        email=user["email"],
        full_name=user.get("full_name"),
        role=user.get("role", "free_user"),
        credits_remaining=user.get("credits_remaining", 10),
        monthly_credit_allowance=user.get("monthly_credit_allowance", 10),
        credits_reset_at=user.get("credits_reset_at"),
    )


@app.get("/admin/is-admin", response_model=AdminCheckResponse)
async def check_admin(
    user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Check if current user is admin.
    Returns { isAdmin: boolean } ONLY.
    Never returns admin emails or other sensitive data.
    """
    # Rate limit by user ID
    rate_limit_middleware(f"admin_check:{user['id']}")
    
    is_admin = await check_is_admin(user)
    return AdminCheckResponse(isAdmin=is_admin)


@app.post("/sessions", response_model=SessionResponse)
async def create_session(
    session_data: SessionCreate,
    user: dict = Depends(get_active_user)  # Disabled users blocked
):
    """
    Create a new session (recording).
    Enforces credits server-side.
    Admins bypass credit checks.
    Disabled users receive 403.
    """
    # Rate limit by user ID
    rate_limit_middleware(f"create_session:{user['id']}")
    
    # Check if user is admin
    is_admin = await check_is_admin(user)
    
    # Check and enforce credits (unless admin)
    has_credits, profile = await check_credits_available(user["id"], required=1, is_admin=is_admin)
    if not has_credits:
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits. Please upgrade or wait for monthly reset."
        )
    
    # Create session
    insert_data = {
        "user_id": user["id"],
        "title": session_data.title,
        "type": session_data.type,
        "question": session_data.question,
        "goal": session_data.goal,
        "reference_text": session_data.reference_text,
        "audio_url": session_data.audio_url,
        "audio_mime": session_data.audio_mime,
        "audio_size_bytes": session_data.audio_size_bytes,
        "duration_seconds": session_data.duration_seconds,
        "transcript": session_data.transcript,
        "refined_draft": session_data.refined_draft,
        "clarity_score": session_data.clarity_score,
        "confidence_score": session_data.confidence_score,
        "filler_count": session_data.filler_count,
        "words_per_minute": session_data.words_per_minute,
        "highlights": session_data.highlights,
    }
    
    query_start = time.time()
    response = supabase.table("recordings").insert(insert_data).execute()
    duration_ms = (time.time() - query_start) * 1000
    log_slow_query("recordings", "INSERT", duration_ms, f"new session for user {user['id']}")
    
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create session")
    
    created = response.data[0]
    
    # Decrement credits (unless admin)
    if not is_admin:
        await decrement_credits(user["id"], amount=1, reason="recording_saved", is_admin=False)
    
    return SessionResponse(
        id=created["id"],
        user_id=created["user_id"],
        title=created["title"],
        type=created["type"],
        question=created.get("question"),
        goal=created.get("goal"),
        reference_text=created.get("reference_text"),
        audio_url=created.get("audio_url"),
        audio_mime=created.get("audio_mime"),
        audio_size_bytes=created.get("audio_size_bytes", 0),
        duration_seconds=created.get("duration_seconds", 0),
        transcript=created.get("transcript", ""),
        refined_draft=created.get("refined_draft", ""),
        clarity_score=created.get("clarity_score", 0),
        confidence_score=created.get("confidence_score", 0),
        filler_count=created.get("filler_count", 0),
        words_per_minute=created.get("words_per_minute", 0),
        highlights=created.get("highlights", []),
        created_at=datetime.fromisoformat(created["created_at"].replace("Z", "+00:00")),
        updated_at=datetime.fromisoformat(created["updated_at"].replace("Z", "+00:00")),
    )


@app.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(user: dict = Depends(get_current_user)):
    """
    List all sessions for the current user.
    Ownership enforced by RLS, but we also filter server-side for extra security.
    """
    # Rate limit by user ID
    rate_limit_middleware(f"list_sessions:{user['id']}")
    
    # Query recordings (RLS ensures user only sees their own)
    # Note: Supabase Python client v2 uses desc as keyword argument
    response = supabase.table("recordings").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute()
    
    sessions = []
    for rec in response.data:
        # Parse datetime strings - handle both Z and +00:00 timezone formats
        # Python 3.9 fromisoformat() doesn't handle microseconds with timezone offsets
        def parse_datetime(dt_str):
            if not dt_str:
                return datetime.now()
            # Normalize Z to +00:00
            dt_str = dt_str.replace("Z", "+00:00")
            # Try parsing as-is first
            try:
                return datetime.fromisoformat(dt_str)
            except ValueError:
                # If it fails, strip microseconds (format: 2026-01-11T03:51:05.87728+00:00 -> 2026-01-11T03:51:05+00:00)
                dt_str_no_micro = re.sub(r'\.\d+(?=[+-])', '', dt_str)
                return datetime.fromisoformat(dt_str_no_micro)
        
        sessions.append(SessionResponse(
            id=rec["id"],
            user_id=rec["user_id"],
            title=rec["title"],
            type=rec["type"],
            question=rec.get("question"),
            goal=rec.get("goal"),
            reference_text=rec.get("reference_text"),
            audio_url=rec.get("audio_url"),
            audio_mime=rec.get("audio_mime"),
            audio_size_bytes=rec.get("audio_size_bytes", 0),
            duration_seconds=rec.get("duration_seconds", 0),
            transcript=rec.get("transcript", ""),
            refined_draft=rec.get("refined_draft", ""),
            clarity_score=rec.get("clarity_score", 0),
            confidence_score=rec.get("confidence_score", 0),
            filler_count=rec.get("filler_count", 0),
            words_per_minute=rec.get("words_per_minute", 0),
            highlights=rec.get("highlights", []),
            created_at=parse_datetime(rec["created_at"]),
            updated_at=parse_datetime(rec["updated_at"]),
        ))
    
    return sessions


@app.delete("/sessions")
async def delete_all_sessions(user: dict = Depends(get_current_user)):
    """
    Delete all sessions for the current user.
    Ownership enforced by RLS, but we also filter server-side for extra security.
    """
    # Rate limit by user ID
    rate_limit_middleware(f"delete_all_sessions:{user['id']}")
    
    # Delete all recordings for the user (RLS ensures user can only delete their own)
    query_start = time.time()
    response = supabase.table("recordings").delete().eq("user_id", user["id"]).execute()
    duration_ms = (time.time() - query_start) * 1000
    log_slow_query("recordings", "DELETE", duration_ms, f"all sessions for user {user['id']}")
    
    deleted_count = len(response.data) if response.data else 0
    
    logger.info(f"Deleted {deleted_count} sessions for user {user['id']}")
    
    return {"deleted_count": deleted_count, "message": f"Deleted {deleted_count} session(s)"}


# =============================================================================
# DRAFT ENDPOINTS (Partial Save / Draft Naming)
# =============================================================================

def _generate_draft_name(question: Optional[str], max_words: int = 8) -> str:
    """
    Generate a default draft name from the first ~8 words of the question.
    Falls back to "Untitled Draft" if no question provided.
    """
    if not question or not question.strip():
        return "Untitled Draft"
    
    words = question.strip().split()[:max_words]
    name = " ".join(words)
    
    # Add ellipsis if truncated
    if len(question.strip().split()) > max_words:
        name += "..."
    
    return name or "Untitled Draft"


@app.post("/drafts", response_model=DraftResponse)
async def create_draft(
    draft_data: DraftCreate,
    user: dict = Depends(get_active_user)
):
    """
    Create a new draft (partial save).
    
    Drafts are intentionally saved unfinished work:
    - No LLM calls triggered
    - No credits consumed
    - No audio persistence
    - Separate from completed sessions
    
    If name is not provided, auto-generated from first ~8 words of question.
    
    **Note:** Disabled users are blocked from this endpoint (403 Forbidden).
    """
    rate_limit_middleware(f"create_draft:{user['id']}")
    
    # Generate name if not provided
    name = draft_data.name
    if not name or not name.strip():
        name = _generate_draft_name(draft_data.question)
    
    # Insert draft into database
    draft_record = {
        "user_id": user["id"],
        "name": name,
        "type": draft_data.type,
        "question": draft_data.question,
        "desired_style": draft_data.desired_style,
        "word_limit": draft_data.word_limit,
        "company_name": draft_data.company_name,
        "company_context": draft_data.company_context,
        "transcript_text": draft_data.transcript_text or "",
        "is_user_edited": draft_data.is_user_edited,
    }
    
    response = supabase.table("drafts").insert(draft_record).execute()
    
    if not response.data:
        logger.error(f"Failed to create draft for user {user['id']}")
        raise HTTPException(status_code=500, detail="Failed to create draft")
    
    created = response.data[0]
    logger.info(f"Created draft {created['id']} for user {user['id']}: {name}")
    
    return DraftResponse(
        id=created["id"],
        user_id=created["user_id"],
        name=created["name"],
        type=created["type"],
        question=created.get("question"),
        desired_style=created.get("desired_style"),
        word_limit=created.get("word_limit"),
        company_name=created.get("company_name"),
        company_context=created.get("company_context"),
        transcript_text=created.get("transcript_text", ""),
        is_user_edited=created.get("is_user_edited", False),
        created_at=datetime.fromisoformat(created["created_at"].replace("Z", "+00:00")),
        updated_at=datetime.fromisoformat(created["updated_at"].replace("Z", "+00:00")),
    )


@app.get("/drafts", response_model=List[DraftResponse])
async def list_drafts(user: dict = Depends(get_current_user)):
    """
    List all drafts for the current user.
    Returns drafts sorted by updated_at (most recent first).
    """
    rate_limit_middleware(f"list_drafts:{user['id']}")
    
    response = supabase.table("drafts").select("*").eq("user_id", user["id"]).order("updated_at", desc=True).execute()
    
    drafts = []
    for draft in response.data or []:
        drafts.append(DraftResponse(
            id=draft["id"],
            user_id=draft["user_id"],
            name=draft["name"],
            type=draft["type"],
            question=draft.get("question"),
            desired_style=draft.get("desired_style"),
            word_limit=draft.get("word_limit"),
            company_name=draft.get("company_name"),
            company_context=draft.get("company_context"),
            transcript_text=draft.get("transcript_text", ""),
            is_user_edited=draft.get("is_user_edited", False),
            created_at=datetime.fromisoformat(draft["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(draft["updated_at"].replace("Z", "+00:00")),
        ))
    
    return drafts


@app.get("/drafts/{draft_id}", response_model=DraftResponse)
async def get_draft(
    draft_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get a specific draft by ID.
    RLS ensures users can only access their own drafts.
    """
    rate_limit_middleware(f"get_draft:{user['id']}")
    
    response = supabase.table("drafts").select("*").eq("id", draft_id).eq("user_id", user["id"]).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    draft = response.data[0]
    
    return DraftResponse(
        id=draft["id"],
        user_id=draft["user_id"],
        name=draft["name"],
        type=draft["type"],
        question=draft.get("question"),
        desired_style=draft.get("desired_style"),
        word_limit=draft.get("word_limit"),
        company_name=draft.get("company_name"),
        company_context=draft.get("company_context"),
        transcript_text=draft.get("transcript_text", ""),
        is_user_edited=draft.get("is_user_edited", False),
        created_at=datetime.fromisoformat(draft["created_at"].replace("Z", "+00:00")),
        updated_at=datetime.fromisoformat(draft["updated_at"].replace("Z", "+00:00")),
    )


@app.put("/drafts/{draft_id}", response_model=DraftResponse)
async def update_draft(
    draft_id: str,
    draft_data: DraftUpdate,
    user: dict = Depends(get_active_user)
):
    """
    Update an existing draft.
    Only provided fields are updated; others remain unchanged.
    
    **Note:** Disabled users are blocked from this endpoint (403 Forbidden).
    """
    rate_limit_middleware(f"update_draft:{user['id']}")
    
    # Build update dict with only provided fields
    update_dict = {}
    if draft_data.name is not None:
        update_dict["name"] = draft_data.name
    if draft_data.question is not None:
        update_dict["question"] = draft_data.question
    if draft_data.desired_style is not None:
        update_dict["desired_style"] = draft_data.desired_style
    if draft_data.word_limit is not None:
        update_dict["word_limit"] = draft_data.word_limit
    if draft_data.company_name is not None:
        update_dict["company_name"] = draft_data.company_name
    if draft_data.company_context is not None:
        update_dict["company_context"] = draft_data.company_context
    if draft_data.transcript_text is not None:
        update_dict["transcript_text"] = draft_data.transcript_text
    if draft_data.is_user_edited is not None:
        update_dict["is_user_edited"] = draft_data.is_user_edited
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Update draft (RLS ensures user can only update their own)
    response = supabase.table("drafts").update(update_dict).eq("id", draft_id).eq("user_id", user["id"]).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    draft = response.data[0]
    logger.info(f"Updated draft {draft_id} for user {user['id']}")
    
    return DraftResponse(
        id=draft["id"],
        user_id=draft["user_id"],
        name=draft["name"],
        type=draft["type"],
        question=draft.get("question"),
        desired_style=draft.get("desired_style"),
        word_limit=draft.get("word_limit"),
        company_name=draft.get("company_name"),
        company_context=draft.get("company_context"),
        transcript_text=draft.get("transcript_text", ""),
        is_user_edited=draft.get("is_user_edited", False),
        created_at=datetime.fromisoformat(draft["created_at"].replace("Z", "+00:00")),
        updated_at=datetime.fromisoformat(draft["updated_at"].replace("Z", "+00:00")),
    )


@app.delete("/drafts/{draft_id}")
async def delete_draft(
    draft_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Delete a draft.
    RLS ensures users can only delete their own drafts.
    """
    rate_limit_middleware(f"delete_draft:{user['id']}")
    
    response = supabase.table("drafts").delete().eq("id", draft_id).eq("user_id", user["id"]).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Draft not found")
    
    logger.info(f"Deleted draft {draft_id} for user {user['id']}")
    
    return {"message": "Draft deleted successfully"}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_endpoint(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    language: Optional[str] = Form(default="en", description="Language code (en, es, fr, etc.)"),
    user: dict = Depends(get_active_user)  # Disabled users blocked
):
    """
    Transcribe audio file using Deepgram.
    
    - **file**: Audio file (max 15MB, formats: webm, wav, mp3, m4a, ogg, opus)
    - **language**: Language code (default: "en")
    
    Enforces:
    - Authentication required
    - Disabled users receive 403
    - Max file size: 15MB
    - 1 credit deducted ONLY after successful transcription
    
    Returns:
    - transcript: The transcribed text
    - confidence: Confidence score (0-1)
    - duration: Audio duration in seconds
    - word_count: Number of words in transcript
    """
    # Rate limit by user ID
    rate_limit_middleware(f"transcribe:{user['id']}")
    
    # Check if user is admin
    is_admin = await check_is_admin(user)
    
    # Check credits BEFORE processing (unless admin)
    # Credit is deducted AFTER successful transcription
    has_credits, profile = await check_credits_available(user["id"], required=1, is_admin=is_admin)
    if not has_credits:
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits for transcription."
        )
    
    # Read file content into memory
    try:
        file_content = await file.read()
        mime_type = file.content_type or "application/octet-stream"
    except Exception as e:
        logger.error(f"Error reading uploaded file: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail="Failed to read uploaded file."
        )
    
    # Perform transcription with error handling
    try:
        result = await transcribe_audio(
            audio_file=file_content,
            mime_type=mime_type,
            language=language
        )
    except UnsupportedFileTypeError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except FileTooLargeError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except TranscriptionProviderError as e:
        # Don't expose internal errors to client
        logger.error(f"Transcription failed for user {user['id']}: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail="Transcription service is currently unavailable. Please try again later."
        )
    except Exception as e:
        # Catch-all for unexpected errors
        logger.error(f"Unexpected transcription error for user {user['id']}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred during transcription. Please try again."
        )
    
    # Deduct credit ONLY after successful transcription (unless admin)
    if not is_admin:
        try:
            await decrement_credits(
                user["id"],
                amount=1,
                reason="transcription",
                is_admin=False
            )
        except Exception as e:
            # Log but don't fail the request - transcription was successful
            logger.error(f"Failed to deduct credits for user {user['id']} after transcription: {str(e)}")
    
    # Return transcription result
    return TranscribeResponse(
        transcript=result["transcript"],
        confidence=result.get("confidence"),
        duration=result.get("duration"),
        word_count=result.get("word_count")
    )


@app.websocket("/ws/live-transcribe")
async def websocket_live_transcribe(
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT authentication token"),
    language: str = Query("en", description="Language code for transcription")
):
    """
    WebSocket endpoint for live transcription streaming.
    
    Real-time speech-to-text: streams audio chunks from client, returns partial transcripts.
    
    Why WebSockets are required:
    - Real-time streaming requires bidirectional communication
    - HTTP/REST cannot push updates from server to client
    - WebSockets enable continuous audio chunk streaming and partial transcript delivery
    - Essential for live transcription where users see text appear as they speak
    
    Why live transcription is display-only for now:
    - Live transcripts are provisional and may contain errors
    - Final accurate transcript comes from POST /transcribe after recording completes
    - Avoids duplicate credit charges (credits deducted only on final transcription)
    - Keeps costs low during active recording sessions
    - Users get immediate feedback without financial penalty
    
    Authentication:
    - Token must be provided via query parameter: ?token=YOUR_JWT_TOKEN
    - Example: ws://localhost:8000/ws/live-transcribe?token=xxx&language=en
    
    Protocol:
    - Client sends binary audio chunks (bytes)
    - Server sends JSON messages with transcript events:
      {
        "type": "partial" | "final" | "error",
        "text": "transcribed text",
        "confidence": 0.95,
        "start_time": 0.0,
        "end_time": 1.23
      }
    """
    await websocket.accept()
    
    # Authenticate user and check if disabled
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return
    
    try:
        user = await get_active_user_from_websocket_token(token)
        logger.info(f"Live transcription session started for user {user['id']}")
    except HTTPException as e:
        # 403 = disabled user, 401 = auth failure
        reason = "Account disabled" if e.status_code == 403 else "Authentication failed"
        await websocket.close(code=1008, reason=reason)
        return
    except Exception as e:
        logger.error(f"WebSocket authentication error: {e}")
        await websocket.close(code=1011, reason="Internal server error")
        return
    
    # Initialize transcription provider
    # Using Deepgram for now, but provider abstraction allows easy swapping
    provider = DeepgramStreamingProvider()
    
    try:
        # Start transcription stream
        # Configuration values come from settings (config.py) with sensible defaults:
        # - Sample rate: 48000 Hz (modern browser default)
        # - Channels: 1 (mono)
        # - Encoding: linear16 (PCM)
        # These can be overridden via environment variables if needed
        stream = provider.start_stream(
            language=language,
            sample_rate=settings.deepgram_sample_rate,
            channels=settings.deepgram_channels,
            encoding=settings.deepgram_encoding
        )
        
        # Task to forward transcript events to client
        async def send_transcripts():
            try:
                async for event in stream:
                    # Send transcript event as JSON to client
                    await websocket.send_json(event)
                    
                    # Log for debugging (truncated to avoid log spam)
                    if event.get("type") in ("partial", "final"):
                        text_preview = event.get("text", "")[:50]
                        logger.debug(f"Transcribed for user {user['id']}: {text_preview}...")
                    
                    # Stop on error or close event
                    if event.get("type") == "error":
                        logger.error(f"Transcription error: {event.get('message')}")
                        break
            except Exception as e:
                logger.error(f"Error in transcript forwarding: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": "Transcription stream error"
                })
        
        send_task = asyncio.create_task(send_transcripts())
        
        # Main loop: receive audio chunks from client and forward to provider
        try:
            while True:
                # Receive binary audio chunk from client
                data = await websocket.receive_bytes()
                
                # Forward audio chunk to Deepgram
                try:
                    await provider.send_audio_chunk(data)
                except RuntimeError as e:
                    # Stream disconnected
                    logger.warning(f"Stream disconnected: {e}")
                    break
                except Exception as e:
                    logger.error(f"Error sending audio chunk: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Failed to process audio chunk"
                    })
        
        except WebSocketDisconnect:
            logger.info(f"Client disconnected for user {user['id']}")
        except Exception as e:
            logger.error(f"WebSocket error for user {user['id']}: {e}")
        finally:
            # Cleanup: cancel send task and close provider
            send_task.cancel()
            try:
                await send_task
            except asyncio.CancelledError:
                pass
            
            await provider.close()
            logger.info(f"Live transcription session ended for user {user['id']}")
    
    except Exception as e:
        logger.error(f"Error setting up live transcription: {e}")
        error_msg = str(e)
        # Never expose API keys in error messages
        if settings.deepgram_api_key and settings.deepgram_api_key in error_msg:
            error_msg = "Transcription service configuration error"
        
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to start transcription: {error_msg}"
        })
        await websocket.close(code=1011, reason="Internal server error")


@app.websocket("/ws/listen")
async def websocket_listen(
    websocket: WebSocket,
    token: Optional[str] = Query(None, description="JWT authentication token"),
    detect_fillers: Optional[bool] = Query(None, description="Enable filler word detection (overrides user setting)")
):
    """
    WebSocket endpoint for live transcription using MediaRecorder (audio/webm).
    
    Accepts binary audio chunks in WebM format from browser MediaRecorder,
    forwards to Deepgram for transcription, and streams transcripts back.
    
    Configuration:
    - model: nova-2
    - language: en-US
    - smart_format: depends on filler detection mode
    - interim_results: true
    
    Filler Detection:
    - If detect_fillers=true: Preserves filler words, reports counts
    - If detect_fillers=false: Uses smart_format for clean output
    - If not provided: Uses user's setting (filler_word_detection)
    - Practice mode should always pass detect_fillers=true
    
    Authentication:
    - Token must be provided via query parameter: ?token=YOUR_JWT_TOKEN
    - Example: ws://localhost:8000/ws/listen?token=xxx&detect_fillers=true
    
    Protocol:
    - Client sends binary audio chunks (audio/webm)
    - Server sends JSON messages with transcript events:
      {
        "type": "partial" | "final" | "error",
        "text": "transcribed text",
        "confidence": 0.95,
        "fillers_in_segment": 0,  // Only when filler detection enabled
        "total_fillers": 0        // Only when filler detection enabled
      }
    """
    # Check authentication BEFORE accepting the connection
    if not token:
        logger.warning(f"[WebSocket /ws/listen] Connection rejected: Missing authentication token")
        await websocket.accept()
        await websocket.close(code=1008, reason="Missing authentication token")
        return
    
    # Log token presence (but not the actual token for security)
    token_preview = f"{token[:10]}..." if len(token) > 10 else token
    logger.info(f"[WebSocket /ws/listen] Received connection with token: {token_preview} (length: {len(token)})")
    
    # Authenticate user and check if disabled BEFORE accepting connection
    try:
        user = await get_active_user_from_websocket_token(token)
        logger.info(f"[WebSocket /ws/listen] Authentication successful for user {user['id']} (email: {user.get('email', 'N/A')})")
    except HTTPException as e:
        # 403 = disabled user, 401 = auth failure
        reason = "Account disabled" if e.status_code == 403 else f"Authentication failed: {e.detail}"
        logger.error(f"[WebSocket /ws/listen] {reason}")
        await websocket.accept()
        await websocket.close(code=1008, reason=reason)
        return
    except Exception as e:
        logger.error(f"[WebSocket /ws/listen] Authentication error: {type(e).__name__}: {str(e)}")
        await websocket.accept()
        await websocket.close(code=1011, reason="Internal server error during authentication")
        return
    
    # Only accept connection AFTER successful authentication
    await websocket.accept()
    logger.info(f"[WebSocket /ws/listen] Connection accepted for user {user['id']}")
    
    # Determine if filler detection should be enabled
    # Priority: explicit parameter > user setting > default (false)
    enable_filler_detection = detect_fillers
    if enable_filler_detection is None:
        # Check user's setting
        try:
            user_settings = await get_user_settings(user['id'])
            enable_filler_detection = user_settings.get('filler_word_detection', False)
            logger.info(f"[WebSocket] Using user setting for filler detection: {enable_filler_detection}")
        except Exception as e:
            logger.warning(f"[WebSocket] Could not fetch user settings, defaulting to no filler detection: {e}")
            enable_filler_detection = False
    else:
        logger.info(f"[WebSocket] Using explicit filler detection parameter: {enable_filler_detection}")
    
    # Initialize Deepgram provider with filler detection mode
    provider = DeepgramWebmProvider(detect_fillers=enable_filler_detection)
    
    try:
        # Connect to Deepgram first
        await provider.connect()
        
        # Start transcription stream (WebM format, Deepgram auto-detects)
        stream = provider.start_stream()
        
        # Task to forward transcript events to client
        async def send_transcripts():
            try:
                async for event in stream:
                    # Send transcript event as JSON to client
                    await websocket.send_json(event)
                    
                    # Log for debugging
                    if event.get("type") in ("partial", "final"):
                        text_preview = event.get("text", "")[:50]
                        logger.debug(f"Transcribed for user {user['id']}: {text_preview}...")
                    
                    # Stop on error or close event
                    if event.get("type") == "error":
                        logger.error(f"Transcription error: {event.get('message')}")
                        break
            except Exception as e:
                logger.error(f"Error in transcript forwarding: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": "Transcription stream error"
                })
        
        send_task = asyncio.create_task(send_transcripts())
        
        # Main loop: receive audio chunks from client and forward to provider
        try:
            while True:
                # Receive binary audio chunk (audio/webm) from client
                data = await websocket.receive_bytes()
                
                # Relay binary audio bytes directly to Deepgram connection
                try:
                    await provider.send_audio_chunk(data)
                except RuntimeError as e:
                    logger.warning(f"Stream disconnected: {e}")
                    break
                except Exception as e:
                    logger.error(f"Error sending audio chunk to Deepgram: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Failed to process audio chunk"
                    })
        
        except WebSocketDisconnect:
            logger.info(f"Client disconnected for user {user['id']}")
        except Exception as e:
            logger.error(f"WebSocket error for user {user['id']}: {e}")
        finally:
            # Cleanup: cancel send task and close provider
            send_task.cancel()
            try:
                await send_task
            except asyncio.CancelledError:
                pass
            
            await provider.close()
            logger.info(f"Live transcription session ended for user {user['id']}")
    
    except Exception as e:
        logger.error(f"Error setting up live transcription: {e}")
        error_msg = str(e)
        # Never expose API keys in error messages
        if settings.deepgram_api_key and settings.deepgram_api_key in error_msg:
            error_msg = "Transcription service configuration error"
        
        await websocket.send_json({
            "type": "error",
            "message": f"Failed to start transcription: {error_msg}"
        })
        await websocket.close(code=1011, reason="Internal server error")


# ============================================
# LLM Refinement Endpoints
# ============================================

@app.post("/refine", response_model=RefineResponse)
async def refine_draft(
    request: RefineRequest,
    user: dict = Depends(get_active_user)  # Disabled users blocked
):
    """
    Refine a raw transcript into a polished response.
    
    This endpoint uses OpenAI to refine verbatim speech while preserving
    the user's authentic voice and meaning. Uses context-aware prompts
    based on session type and voice profile.
    
    Disabled users receive 403.
    """
    # Rate limit by user ID
    rate_limit_middleware(f"refine:{user['id']}")
    
    try:
        refined_text = await refine_transcript(
            raw_transcript=request.raw_transcript,
            session_type=request.session_type,
            desired_tone=request.desired_tone,
            user_context=request.user_context,
            reference_text=request.reference_text,
            reference_file_url=request.reference_file_url,
            reference_file_type=request.reference_file_type,
            question=request.question,
            goal=request.goal,
            user_id=user['id'],
            company_name=request.company_name,
            word_limit=request.word_limit  # Explicit word limit from UI
        )
        
        return RefineResponse(refined_text=refined_text)
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error refining transcript for user {user['id']}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refine transcript: {str(e)}")


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_transcript_endpoint(
    request: AnalyzeRequest,
    user: dict = Depends(get_active_user)
):
    """
    Analyze a raw transcript and generate a refined version.
    
    This endpoint:
    1. Runs deterministic analytics (filler words, confidence, clarity)
    2. Uses OpenAI to refine the transcript with context-aware prompts
    
    Uses voice profile data and session type to generate personalized,
    context-aware refinements. Returns both analytics and refined text.
    
    **Credit Consumption:**
    - Costs 1 credit per request (includes LLM refinement)
    - Admins bypass credit consumption
    - Credit is deducted AFTER successful analysis
    
    **Tradeoffs (GAP-001 Resolution):**
    - Why credits: /analyze triggers expensive LLM calls for refinement
    - Why flat cost (1 credit): Simplifies billing; tiered pricing deferred
    - Future: May revisit for free preview mode or tiered analysis depth
    
    **Note:** Disabled users are blocked from this endpoint (403 Forbidden).
    """
    # Rate limit by user ID
    rate_limit_middleware(f"analyze:{user['id']}")
    
    # Check if user is admin (admins bypass credit checks)
    # ADMIN BYPASS SCOPE:
    # - Admin is determined ONLY by user_profiles.role = 'admin' (auth.py:check_is_admin)
    # - This is intended for internal/testing use only
    # - Admins bypass: credit checks, credit deductions, some rate limits
    # - The DB-level enforcement is in deduct_credit() which also checks user_profiles.role
    # - Do NOT expand admin bypass to broader roles (e.g., "premium_user") without review
    is_admin = await check_is_admin(user)
    
    # Check credits BEFORE any LLM calls (unless admin)
    # Credit is deducted AFTER successful analysis to avoid charging for failures
    has_credits, profile = await check_credits_available(user["id"], required=1, is_admin=is_admin)
    if not has_credits:
        logger.info(f"[Analyze:CreditCheck] Insufficient credits for user {user['id']}")
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits for analysis. Please upgrade or wait for monthly reset."
        )
    
    try:
        result = await analyze_and_refine(
            raw_transcript=request.raw_transcript,
            session_type=request.session_type,
            desired_tone=request.desired_tone,
            user_context=request.user_context,
            reference_text=request.reference_text,
            reference_file_url=request.reference_file_url,
            reference_file_type=request.reference_file_type,
            question=request.question,
            goal=request.goal,
            user_id=user['id'],
            company_name=request.company_name,
            word_limit=request.word_limit  # Explicit word limit from UI
        )
        
        # Build full analytics response (v3 contract)
        response = AnalyzeResponse(
            refined_text=result["refined_text"],
            confidence_score=result["confidence_score"],
            clarity_score=result["clarity_score"],
            analysis_reliability=result.get("analysis_reliability", 0.5),
            filler_word_count=result["filler_word_count"],
            filler_word_frequency=result["filler_word_frequency"],
            filler_word_breakdown=result["filler_word_breakdown"],
            signal_validity=result.get("signal_validity"),
            explanation=result.get("explanation"),
            baseline=result.get("baseline"),
            drift=result.get("drift"),
            metrics=result.get("metrics"),
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error analyzing transcript for user {user['id']}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to analyze transcript: {str(e)}")
    
    # Deduct credit ONLY after successful analysis (unless admin)
    # This ensures users are not charged for failed requests
    #
    # CONCURRENCY: BUG-005 FIXED
    # decrement_credits() now uses atomic_decrement_credits() Postgres function.
    # Single UPDATE with WHERE clause prevents race conditions and negative balances.
    #
    # POST-SUCCESS DEDUCTION TRADEOFF:
    # We deduct AFTER success to avoid charging users for failed requests.
    # Exploit vector: User could intentionally trigger failures to get free retries.
    # This is accepted because:
    # - UX fairness: Users should not pay for our failures
    # - Low abuse risk: Failures are logged and rate-limited
    # - Revisit when: Abuse patterns detected (>10% failure rate per user)
    if not is_admin:
        try:
            await decrement_credits(
                user["id"],
                amount=1,
                reason="analysis",  # Distinct from "refine" for billing clarity
                is_admin=False
            )
            logger.info(f"[Analyze:CreditDeducted] User {user['id']} charged 1 credit for analysis")
        except Exception as e:
            # Log but don't fail the request - analysis was successful
            # User got value, we should not break their experience
            logger.error(f"[Analyze:CreditError] Failed to deduct credit for user {user['id']}: {e}")
    
    return response


# ============================================
# Interview Refinement Endpoint (GAP-011)
# ============================================

@app.post("/refine-interview", response_model=InterviewRefinementResponse)
async def refine_interview_endpoint(
    request: InterviewRefinementRequest,
    user: dict = Depends(get_active_user)
):
    """
    Refine an interview response using the turn-based pipeline.
    
    This is a single-turn refinement flow (one question → one refined response).
    NOT Practice Mode. NOT multi-turn. NOT real-time.
    
    **Required Fields:**
    - interview_question: The interview question being answered
    - desired_style: Desired response style (e.g., "Confident but humble, story-driven")
    
    **Optional Fields:**
    - company_name: Company name for alignment (LLM infers culture)
    - company_role_context: User-provided context (overrides company_name inference)
    - transcript: User's recorded answer (enables feedback generation)
    
    **NOT Supported (v1):**
    - reference_text, reference_file_url: Reference upload is disabled
    
    **Returns:**
    - refined_answer_text: Polished, submission-ready response (ALWAYS)
    - feedback: Targeted feedback on recorded response (ONLY if transcript provided)
    
    **Note:** Disabled users are blocked from this endpoint (403 Forbidden).
    - alignment_signals_used: Company/role signals applied
    - improvements_applied: List of improvements made
    - context_source: "user_provided" | "company_inferred" | "generic"
    - token_usage: Token usage for billing
    """
    # Rate limit by user ID
    rate_limit_middleware(f"refine_interview:{user['id']}")
    
    # Check if user is admin
    is_admin = await check_is_admin(user)
    
    # Check credits (interview refinement costs 1 credit)
    has_credits, profile = await check_credits_available(user["id"], required=1, is_admin=is_admin)
    if not has_credits:
        raise HTTPException(
            status_code=402,
            detail="Insufficient credits for interview refinement."
        )
    
    try:
        # Call the refinement pipeline
        result = await refine_interview_response(
            interview_question=request.interview_question,
            desired_style=request.desired_style,
            company_name=request.company_name,
            company_role_context=request.company_role_context,
            transcript=request.transcript,
            user_id=user['id']
        )
        
        # Deduct credit ONLY after successful refinement (unless admin)
        if not is_admin:
            try:
                await decrement_credits(
                    user["id"],
                    amount=1,
                    reason="interview_refinement",
                    is_admin=False
                )
            except Exception as e:
                # Log but don't fail the request - refinement was successful
                logger.error(f"Failed to deduct credits for user {user['id']} after interview refinement: {e}")
        
        # Log telemetry
        logger.info(
            f"[InterviewRefinement:Endpoint] Success for user {user['id']}: "
            f"context_source={result['context_source']}, "
            f"has_transcript={request.transcript is not None}, "
            f"tokens={result.get('token_usage', {}).get('total_tokens', 0)}"
        )
        
        # Build response with proper FeedbackItem models
        feedback_items = None
        if result.get("feedback"):
            feedback_items = [
                FeedbackItem(
                    category=f.get("category", "content"),
                    observation=f.get("observation", ""),
                    suggestion=f.get("suggestion", ""),
                    priority=f.get("priority", "medium")
                )
                for f in result["feedback"]
                if isinstance(f, dict)
            ]
        
        return InterviewRefinementResponse(
            refined_answer_text=result["refined_answer_text"],
            alignment_signals_used=result.get("alignment_signals_used", []),
            improvements_applied=result.get("improvements_applied", []),
            context_source=result["context_source"],
            feedback=feedback_items,
            assumptions_or_limits=result.get("assumptions_or_limits"),
            suggested_follow_up=result.get("suggested_follow_up"),
            token_usage=result.get("token_usage")
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in interview refinement for user {user['id']}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to refine interview response: {str(e)}")


# ============================================
# File Upload Endpoints
# ============================================

# Allowed file types for reference materials (legacy - now in storage.py)
ALLOWED_REFERENCE_TYPES = {
    # Documents
    "application/pdf": [".pdf"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    # Images
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/gif": [".gif"],
    "image/webp": [".webp"],
    "image/bmp": [".bmp"],
    "image/tiff": [".tiff", ".tif"],
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def validate_file_type(content_type: str, filename: str) -> bool:
    """Validate that the file type is allowed."""
    if not content_type:
        # Try to infer from filename
        ext = os.path.splitext(filename)[1].lower()
        return any(ext in exts for exts in ALLOWED_REFERENCE_TYPES.values())
    
    return content_type in ALLOWED_REFERENCE_TYPES


@app.post("/upload-audio", response_model=AudioUploadResponse)
async def upload_audio_file(
    file: UploadFile = File(..., description="Audio file to upload"),
    session_id: Optional[str] = Form(None, description="Optional session ID to associate with"),
    user: dict = Depends(get_current_user)
):
    """
    Upload an audio recording to storage.
    
    Accepts audio files (webm, mp3, wav, m4a, ogg, flac) up to 15MB.
    Returns the file URL for playback and storage path for reference.
    """
    rate_limit_middleware(f"upload_audio:{user['id']}")
    
    # Read file content
    try:
        file_content = await file.read()
        file_size = len(file_content)
    except Exception as e:
        logger.error(f"Error reading audio file: {e}")
        raise HTTPException(status_code=400, detail="Error reading audio file")
    
    # Validate file
    is_valid, error_msg = StorageService.validate_audio_file(
        file.content_type,
        file.filename,
        file_size
    )
    
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    try:
        # Upload to storage
        result = await storage_service.upload_audio(
            user_id=user['id'],
            file_content=file_content,
            filename=file.filename or "recording.webm",
            content_type=file.content_type or "audio/webm",
            session_id=session_id
        )
        
        logger.info(f"Audio uploaded by user {user['id']}: {result['storage_path']}")
        
        return AudioUploadResponse(
            file_url=result["file_url"],
            file_type=file.content_type or "audio/webm",
            file_size=result["file_size"],
            storage_path=result["storage_path"],
            session_id=session_id
        )
        
    except Exception as e:
        logger.error(f"Error uploading audio: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload audio file")


@app.post("/upload-reference", response_model=FileUploadResponse)
async def upload_reference_file(
    file: UploadFile = File(..., description="Reference file to upload (PDF, Word doc, or image)"),
    user: dict = Depends(get_current_user)
):
    """
    Upload a reference file (PDF, Word document, or image) for use in transcript refinement.
    
    Validates file type and size, uploads to Supabase Storage, and optionally extracts text.
    Returns file URL and metadata.
    """
    rate_limit_middleware(f"upload_reference:{user['id']}")
    
    # Validate file type
    if not validate_file_type(file.content_type, file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Supported types: PDF, Word documents (.doc, .docx), and images (JPEG, PNG, GIF, WebP, BMP, TIFF)"
        )
    
    # Read file content
    try:
        file_content = await file.read()
        file_size = len(file_content)
        
        # Validate file size
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE / (1024 * 1024):.0f}MB"
            )
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        
    except Exception as e:
        logger.error(f"Error reading file: {e}")
        raise HTTPException(status_code=400, detail="Error reading file")
    
    try:
        # Generate unique filename
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        storage_path = f"reference-files/{user['id']}/{unique_filename}"
        
        # Upload to Supabase Storage
        # Using the 'reference-files' bucket (create it in Supabase if it doesn't exist)
        storage_response = supabase.storage.from_("reference-files").upload(
            storage_path,
            file_content,
            file_options={
                "content-type": file.content_type or "application/octet-stream",
                "upsert": False  # Don't overwrite existing files
            }
        )
        
        if not storage_response or "error" in str(storage_response):
            logger.error(f"Supabase storage upload failed: {storage_response}")
            raise HTTPException(status_code=500, detail="Failed to upload file to storage")
        
        # Get public URL
        public_url_response = supabase.storage.from_("reference-files").get_public_url(storage_path)
        file_url = public_url_response if isinstance(public_url_response, str) else public_url_response.get("publicUrl", "")
        
        if not file_url:
            # Fallback: construct URL manually
            supabase_url = settings.supabase_url.rstrip('/')
            file_url = f"{supabase_url}/storage/v1/object/public/reference-files/{storage_path}"
        
        # Extract text for non-image files (optional, can be done async)
        extracted_text = None
        if file.content_type and not file.content_type.startswith('image/'):
            # For PDF/Word docs, we could extract text here
            # For now, we'll return None and let the frontend handle extraction if needed
            # Or we could use a library like PyPDF2, python-docx, etc.
            pass
        
        logger.info(f"File uploaded successfully: {storage_path} by user {user['id']}")
        
        return FileUploadResponse(
            file_url=file_url,
            file_type=file.content_type or "application/octet-stream",
            file_size=file_size,
            extracted_text=extracted_text
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during file upload")


# =============================================================================
# User Settings Endpoints (Phase 1 - Lean)
# =============================================================================

from models import UserSettings, UserSettingsUpdate

async def get_user_settings(user_id: str) -> dict:
    """
    Get or create user settings from database.
    
    Phase 1: Only filler_word_detection is persisted.
    Returns defaults if database operations fail.
    """
    try:
        # Try to get existing settings
        response = supabase.table("user_settings").select("*").eq("user_id", user_id).single().execute()
        if response.data:
            return response.data
    except Exception as e:
        logger.debug(f"Settings not found for user {user_id}, will create: {e}")
    
    # Create default settings if not found
    try:
        response = supabase.table("user_settings").insert({
            "user_id": user_id,
            "filler_word_detection": False
        }).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        logger.error(f"Error creating user settings: {e}")
    
    # Return defaults if database operations fail (graceful degradation)
    return {
        "user_id": user_id,
        "filler_word_detection": False,
        "created_at": None,
        "updated_at": None
    }


@app.get("/user/settings", response_model=UserSettings)
async def get_settings(user: dict = Depends(get_current_user)):
    """
    Get current user's settings (Phase 1).
    
    Returns filler_word_detection setting.
    Auto-creates settings row if user doesn't have one.
    """
    settings_data = await get_user_settings(user["id"])
    return UserSettings(**settings_data)


@app.put("/user/settings", response_model=UserSettings)
async def update_settings(
    settings_update: UserSettingsUpdate,
    user: dict = Depends(get_current_user)
):
    """
    Update current user's settings (Phase 1).
    
    Only filler_word_detection can be updated in Phase 1.
    """
    # Get current settings first (ensures row exists)
    current_settings = await get_user_settings(user["id"])
    
    # Build update dict with only provided fields (Phase 1: only filler_word_detection)
    update_data = {}
    if settings_update.filler_word_detection is not None:
        update_data["filler_word_detection"] = settings_update.filler_word_detection
    
    if not update_data:
        # No updates provided
        return UserSettings(**current_settings)
    
    try:
        response = supabase.table("user_settings").update(update_data).eq("user_id", user["id"]).execute()
        if response.data and len(response.data) > 0:
            logger.info(f"Settings updated for user {user['id']}: filler_word_detection={update_data.get('filler_word_detection')}")
            return UserSettings(**response.data[0])
        else:
            # Fallback to current with updates applied
            current_settings.update(update_data)
            return UserSettings(**current_settings)
    except Exception as e:
        logger.error(f"Error updating user settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to update settings")


# =============================================================================
# Feature Flags Endpoint
# =============================================================================

from feature_flags import get_all_flags, get_user_flags, is_enabled

@app.get("/feature-flags")
async def get_feature_flags(user: dict = Depends(get_current_user)):
    """
    Get feature flags for the current user.
    
    Returns which features are enabled for this user.
    """
    return {
        "flags": get_user_flags(user["id"]),
        "environment": settings.env,
    }


@app.get("/admin/feature-flags")
async def get_all_feature_flags(
    user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Get all feature flags (admin only).
    
    Returns complete flag configuration.
    """
    is_admin = await check_is_admin(user)
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return {
        "flags": get_all_flags(),
        "environment": settings.env,
    }


# =============================================================================
# User Data Export Endpoints (GDPR)
# =============================================================================

from backup import UserDataExport, SessionExport, ExportFormat

@app.get("/user/export")
async def export_my_data(user: dict = Depends(get_current_user)):
    """
    Export all data for the current user (GDPR compliance).
    
    Returns all user data including profile, sessions, and voice profiles.
    """
    rate_limit_middleware(f"export_data:{user['id']}")
    
    try:
        data = await UserDataExport.export_user_data(user["id"])
        return data
    except Exception as e:
        logger.error(f"Failed to export user data: {e}")
        raise HTTPException(status_code=500, detail="Failed to export data")


@app.get("/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    format: str = Query("json", description="Export format: json or txt"),
    user: dict = Depends(get_current_user)
):
    """
    Export a session in the specified format.
    
    Returns the session data as a downloadable file.
    """
    from fastapi.responses import Response
    
    if format not in [ExportFormat.JSON, ExportFormat.TXT]:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'json' or 'txt'")
    
    try:
        data = await SessionExport.export_session(session_id, user["id"], format)
        
        content_type = "application/json" if format == "json" else "text/plain"
        filename = f"voira_session_{session_id}.{format}"
        
        return Response(
            content=data,
            media_type=content_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to export session: {e}")
        raise HTTPException(status_code=500, detail="Failed to export session")

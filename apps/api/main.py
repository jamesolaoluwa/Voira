"""
FastAPI Backend for Voira
Handles authentication, sessions, admin checks, and transcription.
"""

import logging
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from typing import List, Optional
from auth import get_current_user, check_is_admin, security
from models import (
    SessionCreate, SessionResponse, UserResponse, AdminCheckResponse,
    TranscribeResponse
)
from credits import check_credits_available, decrement_credits, check_and_reset_credits
from rate_limit import rate_limit_middleware
from db import supabase
from config import settings
from transcription import (
    transcribe_audio,
    UnsupportedFileTypeError,
    FileTooLargeError,
    TranscriptionProviderError
)
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Voira API",
    description="Backend API for Voira voice coaching platform",
    version="1.0.0",
)


@app.on_event("startup")
async def startup_validation():
    """
    Validate required environment variables on application startup.
    This ensures the app fails fast with clear errors if configuration is missing.
    NEVER log or print secret values (keys, tokens, etc.)
    """
    missing_vars = []
    
    # Check required Supabase configuration
    if not settings.supabase_url:
        missing_vars.append("SUPABASE_URL")
    if not settings.supabase_service_role_key:
        missing_vars.append("SUPABASE_SERVICE_ROLE_KEY")
    
    if missing_vars:
        error_msg = f"Missing required environment variables: {', '.join(missing_vars)}"
        logger.error(error_msg)
        raise ValueError(error_msg)
    
    # Log environment (safe to log - not a secret)
    logger.info(f"Application starting in {settings.env} environment")
    
    # Validate Supabase URL format (basic check, no secrets logged)
    if settings.supabase_url and not settings.supabase_url.startswith(("http://", "https://")):
        logger.warning("SUPABASE_URL should start with http:// or https://")

# CORS configuration - must be added before other middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """Get current authenticated user info."""
    return UserResponse(
        id=user["id"],
        email=user["email"],
        full_name=user.get("full_name"),
        role=user.get("role", "free_user"),
        credits_remaining=user.get("credits_remaining", 10),
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
    user: dict = Depends(get_current_user)
):
    """
    Create a new session (recording).
    Enforces credits server-side.
    Admins bypass credit checks.
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
    
    response = supabase.table("recordings").insert(insert_data).execute()
    
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
    response = supabase.table("recordings").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute()
    
    sessions = []
    for rec in response.data:
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
            created_at=datetime.fromisoformat(rec["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(rec["updated_at"].replace("Z", "+00:00")),
        ))
    
    return sessions


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio_endpoint(
    file: UploadFile = File(..., description="Audio file to transcribe"),
    language: Optional[str] = Form(default="en", description="Language code (en, es, fr, etc.)"),
    user: dict = Depends(get_current_user)
):
    """
    Transcribe audio file using Deepgram.
    
    - **file**: Audio file (max 15MB, formats: webm, wav, mp3, m4a, ogg, opus)
    - **language**: Language code (default: "en")
    
    Enforces:
    - Authentication required
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


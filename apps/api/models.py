"""Pydantic models for request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ============================================
# Session Models
# ============================================

class SessionCreate(BaseModel):
    """Request model for creating a session."""
    title: str = Field(..., min_length=1, max_length=200)
    type: str = Field(default="free", pattern="^(free|application|interview|practice|refine)$")
    question: Optional[str] = Field(None, max_length=1000)
    goal: Optional[str] = Field(None, max_length=500)
    reference_text: Optional[str] = Field(None, max_length=10000)
    audio_url: Optional[str] = None
    audio_mime: Optional[str] = None
    audio_size_bytes: int = Field(default=0, ge=0)
    duration_seconds: int = Field(default=0, ge=0)
    transcript: str = Field(default="", max_length=50000)
    refined_draft: str = Field(default="", max_length=50000)
    clarity_score: int = Field(default=0, ge=0, le=100)
    confidence_score: int = Field(default=0, ge=0, le=100)
    filler_count: int = Field(default=0, ge=0)
    words_per_minute: int = Field(default=0, ge=0)
    highlights: List[dict] = Field(default_factory=list)


class SessionResponse(BaseModel):
    """Response model for a session."""
    id: str
    user_id: str
    title: str
    type: str
    question: Optional[str]
    goal: Optional[str]
    reference_text: Optional[str]
    audio_url: Optional[str]
    audio_mime: Optional[str]
    audio_size_bytes: int
    duration_seconds: int
    transcript: str
    refined_draft: str
    clarity_score: int
    confidence_score: int
    filler_count: int
    words_per_minute: int
    highlights: List[dict]
    created_at: datetime
    updated_at: datetime


# ============================================
# Auth Models
# ============================================

class UserResponse(BaseModel):
    """Response model for user info."""
    id: str
    email: str
    full_name: Optional[str]
    role: str
    credits_remaining: int
    credits_reset_at: Optional[datetime]


class AdminCheckResponse(BaseModel):
    """Response model for admin check."""
    isAdmin: bool


# ============================================
# Transcription Models
# ============================================

class TranscribeRequest(BaseModel):
    """Request model for transcription (placeholder)."""
    audio_url: str = Field(..., min_length=1)
    language: Optional[str] = Field(default="en", pattern="^(en|es|fr|de|it|pt|ja|ko|zh)$")


class TranscribeResponse(BaseModel):
    """Response model for transcription."""
    transcript: str
    confidence: Optional[float] = None


"""Pydantic models for request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
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
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Confidence score (0-1)")
    duration: Optional[float] = Field(None, ge=0.0, description="Audio duration in seconds")
    word_count: Optional[int] = Field(None, ge=0, description="Number of words in transcript")


# ============================================
# LLM Refinement Models
# ============================================

class RefineRequest(BaseModel):
    """Request model for transcript refinement."""
    raw_transcript: str = Field(..., min_length=1, max_length=50000, description="Verbatim user speech (includes filler words)")
    session_type: str = Field(default="free", pattern="^(free|application|interview|practice|refine)$", description="Type of session")
    desired_tone: Optional[str] = Field(None, max_length=50, description="Desired tone (confident, concise, reflective, etc.)")
    user_context: Optional[str] = Field(None, max_length=5000, description="Optional context from prompt input (company info, role details, etc.)")
    reference_text: Optional[str] = Field(None, max_length=10000, description="Optional example text user likes or reference material")
    reference_file_url: Optional[str] = Field(None, max_length=500, description="URL of uploaded reference file (for images, use Vision API)")
    reference_file_type: Optional[str] = Field(None, max_length=100, description="MIME type of reference file (e.g., image/jpeg, application/pdf)")
    question: Optional[str] = Field(None, max_length=1000, description="Optional question/prompt the user is responding to")
    goal: Optional[str] = Field(None, max_length=500, description="Optional user's goal for the session")
    company_name: Optional[str] = Field(None, max_length=100, description="Company name for interview responses (used for research when context is empty)")


class RefineResponse(BaseModel):
    """Response model for transcript refinement."""
    refined_text: str = Field(..., description="Polished response")


class AnalyzeRequest(BaseModel):
    """Request model for transcript analysis and refinement."""
    raw_transcript: str = Field(..., min_length=1, max_length=50000, description="Verbatim user speech (includes filler words)")
    session_type: str = Field(default="free", pattern="^(free|application|interview|practice|refine)$", description="Type of session")
    desired_tone: Optional[str] = Field(None, max_length=50, description="Desired tone (confident, concise, reflective, etc.)")
    user_context: Optional[str] = Field(None, max_length=5000, description="Optional context from prompt input (company info, role details, etc.)")
    reference_text: Optional[str] = Field(None, max_length=10000, description="Optional example text user likes or reference material")
    reference_file_url: Optional[str] = Field(None, max_length=500, description="URL of uploaded reference file (for images, use Vision API)")
    reference_file_type: Optional[str] = Field(None, max_length=100, description="MIME type of reference file (e.g., image/jpeg, application/pdf)")
    question: Optional[str] = Field(None, max_length=1000, description="Optional question/prompt the user is responding to")
    goal: Optional[str] = Field(None, max_length=500, description="Optional user's goal for the session")
    company_name: Optional[str] = Field(None, max_length=100, description="Company name for interview responses (used for research when context is empty)")


class ScoreExplanationModel(BaseModel):
    """Explanation for a score (confidence or clarity)."""
    score: int = Field(..., ge=0, le=100)
    raw_score: float
    reliability: float = Field(..., ge=0, le=1)
    baseline_expectation: float
    epistemic_adjustment: float
    reliability_note: str
    top_positive: List[Dict] = Field(default_factory=list)
    top_negative: List[Dict] = Field(default_factory=list)
    counterfactuals: List[Dict] = Field(default_factory=list)


class BaselineInfoModel(BaseModel):
    """Baseline information used for scoring."""
    is_user_specific: bool
    sample_count: int
    confidence_expectation: float
    clarity_expectation: float
    filler_density_ci: List[float] = Field(default_factory=list)
    stance_ratio_ci: List[float] = Field(default_factory=list)


class DriftInfoModel(BaseModel):
    """Drift tracking information."""
    drift_tracked: bool
    filler_drift: Optional[Dict] = None
    stance_drift: Optional[Dict] = None


class SignalValidityModel(BaseModel):
    """Signal validity information."""
    is_valid: bool
    reliability: float
    reliability_factors: Dict
    reason: str


class AnalyzeResponse(BaseModel):
    """
    Response model for transcript analysis and refinement.
    
    This is the CANONICAL analytics response contract (v3).
    Frontend MUST consume this as-is without recomputing metrics.
    """
    refined_text: str = Field(..., description="Polished response")
    
    # Core scores
    confidence_score: int = Field(..., ge=0, le=100, description="Confidence score (0-100)")
    clarity_score: int = Field(..., ge=0, le=100, description="Clarity score (0-100)")
    
    # Epistemic reliability
    analysis_reliability: float = Field(default=0.5, ge=0, le=1, description="Reliability of the analysis (0-1)")
    
    # Filler metrics
    filler_word_count: int = Field(..., ge=0, description="Total number of filler words detected (display only)")
    filler_word_frequency: float = Field(..., ge=0.0, description="Filler density per 100 words (use for scoring)")
    filler_word_breakdown: Dict[str, int] = Field(default_factory=dict, description="Breakdown of filler words by type")
    
    # Signal validity
    signal_validity: Optional[SignalValidityModel] = Field(None, description="Signal quality analysis")
    
    # Detailed explanations (for advanced views)
    explanation: Optional[Dict] = Field(None, description="Score explanations with counterfactuals")
    
    # Baseline and drift
    baseline: Optional[BaselineInfoModel] = Field(None, description="Baseline used for scoring")
    drift: Optional[DriftInfoModel] = Field(None, description="Drift tracking info")
    
    # Normalized metrics (for charts)
    metrics: Optional[Dict] = Field(None, description="Normalized metrics for visualization")


class FileUploadResponse(BaseModel):
    """Response model for file upload."""
    file_url: str = Field(..., description="URL of the uploaded file")
    file_type: str = Field(..., description="MIME type of the uploaded file")
    file_size: int = Field(..., ge=0, description="Size of the file in bytes")
    extracted_text: Optional[str] = Field(None, description="Extracted text content (for non-image files)")


class AudioUploadResponse(BaseModel):
    """Response model for audio file upload."""
    file_url: str = Field(..., description="URL of the uploaded audio file")
    file_type: str = Field(..., description="MIME type of the audio file")
    file_size: int = Field(..., ge=0, description="Size of the file in bytes")
    storage_path: str = Field(..., description="Internal storage path")
    session_id: Optional[str] = Field(None, description="Associated session ID")


# ============================================
# User Settings Models (Phase 1 - Lean)
# ============================================

class UserSettings(BaseModel):
    """
    Response model for user settings (Phase 1).
    
    Note: filler_word_detection controls DETECTION only.
    Filler REMOVAL is handled per-mode in application logic:
    - Practice: Always detect, never remove
    - Application: Detect per setting, always remove
    - Interview: Detect per setting, default no removal
    - Free Speak: Detect per setting, default no removal
    """
    user_id: str
    filler_word_detection: bool = Field(default=False, description="Enable filler word detection during transcription")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserSettingsUpdate(BaseModel):
    """Request model for updating user settings (Phase 1)."""
    filler_word_detection: Optional[bool] = Field(None, description="Enable filler word detection during transcription")


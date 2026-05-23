"""Pydantic models for request/response validation."""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Union
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


class SessionUpdate(BaseModel):
    """Request model for partially updating a session.

    All fields are optional; only fields set in the request are updated.
    Accepts `highlights` as either a JSON-encoded string (the frontend already
    stringifies on write) or a list of dicts.
    """
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    transcript: Optional[str] = Field(None, max_length=50000)
    refined_draft: Optional[str] = Field(None, max_length=50000)
    highlights: Optional[Union[List[dict], str]] = None
    clarity_score: Optional[int] = Field(None, ge=0, le=100)
    confidence_score: Optional[int] = Field(None, ge=0, le=100)
    filler_count: Optional[int] = Field(None, ge=0)
    words_per_minute: Optional[int] = Field(None, ge=0)


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
    monthly_credit_allowance: int
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
    session_type: str = Field(default="free", pattern="^(free|application|interview|practice|refine|section_refine)$", description="Type of session")
    desired_tone: Optional[str] = Field(None, max_length=50, description="Desired tone (confident, concise, reflective, etc.)")
    user_context: Optional[str] = Field(None, max_length=20000, description="Optional context from prompt input (company info, role details, etc.). Larger cap supports section_refine, which wraps the full current essay in the prompt.")
    reference_text: Optional[str] = Field(None, max_length=10000, description="Optional example text user likes or reference material")
    reference_file_url: Optional[str] = Field(None, max_length=500, description="URL of uploaded reference file (for images, use Vision API)")
    reference_file_type: Optional[str] = Field(None, max_length=100, description="MIME type of reference file (e.g., image/jpeg, application/pdf)")
    question: Optional[str] = Field(None, max_length=1000, description="Optional question/prompt the user is responding to")
    goal: Optional[str] = Field(None, max_length=500, description="Optional user's goal for the session")
    company_name: Optional[str] = Field(None, max_length=100, description="Company name for interview responses (used for research when context is empty)")
    # Explicit word limit from UI (preferred over prompt extraction)
    word_limit: Optional[int] = Field(None, ge=20, le=1000, description="Explicit word limit from UI dropdown. If provided, bypasses prompt-based extraction.")


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
    # Explicit word limit from UI (preferred over prompt extraction)
    word_limit: Optional[int] = Field(None, ge=20, le=1000, description="Explicit word limit from UI dropdown. If provided, bypasses prompt-based extraction.")


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


# ============================================
# Interview Refinement Models (GAP-011)
# ============================================

class InterviewRefinementRequest(BaseModel):
    """
    Request model for turn-based interview response refinement.
    
    This is a single-turn pipeline that produces:
    1. A refined, high-quality interview response (ALWAYS)
    2. Targeted feedback on the recorded response (ONLY if transcript provided)
    
    NOT Practice Mode. NOT multi-turn. NOT real-time.
    """
    # Required fields
    interview_question: str = Field(
        ...,
        min_length=5,
        max_length=1000,
        description="The interview question being answered (required)"
    )
    desired_style: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Desired response style, e.g., 'Confident but humble, story-driven, concise' (required)"
    )
    
    # Optional company context fields
    company_name: Optional[str] = Field(
        None,
        max_length=100,
        description="Company name for alignment (e.g., Google, Microsoft). LLM infers culture if provided."
    )
    company_role_context: Optional[str] = Field(
        None,
        max_length=2000,
        description="User-provided company & role context. Overrides all inferred context if provided."
    )
    
    # Optional transcript (enables feedback)
    transcript: Optional[str] = Field(
        None,
        max_length=50000,
        description="User's recorded answer transcript. If provided, feedback will be generated."
    )
    
    # Explicit word limit from UI (preferred over prompt extraction)
    word_limit: Optional[int] = Field(
        None,
        ge=20,
        le=1000,
        description="Explicit word limit from UI dropdown. If provided, bypasses prompt-based extraction."
    )
    
    # EXPLICITLY REJECTED FIELDS (validation will fail if these are provided)
    # These are out of scope for v1
    reference_text: Optional[str] = Field(
        None,
        description="NOT SUPPORTED in v1. Reference upload is disabled for Interview Response."
    )
    reference_file_url: Optional[str] = Field(
        None,
        description="NOT SUPPORTED in v1. Reference upload is disabled for Interview Response."
    )
    
    @classmethod
    def validate_no_reference_material(cls, v, info):
        """Reject any reference material - explicitly out of scope."""
        if v is not None:
            raise ValueError(
                "Reference material upload is not supported for Interview Response in v1. "
                "This feature may be added in a future release."
            )
        return v
    
    # Apply validators
    from pydantic import field_validator
    
    @field_validator('reference_text', 'reference_file_url')
    @classmethod
    def reject_reference_material(cls, v):
        if v is not None:
            raise ValueError(
                "Reference material upload is not supported for Interview Response in v1. "
                "This feature may be added in a future release."
            )
        return v


class FeedbackItem(BaseModel):
    """Individual feedback item for the user's recorded response."""
    category: str = Field(..., description="Feedback category (clarity, structure, alignment, tone, content)")
    observation: str = Field(..., description="What was observed in the response")
    suggestion: str = Field(..., description="Specific improvement suggestion")
    priority: str = Field(default="medium", pattern="^(high|medium|low)$", description="Priority level")


class InterviewRefinementResponse(BaseModel):
    """
    Response model for turn-based interview response refinement.
    
    Always includes:
    - refined_answer_text: The polished, submission-ready response
    - alignment_signals_used: What company/role signals were applied
    - improvements_applied: List of improvements made
    
    Conditionally includes (only if transcript was provided):
    - feedback: Targeted feedback on the recorded response
    - assumptions_or_limits: Any caveats about the refinement
    """
    # Always returned
    refined_answer_text: str = Field(
        ...,
        min_length=10,
        description="The refined, high-quality interview response"
    )
    alignment_signals_used: List[str] = Field(
        default_factory=list,
        description="Company/role alignment signals applied (e.g., 'innovation', 'customer obsession')"
    )
    improvements_applied: List[str] = Field(
        default_factory=list,
        description="List of improvements made to the response"
    )
    
    # Metadata
    context_source: str = Field(
        ...,
        pattern="^(user_provided|company_inferred|generic)$",
        description="Source of company/role context: user_provided, company_inferred, or generic"
    )
    
    # Conditionally returned (only if transcript was provided)
    feedback: Optional[List[FeedbackItem]] = Field(
        None,
        description="Targeted feedback on the recorded response (only if transcript provided)"
    )
    assumptions_or_limits: Optional[List[str]] = Field(
        None,
        description="Any assumptions made or limitations of the refinement"
    )
    suggested_follow_up: Optional[str] = Field(
        None,
        description="Optional suggestion for follow-up practice or improvement"
    )
    
    # Telemetry (for billing and observability)
    token_usage: Optional[Dict[str, int]] = Field(
        None,
        description="Token usage for this request (prompt_tokens, completion_tokens, total_tokens)"
    )


# ============================================
# Draft Models (Partial Save / Draft Naming)
# ============================================

class DraftCreate(BaseModel):
    """
    Request model for creating or updating a draft.
    
    Drafts are intentionally saved unfinished work.
    No LLM calls, no credits consumed, no audio persistence.
    """
    name: Optional[str] = Field(
        None,
        max_length=200,
        description="Draft name. If not provided, auto-generated from first ~8 words of question."
    )
    type: str = Field(
        default="free",
        pattern="^(free|application|interview)$",
        description="Session type"
    )
    question: Optional[str] = Field(None, max_length=1000)
    desired_style: Optional[str] = Field(None, max_length=500)
    word_limit: Optional[int] = Field(None, ge=20, le=1000)
    company_name: Optional[str] = Field(None, max_length=100)
    company_context: Optional[str] = Field(None, max_length=5000)
    transcript_text: Optional[str] = Field(None, max_length=50000)
    is_user_edited: bool = Field(default=False)


class DraftUpdate(BaseModel):
    """Request model for updating an existing draft."""
    name: Optional[str] = Field(None, max_length=200)
    question: Optional[str] = Field(None, max_length=1000)
    desired_style: Optional[str] = Field(None, max_length=500)
    word_limit: Optional[int] = Field(None, ge=20, le=1000)
    company_name: Optional[str] = Field(None, max_length=100)
    company_context: Optional[str] = Field(None, max_length=5000)
    transcript_text: Optional[str] = Field(None, max_length=50000)
    is_user_edited: Optional[bool] = None


class DraftResponse(BaseModel):
    """Response model for a draft."""
    id: str
    user_id: str
    name: str
    type: str
    question: Optional[str]
    desired_style: Optional[str]
    word_limit: Optional[int]
    company_name: Optional[str]
    company_context: Optional[str]
    transcript_text: str
    is_user_edited: bool
    created_at: datetime
    updated_at: datetime


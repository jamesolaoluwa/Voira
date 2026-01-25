"""
LLM refinement utilities using OpenAI API.
Handles transcript refinement with proper prompt engineering, voice profile integration,
and context-aware prompts for different session types.

VOICE PROFILE CONTRACT (GAP-001):
- Voice profiles affect ONLY LLM refinement output, NEVER transcription
- Deepgram remains verbatim speech-to-text
- Every LLM call MUST receive a validated voice profile (custom or default)
- Voice profile is injected into SYSTEM prompt only
- Single loading path via get_voice_profile_for_llm() - no bypasses allowed

IMPLEMENTATION NOTES:
- VoiceProfileMetrics counters are per-process (not distributed)
- For production observability, emit metrics to DataDog/Prometheus
- Profile TTL cache reduces DB load (default: 5 minutes)
- Cache keys use hashed user_id for privacy in logs
"""
import logging
import os
import re
import hashlib
from time import time
from typing import Optional, Dict, List, Callable, Tuple
from dataclasses import dataclass, field
from pydantic import BaseModel, Field, field_validator, ValidationError
from openai import OpenAI
import tiktoken
from config import settings
from db import supabase

# Import context-aware filler processing from adaptive analytics
from adaptive_analytics import remove_fillers_context_aware

logger = logging.getLogger(__name__)


# ============================================
# Configuration Constants
# ============================================

# TTL cache for voice profiles (reduces DB load)
VOICE_PROFILE_CACHE_TTL_SECONDS = 300  # 5 minutes


# ============================================
# Public API Exports (GAP-001 finalized)
# ============================================
__all__ = [
    # Core functions
    "refine_transcript",
    "analyze_and_refine",
    "get_voice_profile_for_llm",
    # Types
    "VoiceProfile",
    "VoiceProfileSchema",  # Alias for backward compatibility
    "VoiceProfileResult",
    "VoiceProfileMetrics",
    # Constants
    "SYSTEM_DEFAULT_VOICE_PROFILE",
    "DEFAULT_VOICE_PROFILE",  # Legacy dict alias
    # Utility functions (for testing)
    "build_voice_profile_system_instructions",
    "build_context_specific_system_prompt",
    "get_voice_profile_metrics",
    "clear_voice_profile_cache",
]


# ============================================
# Voice Profile Telemetry (GAP-001 Requirement #6)
# ============================================

@dataclass
class VoiceProfileMetrics:
    """
    Telemetry counters for voice profile usage.
    
    NOTE: These counters are per-process and NOT thread-safe.
    For production observability, emit to external metrics systems
    (DataDog, Prometheus, etc.) rather than relying on these counters.
    """
    default_used: int = 0
    custom_used: int = 0
    validation_failures: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    
    def increment_default(self):
        self.default_used += 1
    
    def increment_custom(self):
        self.custom_used += 1
    
    def increment_validation_failure(self):
        self.validation_failures += 1
    
    def to_dict(self) -> Dict:
        return {
            "voice_profile.default.used": self.default_used,
            "voice_profile.custom.used": self.custom_used,
            "voice_profile.validation.failures": self.validation_failures,
            "voice_profile.cache.hits": self.cache_hits,
            "voice_profile.cache.misses": self.cache_misses,
        }

# Global metrics instance
_voice_profile_metrics = VoiceProfileMetrics()

# In-memory TTL cache for voice profiles: {user_id: (profile_dict, timestamp)}
_voice_profile_cache: Dict[str, Tuple[Dict, float]] = {}


def get_voice_profile_metrics() -> Dict:
    """Get current voice profile telemetry metrics."""
    return _voice_profile_metrics.to_dict()


# ============================================
# Voice Profile Schema (GAP-001 Requirement #3)
# ============================================
# 
# Pydantic model for voice profile validation.
# ALL voice profiles (custom and default) MUST validate against this schema.
# Validation failures are logged and fall back to defaults safely.
# ============================================

class VoiceProfile(BaseModel):
    """
    Validated voice profile schema for LLM refinement.
    
    This is the CANONICAL schema for voice profiles.
    All profiles loaded from DB or defaults MUST pass this validation.
    
    CACHE KEY COMPONENTS:
    - user_id (external)
    - version (required for cache invalidation)
    - is_user_profile (external)
    
    Cache key format: sys_voice:{user_id}:{version}:{is_user_profile}:v3
    """
    # Core style settings
    tone: str = Field(
        default="professional",
        description="Target tone (professional, casual, confident, reflective, etc.)"
    )
    confidence_level: int = Field(
        default=65,
        ge=0,
        le=100,
        description="Target confidence level (0-100)"
    )
    emotional_depth: int = Field(
        default=50,
        ge=0,
        le=100,
        description="Emotional depth in writing (0-100)"
    )
    sentence_length: str = Field(
        default="medium",
        pattern="^(short|medium|long)$",
        description="Preferred sentence length style"
    )
    
    # Vocabulary preferences
    preferred_words: List[str] = Field(
        default_factory=list,
        max_length=50,
        description="Words to use naturally when appropriate"
    )
    avoided_words: List[str] = Field(
        default_factory=list,
        max_length=50,
        description="Words to NEVER use"
    )
    
    # Style example
    example_responses: str = Field(
        default="",
        max_length=2000,
        description="Example of user's preferred writing style"
    )
    
    # Cache versioning (MANDATORY for cache safety)
    version: int = Field(
        default=1,
        ge=1,
        description="Profile version for cache invalidation. Increment on any profile change."
    )
    
    @field_validator('preferred_words', 'avoided_words', mode='before')
    @classmethod
    def ensure_list(cls, v):
        """Ensure word lists are always lists, not None."""
        if v is None:
            return []
        if isinstance(v, str):
            return [w.strip() for w in v.split(',') if w.strip()]
        return list(v)
    
    @field_validator('example_responses', mode='before')
    @classmethod
    def ensure_string(cls, v):
        """Ensure example_responses is always a string."""
        if v is None:
            return ""
        return str(v)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for legacy compatibility."""
        return {
            "tone": self.tone,
            "confidence_level": self.confidence_level,
            "emotional_depth": self.emotional_depth,
            "sentence_length": self.sentence_length,
            "preferred_words": self.preferred_words,
            "avoided_words": self.avoided_words,
            "example_responses": self.example_responses,
            "version": self.version,
        }
    
    def cache_key_component(self) -> str:
        """Generate cache key component for this profile."""
        return f"v{self.version}"


# Alias for backward compatibility
VoiceProfileSchema = VoiceProfile

# SYSTEM DEFAULT VOICE PROFILE
# Used when user has no custom profile or validation fails.
# This is EXPLICIT, not implicit or silent.
SYSTEM_DEFAULT_VOICE_PROFILE = VoiceProfile(
    tone="professional",
    confidence_level=65,
    emotional_depth=50,
    sentence_length="medium",
    preferred_words=[],
    avoided_words=[],
    example_responses="",
    version=1,
)

# Legacy compatibility alias
DEFAULT_VOICE_PROFILE = SYSTEM_DEFAULT_VOICE_PROFILE.to_dict()


def validate_voice_profile(profile_data: Optional[Dict], user_id: Optional[str] = None) -> Tuple[VoiceProfileSchema, bool]:
    """
    Validate voice profile data against schema.
    
    This is the ONLY validation path for voice profiles.
    
    Args:
        profile_data: Raw profile data from DB or other source
        user_id: User ID for logging (optional)
    
    Returns:
        Tuple of (validated_profile, validation_succeeded)
        - If validation fails, returns SYSTEM_DEFAULT with False
        - If validation succeeds, returns validated profile with True
    """
    if profile_data is None:
        logger.debug(f"[VoiceProfile:Validate] No profile data provided for user={user_id}, using system default")
        return SYSTEM_DEFAULT_VOICE_PROFILE, False
    
    try:
        validated = VoiceProfileSchema(**profile_data)
        logger.debug(f"[VoiceProfile:Validate] Profile validated successfully for user={user_id}, version={validated.version}")
        return validated, True
    except ValidationError as e:
        _voice_profile_metrics.increment_validation_failure()
        logger.error(
            f"[VoiceProfile:Validate] VALIDATION FAILED for user={user_id}: {e.errors()}. "
            f"Falling back to system default. This indicates corrupt profile data."
        )
        return SYSTEM_DEFAULT_VOICE_PROFILE, False
    except Exception as e:
        _voice_profile_metrics.increment_validation_failure()
        logger.error(
            f"[VoiceProfile:Validate] Unexpected error validating profile for user={user_id}: {e}. "
            f"Falling back to system default."
        )
        return SYSTEM_DEFAULT_VOICE_PROFILE, False

# ============================================
# Filler Word Removal (Post-Processing)
# ============================================

def remove_fillers_from_text(text: str) -> str:
    """
    Remove filler words from text using context-aware processing.
    
    This function uses the adaptive analytics engine's ContextAwareFillerProcessor
    which provides:
    - Position-aware removal (sentence start vs mid-sentence)
    - Repetition pattern handling
    - Sentence structure preservation
    - Semantic loss prevention
    
    Used for:
    - Application mode: Always remove fillers from output
    - Other modes: Based on mode-specific rules in application logic
    
    Args:
        text: Raw transcript or text with potential filler words
    
    Returns:
        Text with filler words removed (context-aware)
    """
    if not text:
        return text
    
    processed_text, fillers_removed = remove_fillers_context_aware(text)
    
    if fillers_removed > 0:
        logger.debug(f"[FillerRemoval] Removed {fillers_removed} fillers using context-aware processing")
    
    return processed_text


def should_remove_fillers_for_mode(session_type: str) -> bool:
    """
    Determine if fillers should be removed based on session type.
    
    Mode-based removal rules (hardcoded product defaults):
    - Practice: NEVER remove (keep for learning feedback)
    - Application: ALWAYS remove (clean output for submission)
    - Interview: Default OFF (keep raw by default)
    - Free Speak: Default OFF (keep raw by default)
    
    Args:
        session_type: One of 'practice', 'application', 'interview', 'free'
    
    Returns:
        True if fillers should be removed, False otherwise
    """
    # Product rule: Application mode ALWAYS removes fillers
    if session_type == 'application':
        return True
    
    # Product rule: Practice mode NEVER removes fillers
    if session_type == 'practice':
        return False
    
    # Interview and Free Speak: Default to NOT removing
    # (User could opt-in via future per-mode settings, but for now, default OFF)
    return False


# ============================================
# Prompt Block Caching (In-Memory, Per-Process)
# ============================================

# In-memory cache for prompt blocks (per-process, safe to clear on restart)
_PROMPT_BLOCK_CACHE: dict[str, str] = {}

# Feature flag for prompt caching (enabled only in DEV)
ENABLE_PROMPT_CACHING = os.getenv("ENV", "prod") == "dev"

# Redis feature flag (opt-in, disabled by default)
ENABLE_REDIS_PROMPT_CACHE = os.getenv("ENABLE_REDIS_PROMPT_CACHE") == "true"

# NOTE:
# TTL exists for memory safety and automatic cleanup.
# Prompt correctness relies on versioned cache keys, not TTL expiry.
# Redis cache TTL (1 hour)
REDIS_PROMPT_CACHE_TTL_SECONDS = 60 * 60

# Maximum cache size (soft limit - clears cache when exceeded, in-memory only)
MAX_PROMPT_CACHE_SIZE = 128

# Cache metrics (in-memory counters for observability)
_PROMPT_CACHE_METRICS = {
    "hits": 0,
    "misses": 0,
    "sets": 0,
    "redis_bypass": 0,
}

# Redis client (initialized lazily if Redis is enabled)
redis_client = None

if ENABLE_REDIS_PROMPT_CACHE:
    try:
        import redis
        # decode_responses=True ensures cached prompt blocks are returned as strings,
        # preventing downstream prompt assembly errors.
        redis_client = redis.Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )
    except ImportError:
        logger.warning("Redis module not available. Install redis>=5.0.0 to use Redis caching.")
        redis_client = None
    except Exception as e:
        logger.warning(f"Failed to initialize Redis client: {e}. Falling back to in-memory cache.")
        redis_client = None


def get_or_cache_block(cache_key: str, builder: Callable[[], str]) -> str:
    """
    Get a prompt block from cache or build it if not cached.
    
    Cache priority:
    Redis (shared, persistent) → In-memory (process-local) → Build fresh
    
    Args:
        cache_key: Unique cache key for the prompt block
        builder: Callable that builds the prompt block if not cached
    
    Returns:
        Cached or newly built prompt block
    """
    if not ENABLE_PROMPT_CACHING:
        return builder()
    
    # Try Redis cache first (if enabled)
    if ENABLE_REDIS_PROMPT_CACHE:
        if not redis_client:
            # Redis enabled but client unavailable - track bypass and fall back
            _PROMPT_CACHE_METRICS["redis_bypass"] += 1
        else:
            try:
                cached = redis_client.get(cache_key)
                if cached:
                    _PROMPT_CACHE_METRICS["hits"] += 1
                    return cached
                
                _PROMPT_CACHE_METRICS["misses"] += 1
                value = builder()
                redis_client.setex(
                    cache_key,
                    REDIS_PROMPT_CACHE_TTL_SECONDS,
                    value,
                )
                _PROMPT_CACHE_METRICS["sets"] += 1
                return value
            except Exception as e:
                logger.warning(f"Redis cache error (falling back to in-memory): {e}")
                # Redis error - track bypass and fall through to in-memory cache
                _PROMPT_CACHE_METRICS["redis_bypass"] += 1
    
    # Fallback: in-memory cache
    if cache_key in _PROMPT_BLOCK_CACHE:
        _PROMPT_CACHE_METRICS["hits"] += 1
        return _PROMPT_BLOCK_CACHE[cache_key]
    
    _PROMPT_CACHE_METRICS["misses"] += 1
    value = builder()
    
    # NOTE:
    # Cache is cleared entirely when max size is reached to keep behavior
    # deterministic and avoid partial-eviction bugs in early-phase caching.
    if len(_PROMPT_BLOCK_CACHE) >= MAX_PROMPT_CACHE_SIZE:
        _PROMPT_BLOCK_CACHE.clear()
    
    _PROMPT_BLOCK_CACHE[cache_key] = value
    _PROMPT_CACHE_METRICS["sets"] += 1
    return value


def get_prompt_cache_metrics() -> dict:
    """
    Get current prompt cache metrics (dev use only).
    
    Returns:
        Dictionary with cache metrics:
        {
            "enabled": bool,
            "entries": int,
            "hits": int,
            "misses": int,
            "sets": int,
        }
    """
    return {
        "enabled": ENABLE_PROMPT_CACHING,
        "entries": len(_PROMPT_BLOCK_CACHE),
        **_PROMPT_CACHE_METRICS,
    }


# ============================================
# Prompt Configuration
# ============================================

# Feature-specific output caps (tokens)
OUTPUT_CAPS = {
    "practice": 400,
    "interview": 600,
    "application": 1000,
    "refine": 800,
    "section_refine": 400,  # Section refinement should return smaller chunks
    "free": 800,
}

# Maximum input tokens (safe margin below model limit)
MAX_INPUT_TOKENS = 120_000  # GPT-4o-mini context limit is 128k

# Cache key: sys_base:v1
# Base system prompt for refinement (optimized for token efficiency)
BASE_SYSTEM_PROMPT = """You are an expert writing coach refining spoken or draft content into polished, submission-ready writing.

Input may include filler words, repetitions, and informal phrasing.

Your rules:
- Remove filler words while preserving natural flow
- Improve clarity and structure without changing meaning
- Preserve the user's authentic voice and perspective
- Do NOT invent new information
- Do NOT over-formalize unless requested
- Never sound generic or AI-written

Output should sound fully human—like careful self-editing by the user."""


def words_to_tokens(words: int) -> int:
    """
    Convert word count to approximate token count.
    Uses safe approximation: ~1.33 tokens per word (English text).
    """
    return int(words * 1.33)


# Regex to extract word limits from user input
WORD_LIMIT_REGEX = re.compile(
    r'(\b\d{2,4}\b)\s*(?:word|words)\b', re.IGNORECASE
)

# Minimum reasonable word limit (prevents broken outputs from accidental tiny limits)
MIN_REASONABLE_WORD_LIMIT = 50


def extract_word_limit(*texts) -> Optional[int]:
    """
    Extract word limit from user input (question, user_context, goal).
    Looks for patterns like "500 words", "1000 word", etc.
    
    Extracts ALL word limits and returns the smallest (most conservative) value.
    This handles cases like "500 words max, ideally closer to 300 words" correctly.
    
    Args:
        *texts: Variable number of text strings to search
        
    Returns:
        Smallest word limit as integer if found, None otherwise
    """
    limits = []
    for text in texts:
        if not text:
            continue
        limits.extend(
            int(match.group(1))
            for match in WORD_LIMIT_REGEX.finditer(text)
        )
    return min(limits) if limits else None


def estimate_tokens(text: str, model: str = "gpt-4o-mini") -> int:
    """
    Estimate token count for text using tiktoken.
    
    Args:
        text: Text to estimate tokens for
        model: Model name (default: gpt-4o-mini)
        
    Returns:
        Estimated token count
    """
    try:
        enc = tiktoken.encoding_for_model(model)
        return len(enc.encode(text))
    except Exception as e:
        logger.warning(f"Error estimating tokens for model {model}, using fallback: {e}")
        # Fallback: approximate 1 token = 4 characters (safe estimate)
        return len(text) // 4


# ============================================
# Voice Profile Loading (GAP-001 Requirements #1, #2, #4)
# ============================================
# 
# SINGLE LOADING PATH - NO BYPASSES ALLOWED
# 
# All LLM flows MUST use get_voice_profile_for_llm().
# Direct DB calls for voice profiles are FORBIDDEN elsewhere.
#
# This ensures:
# 1. Voice profile is loaded ONCE per request
# 2. ALL profiles are validated against VoiceProfileSchema
# 3. Fallback to SYSTEM_DEFAULT is explicit and logged
# 4. Telemetry is consistent
# ============================================


def _fetch_voice_profile_from_db(user_id: str) -> Optional[Dict]:
    """
    LOW-LEVEL: Fetch raw voice profile from database.
    
    ⚠️ INTERNAL USE ONLY - Do not call directly from LLM flows.
    Use get_voice_profile_for_llm() instead.
    
    Args:
        user_id: User ID to fetch voice profile for
    
    Returns:
        Raw profile dictionary or None if not found
    """
    try:
        response = supabase.table("voice_profiles").select("*").eq("user_id", user_id).execute()
        if response.data and len(response.data) > 0:
            profile = response.data[0]
            # Include version field for cache key safety
            return {
                "tone": profile.get("tone"),
                "confidence_level": profile.get("confidence_level"),
                "emotional_depth": profile.get("emotional_depth"),
                "sentence_length": profile.get("sentence_length"),
                "preferred_words": profile.get("preferred_words"),
                "avoided_words": profile.get("avoided_words"),
                "example_responses": profile.get("example_responses"),
                "version": profile.get("version", 1),  # Default to 1 if not set
            }
        return None
    except Exception as e:
        logger.error(f"[VoiceProfile:DB] Error fetching profile for user {user_id}: {e}")
        return None


def _hash_user_id(user_id: Optional[str]) -> str:
    """
    Hash user_id for privacy-safe logging and cache keys.
    
    Returns first 12 chars of SHA-256 hash, or 'anonymous' if no user_id.
    This prevents raw user IDs from appearing in logs while still
    allowing correlation of requests from the same user.
    """
    if not user_id:
        return "anonymous"
    return hashlib.sha256(user_id.encode()).hexdigest()[:12]


def _get_cached_profile(user_id: str) -> Optional[Dict]:
    """
    Get profile from TTL cache if not expired.
    
    Returns None if not in cache or expired.
    """
    if user_id in _voice_profile_cache:
        profile, timestamp = _voice_profile_cache[user_id]
        if time() - timestamp < VOICE_PROFILE_CACHE_TTL_SECONDS:
            return profile
        # Expired - remove from cache
        del _voice_profile_cache[user_id]
    return None


def _set_cached_profile(user_id: str, profile: Dict) -> None:
    """Store profile in TTL cache with current timestamp."""
    _voice_profile_cache[user_id] = (profile, time())


def clear_voice_profile_cache(user_id: Optional[str] = None) -> None:
    """
    Clear voice profile cache.
    
    Call this when a user updates their voice profile to ensure
    the next request gets fresh data.
    
    Args:
        user_id: If provided, clear only this user's cache. Otherwise clear all.
    """
    global _voice_profile_cache
    if user_id:
        _voice_profile_cache.pop(user_id, None)
        logger.info(f"[VoiceProfile:Cache] Cleared cache for user_hash={_hash_user_id(user_id)}")
    else:
        _voice_profile_cache = {}
        logger.info("[VoiceProfile:Cache] Cleared all profile cache")


@dataclass
class VoiceProfileResult:
    """
    Result of voice profile loading.
    
    Encapsulates all information needed for LLM refinement:
    - The validated profile (always non-None)
    - Whether it's the user's custom profile
    - Cache key components for prompt caching
    - Loading metadata for observability
    """
    profile: VoiceProfile
    is_user_profile: bool
    user_id: Optional[str]
    loaded_from_cache: bool = False
    loaded_at: float = field(default_factory=time)
    
    def to_dict(self) -> Dict:
        """Legacy compatibility: return profile as dict."""
        return self.profile.to_dict()
    
    @property
    def cache_key(self) -> str:
        """
        Generate privacy-safe cache key for this profile.
        
        Format: {hashed_user_id}:{version}:{is_user}
        Uses hashed user_id to prevent PII in logs/cache keys.
        Used for prompt caching safety (GAP-001 Requirement #5).
        """
        user_hash = _hash_user_id(self.user_id)
        version_part = self.profile.version
        user_type = "custom" if self.is_user_profile else "default"
        return f"{user_hash}:{version_part}:{user_type}"
    
    @property
    def age_seconds(self) -> float:
        """How long ago this profile was loaded (for debugging)."""
        return time() - self.loaded_at


def get_voice_profile_for_llm(
    user_id: Optional[str],
    provided_profile: Optional[Dict] = None,
    endpoint: str = "unknown",
    session_type: str = "unknown"
) -> VoiceProfileResult:
    """
    Get validated voice profile for LLM refinement.
    
    THIS IS THE SINGLE ENTRY POINT FOR VOICE PROFILE LOADING.
    ALL LLM FLOWS MUST USE THIS FUNCTION - NO EXCEPTIONS.
    
    Guarantees:
    1. Always returns a validated VoiceProfileResult (never None)
    2. Profile is either user's custom or SYSTEM_DEFAULT
    3. Telemetry is logged for every call (with hashed user_id for privacy)
    4. Validation failures fall back safely to SYSTEM_DEFAULT
    5. TTL cache reduces DB load (5 min default)
    
    Args:
        user_id: User ID to fetch profile for (can be None)
        provided_profile: Pre-fetched profile dict (avoids redundant DB call)
        endpoint: Calling endpoint for telemetry (refine, analyze, section_refine)
        session_type: Session type for telemetry
    
    Returns:
        VoiceProfileResult with validated profile and metadata
    """
    user_hash = _hash_user_id(user_id)  # Privacy-safe for logging
    
    # CASE 1: Profile already provided (e.g., from parent request)
    if provided_profile is not None:
        validated, succeeded = validate_voice_profile(provided_profile, user_id)
        if succeeded:
            _voice_profile_metrics.increment_custom()
            _voice_profile_metrics.cache_hits += 1
            logger.info(
                f"[VoiceProfile] voice_profile_custom_used=true "
                f"user_hash={user_hash} endpoint={endpoint} session_type={session_type} "
                f"source=provided version={validated.version}"
            )
            return VoiceProfileResult(
                profile=validated, 
                is_user_profile=True, 
                user_id=user_id,
                loaded_from_cache=False
            )
        else:
            # Validation failed - use system default
            _voice_profile_metrics.increment_default()
            logger.warning(
                f"[VoiceProfile] voice_profile_default_used=true "
                f"user_hash={user_hash} endpoint={endpoint} session_type={session_type} "
                f"reason=provided_profile_validation_failed"
            )
            return VoiceProfileResult(
                profile=SYSTEM_DEFAULT_VOICE_PROFILE, 
                is_user_profile=False, 
                user_id=user_id,
                loaded_from_cache=False
            )
    
    # CASE 2: No user_id - use system default
    if not user_id:
        _voice_profile_metrics.increment_default()
        logger.info(
            f"[VoiceProfile] voice_profile_default_used=true "
            f"user_hash=anonymous endpoint={endpoint} session_type={session_type} "
            f"reason=no_user_id"
        )
        return VoiceProfileResult(
            profile=SYSTEM_DEFAULT_VOICE_PROFILE, 
            is_user_profile=False, 
            user_id=None,
            loaded_from_cache=False
        )
    
    # CASE 3: Check TTL cache first
    cached_profile = _get_cached_profile(user_id)
    if cached_profile is not None:
        validated, succeeded = validate_voice_profile(cached_profile, user_id)
        if succeeded:
            _voice_profile_metrics.increment_custom()
            _voice_profile_metrics.cache_hits += 1
            logger.debug(
                f"[VoiceProfile] voice_profile_cache_hit=true "
                f"user_hash={user_hash} endpoint={endpoint} version={validated.version}"
            )
            return VoiceProfileResult(
                profile=validated, 
                is_user_profile=True, 
                user_id=user_id,
                loaded_from_cache=True
            )
        # Cached profile invalid - fall through to DB fetch
    
    # CASE 4: Fetch from database
    _voice_profile_metrics.cache_misses += 1
    raw_profile = _fetch_voice_profile_from_db(user_id)
    
    if raw_profile is None:
        # No profile in DB - use system default
        _voice_profile_metrics.increment_default()
        logger.info(
            f"[VoiceProfile] voice_profile_default_used=true "
            f"user_hash={user_hash} endpoint={endpoint} session_type={session_type} "
            f"reason=no_profile_in_db"
        )
        return VoiceProfileResult(
            profile=SYSTEM_DEFAULT_VOICE_PROFILE, 
            is_user_profile=False, 
            user_id=user_id,
            loaded_from_cache=False
        )
    
    # CASE 5: Validate fetched profile and cache it
    validated, succeeded = validate_voice_profile(raw_profile, user_id)
    
    if succeeded:
        # Cache the valid profile for future requests
        _set_cached_profile(user_id, raw_profile)
        _voice_profile_metrics.increment_custom()
        logger.info(
            f"[VoiceProfile] voice_profile_custom_used=true "
            f"user_hash={user_hash} endpoint={endpoint} session_type={session_type} "
            f"tone={validated.tone} confidence={validated.confidence_level} version={validated.version}"
        )
        return VoiceProfileResult(
            profile=validated, 
            is_user_profile=True, 
            user_id=user_id,
            loaded_from_cache=False
        )
    else:
        # Validation failed - use system default (already logged in validate_voice_profile)
        _voice_profile_metrics.increment_default()
        logger.warning(
            f"[VoiceProfile] voice_profile_default_used=true "
            f"user_hash={user_hash} endpoint={endpoint} session_type={session_type} "
            f"reason=db_profile_validation_failed"
        )
        return VoiceProfileResult(
            profile=SYSTEM_DEFAULT_VOICE_PROFILE, 
            is_user_profile=False, 
            user_id=user_id,
            loaded_from_cache=False
        )


# Legacy compatibility function (deprecated - use get_voice_profile_for_llm instead)
def get_voice_profile(user_id: str) -> Optional[Dict]:
    """
    DEPRECATED: Use get_voice_profile_for_llm() instead.
    
    This function exists only for backward compatibility.
    It does NOT validate profiles or provide telemetry.
    """
    logger.warning(f"[VoiceProfile] DEPRECATED: get_voice_profile() called directly for user {user_id}. Use get_voice_profile_for_llm() instead.")
    result = _fetch_voice_profile_from_db(user_id)
    return result


def build_voice_profile_system_instructions(
    voice_profile_result: VoiceProfileResult
) -> str:
    """
    Convert voice profile into LLM system prompt instructions.
    
    GAP-001 REQUIREMENT #7: PROMPT CONSTRUCTION RULES
    - Voice profile is injected as a SYSTEM message
    - Placed BEFORE user transcript
    - Instructs style ONLY
    - Explicitly forbids content invention
    - Explicitly forbids copying from references
    
    This is injected ONLY into the system prompt, never the user prompt.
    
    Args:
        voice_profile_result: Validated VoiceProfileResult from get_voice_profile_for_llm()
    
    Returns:
        System prompt block with voice guidance and safety rules
    """
    profile = voice_profile_result.profile
    is_user_profile = voice_profile_result.is_user_profile
    
    # MANDATORY SAFETY RULES (always included)
    safety_rules = """
CRITICAL CONSTRAINTS:
- Do NOT invent new facts, experiences, or information
- Do NOT copy content from reference materials - use them only for style guidance
- PRESERVE the user's original meaning and experiences
- ONLY refine style, tone, and structure"""
    
    if not is_user_profile:
        # System default profile - clear but not over-constrained
        return f"""VOICE GUIDANCE (System Default):
- Maintain a professional, polished tone
- Balance clarity with authenticity
- Adapt to the user's natural speaking style in the transcript
- Keep language natural and human-sounding
{safety_rules}
"""
    
    # Build detailed guidance from user's custom profile
    lines = ["VOICE PROFILE GUIDANCE (User's Custom Style Preferences):"]
    
    # Tone
    lines.append(f"- Target Tone: {profile.tone}")
    
    # Confidence level interpretation
    if profile.confidence_level >= 80:
        lines.append("- Confidence: HIGH - use assertive language, strong statements, decisive phrasing")
    elif profile.confidence_level >= 60:
        lines.append("- Confidence: MODERATE - balance confidence with humility, measured assertions")
    else:
        lines.append("- Confidence: MEASURED - use thoughtful, reflective language, exploratory phrasing")
    
    # Emotional depth interpretation
    if profile.emotional_depth >= 70:
        lines.append("- Emotional Depth: HIGH - include personal feelings, reflections, and emotional context")
    elif profile.emotional_depth >= 40:
        lines.append("- Emotional Depth: MODERATE - balance facts with occasional personal insights")
    else:
        lines.append("- Emotional Depth: LOW - focus on facts, outcomes, and concrete details")
    
    # Sentence style
    sentence_style_map = {
        'short': "- Sentence Style: CONCISE - punchy sentences, direct communication, minimal filler",
        'medium': "- Sentence Style: BALANCED - mix of sentence lengths, natural flow",
        'long': "- Sentence Style: FLOWING - detailed sentences with nuance, complex structures allowed",
    }
    lines.append(sentence_style_map.get(profile.sentence_length, sentence_style_map['medium']))
    
    # Preferred vocabulary
    if profile.preferred_words and len(profile.preferred_words) > 0:
        words_str = ', '.join(profile.preferred_words[:10])
        lines.append(f"- Preferred Vocabulary (use naturally when appropriate): {words_str}")
    
    # Avoided vocabulary
    if profile.avoided_words and len(profile.avoided_words) > 0:
        words_str = ', '.join(profile.avoided_words[:10])
        lines.append(f"- AVOID These Words/Phrases: {words_str}")
    
    # Example style
    if profile.example_responses and len(profile.example_responses.strip()) > 20:
        example_text = profile.example_responses[:500] if len(profile.example_responses) > 500 else profile.example_responses
        lines.append(f"\n- Example of User's Writing Style (match this voice):\n\"{example_text}\"")
    
    # Add safety rules at the end
    lines.append(safety_rules)
    
    return '\n'.join(lines)


# Legacy compatibility wrapper
def _build_voice_profile_system_instructions_legacy(voice_profile: Dict, is_user_profile: bool = True) -> str:
    """
    DEPRECATED: Legacy wrapper for backward compatibility.
    Converts dict to VoiceProfileResult and calls new function.
    """
    validated, _ = validate_voice_profile(voice_profile)
    result = VoiceProfileResult(
        profile=validated,
        is_user_profile=is_user_profile,
        user_id=None
    )
    return build_voice_profile_system_instructions(result)


def build_session_context_prompt(session_type: str) -> str:
    """
    Build session-specific context prompt block.
    
    Args:
        session_type: Type of session (free, application, interview, practice, refine, section_refine)
    
    Returns:
        Session context prompt block
    
    Note:
        Cache key: sys_ctx:{session_type}:{variant}:v1
        Where variant indicates prompt variant (e.g., 'default', 'with_context', 'with_research')
        Currently all variants use the same prompt block, but this may change in the future.
    """
    # Cache key: sys_ctx:{session_type}:default:v1
    if session_type == "interview":
        return """
ADDITIONAL CONTEXT FOR INTERVIEW RESPONSES:
- You are refining responses for behavioral interviews
- Consider the company culture, values, and role requirements provided by the user
- Reference industry best practices for interview responses
- Emphasize concrete examples, impact, and results (STAR method principles)
- Maintain authenticity while highlighting relevant skills and experiences
- The output should demonstrate the candidate's fit for the role and company culture
"""
    
    elif session_type == "application":
        return """
ADDITIONAL CONTEXT FOR APPLICATION ESSAYS:
- You are refining application essays (college admissions, scholarships, etc.)
- Reference award-winning, non-AI written essays as style guides (maintain authentic voice, avoid generic phrasing)
- Emphasize the user's unique story and perspective
- Ensure the essay demonstrates personal growth, reflection, and authenticity
- Avoid clichéd language and overused phrases
- The output should stand out while remaining genuine and compelling
- Maintain the user's authentic voice—never sound generic or AI-generated
"""
    
    elif session_type == "practice":
        return """
ADDITIONAL CONTEXT FOR PRACTICE MODE:
- You are refining practice responses for skill development
- Provide clear, actionable feedback while maintaining the user's voice
- Emphasize improvement opportunities and strengths
- Keep the tone supportive and encouraging
- The output should help the user practice and improve their communication skills
"""
    
    elif session_type == "refine":
        return """
ADDITIONAL CONTEXT FOR DRAFT REFINEMENT:
- You are refining an existing written draft based on user voice instructions
- Incorporate the user's requested changes while maintaining the original voice
- Pay close attention to the user's specific instructions for what to change
- Preserve the core message and structure unless explicitly requested to change
- The output should reflect the user's intended improvements while staying authentic
"""
    
    elif session_type == "section_refine":
        return """
ADDITIONAL CONTEXT FOR SECTION REFINEMENT:
- You are editing a SPECIFIC SECTION of an already-refined essay
- Return ONLY the refined version of the highlighted section, NOT the full essay
- The refined text should directly replace the highlighted section
- Preserve tone, voice, and style consistency with the surrounding text
- Keep similar length unless the instruction specifically asks for expansion/condensation
- Ensure the edited section flows naturally with the rest of the essay
"""
    
    else:  # free
        return """
ADDITIONAL CONTEXT FOR FREE SPEAK:
- You are refining general speech into polished written content
- Maintain a conversational yet polished tone
- Keep the user's authentic voice and style
- The output should be natural, clear, and engaging
"""


# NOTE: build_voice_profile_block() has been replaced by build_voice_profile_system_instructions()
# The old function is kept for backward compatibility but marked as deprecated.
# All new code should use build_voice_profile_system_instructions() via get_voice_profile_for_llm().


def get_session_context_variant(
    session_type: str,
    user_context: Optional[str],
    company_name: Optional[str],
) -> str:
    """
    Determine session context variant for cache key.
    
    Args:
        session_type: Type of session (free, application, interview, practice, refine)
        user_context: Optional user-provided context
        company_name: Optional company name (for interview research)
    
    Returns:
        Variant identifier: 'default', 'with_context', or 'with_research'
    """
    if session_type != "interview":
        return "default"
    if user_context:
        return "with_context"
    if company_name:
        return "with_research"
    return "default"


def build_context_specific_system_prompt(
    session_type: str,
    voice_profile_result: VoiceProfileResult,
    user_context: Optional[str] = None,
    company_name: Optional[str] = None
) -> str:
    """
    Build context-specific system prompt from modular blocks.
    
    Assembles system prompt using explicit block structure with optional caching.
    Voice profile is ALWAYS included (either user's profile or defaults).
    
    REQUIREMENT: voice_profile_result must come from get_voice_profile_for_llm().
    This ensures validated profile data and consistent cache keys.
    
    Args:
        session_type: Type of session (free, application, interview, practice, refine, section_refine)
        voice_profile_result: VoiceProfileResult from get_voice_profile_for_llm() - REQUIRED
        user_context: Optional user-provided context (for variant detection)
        company_name: Optional company name (for variant detection)
    
    Returns:
        Context-specific system prompt with voice profile instructions
    """
    # Cache key: sys_base:v1
    base_prompt = get_or_cache_block(
        "sys_base:v1",
        lambda: BASE_SYSTEM_PROMPT
    )
    
    # Cache key: sys_ctx:{session_type}:{variant}:v1
    # Variant-aware caching ensures interview variants (with_context, with_research) use distinct cache keys
    variant = get_session_context_variant(session_type, user_context, company_name)
    ctx_key = f"sys_ctx:{session_type}:{variant}:v1"
    session_context = get_or_cache_block(
        ctx_key,
        lambda: build_session_context_prompt(session_type)
    )
    
    # Build prompt blocks
    system_blocks = [
        base_prompt,
        session_context,
    ]
    
    # Voice profile is ALWAYS included for consistent output
    # Use cache_key from VoiceProfileResult for prompt-caching efficiency
    if voice_profile_result.is_user_profile and voice_profile_result.cache_key:
        # Cache user's voice profile instructions using the validated cache key
        voice_cache_key = f"sys_voice:{voice_profile_result.cache_key}:v3"  # v3 = VoiceProfileResult format
        voice_block = get_or_cache_block(
            voice_cache_key,
            lambda: build_voice_profile_system_instructions(voice_profile_result)
        )
        system_blocks.append(voice_block)
    else:
        # Default profile - build without caching (default prompts are static anyway)
        system_blocks.append(build_voice_profile_system_instructions(voice_profile_result))
    
    # Assemble system prompt from blocks
    system_prompt = "\n\n".join(system_blocks)
    
    return system_prompt


def smart_truncate_text(text: str, max_length: int = 2000) -> str:
    """
    Smart truncation: keeps beginning and end, summarizes middle if needed.
    For reference materials, we want to preserve style examples from both
    the start and end of the document.
    """
    if len(text) <= max_length:
        return text
    
    # Keep first 40% and last 40% of max_length
    first_chunk_size = int(max_length * 0.4)
    last_chunk_size = int(max_length * 0.4)
    
    first_chunk = text[:first_chunk_size]
    last_chunk = text[-last_chunk_size:]
    
    # Add ellipsis to indicate truncation
    return f"{first_chunk}\n\n[... content truncated for length ...]\n\n{last_chunk}"


def build_user_prompt(
    raw_transcript: str,
    session_type: str,
    desired_tone: Optional[str] = None,
    user_context: Optional[str] = None,
    reference_text: Optional[str] = None,
    reference_file_url: Optional[str] = None,
    reference_file_type: Optional[str] = None,
    question: Optional[str] = None,
    goal: Optional[str] = None,
    voice_profile: Optional[Dict] = None,
    company_name: Optional[str] = None
) -> str:
    """
    Build context-aware user prompt template for LLM refinement.
    
    Args:
        raw_transcript: Verbatim user speech (includes filler words)
        session_type: Type of session (free, application, interview, practice, refine)
        desired_tone: Desired tone (confident, concise, reflective, etc.)
        user_context: Optional context from prompt input (company info, role details, etc.)
        reference_text: Optional example text user likes or reference material
        question: Optional question/prompt the user is responding to
        goal: Optional user's goal for the session
        voice_profile: Optional voice profile data
    
    Returns:
        Formatted user prompt string
    """
    prompt_parts = []
    
    # Session-specific context
    if session_type == "interview":
        if user_context:
            # User provided context - use it directly
            prompt_parts.extend([
                "INTERVIEW CONTEXT:",
                user_context,
                "",
                "Consider this context when refining the response. Align the tone and examples with the company culture, values, and role requirements mentioned above.",
                "",
            ])
        elif company_name:
            # No context but company name provided - instruct LLM to research
            prompt_parts.extend([
                f"COMPANY RESEARCH REQUIRED:",
                f"Company Name: {company_name}",
                "",
                "CRITICAL INSTRUCTION: The user has not provided specific company context. You must conduct deep research using your training knowledge about this company to tailor the response.",
                "",
                "Research and consider the following about this company:",
                "1. Company culture, values, and mission statement",
                "2. Leadership principles and behavioral expectations",
                "3. Recent initiatives, projects, or strategic direction",
                "4. Hiring practices and what they look for in candidates",
                "5. Industry reputation and competitive positioning",
                "6. Innovation approach and work environment",
                "7. Diversity, equity, and inclusion initiatives",
                "8. Team collaboration style and communication norms",
                "9. Career development and growth opportunities they emphasize",
                "10. Specific qualities they value in employees",
                "",
                "Based on this research, tailor the response to:",
                "- Reflect the company's core values and cultural principles",
                "- Demonstrate understanding of their business model and priorities",
                "- Align with their communication style and expectations",
                "- Show genuine interest based on their actual initiatives and mission",
                "- Use language and examples that resonate with their culture",
                "",
                "IMPORTANT: Be specific and authentic—reference actual aspects of the company (without making things up). If you're uncertain about specific details, focus on universal principles while maintaining alignment with the company's known culture and values.",
                "",
            ])
    
    elif session_type == "application" and user_context:
        prompt_parts.extend([
            "APPLICATION CONTEXT:",
            user_context,
            "",
            "Refine this application essay considering the context above. Reference award-winning, authentic essays as style guides—maintain the user's unique story while ensuring it stands out.",
            "",
        ])
    
    elif session_type == "refine" and user_context:
        prompt_parts.extend([
            "REFINEMENT INSTRUCTIONS:",
            user_context,
            "",
            "Apply these specific changes to the draft below while maintaining the original voice and core message.",
            "",
        ])
    
    elif user_context:
        prompt_parts.extend([
            "CONTEXT:",
            user_context,
            "",
        ])
    
    # Question/Prompt
    if question:
        prompt_parts.extend([
            f"PROMPT/QUESTION: {question}",
            "",
        ])
    
    # Goal
    if goal:
        prompt_parts.extend([
            f"USER'S GOAL: {goal}",
            "",
        ])
    
    # Desired tone (override voice profile tone if specified)
    final_tone = desired_tone or (voice_profile.get('tone') if voice_profile else None)
    if final_tone:
        prompt_parts.extend([
            f"DESIRED TONE: {final_tone}",
            "",
        ])
    
    # Reference text (smart truncation for better context preservation)
    if reference_text:
        truncated_text = smart_truncate_text(reference_text, max_length=2000)
        prompt_parts.extend([
            "REFERENCE STYLE/MATERIAL:",
            truncated_text,
            "",
            "Use this as a style guide—match the tone and approach while maintaining the user's authentic voice.",
            "",
        ])
    
    # Reference file URL (for images, will be handled separately in Vision API)
    if reference_file_url and reference_file_type:
        if reference_file_type.startswith('image/'):
            # Image will be handled via Vision API, but note it in prompt
            prompt_parts.extend([
                "REFERENCE IMAGE:",
                f"A reference image has been provided at {reference_file_url}",
                "The image will be analyzed visually to understand style, tone, and formatting preferences.",
                "",
            ])
        else:
            # For non-image files, note that text extraction was used
            prompt_parts.extend([
                "REFERENCE FILE:",
                f"A reference file ({reference_file_type}) has been provided.",
                "Text content from this file is included above in REFERENCE STYLE/MATERIAL.",
                "",
            ])
    
    # Raw transcript
    prompt_parts.extend([
        "RAW TRANSCRIPT (verbatim speech):",
        '"""',
        raw_transcript,
        '"""',
        "",
    ])
    
    # Instructions
    if session_type == "interview":
        if user_context:
            # User provided context
            instructions = """INSTRUCTIONS:
Refine this interview response to:
1. Remove filler words and hesitations
2. Structure responses using the STAR method (Situation, Task, Action, Result) where applicable
3. Align with company culture and role requirements from the context above
4. Emphasize concrete examples and measurable impact
5. Maintain the user's authentic voice—never sound scripted or generic
6. Ensure the response demonstrates fit for the role and company

Output a polished, authentic response that sounds like the candidate naturally wrote it after careful editing."""
        elif company_name:
            # Company research required
            instructions = """INSTRUCTIONS:
Refine this interview response to:
1. Remove filler words and hesitations
2. Structure responses using the STAR method (Situation, Task, Action, Result) where applicable
3. **CRITICAL**: Use your deep knowledge of this company to align the response with their culture, values, and hiring practices
4. Reference specific aspects of the company's culture, mission, or values that are relevant to the response
5. Emphasize concrete examples and measurable impact
6. Maintain the user's authentic voice—never sound scripted or generic
7. Ensure the response demonstrates genuine understanding of and fit for the company
8. Use language and examples that would resonate with this company's interviewers

Output a polished, authentic response that demonstrates deep understanding of the company while maintaining the candidate's authentic voice."""
        else:
            # Generic interview (no company info)
            instructions = """INSTRUCTIONS:
Refine this interview response to:
1. Remove filler words and hesitations
2. Structure responses using the STAR method (Situation, Task, Action, Result) where applicable
3. Emphasize concrete examples and measurable impact
4. Maintain the user's authentic voice—never sound scripted or generic
5. Ensure the response demonstrates strong communication and fit for professional roles

Output a polished, authentic response that sounds like the candidate naturally wrote it after careful editing."""
    
    elif session_type == "application":
        instructions = """INSTRUCTIONS:
Refine this application essay to:
1. Remove filler words and improve clarity
2. Emphasize the user's unique story and authentic perspective
3. Reference award-winning essay styles—avoid generic or AI-sounding language
4. Ensure the essay demonstrates personal growth, reflection, and authenticity
5. Make it compelling and memorable while remaining genuine
6. Maintain the user's authentic voice—the essay should sound uniquely theirs
7. STRICTLY respect any stated word limit—do not exceed the limit
8. Aim to be slightly under rather than over any word limit

Output a polished, authentic essay that stands out while remaining genuine and compelling."""
    
    elif session_type == "refine":
        instructions = """INSTRUCTIONS:
Refine this draft according to the instructions above:
1. Apply the requested changes while preserving the original voice
2. Maintain the core message and structure unless explicitly requested to change
3. Incorporate the user's specific improvement requests
4. Ensure the refined version sounds natural and authentic—never AI-generated
5. Preserve the user's unique style and perspective

Output a refined version that incorporates the requested changes while maintaining authenticity."""
    
    elif session_type == "section_refine":
        instructions = """INSTRUCTIONS:
You are editing a SPECIFIC SECTION of an already-refined essay:
1. Return ONLY the refined version of the highlighted section
2. Do NOT return the full essay—only the edited portion
3. Apply the user's instruction to the highlighted text
4. Preserve tone and voice consistency with the surrounding essay
5. Keep similar length unless explicitly asked to expand or condense
6. Ensure the edited text flows naturally when reinserted

Output ONLY the refined section text, ready to replace the highlighted portion."""
    
    elif session_type == "practice":
        instructions = """INSTRUCTIONS:
Refine this practice response to:
1. Remove filler words and improve clarity
2. Provide a polished version that demonstrates best practices
3. Maintain the user's authentic voice and style
4. Keep the tone supportive and encouraging
5. Ensure the output helps the user understand how to improve

Output a polished, authentic response that demonstrates effective communication while maintaining the user's voice."""
    
    else:  # free
        instructions = """INSTRUCTIONS:
Refine this speech to:
1. Remove filler words and hesitations
2. Improve clarity and flow
3. Maintain the user's authentic voice and conversational style
4. Keep it natural and engaging
5. Ensure the output sounds 100% human—never generic or AI-generated

Output a polished, authentic response that sounds like the user wrote it themselves after careful editing."""
    
    prompt_parts.append(instructions)
    
    return '\n'.join(prompt_parts)


async def refine_transcript(
    raw_transcript: str,
    session_type: str = "free",
    desired_tone: Optional[str] = None,
    user_context: Optional[str] = None,
    reference_text: Optional[str] = None,
    reference_file_url: Optional[str] = None,
    reference_file_type: Optional[str] = None,
    question: Optional[str] = None,
    goal: Optional[str] = None,
    user_id: Optional[str] = None,
    voice_profile_result: Optional[VoiceProfileResult] = None,
    company_name: Optional[str] = None
) -> str:
    """
    Refine raw transcript using OpenAI API with context-aware prompts.
    
    Voice profile is ALWAYS applied to ensure consistent tone/style.
    If no profile exists, sensible defaults are used.
    
    GAP-001 REQUIREMENTS:
    - voice_profile_result should be pre-loaded via get_voice_profile_for_llm()
    - If not provided, this function will load it (single loading path)
    - VoiceProfileResult contains validated profile, is_user_profile flag, and cache_key
    
    Args:
        raw_transcript: Verbatim user speech (includes filler words)
        session_type: Type of session (free, application, interview, practice, refine, section_refine)
        desired_tone: Desired tone (confident, concise, reflective, etc.)
        user_context: Optional context from prompt input
        reference_text: Optional example text user likes
        question: Optional question/prompt the user is responding to
        goal: Optional user's goal for the session
        user_id: User ID to fetch voice profile (required for profile-aware refinement)
        voice_profile_result: Pre-loaded VoiceProfileResult (avoids redundant DB call if already loaded)
        company_name: Company name for interview context
    
    Returns:
        Refined text (polished response)
    
    Raises:
        ValueError: If OpenAI API key is not configured
        Exception: If OpenAI API call fails
    """
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.")
    
    if not settings.openai_api_key.strip():
        raise ValueError("OpenAI API key is empty. Please set a valid OPENAI_API_KEY environment variable.")
    
    if not raw_transcript or not raw_transcript.strip():
        raise ValueError("Raw transcript cannot be empty")
    
    # CENTRALIZED VOICE PROFILE LOADING (GAP-001 fix)
    # Use pre-loaded result if available, otherwise load via single path
    if voice_profile_result is None:
        voice_profile_result = get_voice_profile_for_llm(user_id, None)
    
    client = OpenAI(api_key=settings.openai_api_key)
    
    # Build context-specific system prompt (with optional caching)
    # Voice profile is now ALWAYS passed via VoiceProfileResult
    system_prompt = build_context_specific_system_prompt(
        session_type=session_type,
        voice_profile_result=voice_profile_result,
        user_context=user_context,
        company_name=company_name
    )
    
    # Build user prompt - extract dict for backward compatibility with build_user_prompt
    user_prompt = build_user_prompt(
        raw_transcript=raw_transcript,
        session_type=session_type,
        desired_tone=desired_tone,
        user_context=user_context,
        reference_text=reference_text,
        reference_file_url=reference_file_url,
        reference_file_type=reference_file_type,
        question=question,
        goal=goal,
        voice_profile=voice_profile_result.profile.model_dump() if voice_profile_result.profile else None,
        company_name=company_name
    )
    
    try:
        # Token-level input validation (guardrail)
        total_input_tokens = (
            estimate_tokens(system_prompt, model="gpt-4o-mini") +
            estimate_tokens(user_prompt, model="gpt-4o-mini")
        )
        
        if total_input_tokens > MAX_INPUT_TOKENS:
            raise ValueError(
                f"Input too long ({total_input_tokens} tokens). "
                "Please shorten your transcript or reference material."
            )
        
        # Determine if we need Vision API (for images)
        use_vision = (
            reference_file_url and 
            reference_file_type and 
            reference_file_type.startswith('image/')
        )
        
        if use_vision:
            logger.info(f"Calling OpenAI Vision API for transcript refinement with image (type: {session_type})")
            # Use GPT-4 Vision for image analysis
            model = "gpt-4o"  # GPT-4 Vision supports images
            messages = [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": reference_file_url}
                        }
                    ]
                }
            ]
        else:
            logger.info(f"Calling OpenAI API for transcript refinement (type: {session_type})")
            model = "gpt-4o-mini"  # Cost-effective, high-quality model
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        
        # Feature-specific output caps with word-aware logic
        base_cap = OUTPUT_CAPS.get(session_type, 800)
        
        word_limit = extract_word_limit(question, user_context, goal)
        
        # Clamp unreasonably low word limits to prevent broken outputs
        if word_limit and word_limit < MIN_REASONABLE_WORD_LIMIT:
            word_limit = MIN_REASONABLE_WORD_LIMIT
        
        # NOTE:
        # max_tokens is dynamically derived to respect explicit word limits
        # and prevent unnecessary token usage while staying under feature caps.
        if word_limit:
            max_tokens = min(
                words_to_tokens(word_limit + 20),  # Small buffer (20 words)
                base_cap
            )
        else:
            max_tokens = base_cap
        
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.5,  # More deterministic for refinement tasks
            max_tokens=max_tokens,
        )
        
        refined_text = response.choices[0].message.content.strip()
        
        logger.info(f"Successfully refined transcript (length: {len(refined_text)}, type: {session_type})")
        
        return refined_text
    
    except Exception as e:
        error_msg = str(e)
        logger.error(f"OpenAI API error: {error_msg}")
        
        # Provide more helpful error messages
        if "insufficient_quota" in error_msg or "429" in error_msg:
            raise ValueError(
                "OpenAI API quota exceeded. Please check your OpenAI account billing and credits. "
                "If this is your first time using the API, ensure your API key is valid and your account has credits."
            )
        elif "invalid_api_key" in error_msg or "401" in error_msg:
            raise ValueError(
                "Invalid OpenAI API key. Please check that OPENAI_API_KEY is set correctly in your .env file."
            )
        elif "rate_limit" in error_msg.lower():
            raise ValueError("OpenAI API rate limit exceeded. Please try again in a moment.")
        else:
            raise Exception(f"Failed to refine transcript: {error_msg}")


async def analyze_and_refine(
    raw_transcript: str,
    session_type: str = "free",
    desired_tone: Optional[str] = None,
    user_context: Optional[str] = None,
    reference_text: Optional[str] = None,
    reference_file_url: Optional[str] = None,
    reference_file_type: Optional[str] = None,
    question: Optional[str] = None,
    goal: Optional[str] = None,
    user_id: Optional[str] = None,
    voice_profile_result: Optional[VoiceProfileResult] = None,
    company_name: Optional[str] = None,
    filler_detection_enabled: bool = False,
    filler_count_from_transcription: Optional[int] = None
) -> Dict:
    """
    Analyze transcript and generate refined version with context-aware prompts.
    
    This combines analytics (non-LLM) with LLM refinement.
    Voice profile is loaded ONCE at the start and passed to all downstream calls.
    
    GAP-001 REQUIREMENTS:
    - Voice profile loaded via single path: get_voice_profile_for_llm()
    - VoiceProfileResult contains validated profile, is_user_profile flag, and cache_key
    - Profile passed to refine_transcript() to avoid double-loading
    
    Mode-based filler removal rules (applied AFTER LLM refinement):
    - Practice: NEVER remove fillers (keep for learning feedback)
    - Application: ALWAYS remove fillers (clean output for submission)
    - Interview: Default OFF (keep raw by default)
    - Free Speak: Default OFF (keep raw by default)
    
    Args:
        raw_transcript: Verbatim user speech (may include filler words if detection was ON)
        session_type: Type of session (free, application, interview, practice, refine, section_refine)
        desired_tone: Desired tone (confident, concise, reflective, etc.)
        user_context: Optional context from prompt input
        reference_text: Optional example text user likes
        question: Optional question/prompt the user is responding to
        goal: Optional user's goal for the session
        user_id: User ID to fetch voice profile (required for profile-aware refinement)
        voice_profile_result: Pre-loaded VoiceProfileResult (avoids redundant DB call)
        company_name: Company name for interview context
        filler_detection_enabled: Whether filler detection was ON during transcription
        filler_count_from_transcription: Filler count from Deepgram (if detection was ON)
    
    Returns:
        Dictionary with full v3 analytics contract:
        {
            "refined_text": str,
            "confidence_score": int,
            "clarity_score": int,
            "analysis_reliability": float,
            "filler_word_count": int,
            "filler_word_frequency": float,
            "filler_word_breakdown": Dict[str, int],
            "signal_validity": Dict,
            "explanation": Dict,
            "baseline": Dict,
            "drift": Dict,
            "metrics": Dict,
        }
    """
    from analytics import analyze_transcript as analyze_transcript_fn
    
    # CENTRALIZED VOICE PROFILE LOADING (GAP-001 fix)
    # Load voice profile ONCE at the start of the request via single path
    # This ensures consistent profile usage across analytics and refinement
    if voice_profile_result is None:
        voice_profile_result = get_voice_profile_for_llm(user_id, None)
    
    logger.info(
        f"[analyze_and_refine] Voice profile loaded: "
        f"is_user_profile={voice_profile_result.is_user_profile}, "
        f"cache_key={voice_profile_result.cache_key}, "
        f"session_type={session_type}"
    )
    
    # Run analytics - now always returns full v3 structure
    # Analytics engine handles detection ON/OFF internally
    if filler_detection_enabled:
        logger.info(f"[Filler Detection] ENABLED for session_type={session_type}")
        analytics = analyze_transcript_fn(raw_transcript, user_id=user_id)
        # Use Deepgram's filler count if provided (more accurate than regex)
        if filler_count_from_transcription is not None:
            analytics["filler_word_count"] = filler_count_from_transcription
            logger.info(f"[Filler Detection] Using Deepgram count: {filler_count_from_transcription}")
    else:
        # Detection OFF: still run analytics but note it's less reliable
        logger.info(f"[Filler Detection] DISABLED for session_type={session_type}")
        analytics = analyze_transcript_fn(raw_transcript, user_id=user_id)
        # Override filler data to 0 since we didn't detect
        analytics["filler_word_count"] = 0
        analytics["filler_word_frequency"] = 0.0
        analytics["filler_word_breakdown"] = {}
    
    # Run LLM refinement with context-aware prompts
    # Pass the already-loaded VoiceProfileResult to avoid redundant DB call
    refined_text = await refine_transcript(
        raw_transcript=raw_transcript,
        session_type=session_type,
        desired_tone=desired_tone,
        user_context=user_context,
        reference_text=reference_text,
        reference_file_url=reference_file_url,
        reference_file_type=reference_file_type,
        question=question,
        goal=goal,
        user_id=user_id,
        voice_profile_result=voice_profile_result,  # Pass already-loaded VoiceProfileResult
        company_name=company_name
    )
    
    # Post-processing: Apply mode-based filler removal
    # This happens AFTER LLM refinement to ensure clean output for Application mode
    if should_remove_fillers_for_mode(session_type):
        original_length = len(refined_text)
        refined_text = remove_fillers_from_text(refined_text)
        chars_removed = original_length - len(refined_text)
        logger.info(f"[Filler Removal] Applied for session_type={session_type}, chars_removed={chars_removed}")
    
    # Return full v3 analytics contract
    return {
        "refined_text": refined_text,
        "confidence_score": analytics["confidence_score"],
        "clarity_score": analytics["clarity_score"],
        "analysis_reliability": analytics.get("analysis_reliability", 0.5),
        "filler_word_count": analytics["filler_word_count"],
        "filler_word_frequency": analytics["filler_word_frequency"],
        "filler_word_breakdown": analytics["filler_word_breakdown"],
        "signal_validity": analytics.get("signal_validity"),
        "explanation": analytics.get("explanation"),
        "baseline": analytics.get("baseline"),
        "drift": analytics.get("drift"),
        "metrics": analytics.get("metrics"),
    }

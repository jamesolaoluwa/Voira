"""
LLM refinement utilities using OpenAI API.
Handles transcript refinement with proper prompt engineering, voice profile integration,
and context-aware prompts for different session types.
"""
import logging
import os
import re
from typing import Optional, Dict, List, Callable
from openai import OpenAI
import tiktoken
from config import settings
from db import supabase

logger = logging.getLogger(__name__)

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


def get_voice_profile(user_id: str) -> Optional[Dict]:
    """
    Retrieve user's voice profile from database.
    
    Args:
        user_id: User ID to fetch voice profile for
    
    Returns:
        Voice profile dictionary or None if not found
    """
    try:
        response = supabase.table("voice_profiles").select("*").eq("user_id", user_id).execute()
        if response.data and len(response.data) > 0:
            profile = response.data[0]
            return {
                "tone": profile.get("tone", "professional"),
                "confidence_level": profile.get("confidence_level", 65),
                "emotional_depth": profile.get("emotional_depth", 50),
                "sentence_length": profile.get("sentence_length", "medium"),
                "preferred_words": profile.get("preferred_words", []) or [],
                "avoided_words": profile.get("avoided_words", []) or [],
                "example_responses": profile.get("example_responses", "") or "",
            }
        return None
    except Exception as e:
        logger.warning(f"Error fetching voice profile for user {user_id}: {e}")
        return None


def build_session_context_prompt(session_type: str) -> str:
    """
    Build session-specific context prompt block.
    
    Args:
        session_type: Type of session (free, application, interview, practice, refine)
    
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
    
    else:  # free
        return """
ADDITIONAL CONTEXT FOR FREE SPEAK:
- You are refining general speech into polished written content
- Maintain a conversational yet polished tone
- Keep the user's authentic voice and style
- The output should be natural, clear, and engaging
"""


def build_voice_profile_block(voice_profile: Dict) -> str:
    """
    Build voice profile guidance block.
    
    Args:
        voice_profile: Voice profile data dictionary
    
    Returns:
        Voice profile guidance block
    
    Note:
        Cache key: sys_voice:{user_id}:v{voice_profile.version}
        Uses explicit user_id and version for deterministic, human-readable cache keys.
        The version field should be updated whenever the voice profile changes.
    """
    # Cache key: sys_voice:{user_id}:v{voice_profile.version}
    voice_guidance = "VOICE PROFILE GUIDANCE:\n"
    voice_guidance += f"- Tone: {voice_profile.get('tone', 'professional')}\n"
    voice_guidance += f"- Confidence Level Target: {voice_profile.get('confidence_level', 65)}%\n"
    voice_guidance += f"- Emotional Depth Target: {voice_profile.get('emotional_depth', 50)}%\n"
    voice_guidance += f"- Sentence Length Preference: {voice_profile.get('sentence_length', 'medium')}\n"
    
    preferred = voice_profile.get('preferred_words', [])
    if preferred:
        voice_guidance += f"- Preferred Words (use naturally): {', '.join(preferred[:10])}\n"
    
    avoided = voice_profile.get('avoided_words', [])
    if avoided:
        voice_guidance += f"- Avoided Words (never use): {', '.join(avoided[:10])}\n"
    
    example_responses = voice_profile.get('example_responses', '')
    if example_responses:
        voice_guidance += f"\n- Example Response Style:\n{example_responses[:500]}\n"
    
    return voice_guidance


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
    voice_profile: Optional[Dict] = None,
    user_id: Optional[str] = None,
    user_context: Optional[str] = None,
    company_name: Optional[str] = None
) -> str:
    """
    Build context-specific system prompt from modular blocks.
    
    Assembles system prompt using explicit block structure with optional caching.
    
    Args:
        session_type: Type of session (free, application, interview, practice, refine)
        voice_profile: Optional voice profile data
        user_id: Optional user ID for voice profile cache key
        user_context: Optional user-provided context (for variant detection)
        company_name: Optional company name (for variant detection)
    
    Returns:
        Context-specific system prompt
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
    
    if voice_profile:
        # Voice profile blocks are only cached when user_id and version are available.
        # Anonymous or incomplete profiles bypass caching intentionally.
        if user_id:
            # Use a placeholder version (1) until voice_profile.version is implemented
            voice_version = voice_profile.get("version", 1)
            voice_key = f"sys_voice:{user_id}:v{voice_version}"
            voice_block = get_or_cache_block(
                voice_key,
                lambda: build_voice_profile_block(voice_profile)
            )
            system_blocks.append(voice_block)
        else:
            # No user_id provided - build without caching (fallback for anonymous/incomplete profiles)
            system_blocks.append(build_voice_profile_block(voice_profile))
    
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
    voice_profile: Optional[Dict] = None,
    company_name: Optional[str] = None
) -> str:
    """
    Refine raw transcript using OpenAI API with context-aware prompts.
    
    Args:
        raw_transcript: Verbatim user speech (includes filler words)
        session_type: Type of session (free, application, interview, practice, refine)
        desired_tone: Desired tone (confident, concise, reflective, etc.)
        user_context: Optional context from prompt input
        reference_text: Optional example text user likes
        question: Optional question/prompt the user is responding to
        goal: Optional user's goal for the session
        user_id: Optional user ID to fetch voice profile
        voice_profile: Optional voice profile data (if not provided and user_id is set, will fetch)
    
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
    
    # Fetch voice profile if user_id provided and voice_profile not provided
    if user_id and not voice_profile:
        voice_profile = get_voice_profile(user_id)
    
    client = OpenAI(api_key=settings.openai_api_key)
    
    # Build context-specific system prompt (with optional caching)
    system_prompt = build_context_specific_system_prompt(
        session_type=session_type,
        voice_profile=voice_profile,
        user_id=user_id,
        user_context=user_context,
        company_name=company_name
    )
    
    # Build user prompt
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
        voice_profile=voice_profile,
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
    voice_profile: Optional[Dict] = None,
    company_name: Optional[str] = None
) -> Dict:
    """
    Analyze transcript and generate refined version with context-aware prompts.
    
    This combines analytics (non-LLM) with LLM refinement.
    
    Args:
        raw_transcript: Verbatim user speech (includes filler words)
        session_type: Type of session (free, application, interview, practice, refine)
        desired_tone: Desired tone (confident, concise, reflective, etc.)
        user_context: Optional context from prompt input
        reference_text: Optional example text user likes
        question: Optional question/prompt the user is responding to
        goal: Optional user's goal for the session
        user_id: Optional user ID to fetch voice profile
        voice_profile: Optional voice profile data
    
    Returns:
        Dictionary with:
        {
            "refined_text": str,
            "confidence_score": int,
            "clarity_score": int,
            "filler_word_count": int,
            "filler_word_frequency": float,
            "filler_word_breakdown": Dict[str, int],
        }
    """
    from analytics import analyze_transcript
    
    # Run analytics (non-LLM, deterministic)
    analytics = analyze_transcript(raw_transcript)
    
    # Run LLM refinement with context-aware prompts
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
        voice_profile=voice_profile,
        company_name=company_name
    )
    
    return {
        "refined_text": refined_text,
        "confidence_score": analytics["confidence_score"],
        "clarity_score": analytics["clarity_score"],
        "filler_word_count": analytics["filler_word_count"],
        "filler_word_frequency": analytics["filler_word_frequency"],
        "filler_word_breakdown": analytics["filler_word_breakdown"],
    }

"""
Voira v1 Model HTTP Client.

Calls the hosted Voira LoRA inference endpoint (local mlx server in dev,
HF Inference Endpoints or Replicate in production) to generate essays from
structured outlines.

Two-stage pipeline:
    Stage 1: OpenAI converts raw transcript -> structured outline
             (see outline_generator.py)
    Stage 2: Voira v1 converts outline -> polished essay
             (this module)

Follows the same httpx REST + fallback pattern as transcription.py
(Deepgram -> OpenAI Whisper). If the Voira endpoint is unreachable or the
feature flag is disabled, callers should fall back to direct OpenAI
refinement.

Reference: https://huggingface.co/ekomobng/voira-essay-lora-v1
"""
import logging
from typing import Optional
import httpx

from config import settings
from sentry_config import capture_message

logger = logging.getLogger(__name__)


class VoiraModelError(Exception):
    """Base exception for Voira model inference errors."""
    pass


class VoiraModelDisabledError(VoiraModelError):
    """Raised when the Voira model is disabled via config."""
    pass


class VoiraModelUnavailableError(VoiraModelError):
    """Raised when the inference endpoint is unreachable or returns an error."""
    pass


def is_voira_model_enabled() -> bool:
    """Check if the Voira v1 model is configured and enabled.

    Returns True only when both the feature flag is on and a URL is set.
    """
    return bool(settings.voira_model_enabled and settings.voira_model_url)


def _estimate_max_new_tokens(word_limit: Optional[int], default: int = 1500) -> int:
    """Convert a target word count to a safe max_new_tokens budget.

    Uses ~1.5 tokens/word for English prose plus a small buffer so the model
    can finish a sentence cleanly. Capped at 4096 to avoid runaway generation.
    """
    if word_limit and word_limit > 0:
        return min(int(word_limit * 1.8) + 50, 4096)
    return default


async def generate_essay(
    outline: str,
    word_limit: Optional[int] = None,
    temperature: float = 0.7,
    top_p: float = 0.9,
    repetition_penalty: float = 1.1,
    max_new_tokens: Optional[int] = None,
) -> str:
    """Generate an essay from a Voira-format outline.

    The outline must already be in the structure expected by the LoRA
    (wrapped with --- OUTLINE --- / --- END --- markers). Use
    outline_generator.py to produce valid outlines from raw transcripts
    or drafts.

    Args:
        outline: Structured outline text (prompt, word limit, arc, voice, body).
        word_limit: Target essay length in words. Used to size max_new_tokens.
        temperature: Sampling temperature. Model card recommends 0.7.
        top_p: Nucleus sampling threshold. Model card recommends 0.9.
        repetition_penalty: Repetition penalty. Model card recommends 1.1.
        max_new_tokens: Override token budget. Derived from word_limit if None.

    Returns:
        Generated essay text (model output, post-chat-template stripping).

    Raises:
        VoiraModelDisabledError: Feature flag off or URL not set.
        VoiraModelUnavailableError: Endpoint unreachable / returned an error.
    """
    if not is_voira_model_enabled():
        raise VoiraModelDisabledError(
            "Voira model is disabled. Set VOIRA_MODEL_ENABLED=true and VOIRA_MODEL_URL."
        )

    if not outline or not outline.strip():
        raise ValueError("Outline cannot be empty")

    if max_new_tokens is None:
        max_new_tokens = _estimate_max_new_tokens(word_limit)

    payload = {
        "outline": outline,
        "max_new_tokens": max_new_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "repetition_penalty": repetition_penalty,
    }

    headers = {"Content-Type": "application/json"}
    if settings.voira_model_api_key:
        headers["Authorization"] = f"Bearer {settings.voira_model_api_key}"

    url = settings.voira_model_url.rstrip("/") + "/generate"

    logger.info(
        f"[VoiraModel] Calling inference endpoint "
        f"(url={settings.voira_model_url}, max_new_tokens={max_new_tokens}, "
        f"outline_chars={len(outline)})"
    )

    try:
        async with httpx.AsyncClient(timeout=settings.voira_model_timeout) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code >= 400:
            logger.error(
                f"[VoiraModel] Endpoint returned HTTP {response.status_code}: "
                f"{response.text[:500]}"
            )
            capture_message(
                f"Voira model inference failed: HTTP {response.status_code}",
                level="error",
                extra={
                    "status_code": response.status_code,
                    "response_snippet": response.text[:500],
                },
            )
            raise VoiraModelUnavailableError(
                f"Voira inference endpoint returned HTTP {response.status_code}"
            )

        data = response.json()

        essay = data.get("essay") or data.get("generated_text") or data.get("output")
        if not essay:
            raise VoiraModelUnavailableError(
                f"Voira endpoint response missing essay/generated_text field: {data}"
            )

        essay = essay.strip()
        logger.info(
            f"[VoiraModel] Generation succeeded "
            f"(chars={len(essay)}, words={len(essay.split())})"
        )
        return essay

    except httpx.TimeoutException as e:
        logger.error(f"[VoiraModel] Inference timed out after {settings.voira_model_timeout}s: {e}")
        capture_message(
            "Voira model inference timed out",
            level="warning",
            extra={"timeout_s": settings.voira_model_timeout},
        )
        raise VoiraModelUnavailableError(
            f"Voira inference timed out after {settings.voira_model_timeout}s"
        ) from e

    except httpx.RequestError as e:
        logger.error(f"[VoiraModel] Request failed: {e}")
        capture_message(
            f"Voira model request failed: {type(e).__name__}",
            level="warning",
            extra={"error": str(e)},
        )
        raise VoiraModelUnavailableError(f"Voira inference request failed: {e}") from e


async def health_check() -> bool:
    """Quick liveness probe for the inference endpoint.

    Returns True if the endpoint responds to GET /health within 5s.
    Useful for startup checks and admin diagnostics.
    """
    if not is_voira_model_enabled():
        return False

    url = settings.voira_model_url.rstrip("/") + "/health"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
        return response.status_code == 200
    except Exception as e:
        logger.debug(f"[VoiraModel] Health check failed: {e}")
        return False

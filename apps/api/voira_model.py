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
import re
from typing import Optional
import httpx

from config import settings
from sentry_config import capture_message

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Essay output sanitization
# ---------------------------------------------------------------------------
# The v1 LoRA was trained on only ~91 outline+essay pairs. When the outline
# OpenAI generates doesn't exactly match the training format, the model can
# leak outline-schema artifacts into its output instead of clean prose:
#
#   * preambles: "Here is the polished essay:"
#   * block markers: "--- ESSAY ---", "--- END ---"
#   * inline field labels: "[Title:]", "[Prompt:]", "[Overall Emotional Arc:]"
#   * inline cues: "[MOOD: reflective]", "[STRESS: ...]", "[TONAL SHIFT: ...]"
#
# We strip these deterministically. If what remains is too short to be a
# usable essay, generate_essay() raises VoiraModelUnavailableError so the
# caller (llm_refinement._maybe_refine_via_voira_model) falls back to the
# direct OpenAI path.

# Preamble phrases the model sometimes emits before the essay, possibly
# chained (e.g. "Here's the essay: Here is the polished essay:").
_PREAMBLE_RE = re.compile(
    r"^\s*(?:here(?:'s|\s+is)\s+(?:the\s+)?(?:polished\s+)?essay[:.\-]?\s*)+",
    re.IGNORECASE,
)

# Block markers on their own line (---OUTLINE---, --- ESSAY ---, --- END ---).
_LINE_MARKER_RE = re.compile(
    r"^[ \t]*-{2,}\s*(?:ESSAY|END|OUTLINE)\s*-{2,}[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)

# Same markers when they appear inline (single-line outputs).
_INLINE_MARKER_RE = re.compile(
    r"-{2,}\s*(?:ESSAY|END|OUTLINE)\s*-{2,}",
    re.IGNORECASE,
)

# Inline mood/stress/tonal cues from the outline schema.
_INLINE_CUE_RE = re.compile(
    r"\s*\[\s*(?:MOOD|STRESS|TONAL\s+SHIFT|PACING|VOICE)\s*:[^\]]*\]",
    re.IGNORECASE,
)

# Known outline field labels. Order matters only for readability; the regex
# is alternation-based so longest-first isn't required (all end with `]`).
_OUTLINE_FIELDS = (
    "Title",
    "Prompt",
    "Word Limit",
    "Overall Emotional Arc & Voice Notes",
    "Overall Emotional Arc and Voice Notes",
    "Overall Emotional Arc",
    "Emotional Arc",
    "Overall Tone & Voice",
    "Overall Tone and Voice",
    "Writing Voice",
    "Voice Notes",
    "Tone",
    "Introduction / Hook",
    "Introduction/Hook",
    "Introduction",
    "Hook",
    "Body",
    "Conclusion / Summary",
    "Conclusion/Summary",
    "Conclusion",
    "Summary",
    "Key phrases",
    "Voice/pacing",
    "Voice / pacing",
    "Content plan",
)
_FIELD_LABEL_ALT = "|".join(re.escape(f) for f in _OUTLINE_FIELDS)

# Whole-line [Field:] echoes (when output is properly newline-separated).
# Field label may have a `:`/`.`/`-` inside the brackets *or* after, e.g.
# "[Prompt:]", "[Prompt]:", "[Prompt.]".
_FIELD_LINE_RE = re.compile(
    r"^[ \t]*\[\s*(?:" + _FIELD_LABEL_ALT + r")\s*[:.\-]?\s*\][:.\-]?[ \t]*.*$",
    re.IGNORECASE | re.MULTILINE,
)

# Inline [Field:] <content> segments up to the next "[" or end of string
# (when the model emits the whole outline on a single line).
_FIELD_SEGMENT_RE = re.compile(
    r"\[\s*(?:" + _FIELD_LABEL_ALT + r")\s*[:.\-]?\s*\][:.\-]?[^\[]*",
    re.IGNORECASE,
)

# Generic "looks-like-an-outline-label" detector at line start. Catches
# any line that begins with [Something] or [Something:] where the bracketed
# contents look like a label (Title Case words or ALL CAPS, possibly with
# `&`, `/`, or `-` separators). This covers label variants the model
# invents that aren't in _OUTLINE_FIELDS, e.g. `[Writing Voice]`,
# `[Overall Emotional Arc & Voice Notes:]`, `[OUTGRACE:]`.
# Kept deliberately narrow (anchored to line start, requires the label to
# start with an uppercase letter) so it does not touch legitimate prose
# that happens to quote bracketed text mid-sentence.
_GENERIC_BRACKET_LINE_RE = re.compile(
    r"^[ \t]*\[[A-Z][A-Za-z0-9&/\- \t]{1,80}\][ \t]*[:.\-]?[ \t]*.*$",
    re.MULTILINE,
)

# Any remaining bracketed label anywhere in the output. Used only as a
# safety-net count after sanitization -- if multiple labels survive, the
# model is clearly emitting outline structure rather than prose.
_ANY_BRACKET_LABEL_RE = re.compile(r"\[[A-Z][^\]\n]{0,80}\]")

# Bullet markers at line start -- `*`, `-`, `•`, or numbered `1.` / `1)`.
# Used to detect "mostly bullets" outputs and to strip specific bullet lines.
_BULLET_LINE_HEAD = r"^[ \t]*(?:[*\-\u2022]|\d+[.)])\s+"

# Lines that start with bare outline-schema labels (no brackets), with or
# without a leading bullet. Catches the "* MOOD: nostalgic" variant the
# model sometimes produces instead of the bracketed "[MOOD: nostalgic]".
_BARE_LABEL_LINE_RE = re.compile(
    r"(?:" + _BULLET_LINE_HEAD + r")?"
    r"(?:MOOD|STRESS|TONAL\s+SHIFT|PACING|VOICE|VOICE\s*/\s*PACING|"
    r"CONTENT\s+PLAN|KEY\s+PHRASES)\s*[:.\-]\s+.*$",
    re.IGNORECASE | re.MULTILINE,
)

# Bulleted lines that look like outline planning directives rather than
# essay prose (verbs in the imperative like "Open with", "Establish",
# "Plant the seed", "Close the intro with"). Conservative -- only applied
# as a second pass after other stripping.
_OUTLINE_VERB_BULLET_RE = re.compile(
    _BULLET_LINE_HEAD + r"(?:Open\s+with|Start\s+with|Begin\s+with|"
    r"Establish|Plant\s+the\s+seed|"
    r"Close\s+the\s+(?:intro|essay)\s+with|Introduce|Transition\s+to|"
    r"Move\s+into|Return\s+to|"
    r"Build\s+to|Show\s+that|Reveal\s+that|Emphasize\s+that|"
    r"Finally,?\s+(?:return|move|close|end))\b.*$",
    re.IGNORECASE | re.MULTILINE,
)

_BLANK_LINE_COLLAPSE_RE = re.compile(r"\n{3,}")

# Outputs shorter than this after sanitization are treated as "model echoed
# outline structure without producing an essay" and trigger fallback.
MIN_ESSAY_WORDS = 30


def _sanitize_essay_output(raw: str) -> str:
    """Strip outline-schema artifacts from a raw Voira v1 essay output.

    Leaves clean prose untouched. For outputs that are mostly or entirely
    outline echoes, this can reduce the text to an empty string; callers
    should validate the length before returning to the user.
    """
    if not raw:
        return ""

    text = raw.strip()

    # 1. Drop preamble phrases.
    text = _PREAMBLE_RE.sub("", text).lstrip()

    # 2. Drop block markers (both on their own line and inline).
    text = _LINE_MARKER_RE.sub("", text)
    text = _INLINE_MARKER_RE.sub("", text)

    # 3. Drop inline [MOOD:]/[STRESS:]/[TONAL SHIFT:] cues.
    text = _INLINE_CUE_RE.sub("", text)

    # 4. Drop whole-line [Field:] echoes first (cheapest), then inline
    #    [Field:] segments for pathological single-line outputs.
    text = _FIELD_LINE_RE.sub("", text)
    text = _FIELD_SEGMENT_RE.sub("", text)

    # 5. Drop any remaining lines that open with a bracketed label. This
    #    catches variants the model invents on the fly (`[Writing Voice]`,
    #    `[Overall Emotional Arc & Voice Notes:]`, garbled tokens like
    #    `[OUTGRACE:]`) that aren't in _OUTLINE_FIELDS.
    text = _GENERIC_BRACKET_LINE_RE.sub("", text)

    # 6. Drop lines that are bare outline-schema labels ("* MOOD: ...",
    #    "STRESS: ...") and bullet lines that are clearly outline planning
    #    directives ("* Open with...", "* Establish...").
    text = _BARE_LABEL_LINE_RE.sub("", text)
    text = _OUTLINE_VERB_BULLET_RE.sub("", text)

    # 7. Tidy whitespace: collapse 3+ newlines to a paragraph break, trim
    #    trailing spaces per line, and strip edges.
    text = _BLANK_LINE_COLLAPSE_RE.sub("\n\n", text)
    text = "\n".join(line.rstrip() for line in text.splitlines())
    text = text.strip()

    # 8. Safety net A -- bullet-heavy output. If >= 50% of non-empty lines
    #    start with a bullet marker (or numbered list prefix), it's almost
    #    certainly outline content, not an essay.
    non_empty_lines = [ln for ln in text.splitlines() if ln.strip()]
    if non_empty_lines:
        bullet_lines = sum(
            1 for ln in non_empty_lines if re.match(_BULLET_LINE_HEAD, ln)
        )
        if bullet_lines / len(non_empty_lines) >= 0.5:
            return ""

    # 9. Safety net B -- residual bracketed labels. After stripping known
    #    and generic label lines, a clean essay should have ~0 of these.
    #    Two or more remaining `[Something]` labels means the model is
    #    leaking outline/control tokens (or has collapsed into garbled
    #    token output like `[OUTGRACE:]`), so reject.
    if len(_ANY_BRACKET_LABEL_RE.findall(text)) >= 2:
        return ""

    return text


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


def _estimate_max_new_tokens(word_limit: Optional[int], default: int = 900) -> int:
    """Convert a target word count to a safe max_new_tokens budget.

    Uses ~1.5 tokens/word for English prose plus a small buffer so the model
    can finish a sentence cleanly. Capped at 2200 tokens -- beyond that, the
    v1 LoRA tends to exhaust its trained essay length and start emitting
    outline-scaffolding artifacts instead of clean prose. The early-stop
    detector in the inference server protects against this too, but keeping
    the budget tight here is the first line of defence.
    """
    if word_limit and word_limit > 0:
        # 1.6 tokens/word average for English, +60 token safety buffer to
        # finish the last sentence, hard cap at 2200.
        return min(int(word_limit * 1.6) + 60, 2200)
    return default


async def generate_essay(
    outline: str,
    word_limit: Optional[int] = None,
    temperature: float = 0.6,
    top_p: float = 0.9,
    repetition_penalty: float = 1.15,
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

        raw_essay = (
            data.get("essay") or data.get("generated_text") or data.get("output")
        )
        if not raw_essay:
            raise VoiraModelUnavailableError(
                f"Voira endpoint response missing essay/generated_text field: {data}"
            )

        essay = _sanitize_essay_output(raw_essay)
        raw_chars = len(raw_essay)
        clean_chars = len(essay)
        clean_words = len(essay.split())

        if clean_words < MIN_ESSAY_WORDS:
            logger.warning(
                f"[VoiraModel] Output was mostly outline artifacts "
                f"(raw_chars={raw_chars}, clean_chars={clean_chars}, "
                f"clean_words={clean_words}). Treating as unavailable."
            )
            capture_message(
                "Voira model output collapsed to <min_words after sanitization",
                level="warning",
                extra={
                    "raw_chars": raw_chars,
                    "clean_chars": clean_chars,
                    "clean_words": clean_words,
                    "min_words": MIN_ESSAY_WORDS,
                },
            )
            raise VoiraModelUnavailableError(
                f"Voira output had only {clean_words} prose words after "
                f"stripping outline artifacts (min={MIN_ESSAY_WORDS})"
            )

        logger.info(
            f"[VoiraModel] Generation succeeded "
            f"(raw_chars={raw_chars}, clean_chars={clean_chars}, "
            f"words={clean_words})"
        )
        return essay

    except httpx.TimeoutException as e:
        logger.error(
            f"[VoiraModel] Inference timed out after {settings.voira_model_timeout}s: {e}"
        )
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

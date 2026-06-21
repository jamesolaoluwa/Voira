"""
Outline generator (Stage 1 of the Voira v1 essay pipeline).

The Voira v1 LoRA adapter was fine-tuned on outline -> essay pairs, where the
outlines follow a very specific structure with emotional arcs, voice notes,
MOOD/STRESS markers, and key phrases. Feeding it a raw transcript would be
off-distribution, so we first use OpenAI (gpt-4o-mini) to convert a transcript
(or existing draft) into a properly structured outline.

Two entry points:
- generate_outline_from_transcript() -- for new application essays
- extract_outline_from_draft()      -- for refining existing drafts

Both return a string wrapped with the exact markers the model expects:

    --- OUTLINE ---
    [Prompt:] ...
    [Word Limit:] ...
    [Overall Emotional Arc:] ...
    [Overall Tone & Voice:] ...
    [Introduction / Hook:] ...
    [Body:] 1. ... 2. ... 3. ...
    [Conclusion / Summary:] ...
    --- END ---

    Now write the essay based on this outline:

Reference: https://huggingface.co/ekomobng/voira-essay-lora-v1
"""

import logging
from typing import Optional, Dict, Any

from openai import OpenAI
from config import settings

logger = logging.getLogger(__name__)

# Use gpt-4o-mini for cost efficiency; outline generation is a constrained task.
OUTLINE_MODEL = "gpt-4o-mini"

# Temperature for outline generation: slightly lower than essay generation so
# structure stays consistent, but not zero so voice notes remain expressive.
OUTLINE_TEMPERATURE = 0.4

# Token budget for the outline itself (enough for ~600-word outlines).
OUTLINE_MAX_TOKENS = 1500


# ============================================================================
# System prompts
# ============================================================================

OUTLINE_FROM_TRANSCRIPT_SYSTEM = """You are an expert essay planner working with the Voira essay-writing system.

Your job: take a raw spoken transcript (the writer talking out their ideas) plus optional context, and produce a detailed structured outline in the EXACT format below. The outline will be passed to a specialized essay-writing model that follows outlines precisely.

CRITICAL RULES:
1. Extract ONLY what the writer actually said. Do NOT invent facts, events, names, places, or quotes that aren't in the transcript.
2. Capture the writer's voice -- their cadence, specific phrases, emotional beats. Quote their exact words for key phrases whenever possible.
3. The outline must preserve enough detail that the essay model can write the essay WITHOUT inventing content.
4. Respect the voice profile when setting tone and voice notes.
5. Output ONLY the outline. No preamble, no explanation, no commentary.

OUTPUT FORMAT (use this structure exactly, including the markers):

--- OUTLINE ---
[Prompt:] <the essay question or topic>
[Word Limit:] <target word count>
[Overall Emotional Arc:] <macro emotional trajectory, e.g. "uncertainty -> clarity -> resolve">
[Overall Tone & Voice:] <the writer's baseline register, e.g. "reflective, grounded, slightly wry">
[Introduction / Hook:] <opening strategy> [MOOD: <mood>] [STRESS: <what to emphasize>]
[Body:]
1. <section topic> [MOOD: <mood>] [STRESS: <emphasis>] [TONAL SHIFT: <if any>]
   - Content plan: <what this section covers, drawn from the transcript>
   - Key phrases: "<exact quoted phrases from the transcript>"
   - Voice/pacing: <how it should read -- sentence rhythm, pauses, texture>
2. <next section>
   - ...
3. <next section>
   - ...
[Conclusion / Summary:] <closing strategy> [MOOD: <final mood>] [STRESS: <final emphasis>]
--- END ---

Now write the essay based on this outline:"""


OUTLINE_FROM_DRAFT_SYSTEM = """You are an expert essay planner working with the Voira essay-writing system.

Your job: reverse-engineer a structured outline from an EXISTING essay draft, optionally applying refinement instructions. The outline will be passed to a specialized essay-writing model that will rewrite the essay based on it.

CRITICAL RULES:
1. Capture what the draft is actually doing -- its structure, emotional beats, specific details, and voice. The essay model will rewrite from this outline, so it must contain every concrete fact, event, and key phrase needed.
2. Do NOT invent new content or change the story. If refinement instructions ask for changes, translate those into outline-level adjustments (e.g. a different hook, a stronger stress, a tonal shift) -- but do not fabricate facts.
3. Quote specific phrases from the draft that should be preserved or that carry the writer's voice.
4. Respect the voice profile when setting tone and voice notes.
5. Output ONLY the outline. No preamble, no explanation, no commentary.

OUTPUT FORMAT (use this structure exactly, including the markers):

--- OUTLINE ---
[Prompt:] <the essay question or topic>
[Word Limit:] <target word count>
[Overall Emotional Arc:] <macro emotional trajectory>
[Overall Tone & Voice:] <baseline register>
[Introduction / Hook:] <opening strategy> [MOOD: <mood>] [STRESS: <emphasis>]
[Body:]
1. <section topic> [MOOD: <mood>] [STRESS: <emphasis>] [TONAL SHIFT: <if any>]
   - Content plan: <what this section covers, drawn from the draft>
   - Key phrases: "<exact quoted phrases from the draft to preserve>"
   - Voice/pacing: <sentence rhythm, pauses, texture>
2. <next section>
   - ...
[Conclusion / Summary:] <closing strategy> [MOOD: <mood>] [STRESS: <emphasis>]
--- END ---

Now write the essay based on this outline:"""


# ============================================================================
# Helpers
# ============================================================================


def _format_voice_profile_block(voice_profile: Optional[Dict[str, Any]]) -> str:
    """Render a voice profile dict into a compact prompt block."""
    if not voice_profile:
        return ""

    lines = ["VOICE PROFILE (apply to tone and voice notes):"]

    tone = voice_profile.get("tone")
    if tone:
        lines.append(f"- Baseline tone: {tone}")

    confidence = voice_profile.get("confidence_level")
    if confidence is not None:
        lines.append(f"- Confidence level: {confidence}/100")

    depth = voice_profile.get("emotional_depth")
    if depth is not None:
        lines.append(f"- Emotional depth: {depth}/100")

    length = voice_profile.get("sentence_length")
    if length:
        lines.append(f"- Sentence length preference: {length}")

    preferred = voice_profile.get("preferred_words") or []
    if preferred:
        lines.append(f"- Use naturally when appropriate: {', '.join(preferred[:20])}")

    avoided = voice_profile.get("avoided_words") or []
    if avoided:
        lines.append(f"- NEVER use: {', '.join(avoided[:20])}")

    example = voice_profile.get("example_responses")
    if example:
        snippet = example.strip()[:400]
        lines.append(f'- Style example:\n"""\n{snippet}\n"""')

    return "\n".join(lines)


def _call_openai_for_outline(system_prompt: str, user_prompt: str) -> str:
    """Call OpenAI and return stripped outline text.

    Raises ValueError if OpenAI key is missing; propagates OpenAI exceptions.
    """
    if not settings.openai_api_key or not settings.openai_api_key.strip():
        raise ValueError(
            "OpenAI API key not configured. Cannot generate outline for Voira model."
        )

    client = OpenAI(api_key=settings.openai_api_key)

    response = client.chat.completions.create(
        model=OUTLINE_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=OUTLINE_TEMPERATURE,
        max_tokens=OUTLINE_MAX_TOKENS,
    )

    return response.choices[0].message.content.strip()


def _ensure_markers(outline: str) -> str:
    """Guarantee the outline has the required --- OUTLINE --- / --- END --- markers
    and the trailing "Now write the essay..." cue. If the model dropped any of
    these, add them so the downstream Voira model isn't off-distribution.
    """
    text = outline.strip()

    if "--- OUTLINE ---" not in text:
        text = "--- OUTLINE ---\n" + text

    if "--- END ---" not in text:
        text = text + "\n--- END ---"

    cue = "Now write the essay based on this outline:"
    if cue not in text:
        text = text + "\n\n" + cue

    return text


# ============================================================================
# Public API
# ============================================================================


async def generate_outline_from_transcript(
    transcript: str,
    question: Optional[str] = None,
    desired_tone: Optional[str] = None,
    user_context: Optional[str] = None,
    goal: Optional[str] = None,
    voice_profile: Optional[Dict[str, Any]] = None,
    word_limit: Optional[int] = None,
    reference_text: Optional[str] = None,
) -> str:
    """Convert a raw application-essay transcript into a Voira-format outline.

    Args:
        transcript: Raw spoken transcript (verbatim, with fillers).
        question: Essay prompt / topic the writer is responding to.
        desired_tone: Target tone override (e.g. "reflective", "confident").
        user_context: Any additional application context (school, scholarship).
        goal: User's stated goal for the piece.
        voice_profile: Voice profile dict (as returned by VoiceProfile.to_dict()).
        word_limit: Target word count for the final essay.
        reference_text: Optional reference material / example writing.

    Returns:
        Outline string with markers, ready to pass to Voira's generate_essay().
    """
    if not transcript or not transcript.strip():
        raise ValueError("Transcript cannot be empty")

    parts = []

    if question:
        parts.append(f"ESSAY PROMPT:\n{question.strip()}")

    if word_limit:
        parts.append(f"TARGET WORD LIMIT: {word_limit} words")
    else:
        parts.append("TARGET WORD LIMIT: 500 words (default)")

    if desired_tone:
        parts.append(f"DESIRED TONE: {desired_tone}")

    if goal:
        parts.append(f"WRITER'S GOAL: {goal}")

    if user_context:
        parts.append(f"CONTEXT:\n{user_context.strip()}")

    voice_block = _format_voice_profile_block(voice_profile)
    if voice_block:
        parts.append(voice_block)

    if reference_text:
        parts.append(
            f'REFERENCE MATERIAL (style only, do not copy):\n"""\n{reference_text.strip()}\n"""'
        )

    parts.append(
        f'RAW TRANSCRIPT (the writer talking out their ideas):\n"""\n{transcript.strip()}\n"""'
    )

    parts.append(
        "Now produce the structured outline in the exact format specified. "
        "Output ONLY the outline (starting with --- OUTLINE --- and ending with "
        "the cue line). Do not include any other text."
    )

    user_prompt = "\n\n".join(parts)

    logger.info(
        f"[OutlineGen] Generating outline from transcript "
        f"(transcript_chars={len(transcript)}, word_limit={word_limit}, "
        f"has_question={bool(question)}, has_voice_profile={bool(voice_profile)})"
    )

    outline = _call_openai_for_outline(OUTLINE_FROM_TRANSCRIPT_SYSTEM, user_prompt)
    outline = _ensure_markers(outline)

    logger.info(f"[OutlineGen] Outline produced (chars={len(outline)})")
    return outline


async def extract_outline_from_draft(
    draft: str,
    question: Optional[str] = None,
    refinement_instructions: Optional[str] = None,
    desired_tone: Optional[str] = None,
    voice_profile: Optional[Dict[str, Any]] = None,
    word_limit: Optional[int] = None,
    reference_text: Optional[str] = None,
) -> str:
    """Reverse-engineer an outline from an existing draft (for the refine flow).

    The resulting outline is then fed to Voira's generate_essay() to rewrite
    the draft with better voice and craft while preserving its factual content.

    Args:
        draft: Existing essay draft (the user's text to refine).
        question: Essay prompt / topic.
        refinement_instructions: What the user wants changed (voice notes).
        desired_tone: Target tone override.
        voice_profile: Voice profile dict.
        word_limit: Target word count for the rewritten essay.
        reference_text: Optional reference material.

    Returns:
        Outline string with markers, ready for generate_essay().
    """
    if not draft or not draft.strip():
        raise ValueError("Draft cannot be empty")

    parts = []

    if question:
        parts.append(f"ESSAY PROMPT:\n{question.strip()}")

    if word_limit:
        parts.append(f"TARGET WORD LIMIT: {word_limit} words")
    else:
        current_words = len(draft.split())
        parts.append(
            f"TARGET WORD LIMIT: {current_words} words (match existing draft length)"
        )

    if desired_tone:
        parts.append(f"DESIRED TONE: {desired_tone}")

    if refinement_instructions:
        parts.append(
            f"REFINEMENT INSTRUCTIONS (translate these into outline-level changes, "
            f"do not invent facts):\n{refinement_instructions.strip()}"
        )

    voice_block = _format_voice_profile_block(voice_profile)
    if voice_block:
        parts.append(voice_block)

    if reference_text:
        parts.append(
            f'REFERENCE MATERIAL (style only, do not copy):\n"""\n{reference_text.strip()}\n"""'
        )

    parts.append(
        f'EXISTING DRAFT (reverse-engineer the outline from this):\n"""\n{draft.strip()}\n"""'
    )

    parts.append(
        "Now produce the structured outline in the exact format specified. "
        "Output ONLY the outline (starting with --- OUTLINE --- and ending with "
        "the cue line). Do not include any other text."
    )

    user_prompt = "\n\n".join(parts)

    logger.info(
        f"[OutlineGen] Extracting outline from draft "
        f"(draft_chars={len(draft)}, draft_words={len(draft.split())}, "
        f"has_instructions={bool(refinement_instructions)})"
    )

    outline = _call_openai_for_outline(OUTLINE_FROM_DRAFT_SYSTEM, user_prompt)
    outline = _ensure_markers(outline)

    logger.info(f"[OutlineGen] Outline extracted (chars={len(outline)})")
    return outline

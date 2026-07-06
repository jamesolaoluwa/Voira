"""
Transcription service module with provider fallback.

Features:
- Primary provider: Deepgram (fast, cost-effective)
- Fallback provider: OpenAI Whisper (for redundancy)
- Automatic failover on provider errors
- Cost monitoring and logging of fallback usage

Uses REST APIs via httpx for Python 3.9 compatibility.
"""

import logging
from typing import Optional, Dict, Any
import httpx
from config import settings
from sentry_config import capture_message

logger = logging.getLogger(__name__)

# Supported audio formats for transcription
SUPPORTED_AUDIO_TYPES = {
    "audio/webm",
    "audio/wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/x-m4a",
    "audio/m4a",
    "audio/ogg",
    "audio/opus",
}

# Maximum file size: 15MB (in bytes)
MAX_FILE_SIZE = 15 * 1024 * 1024


class TranscriptionError(Exception):
    """Base exception for transcription errors."""

    pass


class UnsupportedFileTypeError(TranscriptionError):
    """Raised when file type is not supported."""

    pass


class FileTooLargeError(TranscriptionError):
    """Raised when file exceeds maximum size."""

    pass


class TranscriptionProviderError(TranscriptionError):
    """Raised when transcription provider fails."""

    pass


# Lazy-loaded provider caches (initialized on first use)
_deepgram_provider = None
_openai_provider = None


async def get_deepgram_provider():
    """Lazy load Deepgram provider on first use.

    Returns:
        Deepgram provider instance (or marker for REST API usage)
    """
    global _deepgram_provider
    if _deepgram_provider is None:
        # Mark as initialized for REST API calls
        _deepgram_provider = {"initialized": True}
        logger.debug("Deepgram provider initialized (lazy loaded)")
    return _deepgram_provider


async def get_openai_provider():
    """Lazy load OpenAI provider on first use.

    Returns:
        OpenAI provider instance (or marker for REST API usage)
    """
    global _openai_provider
    if _openai_provider is None:
        # Mark as initialized for REST API calls
        _openai_provider = {"initialized": True}
        logger.debug("OpenAI provider initialized (lazy loaded)")
    return _openai_provider


async def _transcribe_with_deepgram(
    audio_file: bytes,
    mime_type: str,
    language: Optional[str] = "en",
) -> Dict[str, Any]:
    """
    Transcribe using Deepgram provider.

    Raises TranscriptionProviderError on failure.
    """
    if not settings.deepgram_api_key:
        raise TranscriptionProviderError("Deepgram API key not configured")

    url = "https://api.deepgram.com/v1/listen"
    headers = {
        "Authorization": f"Token {settings.deepgram_api_key}",
        "Content-Type": mime_type,
    }
    params = {
        "punctuate": "true",
        "smart_format": "true",
        "language": language,
        "model": settings.deepgram_model,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            headers=headers,
            params=params,
            content=audio_file,
        )

        if response.status_code != 200:
            error_msg = f"Deepgram API returned status {response.status_code}"
            try:
                error_data = response.json()
                error_msg = error_data.get("err_msg", error_msg)
            except Exception:
                error_msg = f"{error_msg}: {response.text[:200]}"
            raise TranscriptionProviderError(error_msg)

        response_data = response.json()

    # Extract transcript and metadata from Deepgram response
    transcript_text = ""
    confidence_avg = None
    word_count = 0
    duration = 0.0

    if response_data and "results" in response_data:
        results = response_data["results"]
        if "channels" in results and len(results["channels"]) > 0:
            channel = results["channels"][0]
            if "alternatives" in channel and len(channel["alternatives"]) > 0:
                alternative = channel["alternatives"][0]
                transcript_text = alternative.get("transcript", "").strip()

                if "words" in alternative:
                    words = alternative["words"]
                    word_count = len(words)
                    confidences = [
                        word.get("confidence", 0)
                        for word in words
                        if "confidence" in word
                    ]
                    if confidences:
                        confidence_avg = sum(confidences) / len(confidences)

                if "metadata" in results and "duration" in results["metadata"]:
                    duration = results["metadata"]["duration"]
                elif "words" in alternative and len(alternative["words"]) > 0:
                    last_word = alternative["words"][-1]
                    duration = last_word.get("end", 0.0)

    return {
        "transcript": transcript_text,
        "confidence": confidence_avg,
        "duration": duration,
        "word_count": word_count,
    }


async def _transcribe_with_openai(
    audio_file: bytes,
    mime_type: str,
    language: Optional[str] = "en",
) -> Dict[str, Any]:
    """
    Transcribe using OpenAI Whisper API (fallback provider).

    COST WARNING: Whisper is ~2x more expensive than Deepgram.
    Only used as fallback when Deepgram is unavailable.

    Raises TranscriptionProviderError on failure.
    """
    if not settings.openai_api_key:
        raise TranscriptionProviderError("OpenAI API key not configured")

    url = "https://api.openai.com/v1/audio/transcriptions"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
    }

    # OpenAI Whisper API expects multipart form data
    files = {
        "file": ("audio", audio_file, mime_type),
        "model": (None, "whisper-1"),
        "language": (None, language),
        "temperature": (None, "0"),
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            headers=headers,
            files=files,
        )

        if response.status_code != 200:
            error_msg = f"OpenAI API returned status {response.status_code}"
            try:
                error_data = response.json()
                error_msg = error_data.get("error", {}).get("message", error_msg)
            except Exception:
                error_msg = f"{error_msg}: {response.text[:200]}"
            raise TranscriptionProviderError(error_msg)

        response_data = response.json()

    # OpenAI Whisper response structure: {"text": "...", "language": "..."}
    transcript_text = response_data.get("text", "").strip()

    # OpenAI Whisper doesn't return confidence, word count, or duration
    # These would need to be calculated separately if needed
    return {
        "transcript": transcript_text,
        "confidence": None,  # Not provided by Whisper API
        "duration": None,  # Not provided by Whisper API
        "word_count": len(transcript_text.split()) if transcript_text else 0,
    }


async def transcribe_audio(
    audio_file: bytes, mime_type: str, language: Optional[str] = "en"
) -> Dict[str, Any]:
    """
    Transcribe audio file with automatic provider fallback.

    Strategy:
    1. Try primary provider (Deepgram) - faster, cheaper
    2. Fall back to OpenAI Whisper if Deepgram fails
    3. Both must have API keys configured

    Args:
        audio_file: Audio file content as bytes
        mime_type: MIME type of the audio file
        language: Language code (default: "en")

    Returns:
        Dictionary with:
        - transcript: str - The transcribed text
        - confidence: Optional[float] - Confidence score (0-1), only from Deepgram
        - duration: Optional[float] - Audio duration in seconds, only from Deepgram
        - word_count: Optional[int] - Number of words in transcript

    Raises:
        UnsupportedFileTypeError: If file type is not supported
        FileTooLargeError: If file exceeds maximum size
        TranscriptionProviderError: If all providers fail
    """
    # Lazy load providers on first transcription request
    await get_deepgram_provider()
    await get_openai_provider()

    # Validate file type
    if mime_type not in SUPPORTED_AUDIO_TYPES:
        raise UnsupportedFileTypeError(
            f"Unsupported audio format: {mime_type}. "
            f"Supported formats: {', '.join(sorted(SUPPORTED_AUDIO_TYPES))}"
        )

    # Validate file size
    file_size = len(audio_file)
    if file_size > MAX_FILE_SIZE:
        raise FileTooLargeError(
            f"File size {file_size / (1024 * 1024):.2f}MB exceeds maximum of {MAX_FILE_SIZE / (1024 * 1024)}MB"
        )

    # Try primary provider (Deepgram)
    try:
        logger.debug("Attempting transcription with Deepgram")
        result = await _transcribe_with_deepgram(audio_file, mime_type, language)
        logger.info("Deepgram transcription succeeded")
        return result

    except TranscriptionProviderError as e:
        logger.warning(f"Deepgram transcription failed: {e}, trying fallback")
        deepgram_error = str(e)
    except Exception as e:
        logger.warning(f"Deepgram transcription error: {e}, trying fallback")
        deepgram_error = str(e)

    # Try fallback provider (OpenAI Whisper)
    try:
        logger.info("Falling back to OpenAI Whisper provider")
        result = await _transcribe_with_openai(audio_file, mime_type, language)

        # Alert that we used fallback (higher cost)
        capture_message(
            "Transcription fallback used - Deepgram failed, using OpenAI Whisper",
            level="warning",
            extra={
                "deepgram_error": deepgram_error,
                "transcript_length": len(result.get("transcript", "")),
                "word_count": result.get("word_count", 0),
            },
        )
        logger.warning("Used OpenAI Whisper fallback due to Deepgram failure")
        return result

    except TranscriptionProviderError as e:
        logger.error(f"OpenAI Whisper transcription failed: {e}")
        raise TranscriptionProviderError(
            f"All transcription providers failed. Deepgram: {deepgram_error}. OpenAI: {str(e)}"
        )
    except Exception as e:
        logger.error(f"OpenAI Whisper transcription error: {e}")
        raise TranscriptionProviderError(
            f"Transcription service error: Both providers failed."
        )

"""
Transcription service module.
Provides a modular interface for audio transcription providers (Deepgram, Whisper, etc.).
Uses Deepgram REST API via httpx for Python 3.9 compatibility.
"""
import logging
from typing import Optional, Dict, Any
import httpx
from config import settings

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


async def transcribe_audio(
    audio_file: bytes,
    mime_type: str,
    language: Optional[str] = "en"
) -> Dict[str, Any]:
    """
    Transcribe audio file using Deepgram.
    
    Args:
        audio_file: Audio file content as bytes
        mime_type: MIME type of the audio file
        language: Language code (default: "en")
    
    Returns:
        Dictionary with:
        - transcript: str - The transcribed text
        - confidence: Optional[float] - Confidence score (0-1)
        - duration: Optional[float] - Audio duration in seconds
        - word_count: Optional[int] - Number of words in transcript
    
    Raises:
        UnsupportedFileTypeError: If file type is not supported
        FileTooLargeError: If file exceeds maximum size
        TranscriptionProviderError: If Deepgram transcription fails
    """
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
    
    if not settings.deepgram_api_key:
        raise TranscriptionProviderError("Deepgram API key not configured")
    
    try:
        # Deepgram REST API endpoint for pre-recorded audio
        # Using REST API via httpx for Python 3.9 compatibility
        url = "https://api.deepgram.com/v1/listen"
        
        # Set headers - API key in Authorization header
        # Note: API key is loaded from environment, never logged or exposed
        headers = {
            "Authorization": f"Token {settings.deepgram_api_key}",
            "Content-Type": mime_type,
        }
        
        # Build query parameters for transcription options
        params = {
            "punctuate": "true",
            "smart_format": "true",
            "language": language,
            "model": "nova-2",  # Use Deepgram's latest model
        }
        
        # Send POST request to Deepgram API with audio file
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                headers=headers,
                params=params,
                content=audio_file,
            )
            
            # Check for HTTP errors
            if response.status_code != 200:
                error_msg = f"Deepgram API returned status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg = error_data.get("err_msg", error_msg)
                except Exception:
                    error_msg = f"{error_msg}: {response.text[:200]}"
                raise TranscriptionProviderError(error_msg)
            
            # Parse JSON response
            response_data = response.json()
        
        # Extract transcript and metadata from Deepgram response
        transcript_text = ""
        confidence_avg = None
        word_count = 0
        duration = 0.0
        
        # Deepgram response structure: response["results"]["channels"][0]["alternatives"][0]
        if response_data and "results" in response_data:
            results = response_data["results"]
            if "channels" in results and len(results["channels"]) > 0:
                channel = results["channels"][0]
                if "alternatives" in channel and len(channel["alternatives"]) > 0:
                    alternative = channel["alternatives"][0]
                    transcript_text = alternative.get("transcript", "").strip()
                    
                    # Calculate average confidence from words
                    if "words" in alternative:
                        words = alternative["words"]
                        word_count = len(words)
                        confidences = [word.get("confidence", 0) for word in words if "confidence" in word]
                        if confidences:
                            confidence_avg = sum(confidences) / len(confidences)
                    
                    # Get duration from metadata or words
                    if "metadata" in results and "duration" in results["metadata"]:
                        duration = results["metadata"]["duration"]
                    elif "words" in alternative and len(alternative["words"]) > 0:
                        # Get duration from last word's end time
                        last_word = alternative["words"][-1]
                        duration = last_word.get("end", 0.0)
        
        return {
            "transcript": transcript_text,
            "confidence": confidence_avg,
            "duration": duration,
            "word_count": word_count,
        }
    
    except UnsupportedFileTypeError:
        raise
    except FileTooLargeError:
        raise
    except Exception as e:
        # Log error details without exposing API keys or sensitive data
        error_msg = str(e)
        logger.error(f"Deepgram transcription failed: {error_msg}")
        raise TranscriptionProviderError(f"Transcription service error: {error_msg}")

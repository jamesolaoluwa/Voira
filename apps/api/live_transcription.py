"""
Live transcription service module.
Provides real-time speech-to-text streaming via WebSocket connections.

Why WebSockets are required:
- Real-time streaming requires bidirectional communication
- HTTP/REST cannot push updates from server to client
- WebSockets enable continuous audio chunk streaming and partial transcript delivery
- Essential for live transcription where users see text appear as they speak

Why live transcription is display-only for now:
- Live transcripts are provisional and may contain errors
- Final accurate transcript comes from POST /transcribe after recording completes
- Avoids duplicate credit charges (credits deducted only on final transcription)
- Keeps costs low during active recording sessions
- Users get immediate feedback without financial penalty
"""

import logging
import json
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional, Dict, Any
import asyncio

logger = logging.getLogger(__name__)


class LiveTranscriptionProvider(ABC):
    """
    Abstract base class for live transcription providers.

    This abstraction allows swapping providers (Deepgram, AssemblyAI, Google STT)
    without changing the WebSocket endpoint implementation.
    """

    @abstractmethod
    async def start_stream(
        self,
        language: str = "en",
        sample_rate: int = 16000,
        channels: int = 1,
        encoding: str = "linear16",
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Start a live transcription stream.

        Args:
            language: Language code (e.g., "en", "es")
            sample_rate: Audio sample rate in Hz
            channels: Number of audio channels
            encoding: Audio encoding format

        Yields:
            Dictionary with transcription events:
            - type: str - Event type ("partial", "final", "error")
            - text: str - Transcript text
            - confidence: Optional[float] - Confidence score (0-1)
            - start_time: Optional[float] - Start timestamp in seconds
            - end_time: Optional[float] - End timestamp in seconds
        """
        pass

    @abstractmethod
    async def send_audio_chunk(self, audio_data: bytes) -> None:
        """
        Send an audio chunk to the transcription stream.

        Args:
            audio_data: Raw audio bytes
        """
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close the transcription stream and cleanup resources."""
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Check if the stream is currently connected."""
        pass

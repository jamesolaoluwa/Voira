"""
Deepgram streaming transcription provider.

This module contains all Deepgram-specific logic for live transcription.
Isolating it here makes it easy to swap providers later (AssemblyAI, Google STT, etc.)
"""

import logging
import json
import asyncio
from typing import AsyncIterator, Dict, Any, Optional
import websockets
from websockets.client import WebSocketClientProtocol
from websockets.exceptions import WebSocketException
from config import settings

logger = logging.getLogger(__name__)

# Deepgram WebSocket endpoint for streaming transcription
# This is a fixed API endpoint (not configurable)
DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"

# Default streaming configuration (can be overridden by settings)
DEFAULT_SAMPLE_RATE = 48000  # Browser default
DEFAULT_CHANNELS = 1  # Mono
DEFAULT_ENCODING = "linear16"  # PCM
DEFAULT_MODEL = "nova-2"
DEFAULT_ENDPOINTING_MS = 500  # Silence threshold for endpointing


class DeepgramStreamingProvider:
    """
    Deepgram live transcription provider implementation.

    Handles WebSocket connection to Deepgram, audio chunk streaming,
    and parsing of real-time transcript responses.
    """

    def __init__(self):
        self._ws: Optional[WebSocketClientProtocol] = None
        self._connected = False
        self._receive_task: Optional[asyncio.Task] = None
        self._transcript_queue: asyncio.Queue = asyncio.Queue()
        self._closed = False

    async def start_stream(
        self,
        language: str = "en",
        sample_rate: int = None,
        channels: int = None,
        encoding: str = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Start Deepgram streaming transcription.

        Args:
            language: Language code (default: "en")
            sample_rate: Audio sample rate (default from settings or 48000 Hz)
            channels: Number of audio channels (default from settings or 1 mono)
            encoding: Audio encoding (default from settings or "linear16" for PCM)

        Yields:
            Transcription event dictionaries
        """
        if not settings.deepgram_api_key:
            raise ValueError("Deepgram API key not configured")

        if self._connected:
            raise RuntimeError("Stream already started")

        # Use config values or defaults
        actual_sample_rate = sample_rate or getattr(
            settings, "deepgram_sample_rate", DEFAULT_SAMPLE_RATE
        )
        actual_channels = channels or getattr(
            settings, "deepgram_channels", DEFAULT_CHANNELS
        )
        actual_encoding = encoding or getattr(
            settings, "deepgram_encoding", DEFAULT_ENCODING
        )
        model = getattr(settings, "deepgram_model", DEFAULT_MODEL)
        endpointing = DEFAULT_ENDPOINTING_MS  # Fixed value for now

        try:
            # Build Deepgram WebSocket URL with query parameters
            # Note: Deepgram WebSocket auth uses query param with token=API_KEY
            params = {
                "token": settings.deepgram_api_key,  # API key in query param
                "model": model,
                "language": language,
                "smart_format": "true",
                "punctuate": "true",
                "interim_results": "true",  # Get partial transcripts
                "vad_events": "true",  # Voice Activity Detection events
                "endpointing": str(
                    endpointing
                ),  # Milliseconds of silence to trigger endpointing
                "encoding": actual_encoding,
                "sample_rate": str(actual_sample_rate),
                "channels": str(actual_channels),
            }

            query_string = "&".join([f"{k}={v}" for k, v in params.items()])
            ws_url = f"{DEEPGRAM_WS_URL}?{query_string}"

            # Connect to Deepgram WebSocket
            # Log configuration and URL (without API key for security)
            logger.info(
                f"Deepgram config: encoding={actual_encoding}, sample_rate={actual_sample_rate} Hz, channels={actual_channels}, language={language}, model={model}"
            )
            logger.info(
                f"Deepgram WebSocket URL: {DEEPGRAM_WS_URL}?token=***&model={model}&language={language}&encoding={actual_encoding}&sample_rate={actual_sample_rate}&channels={actual_channels}&smart_format=true&punctuate=true&interim_results=true&vad_events=true&endpointing={endpointing}"
            )
            self._ws = await websockets.connect(ws_url)
            self._connected = True
            logger.info("Connected to Deepgram streaming service")

            # Start background task to receive messages from Deepgram
            self._receive_task = asyncio.create_task(self._receive_messages())

            # Yield transcript events as they arrive
            while self._connected and not self._closed:
                try:
                    # Wait for transcript event with timeout to check connection
                    event = await asyncio.wait_for(
                        self._transcript_queue.get(), timeout=1.0
                    )
                    yield event

                    # Stop if we receive an error or final close event
                    if event.get("type") == "error" or event.get("type") == "close":
                        break
                except asyncio.TimeoutError:
                    # Check if still connected
                    if self._closed:
                        break
                    continue
                except Exception as e:
                    logger.error(f"Error receiving transcript event: {e}")
                    yield {"type": "error", "message": "Transcription stream error"}
                    break

        except Exception as e:
            logger.error(f"Failed to start Deepgram stream: {e}")
            error_msg = str(e)
            # Never expose API keys in error messages
            if settings.deepgram_api_key and settings.deepgram_api_key in error_msg:
                error_msg = "Deepgram authentication failed"
            raise Exception(f"Failed to start transcription stream: {error_msg}")

    async def _receive_messages(self) -> None:
        """
        Background task to receive messages from Deepgram WebSocket.
        Parses Deepgram responses and queues transcript events.
        """
        try:
            while self._connected and not self._closed and self._ws:
                try:
                    # Receive message from Deepgram
                    message = await self._ws.recv()

                    # Handle both text and binary messages (Deepgram sends JSON as text)
                    if isinstance(message, bytes):
                        message = message.decode("utf-8")

                    # Parse JSON response
                    data = json.loads(message)

                    # Log all incoming Deepgram messages for debugging
                    msg_type = data.get("type", "Unknown")
                    logger.info(f"[Deepgram] Received message type: {msg_type}")

                    # Deepgram sends different message types
                    # We're interested in "results" messages with transcripts
                    if "type" in data:
                        if data["type"] == "Metadata":
                            # Connection metadata - log but don't process
                            logger.debug(f"[Deepgram] Metadata: {data}")
                            continue
                        elif data["type"] == "SpeechStarted":
                            # Voice activity detected
                            logger.info("[Deepgram] SpeechStarted event")
                            continue
                        elif data["type"] == "UtteranceEnd":
                            # Utterance ended (endpointing triggered)
                            logger.info("[Deepgram] UtteranceEnd event")
                            continue
                        elif data["type"] == "Results":
                            # Transcript results
                            await self._parse_results(data)
                        else:
                            # Log any other message types for debugging
                            logger.debug(
                                f"[Deepgram] Unknown message type '{data['type']}': {data}"
                            )
                    elif "channel" in data:
                        # Alternative response format
                        await self._parse_channel_results(data)
                    else:
                        # Log messages that don't match expected formats
                        logger.debug(f"[Deepgram] Unrecognized message format: {data}")

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error receiving Deepgram message: {e}")
                    await self._transcript_queue.put(
                        {"type": "error", "message": f"Connection error: {str(e)}"}
                    )
                    break

        except Exception as e:
            logger.error(f"Deepgram receive task error: {e}")
        finally:
            self._connected = False

    async def _parse_results(self, data: Dict[str, Any]) -> None:
        """
        Parse Deepgram Results message and queue transcript events.

        Deepgram Results structure:
        {
            "type": "Results",
            "channel_index": [0],
            "duration": 1.23,
            "start": 0.0,
            "is_final": false,
            "speech_final": false,
            "channel": {
                "alternatives": [{
                    "transcript": "Hello world",
                    "confidence": 0.95,
                    "words": [...]
                }]
            }
        }
        """
        try:
            channel = data.get("channel", {})
            alternatives = channel.get("alternatives", [])

            if not alternatives:
                return

            alternative = alternatives[0]
            transcript_text = alternative.get("transcript", "").strip()

            if not transcript_text:
                return

            # Determine if this is a partial or final transcript
            is_final = data.get("is_final", False)
            event_type = "final" if is_final else "partial"

            # Extract confidence (average of word confidences if available)
            confidence = None
            words = alternative.get("words", [])
            if words:
                confidences = [
                    w.get("confidence", 0) for w in words if "confidence" in w
                ]
                if confidences:
                    confidence = sum(confidences) / len(confidences)
            else:
                confidence = alternative.get("confidence")

            # Extract timestamps
            start_time = data.get("start", 0.0)
            duration = data.get("duration", 0.0)
            end_time = start_time + duration if duration else None

            # Queue transcript event
            event = {
                "type": event_type,
                "text": transcript_text,
                "confidence": confidence,
                "start_time": start_time,
                "end_time": end_time,
            }

            # Debug: Log when transcript message is received from Deepgram
            logger.info(
                f"[Deepgram] Received {event_type} transcript: {transcript_text[:100]}{'...' if len(transcript_text) > 100 else ''} (confidence: {confidence})"
            )

            await self._transcript_queue.put(event)

        except Exception as e:
            logger.error(f"Error parsing Deepgram results: {e}")

    async def _parse_channel_results(self, data: Dict[str, Any]) -> None:
        """
        Parse alternative Deepgram response format (channel-based).
        """
        try:
            channel = data.get("channel", {})
            alternatives = channel.get("alternatives", [])

            if not alternatives:
                return

            alternative = alternatives[0]
            transcript_text = alternative.get("transcript", "").strip()

            if not transcript_text:
                return

            event = {
                "type": "partial",
                "text": transcript_text,
                "confidence": alternative.get("confidence"),
                "start_time": None,
                "end_time": None,
            }

            # Debug: Log when transcript message is received from Deepgram (alternative format)
            logger.info(
                f"[Deepgram] Received partial transcript (channel format): {transcript_text[:100]}{'...' if len(transcript_text) > 100 else ''} (confidence: {alternative.get('confidence')})"
            )

            await self._transcript_queue.put(event)

        except Exception as e:
            logger.error(f"Error parsing channel results: {e}")

    async def send_audio_chunk(self, audio_data: bytes) -> None:
        """
        Send audio chunk to Deepgram for transcription.

        Args:
            audio_data: Raw audio bytes (should match encoding/sample_rate from start_stream)
        """
        if not self._connected or not self._ws or self._closed:
            raise RuntimeError("Stream not connected")

        try:
            # Send binary audio data to Deepgram
            await self._ws.send(audio_data)
        except Exception as e:
            logger.error(f"Error sending audio chunk to Deepgram: {e}")
            raise

    async def close(self) -> None:
        """Close Deepgram stream connection."""
        if self._closed:
            return  # Already closed, idempotent
        self._closed = True
        await self._cleanup()

    async def _cleanup(self) -> None:
        """Clean up WebSocket connection and resources."""
        try:
            # Cancel receive task if running
            if self._receive_task and not self._receive_task.done():
                self._receive_task.cancel()
                try:
                    await self._receive_task
                except asyncio.CancelledError:
                    pass

            # Close WebSocket connection
            if self._ws:
                try:
                    await self._ws.close()
                except Exception as e:
                    logger.debug(f"Error closing WebSocket: {e}")
                self._ws = None

            self._connected = False

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

    def is_connected(self) -> bool:
        """Check if stream is connected."""
        return self._connected and not self._closed

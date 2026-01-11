"""
Deepgram streaming transcription provider using websockets library.
Supports audio/webm format (Deepgram auto-detects format).
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
DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"


class DeepgramWebmProvider:
    """
    Deepgram live transcription provider using websockets library.
    Handles WebM audio streaming and real-time transcript events.
    """
    
    def __init__(self):
        self._ws: Optional[WebSocketClientProtocol] = None
        self._connected = False
        self._receive_task: Optional[asyncio.Task] = None
        self._transcript_queue: asyncio.Queue = asyncio.Queue()
        self._closed = False
    
    async def connect(self) -> None:
        """
        Connect to Deepgram WebSocket. Must be called before start_stream().
        """
        if not settings.deepgram_api_key:
            raise ValueError("Deepgram API key not configured")
        
        if self._connected:
            raise RuntimeError("Stream already connected")
        
        # Build Deepgram WebSocket URL with query parameters (excluding token)
        # Token goes in Authorization header instead
        params = {
            "model": "nova-2",
            "language": "en-US",
            "smart_format": "true",
            "interim_results": "true",
        }
        
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        ws_url = f"{DEEPGRAM_WS_URL}?{query_string}"
        
        # Connect to Deepgram WebSocket with Authorization header
        # Deepgram expects "Token API_KEY" format in Authorization header
        headers = {
            "Authorization": f"Token {settings.deepgram_api_key}"
        }
        
        logger.info(f"Connecting to Deepgram WebSocket: {ws_url[:80]}...")
        self._ws = await websockets.connect(ws_url, additional_headers=headers)
        self._connected = True
        logger.info("✅ Connected to Deepgram streaming service (WebM)")
        
        # Start background task to receive messages from Deepgram
        logger.info("Starting Deepgram message receiver task...")
        self._receive_task = asyncio.create_task(self._receive_messages())
        
        # Give the receiver task a moment to start
        await asyncio.sleep(0.1)
    
    async def start_stream(self) -> AsyncIterator[Dict[str, Any]]:
        """
        Start streaming transcription events. connect() must be called first.
        
        Yields:
            Transcription event dictionaries with type, text, confidence
        """
        if not self._connected:
            raise RuntimeError("Must call connect() before start_stream()")
        
        # Yield transcript events as they arrive
        while self._connected and not self._closed:
            try:
                event = await asyncio.wait_for(self._transcript_queue.get(), timeout=1.0)
                yield event
                
                if event.get("type") == "error" or event.get("type") == "close":
                    break
            except asyncio.TimeoutError:
                if self._closed:
                    break
                continue
            except Exception as e:
                logger.error(f"Error receiving transcript event: {e}")
                yield {"type": "error", "message": str(e)}
                break
    
    async def _receive_messages(self) -> None:
        """Background task to receive messages from Deepgram WebSocket. Logs every TranscriptReceived event."""
        try:
            logger.info("[Deepgram] Starting message receiver loop")
            while self._connected and not self._closed and self._ws:
                try:
                    message = await self._ws.recv()
                    
                    if isinstance(message, bytes):
                        message = message.decode('utf-8')
                    
                    data = json.loads(message)
                    msg_type = data.get("type", "Unknown")
                    
                    # Log every message received (especially TranscriptReceived/Results)
                    logger.info(f"[Deepgram] Received message type: {msg_type}, full data: {json.dumps(data)[:200]}")
                    
                    if "type" in data:
                        if data["type"] == "Metadata":
                            logger.debug(f"[Deepgram] Metadata: {data}")
                            continue
                        elif data["type"] == "SpeechStarted":
                            logger.info("[Deepgram] SpeechStarted event")
                            continue
                        elif data["type"] == "UtteranceEnd":
                            logger.info("[Deepgram] UtteranceEnd event")
                            continue
                        elif data["type"] == "Results":
                            # Log every TranscriptReceived/Results event
                            logger.info("[Deepgram] TranscriptReceived (Results) event - processing transcript")
                            await self._parse_results(data)
                        else:
                            logger.debug(f"[Deepgram] Unknown message type '{data['type']}': {data}")
                    elif "channel" in data:
                        await self._parse_channel_results(data)
                    else:
                        logger.debug(f"[Deepgram] Unrecognized message format: {data}")
                
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error receiving Deepgram message: {e}")
                    await self._transcript_queue.put({
                        "type": "error",
                        "message": f"Connection error: {str(e)}"
                    })
                    break
        
        except Exception as e:
            logger.error(f"Deepgram receive task error: {e}")
        finally:
            self._connected = False
    
    async def _parse_results(self, data: Dict[str, Any]) -> None:
        """Parse Deepgram Results message and queue transcript events."""
        try:
            channel = data.get("channel", {})
            alternatives = channel.get("alternatives", [])
            
            if not alternatives:
                return
            
            alternative = alternatives[0]
            transcript_text = alternative.get("transcript", "").strip()
            
            if not transcript_text:
                return
            
            is_final = data.get("is_final", False)
            event_type = "final" if is_final else "partial"
            
            confidence = None
            words = alternative.get("words", [])
            if words:
                confidences = [w.get("confidence", 0) for w in words if "confidence" in w]
                if confidences:
                    confidence = sum(confidences) / len(confidences)
            else:
                confidence = alternative.get("confidence")
            
            event = {
                "type": event_type,
                "text": transcript_text,
                "confidence": confidence,
            }
            
            # Log every transcript event with details
            logger.info(f"[Deepgram] TranscriptReceived - {event_type.upper()}: '{transcript_text[:100]}{'...' if len(transcript_text) > 100 else ''}' (confidence: {confidence})")
            
            await self._transcript_queue.put(event)
        
        except Exception as e:
            logger.error(f"Error parsing Deepgram results: {e}")
    
    async def _parse_channel_results(self, data: Dict[str, Any]) -> None:
        """Parse alternative Deepgram response format (channel-based)."""
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
            }
            
            logger.info(f"[Deepgram] TranscriptReceived - PARTIAL (channel format): '{transcript_text[:100]}{'...' if len(transcript_text) > 100 else ''}'")
            
            await self._transcript_queue.put(event)
        
        except Exception as e:
            logger.error(f"Error parsing channel results: {e}")
    
    async def send_audio_chunk(self, audio_data: bytes) -> None:
        """
        Send audio chunk to Deepgram.
        Relays binary audio bytes directly to Deepgram connection.
        
        Args:
            audio_data: Raw audio bytes (audio/webm format)
        """
        if not self._connected or not self._ws or self._closed:
            raise RuntimeError("Stream not connected")
        
        try:
            # Send binary audio data directly to Deepgram (WebM format)
            logger.info(f"[Deepgram] 📤 Sending audio chunk: {len(audio_data)} bytes")
            await self._ws.send(audio_data)
        except Exception as e:
            logger.error(f"Error sending audio chunk to Deepgram: {e}")
            raise
    
    async def close(self) -> None:
        """Close Deepgram stream connection."""
        if self._closed:
            return
        self._closed = True
        await self._cleanup()
    
    async def _cleanup(self) -> None:
        """Clean up WebSocket connection and resources."""
        try:
            if self._receive_task and not self._receive_task.done():
                self._receive_task.cancel()
                try:
                    await self._receive_task
                except asyncio.CancelledError:
                    pass
            
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

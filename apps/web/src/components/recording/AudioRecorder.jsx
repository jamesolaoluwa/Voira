import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { audio } from '@/components/services/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// WebSocket URL for live transcription - must point to backend, never frontend
// Defaults to backend API URL with /ws/listen endpoint
const getTranscriptionWebSocketUrl = () => {
  // If explicitly set, use that (with validation)
  const explicitWsUrl = import.meta.env.VITE_TRANSCRIPTION_WS_URL;
  if (explicitWsUrl) {
    try {
      const url = new URL(explicitWsUrl);
      // Validate it's not pointing to frontend dev server
      const isFrontend = url.port === '5173' || 
                         (url.hostname === 'localhost' && !url.port && url.protocol === 'ws:') ||
                         (url.hostname === 'localhost' && url.port === '' && url.protocol === 'ws:');
      if (isFrontend) {
        console.error('[AudioRecorder] VITE_TRANSCRIPTION_WS_URL points to frontend dev server (port 5173 or no port)!', explicitWsUrl);
        console.error('[AudioRecorder] Using backend fallback: ws://localhost:8000/ws/listen');
      } else {
        console.log('[AudioRecorder] Using explicit WebSocket URL:', explicitWsUrl);
        return explicitWsUrl;
      }
    } catch (err) {
      console.error('[AudioRecorder] Invalid VITE_TRANSCRIPTION_WS_URL:', explicitWsUrl, err);
      // Fall through to use backend default
    }
  }
  
  // Fallback: derive from API_BASE_URL (backend)
  try {
    const apiUrl = new URL(API_BASE_URL);
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${apiUrl.host}/ws/listen`;
    
    // Validate we're not accidentally using frontend
    if (apiUrl.port === '5173' || 
        (apiUrl.hostname === 'localhost' && !apiUrl.port) ||
        (apiUrl.hostname === 'localhost' && apiUrl.port === '')) {
      console.error('[AudioRecorder] API_BASE_URL points to frontend! Forcing backend fallback.');
      console.error('[AudioRecorder] API_BASE_URL:', API_BASE_URL);
      return 'ws://localhost:8000/ws/listen';
    }
    
    console.log('[AudioRecorder] Derived WebSocket URL from API_BASE_URL:', wsUrl);
    return wsUrl;
  } catch (err) {
    console.error('[AudioRecorder] Invalid API_BASE_URL:', API_BASE_URL, err);
    // Final fallback: hardcoded backend URL
    console.warn('[AudioRecorder] Using hardcoded backend fallback: ws://localhost:8000/ws/listen');
    return 'ws://localhost:8000/ws/listen';
  }
};

export default function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [error, setError] = useState(null);
  const [amplitude, setAmplitude] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const hasAudioChunksRef = useRef(false); // Track if at least one audio chunk was received
  const recorderStateRef = useRef('idle'); // Track recorder state: 'idle' | 'recording' | 'stopping' | 'stopped'
  const wsStatusRef = useRef('idle'); // Track WebSocket status: 'idle' | 'connecting' | 'open' | 'error' | 'closed'
  
  // Live transcription WebSocket connection
  const wsRef = useRef(null);
  const wsReadyRef = useRef(false);
  const chunkIntervalRef = useRef(null);
  const accumulatedTranscriptRef = useRef(''); // Track accumulated final transcripts
  const pendingChunksRef = useRef([]); // Queue chunks that arrive before WebSocket is ready
  
  // Helper to get JWT token for WebSocket auth from Supabase session
  const getAuthToken = async () => {
    try {
      const { supabase } = await import('@/components/lib/supabase');
      // Await session to ensure it's loaded before constructing WebSocket URL
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('[TranscriptionWS] Error getting Supabase session:', error);
        return null;
      }
      
      if (!session) {
        console.warn('[TranscriptionWS] No Supabase session found - user may not be authenticated');
        return null;
      }
      
      const token = session.access_token;
      if (!token) {
        console.warn('[TranscriptionWS] Session exists but access_token is missing');
        return null;
      }
      
      // Validate token is a proper JWT (should be at least 50 chars for a valid JWT)
      if (token.length < 50) {
        console.error(`[TranscriptionWS] Token too short (${token.length} chars) - likely invalid`);
        return null;
      }
      
      console.log(`[TranscriptionWS] Token retrieved from Supabase session (length: ${token.length})`);
      return token;
    } catch (err) {
      console.error('[TranscriptionWS] Error getting auth token:', err);
      return null;
    }
  };

  /**
   * Start live transcription WebSocket connection using MediaRecorder (audio/webm).
   * Returns true if connection initiated successfully, false if it failed.
   */
  const startLiveTranscription = async () => {
    // Check WebSocket state - close any stale connections first
    if (wsRef.current) {
      const wsState = wsRef.current.readyState;
      console.log('[TranscriptionWS] Existing WebSocket found, state:', wsState);
      
      // Close stale connections (OPEN, CONNECTING, or CLOSING) to start fresh
      if (wsState === WebSocket.OPEN || wsState === WebSocket.CONNECTING || wsState === WebSocket.CLOSING) {
        console.log('[TranscriptionWS] Closing stale WebSocket connection (state:', wsState, ')');
        try {
          wsRef.current.close();
        } catch (closeErr) {
          console.warn('[TranscriptionWS] Error closing stale WebSocket:', closeErr);
        }
        wsRef.current = null;
        wsReadyRef.current = false;
        wsStatusRef.current = 'idle';
      } else if (wsState === WebSocket.CLOSED) {
        // Already closed, just clean up refs
        console.log('[TranscriptionWS] WebSocket already closed, cleaning up refs');
        wsRef.current = null;
        wsReadyRef.current = false;
        wsStatusRef.current = 'idle';
      }
    }
    
    // Now start fresh connection - refs are cleaned up above
    
    try {
      // Get JWT token for authentication from Supabase session
      // MUST await this before constructing WebSocket URL
      const token = await getAuthToken();
      
      // Hard validation: token must exist and be valid length (JWT tokens are typically 150+ chars)
      if (!token || typeof token !== 'string') {
        console.error('[TranscriptionWS] Token validation failed: token is null, undefined, or not a string');
        setError('Authentication expired. Please refresh the page and try again.');
        wsStatusRef.current = 'error';
        return false; // DO NOT open WebSocket
      }
      
      if (token.trim().length === 0) {
        console.error('[TranscriptionWS] Token validation failed: token is empty string');
        setError('Authentication expired. Please refresh the page and try again.');
        wsStatusRef.current = 'error';
        return false; // DO NOT open WebSocket
      }
      
      if (token.length < 50) {
        console.error(`[TranscriptionWS] Token validation failed: token too short (${token.length} chars, expected >= 50)`);
        setError('Authentication expired. Please refresh the page and try again.');
        wsStatusRef.current = 'error';
        return false; // DO NOT open WebSocket
      }

      // Build WebSocket URL - ensure it points to backend, never frontend
      const baseWsUrl = getTranscriptionWebSocketUrl();
      const wsUrl = `${baseWsUrl}?token=${encodeURIComponent(token)}`;
      
      // Final validation: ensure URL is not pointing to frontend
      const url = new URL(wsUrl);
      if (url.port === '5173' || (url.hostname === 'localhost' && !url.port && url.protocol === 'ws:')) {
        console.error('[TranscriptionWS] WebSocket URL validation failed - points to frontend!', wsUrl);
        console.error('[TranscriptionWS] API_BASE_URL:', API_BASE_URL);
        console.error('[TranscriptionWS] VITE_TRANSCRIPTION_WS_URL:', import.meta.env.VITE_TRANSCRIPTION_WS_URL);
        setError('WebSocket configuration error - cannot connect to frontend. Please check VITE_TRANSCRIPTION_WS_URL or VITE_API_BASE_URL.');
        wsStatusRef.current = 'error';
        return false; // DO NOT open WebSocket
      }
      
      // Log EXACT WebSocket URL with masked token (first 10 chars only)
      const tokenPreview = token.substring(0, 10);
      const maskedUrl = wsUrl.replace(/token=[^&]+/, `token=${tokenPreview}...`);
      console.log(`[TranscriptionWS] Connecting to ${maskedUrl} (token length: ${token.length})`);
      
      // Open WebSocket connection to backend
      wsStatusRef.current = 'connecting';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      // Return true to indicate connection was initiated successfully
      // Note: Actual success is determined by ws.onopen firing

      // Handle WebSocket connection opened
      ws.onopen = () => {
        console.log('[TranscriptionWS] WS authenticated & open - ready to receive audio chunks');
        wsReadyRef.current = true;
        wsStatusRef.current = 'open';
        setError(null); // Clear any previous errors
        
        // Send any pending chunks that arrived before WebSocket was ready
        if (pendingChunksRef.current.length > 0) {
          console.log(`[TranscriptionWS] Sending ${pendingChunksRef.current.length} queued audio chunks`);
          while (pendingChunksRef.current.length > 0) {
            const chunk = pendingChunksRef.current.shift();
            try {
              ws.send(chunk);
              console.log('[TranscriptionWS] Sent queued chunk, size:', chunk.size);
            } catch (err) {
              console.error('[TranscriptionWS] Error sending queued chunk:', err);
            }
          }
        }
      };

      // Handle incoming transcript messages from backend
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Live Transcription] Received message:', data);
          
          if (data.type === 'partial' || data.type === 'final') {
            if (data.text) {
              const trimmedText = data.text.trim();
              console.log('[Live Transcription] Received', data.type, ':', trimmedText);
              
              if (data.type === 'final') {
                // Final results: append to accumulated transcript
                accumulatedTranscriptRef.current += (accumulatedTranscriptRef.current ? ' ' : '') + trimmedText;
                setLiveTranscript(accumulatedTranscriptRef.current);
                console.log('[Live Transcription] Accumulated transcript:', accumulatedTranscriptRef.current);
              } else {
                // Partial results: show accumulated + current partial
                const displayText = accumulatedTranscriptRef.current 
                  ? accumulatedTranscriptRef.current + ' ' + trimmedText
                  : trimmedText;
                setLiveTranscript(displayText);
              }
            } else {
              console.log('[Live Transcription] Received transcript message but text is empty');
            }
          } else if (data.type === 'error') {
            console.error('Live transcription error:', data.message);
            setError(data.message || 'Live transcription error');
            wsReadyRef.current = false;
          } else {
            console.log('[Live Transcription] Received unknown message type:', data.type);
          }
        } catch (err) {
          console.error('Error parsing transcript message:', err, event.data);
        }
      };

      ws.onerror = (err) => {
        console.error('[TranscriptionWS] WS error occurred:', err);
        console.error('[TranscriptionWS] WS readyState:', ws.readyState);
        // Don't log full URL with token, but log base URL
        console.error('[TranscriptionWS] WS base URL:', baseWsUrl);
        wsStatusRef.current = 'error';
        wsReadyRef.current = false;
        setError('Live transcription connection error - WebSocket failed to connect');
      };

      ws.onclose = (event) => {
        const closeCode = event.code;
        const closeReason = event.reason || 'No reason provided';
        const wasClean = event.wasClean;
        
        console.log(`[TranscriptionWS] WS closed - code: ${closeCode}, reason: "${closeReason}", clean: ${wasClean}`);
        
        // Log error-level for abnormal closes (including auth failures)
        if (!wasClean || closeCode !== 1000) {
          console.error('[TranscriptionWS] WS closed abnormally:', {
            code: closeCode,
            reason: closeReason,
            wasClean,
            note: closeCode === 1008 ? 'Likely authentication failure - check token validity' : 'Connection error'
          });
          wsStatusRef.current = 'error';
          // Provide user-friendly error message
          if (closeCode === 1008) {
            setError('Authentication failed. Please refresh the page and try again.');
          } else {
            setError(`Live transcription connection closed: ${closeReason || 'Connection lost'}`);
          }
        } else {
          wsStatusRef.current = 'closed';
        }
        
        wsReadyRef.current = false;
        wsRef.current = null;
      };
      
      console.log('[TranscriptionWS] WebSocket connection initiated, waiting for handshake...');
      return true; // Connection initiated successfully
      
    } catch (err) {
      console.error('[TranscriptionWS] Error starting live transcription:', err);
      setError('Live transcription unavailable');
      wsStatusRef.current = 'error';
      return false; // Connection failed
    }
  };

  /**
   * Stop live transcription and close WebSocket connection.
   * Idempotent - safe to call multiple times.
   */
  const stopLiveTranscription = () => {
    // Idempotent cleanup - check state before acting
    if (wsRef.current) {
      const wsState = wsRef.current.readyState;
      console.log('[TranscriptionWS] Stopping live transcription, WebSocket state:', wsState);
      
      // Close WebSocket connection if not already closed
      if (wsState !== WebSocket.CLOSED && wsState !== WebSocket.CLOSING) {
        try {
          wsRef.current.close();
          console.log('[TranscriptionWS] WebSocket close() called');
        } catch (err) {
          console.error('[TranscriptionWS] Error closing WebSocket:', err);
        }
      } else {
        console.log('[TranscriptionWS] WebSocket already closing/closed, skipping close()');
      }
      
      wsRef.current = null;
    } else {
      console.log('[TranscriptionWS] WebSocket ref is null, already cleaned up');
    }

    // Reset WebSocket state refs
    wsReadyRef.current = false;
    wsStatusRef.current = 'idle';

    // Clear interval if set (idempotent)
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Clear live transcript
    setLiveTranscript('');
    accumulatedTranscriptRef.current = '';
    
    // Clear pending chunks queue
    pendingChunksRef.current = [];
    
    console.log('[TranscriptionWS] Live transcription cleanup complete');
  };
  
  /**
   * Send audio chunk to live transcription WebSocket.
   * Queues chunks if WebSocket is not ready yet.
   */
  const sendAudioChunk = (blob) => {
    if (!blob || blob.size === 0) {
      console.warn('[TranscriptionWS] Attempted to send empty chunk, skipping');
      return;
    }
    
    if (wsRef.current && wsReadyRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(blob);
        console.log(`[TranscriptionWS] Sent audio chunk to Deepgram (size: ${blob.size} bytes)`);
      } catch (err) {
        console.error('[TranscriptionWS] Error sending audio chunk to WebSocket:', err);
        // Queue chunk if send failed
        pendingChunksRef.current.push(blob);
        console.log('[TranscriptionWS] Chunk queued after send failure. Queue size:', pendingChunksRef.current.length);
      }
    } else {
      // Queue chunk if WebSocket is not ready yet
      pendingChunksRef.current.push(blob);
      console.log(`[TranscriptionWS] WebSocket not ready, queued chunk (size: ${blob.size} bytes). Queue size: ${pendingChunksRef.current.length}`);
    }
  };

  const startRecording = async (options = {}) => {
    const { enableLiveTranscription = true, stream: providedStream = null } = options;
    
    // Log current state at start (for debugging stale state issues)
    console.log('[AudioRecorder] startRecording called - state check:', {
      recorderState: recorderStateRef.current,
      wsStatus: wsStatusRef.current,
      wsReady: wsReadyRef.current,
      mediaRecorder: mediaRecorderRef.current ? mediaRecorderRef.current.state : 'null',
      wsRef: wsRef.current ? `readyState=${wsRef.current.readyState}` : 'null',
      streamRef: streamRef.current ? 'exists' : 'null',
      hasAudioChunks: hasAudioChunksRef.current,
      pendingChunksCount: pendingChunksRef.current.length
    });
    
    // Check if recorder is already active - early return ONLY for active states
    if (recorderStateRef.current === 'recording' || recorderStateRef.current === 'stopping') {
      console.warn('[AudioRecorder] startRecording called but recorder is already', recorderStateRef.current, '- aborting');
      throw new Error(`Recording already ${recorderStateRef.current}`);
    }
    
    // Reset ALL refs/flags to initial values before starting a new recording
    // This ensures no stale state from previous recording blocks re-entry
    console.log('[AudioRecorder] Resetting all refs/flags for new recording');
    setLiveTranscript('');
    accumulatedTranscriptRef.current = '';
    pendingChunksRef.current = [];
    hasAudioChunksRef.current = false;
    recorderStateRef.current = 'idle';
    wsStatusRef.current = 'idle';
    wsReadyRef.current = false;
    // Note: mediaRecorderRef and wsRef will be set below, don't clear them yet
    
    try {
      // Clean up any stale MediaRecorder before starting new one
      // This ensures we don't have stale refs blocking re-entry
      if (mediaRecorderRef.current) {
        const mrState = mediaRecorderRef.current.state;
        console.log('[AudioRecorder] Cleaning up stale MediaRecorder, state:', mrState);
        try {
          if (mrState !== 'inactive') {
            // Stop if still recording/paused
            mediaRecorderRef.current.stop();
          }
          // Remove event listeners if any
          mediaRecorderRef.current.ondataavailable = null;
          mediaRecorderRef.current.onstop = null;
        } catch (cleanupErr) {
          console.warn('[AudioRecorder] Error cleaning up stale MediaRecorder:', cleanupErr);
        }
        mediaRecorderRef.current = null;
      }
      
      // Get audio stream - use provided stream if available (from user gesture),
      // otherwise request it here (for backward compatibility)
      let stream = providedStream;
      if (!stream) {
        console.log('[AudioRecorder] Requesting microphone permission (fallback)...');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;
      
      // Start live transcription WebSocket connection if enabled
      // This ensures the WebSocket is ready before MediaRecorder starts sending chunks
      if (enableLiveTranscription) {
        console.log('[AudioRecorder] Starting live transcription WebSocket...');
        const wsStarted = await startLiveTranscription();
        
        // Check if WebSocket connection was initiated successfully
        // startLiveTranscription returns true on success, false on failure, or undefined if already connecting
        if (wsStarted === false) {
          console.error('[AudioRecorder] WebSocket connection failed to initiate (token validation failed or error)');
          console.error('[AudioRecorder] wsStarted value:', wsStarted);
          throw new Error('WebSocket authentication failed - token validation failed');
        }
        
        // Log if WebSocket connection was initiated
        if (wsStarted === true) {
          console.log('[AudioRecorder] WebSocket connection initiated successfully');
        } else {
          console.log('[AudioRecorder] WebSocket connection already in progress (wsStarted:', wsStarted, ')');
        }
        
        // Wait for WebSocket to be ready (with timeout)
        // CRITICAL: MediaRecorder MUST NOT start until WebSocket is authenticated and open
        console.log('[AudioRecorder] Waiting for WebSocket to authenticate and open...');
        const waitForReady = () => {
          return new Promise((resolve, reject) => {
            // Check if WebSocket is in error state - don't proceed
            if (wsStatusRef.current === 'error') {
              console.error('[TranscriptionWS] WebSocket in error state, aborting recording start');
              setError('Live transcription connection failed. Please refresh and try again.');
              reject(new Error('WebSocket authentication failed'));
              return;
            }
            
            // Check if WebSocket is already open
            if (wsReadyRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              console.log('[TranscriptionWS] WebSocket already open, proceeding with MediaRecorder');
              resolve();
              return;
            }
            
            // Poll for WebSocket to become ready
            const checkInterval = setInterval(() => {
              // Check for error state during wait (e.g., auth failure)
              if (wsStatusRef.current === 'error') {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                console.error('[TranscriptionWS] WebSocket failed during wait (auth failed or connection error), aborting recording start');
                setError('Live transcription connection failed. Please refresh and try again.');
                reject(new Error('WebSocket authentication failed'));
                return;
              }
              
              // Check if WebSocket is now open (after ws.onopen fires)
              if (wsReadyRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                console.log('[TranscriptionWS] WebSocket authenticated & open, proceeding with MediaRecorder');
                resolve();
                return;
              }
              
              // Check if WebSocket closed before opening (auth failure)
              if (wsRef.current && wsRef.current.readyState === WebSocket.CLOSED) {
                clearInterval(checkInterval);
                clearTimeout(timeout);
                console.error('[TranscriptionWS] WebSocket closed before opening (likely auth failure), aborting recording start');
                wsStatusRef.current = 'error';
                setError('Authentication failed. Please refresh and try again.');
                reject(new Error('WebSocket authentication failed - connection closed'));
                return;
              }
            }, 50);
            
            // Timeout after 3 seconds - if WebSocket hasn't opened by then, likely auth failure
            const timeout = setTimeout(() => {
              clearInterval(checkInterval);
              // Check if it's an error or just slow connection
              if (wsStatusRef.current === 'error') {
                console.error('[TranscriptionWS] WebSocket failed, aborting recording start');
                setError('Live transcription connection failed. Please refresh and try again.');
                reject(new Error('WebSocket authentication failed'));
              } else if (wsRef.current && wsRef.current.readyState === WebSocket.CLOSED) {
                // WebSocket closed before opening - likely auth failure
                console.error('[TranscriptionWS] WebSocket closed before opening (likely auth failure), aborting recording start');
                wsStatusRef.current = 'error';
                setError('Authentication failed. Please refresh and try again.');
                reject(new Error('WebSocket authentication failed - connection closed'));
              } else if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
                // Still connecting after 3s - might be slow, but reject to be safe
                console.error('[TranscriptionWS] WebSocket still connecting after 3s, likely auth failure, aborting');
                wsStatusRef.current = 'error';
                setError('Live transcription connection timeout. Please refresh and try again.');
                reject(new Error('WebSocket connection timeout'));
              } else {
                // Unknown state - reject to be safe
                console.error('[TranscriptionWS] WebSocket in unknown state after timeout, aborting');
                wsStatusRef.current = 'error';
                setError('Live transcription connection failed. Please refresh and try again.');
                reject(new Error('WebSocket connection failed - unknown state'));
              }
            }, 3000);
          });
        };
        
        // CRITICAL: Wait for WebSocket authentication before starting MediaRecorder
        // If WebSocket fails to open (auth failure), this will reject and abort recording
        try {
          await waitForReady();
          console.log('[AudioRecorder] WebSocket ready, proceeding to MediaRecorder setup');
        } catch (waitErr) {
          console.error('[AudioRecorder] WebSocket wait failed, aborting recording:', waitErr);
          throw waitErr; // Re-throw to abort recording
        }
      }
      
      // Set up MediaRecorder with audio/webm format
      console.log('[AudioRecorder] Setting up MediaRecorder...');
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined
      });
      
      audioChunksRef.current = [];

      // Handle data available events - send to WebSocket for live transcription
      mediaRecorder.ondataavailable = (event) => {
        console.log('[AudioRecorder] ondataavailable fired, blob size:', event.data.size);
        if (event.data.size > 0) {
          // Mark that at least one audio chunk was received
          hasAudioChunksRef.current = true;
          
          // Store for final blob
          audioChunksRef.current.push(event.data);
          console.log('[AudioRecorder] Audio chunk received, total chunks:', audioChunksRef.current.length, 'total size:', audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0));
          
          // Send to WebSocket for live transcription (will queue if not ready)
          if (enableLiveTranscription) {
            sendAudioChunk(event.data);
          }
        } else {
          console.warn('[AudioRecorder] ondataavailable fired with empty blob');
        }
      };

      mediaRecorder.onstop = () => {
        console.log('[AudioRecorder] onstop fired, total chunks:', audioChunksRef.current.length);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        console.log('[AudioRecorder] Final blob created, size:', audioBlob.size, 'hasAudioChunks:', hasAudioChunksRef.current);
      };

      // Start recording with timeslice of 250ms to get chunks frequently
      // Now the WebSocket should be ready, so chunks will be sent immediately
      console.log('[AudioRecorder] Starting MediaRecorder with timeslice 250ms');
      try {
        mediaRecorder.start(250);
        console.log('[AudioRecorder] MediaRecorder started successfully, state:', mediaRecorder.state);
        recorderStateRef.current = 'recording';
        
        mediaRecorderRef.current = mediaRecorder;
        
        setIsRecording(true);
        setIsPaused(false);
        setError(null);
        // Live transcript was cleared at the start of this function
        // It will now accumulate during recording
        console.log('[AudioRecorder] Recording state set to active - ready to receive audio chunks');
      } catch (startErr) {
        console.error('[AudioRecorder] Error calling mediaRecorder.start():', startErr);
        console.error('[AudioRecorder] MediaRecorder state:', mediaRecorder.state);
        console.error('[AudioRecorder] Stream active:', streamRef.current?.active);
        throw new Error(`Failed to start MediaRecorder: ${startErr.message}`);
      }
    } catch (err) {
      console.error('[AudioRecorder] Error starting recording:', err);
      setError(err.message);
      // Clean up stream if it was obtained but recording failed
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(track => {
            if (track.readyState !== 'ended') {
              track.stop();
            }
          });
        } catch (cleanupErr) {
          console.warn('[AudioRecorder] Error cleaning up stream:', cleanupErr);
        }
        streamRef.current = null;
      }
      recorderStateRef.current = 'idle';
      // Re-throw to allow caller to handle
      throw err;
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      // Note: WebSocket continues but MediaRecorder won't send chunks while paused
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  };

  const stopRecording = () => {
    // Prevent double-stopping
    if (recorderStateRef.current === 'stopping' || recorderStateRef.current === 'stopped') {
      console.warn('[AudioRecorder] stopRecording called but recorder is already', recorderStateRef.current);
      const finalBlob = audioBlob || new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const hasChunks = hasAudioChunksRef.current || (finalBlob && finalBlob.size > 0);
      return Promise.resolve({ blob: finalBlob, hasAudioChunks: hasChunks });
    }
    
    recorderStateRef.current = 'stopping';
    
    // Stop live transcription first (close WebSocket)
    stopLiveTranscription();

    // Stop the recorder and return a Promise that resolves with the final Blob and hasAudioChunks flag
    return new Promise((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const mr = mediaRecorderRef.current;
        let stopResolved = false; // Prevent resolving twice

        const onStop = () => {
          if (stopResolved) {
            console.warn('[AudioRecorder] onStop called multiple times, ignoring');
            return;
          }
          stopResolved = true;
          recorderStateRef.current = 'stopped';
          
          console.log('[AudioRecorder] onStop handler fired');
          console.log('[AudioRecorder] Audio chunks count:', audioChunksRef.current.length);
          console.log('[AudioRecorder] Total chunks size:', audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0));
          console.log('[AudioRecorder] hasAudioChunksRef:', hasAudioChunksRef.current);
          
          // Request final data - this may trigger one more ondataavailable
          // Some browsers require this to get the final chunk
          try {
            if (mr.state !== 'inactive') {
              mr.requestData();
            }
          } catch (reqErr) {
            console.warn('[AudioRecorder] Error requesting final data:', reqErr);
          }
          
          // Small delay to allow any final ondataavailable to fire
          // MediaRecorder may need a tick to emit final chunk
          setTimeout(() => {
            const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            setAudioBlob(finalBlob);
            
            // Check if audio chunks were received (capture before cleanup)
            const hasChunks = hasAudioChunksRef.current;
            
            console.log('[AudioRecorder] Finalizing stop - blob size:', finalBlob.size, 'hasChunks:', hasChunks);

            // Stop all tracks - ONLY AFTER MediaRecorder has finished and emitted final chunk
            // This is critical: tracks must be stopped AFTER onstop fires
            if (streamRef.current) {
              try {
                streamRef.current.getTracks().forEach(track => {
                  // Only stop tracks that aren't already ended
                  if (track.readyState !== 'ended') {
                    console.log('[AudioRecorder] Stopping track, state:', track.readyState);
                    track.stop();
                  } else {
                    console.log('[AudioRecorder] Track already ended, skipping');
                  }
                });
                console.log('[AudioRecorder] Stopped all audio tracks');
              } catch (trackErr) {
                console.warn('[AudioRecorder] Error stopping tracks:', trackErr);
              }
              streamRef.current = null; // Clear stream reference
            }

            // RESET ALL REFS to initial values after recording stops
            // This ensures clean state for the next recording
            console.log('[AudioRecorder] Resetting all refs/flags after recording stopped');
            
            setIsRecording(false);
            setIsPaused(false);
            mr.removeEventListener('stop', onStop);
            
            // Clean up MediaRecorder ref
            mediaRecorderRef.current = null;
            
            // Clean up stream ref (tracks already stopped above)
            streamRef.current = null;
            
            // Reset recording state refs
            recorderStateRef.current = 'idle';
            hasAudioChunksRef.current = false;
            audioChunksRef.current = [];
            
            // WebSocket cleanup already done by stopLiveTranscription() above
            // But ensure refs are reset
            wsStatusRef.current = 'idle';
            wsReadyRef.current = false;
            
            console.log('[AudioRecorder] All refs reset, recording cleanup complete');
            
            // Return both blob and hasAudioChunks flag
            resolve({ blob: finalBlob, hasAudioChunks: hasChunks });
          }, 100); // Small delay to allow final ondataavailable
        };

        mr.addEventListener('stop', onStop);
        try { 
          console.log('[AudioRecorder] Calling mediaRecorder.stop()');
          mr.stop(); // This will trigger onstop event
        } catch (e) { 
          console.error('[AudioRecorder] Error calling stop:', e);
          onStop(); 
        }
      } else {
        // Already stopped or never started
        console.warn('[AudioRecorder] stopRecording called but MediaRecorder is already inactive');
        
        const finalBlob = audioBlob || new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const hasChunks = hasAudioChunksRef.current || (finalBlob && finalBlob.size > 0);
        
        // Ensure tracks are stopped even if already stopped
        if (streamRef.current) {
          try {
            streamRef.current.getTracks().forEach(track => {
              if (track.readyState !== 'ended') {
                track.stop();
              }
            });
            console.log('[AudioRecorder] Stopped all audio tracks (already stopped)');
          } catch (trackErr) {
            console.warn('[AudioRecorder] Error stopping tracks:', trackErr);
          }
          streamRef.current = null;
        }
        
        // RESET ALL REFS even in this path (idempotent cleanup)
        console.log('[AudioRecorder] Resetting all refs/flags (MediaRecorder was inactive)');
        mediaRecorderRef.current = null;
        recorderStateRef.current = 'idle';
        hasAudioChunksRef.current = false;
        audioChunksRef.current = [];
        wsStatusRef.current = 'idle';
        wsReadyRef.current = false;
        
        setIsRecording(false);
        setIsPaused(false);
        resolve({ blob: finalBlob, hasAudioChunks: hasChunks });
      }
    });
  };

  const uploadAndTranscribe = async (onTranscriptUpdate, providedBlob = null) => {
    const blobToUse = providedBlob || audioBlob;
    if (!blobToUse) {
      throw new Error('No audio recorded');
    }

    try {
      const audioFile = new File([blobToUse], 'recording.webm', { type: blobToUse.type || 'audio/webm' });
      
      if (onTranscriptUpdate) {
        onTranscriptUpdate('Processing recording...');
      }
      
      const transcriptionResult = await audio.transcribeAudio(audioFile);
      const transcript = transcriptionResult.transcript;
      
      if (onTranscriptUpdate) {
        onTranscriptUpdate(transcript);
      }
      
      let file_url = null;
      try {
        const uploadResp = await base44.integrations.Core.UploadFile({ file: audioFile });
        file_url = uploadResp?.file_url ?? null;
      } catch (uploadErr) {
        console.warn('Audio upload for storage failed (transcription succeeded):', uploadErr);
        file_url = null;
      }

      console.log('Transcription completed. Audio saved at:', file_url);

      return { transcript, file_url };
    } catch (err) {
      console.error('Error transcribing audio:', err);
      
      if (onTranscriptUpdate) {
        onTranscriptUpdate(err.message || 'Error processing audio. Please try again.');
      }
      throw err;
    }
  };

  // Cleanup on unmount - idempotent cleanup
  useEffect(() => {
    return () => {
      console.log('[AudioRecorder] Component unmounting, cleaning up...');
      // stopLiveTranscription is idempotent - safe to call multiple times
      stopLiveTranscription();
      
      // stopRecording is also idempotent - safe to call multiple times
      // It checks recorderState before acting
      try {
        stopRecording().catch(err => {
          console.warn('[AudioRecorder] Error during unmount cleanup:', err);
        });
      } catch (err) {
        console.warn('[AudioRecorder] Error calling stopRecording during unmount:', err);
      }
      
      // Final cleanup - ensure all refs are reset
      mediaRecorderRef.current = null;
      streamRef.current = null;
      wsRef.current = null;
      recorderStateRef.current = 'idle';
      wsStatusRef.current = 'idle';
      wsReadyRef.current = false;
      hasAudioChunksRef.current = false;
      audioChunksRef.current = [];
      pendingChunksRef.current = [];
      accumulatedTranscriptRef.current = '';
      
      console.log('[AudioRecorder] Unmount cleanup complete');
    };
  }, []);

  return {
    isRecording,
    isPaused,
    audioBlob,
    amplitude,
    error,
    liveTranscript,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    uploadAndTranscribe,
    sendAudioChunk, // Expose method for sending audio chunks
  };
}

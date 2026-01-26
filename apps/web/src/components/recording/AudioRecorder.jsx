import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { audio } from '@/components/services/api';
import { 
  API_BASE_URL, 
  getWebSocketUrl,
  RECORDING_TIMESLICE_MS,
  WEBSOCKET_CONNECTION_TIMEOUT_MS,
  WEBSOCKET_READY_CHECK_INTERVAL_MS,
  MIN_JWT_TOKEN_LENGTH
} from '@/config/constants';

// WebSocket URL for live transcription - derived from centralized config
// This function adds validation to prevent accidental frontend connections
const getTranscriptionWebSocketUrl = () => {
  const wsUrl = getWebSocketUrl();
  
  // Validate it's not pointing to frontend dev server
  try {
    const url = new URL(wsUrl.replace('ws://', 'http://').replace('wss://', 'https://'));
    const isFrontend = url.port === '5173' || 
                       (url.hostname === 'localhost' && !url.port);
    if (isFrontend) {
      console.error('[AudioRecorder] WebSocket URL points to frontend! Using backend fallback.');
      // Derive from API_BASE_URL as fallback
      const apiUrl = new URL(API_BASE_URL);
      const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${apiUrl.host}/ws/listen`;
    }
  } catch (err) {
    console.warn('[AudioRecorder] Could not validate WebSocket URL, using as-is:', wsUrl);
  }
  
  return wsUrl;
};

/**
 * useAudioRecorder - Hook for audio recording with live transcription
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.detectFillers - Enable filler word detection (for Practice mode)
 */
export default function useAudioRecorder(options = {}) {
  const { detectFillers = false } = options;
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [error, setError] = useState(null);
  const [amplitude, setAmplitude] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [fillerCount, setFillerCount] = useState(0); // Live filler count (when detectFillers=true)
  const [isOfflineMode, setIsOfflineMode] = useState(false); // True if recording without live transcription
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const hasAudioChunksRef = useRef(false); // Track if at least one audio chunk was received
  const recorderStateRef = useRef('idle'); // Track recorder state: 'idle' | 'recording' | 'stopping' | 'stopped'
  const wsStatusRef = useRef('idle'); // Track WebSocket status: 'idle' | 'connecting' | 'open' | 'error' | 'closed'
  const detectFillersRef = useRef(detectFillers); // Store the detectFillers option
  const offlineModeRef = useRef(false); // Track offline mode in ref for synchronous access
  
  // Update ref when option changes
  useEffect(() => {
    detectFillersRef.current = detectFillers;
  }, [detectFillers]);
  
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
      
      // Validate token is a proper JWT (should be at least MIN_JWT_TOKEN_LENGTH chars)
      if (token.length < MIN_JWT_TOKEN_LENGTH) {
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
      
      if (token.length < MIN_JWT_TOKEN_LENGTH) {
        console.error(`[TranscriptionWS] Token validation failed: token too short (${token.length} chars, expected >= ${MIN_JWT_TOKEN_LENGTH})`);
        setError('Authentication expired. Please refresh the page and try again.');
        wsStatusRef.current = 'error';
        return false; // DO NOT open WebSocket
      }

      // Build WebSocket URL - ensure it points to backend, never frontend
      const baseWsUrl = getTranscriptionWebSocketUrl();
      // Include detect_fillers parameter if enabled (for Practice mode or user setting)
      const fillerParam = detectFillersRef.current ? '&detect_fillers=true' : '';
      const wsUrl = `${baseWsUrl}?token=${encodeURIComponent(token)}${fillerParam}`;
      
      if (detectFillersRef.current) {
        console.log('[TranscriptionWS] Filler word detection ENABLED');
      }
      
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
              
              // Update filler count if filler detection is enabled
              // Backend sends total_fillers with each transcript event when detect_fillers=true
              if (detectFillersRef.current && typeof data.total_fillers === 'number') {
                setFillerCount(data.total_fillers);
                console.log('[Live Transcription] Filler count updated:', data.total_fillers);
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
   * CRITICAL: Does NOT clear accumulatedTranscriptRef - transcript must be preserved
   * until explicitly cleared by caller after saving or discarding session.
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

    // CRITICAL: Do NOT clear accumulatedTranscriptRef here!
    // The transcript must be preserved until the session is saved or discarded.
    // Clearing it here causes Bug #1 (transcript lost before handleFinish captures it).
    // 
    // Do NOT clear: accumulatedTranscriptRef.current
    // Do NOT call: setLiveTranscript('')
    //
    // These will be cleared in startRecording() when a new recording begins,
    // or by the caller after successfully saving the session.
    
    // Clear pending chunks queue (these are audio chunks, not transcript)
    pendingChunksRef.current = [];
    
    console.log('[TranscriptionWS] Live transcription WebSocket closed, transcript PRESERVED:', 
      accumulatedTranscriptRef.current?.substring(0, 50) || '(empty)');
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
    setFillerCount(0); // Reset filler count for new recording
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
      // GAP-003: If WebSocket fails, continue recording in offline mode
      // Audio will be uploaded for transcription when recording stops
      let transcriptionAvailable = false;
      
      if (enableLiveTranscription) {
        console.log('[AudioRecorder] Starting live transcription WebSocket...');
        const wsStarted = await startLiveTranscription();
        
        // Check if WebSocket connection was initiated successfully
        // startLiveTranscription returns true on success, false on failure
        if (wsStarted === false) {
          // GAP-003: WebSocket failed - switch to offline mode instead of aborting
          console.warn('[AudioRecorder] WebSocket connection failed, switching to OFFLINE MODE');
          console.warn('[AudioRecorder] Recording will continue without live transcription');
          setIsOfflineMode(true);
          offlineModeRef.current = true;
          setError(null); // Clear error - offline mode is not an error state
          transcriptionAvailable = false;
        } else {
          // Log if WebSocket connection was initiated
          if (wsStarted === true) {
            console.log('[AudioRecorder] WebSocket connection initiated successfully');
          } else {
            console.log('[AudioRecorder] WebSocket connection already in progress (wsStarted:', wsStarted, ')');
          }
          
          // Wait for WebSocket to be ready (with timeout)
          // If it fails during wait, switch to offline mode
          console.log('[AudioRecorder] Waiting for WebSocket to authenticate and open...');
          try {
            await waitForWebSocketReady();
            transcriptionAvailable = true;
            setIsOfflineMode(false);
            offlineModeRef.current = false;
          } catch (wsError) {
            // GAP-003: WebSocket failed during wait - switch to offline mode
            console.warn('[AudioRecorder] WebSocket failed during wait, switching to OFFLINE MODE:', wsError.message);
            setIsOfflineMode(true);
            offlineModeRef.current = true;
            setError(null); // Clear error - offline mode is not an error state
            transcriptionAvailable = false;
          }
        }
      } else {
        // Live transcription explicitly disabled
        setIsOfflineMode(true);
        offlineModeRef.current = true;
        transcriptionAvailable = false;
      }
      
      // Log final transcription mode
      console.log('[AudioRecorder] Transcription mode:', transcriptionAvailable ? 'LIVE' : 'OFFLINE');
      
      // Helper function to wait for WebSocket with timeout
      function waitForWebSocketReady() {
        return new Promise((resolve, reject) => {
          // Check if WebSocket is in error state - don't proceed
          if (wsStatusRef.current === 'error') {
            reject(new Error('WebSocket in error state'));
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
              reject(new Error('WebSocket closed before opening'));
              return;
            }
          }, WEBSOCKET_READY_CHECK_INTERVAL_MS);
          
          // Timeout - if WebSocket hasn't opened by then, switch to offline
          const timeout = setTimeout(() => {
            clearInterval(checkInterval);
            if (wsStatusRef.current === 'error' || 
                (wsRef.current && wsRef.current.readyState === WebSocket.CLOSED) ||
                (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING)) {
              reject(new Error('WebSocket connection timeout'));
            }
          }, WEBSOCKET_CONNECTION_TIMEOUT_MS);
        });
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
          
          // Send to WebSocket for live transcription (only if not in offline mode)
          // GAP-003: In offline mode, audio is stored locally and transcribed on save
          if (transcriptionAvailable && !offlineModeRef.current) {
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

      // Start recording with configured timeslice to get chunks frequently
      // Now the WebSocket should be ready, so chunks will be sent immediately
      console.log(`[AudioRecorder] Starting MediaRecorder with timeslice ${RECORDING_TIMESLICE_MS}ms`);
      try {
        mediaRecorder.start(RECORDING_TIMESLICE_MS);
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

  /**
   * Pause recording.
   * IMPORTANT: Closes WebSocket to prevent Deepgram 1011 timeout errors.
   * The WebSocket will be reconnected on resume.
   */
  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      console.log('[AudioRecorder] Pausing recording...');
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      
      // CRITICAL: Close WebSocket to prevent Deepgram 1011 timeout
      // Deepgram expects continuous audio; idle connections cause errors
      // We'll reconnect on resume
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('[AudioRecorder] Closing WebSocket on pause to prevent 1011 timeout');
        try {
          wsRef.current.close(1000, 'Paused by user'); // Normal closure
        } catch (err) {
          console.warn('[AudioRecorder] Error closing WebSocket on pause:', err);
        }
      }
      wsReadyRef.current = false;
      wsStatusRef.current = 'closed';
      // Note: We do NOT clear accumulatedTranscriptRef - transcript must be preserved
      console.log('[AudioRecorder] Recording paused, WebSocket closed, transcript preserved');
    }
  };

  /**
   * Resume recording.
   * Reconnects WebSocket for live transcription.
   * New transcription will append to existing accumulated transcript.
   */
  const resumeRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      console.log('[AudioRecorder] Resuming recording...');
      
      // Resume MediaRecorder first
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      
      // Reconnect WebSocket for live transcription (if not in offline mode)
      if (!offlineModeRef.current) {
        console.log('[AudioRecorder] Reconnecting WebSocket after resume...');
        try {
          const wsStarted = await startLiveTranscription();
          if (wsStarted === true) {
            console.log('[AudioRecorder] WebSocket reconnected successfully after resume');
            // Wait briefly for WebSocket to be ready
            let attempts = 0;
            const maxAttempts = 20; // 2 seconds max
            while (!wsReadyRef.current && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 100));
              attempts++;
            }
            if (wsReadyRef.current) {
              console.log('[AudioRecorder] WebSocket ready after resume');
            } else {
              console.warn('[AudioRecorder] WebSocket not ready after resume, switching to offline mode');
              setIsOfflineMode(true);
              offlineModeRef.current = true;
            }
          } else {
            console.warn('[AudioRecorder] Failed to reconnect WebSocket after resume, switching to offline mode');
            setIsOfflineMode(true);
            offlineModeRef.current = true;
          }
        } catch (err) {
          console.warn('[AudioRecorder] Error reconnecting WebSocket after resume:', err);
          setIsOfflineMode(true);
          offlineModeRef.current = true;
        }
      }
      
      console.log('[AudioRecorder] Recording resumed');
    }
  };

  const stopRecording = () => {
    // Prevent double-stopping
    if (recorderStateRef.current === 'stopping' || recorderStateRef.current === 'stopped') {
      console.warn('[AudioRecorder] stopRecording called but recorder is already', recorderStateRef.current);
      // Construct blob from current chunks (don't rely on stale audioBlob state)
      const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const hasChunks = hasAudioChunksRef.current || (finalBlob && finalBlob.size > 0);
      // Also return the transcript synchronously
      const transcript = accumulatedTranscriptRef.current || '';
      return Promise.resolve({ blob: finalBlob, hasAudioChunks: hasChunks, transcript });
    }
    
    recorderStateRef.current = 'stopping';
    
    // Stop live transcription (close WebSocket) - but PRESERVE transcript
    stopLiveTranscription();

    // Stop the recorder and return a Promise that resolves with the final Blob, hasAudioChunks flag, and transcript
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
          
          console.log('[AudioRecorder] onStop handler fired');
          console.log('[AudioRecorder] Audio chunks count:', audioChunksRef.current.length);
          console.log('[AudioRecorder] Total chunks size:', audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0));
          console.log('[AudioRecorder] hasAudioChunksRef:', hasAudioChunksRef.current);
          console.log('[AudioRecorder] accumulatedTranscript:', accumulatedTranscriptRef.current?.substring(0, 100) || '(empty)');
          
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
            // CRITICAL: Construct blob BEFORE clearing audioChunksRef
            // Bug #4 fix: don't clear chunks until blob is safely constructed
            const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            setAudioBlob(finalBlob);
            
            // Capture values BEFORE any cleanup
            const hasChunks = hasAudioChunksRef.current;
            // CRITICAL: Capture transcript from ref, not React state (Bug #1, #2 fix)
            const transcript = accumulatedTranscriptRef.current || '';
            
            console.log('[AudioRecorder] Finalizing stop - blob size:', finalBlob.size, 'hasChunks:', hasChunks, 'transcript length:', transcript.length);

            // Stop all tracks - ONLY AFTER MediaRecorder has finished and emitted final chunk
            if (streamRef.current) {
              try {
                streamRef.current.getTracks().forEach(track => {
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
            }

            // SYNCHRONOUS state reset - critical for re-recording (Bug #7 fix)
            // Reset recorderStateRef BEFORE any async operations
            recorderStateRef.current = 'idle';
            
            // Clean up refs for next recording
            mediaRecorderRef.current = null;
            streamRef.current = null;
            hasAudioChunksRef.current = false;
            // Clear audio chunks AFTER blob is constructed (Bug #4 fix)
            audioChunksRef.current = [];
            wsStatusRef.current = 'idle';
            wsReadyRef.current = false;
            
            // Update React state
            setIsRecording(false);
            setIsPaused(false);
            mr.removeEventListener('stop', onStop);
            
            console.log('[AudioRecorder] All refs reset, recording cleanup complete. Transcript PRESERVED.');
            
            // Return blob, hasAudioChunks flag, AND transcript
            resolve({ blob: finalBlob, hasAudioChunks: hasChunks, transcript });
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
        
        // Construct blob from current chunks
        const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const hasChunks = hasAudioChunksRef.current || (finalBlob && finalBlob.size > 0);
        // Capture transcript from ref
        const transcript = accumulatedTranscriptRef.current || '';
        
        // Ensure tracks are stopped
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
        }
        
        // SYNCHRONOUS state reset (Bug #7 fix)
        recorderStateRef.current = 'idle';
        mediaRecorderRef.current = null;
        streamRef.current = null;
        hasAudioChunksRef.current = false;
        audioChunksRef.current = [];
        wsStatusRef.current = 'idle';
        wsReadyRef.current = false;
        
        setIsRecording(false);
        setIsPaused(false);
        resolve({ blob: finalBlob, hasAudioChunks: hasChunks, transcript });
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

  /**
   * Get the accumulated transcript synchronously from ref.
   * CRITICAL: Use this instead of liveTranscript state for capturing transcript
   * in handleFinish - React state may be stale due to async updates.
   * @returns {string} The accumulated final transcript
   */
  const getAccumulatedTranscript = () => {
    return accumulatedTranscriptRef.current || '';
  };

  /**
   * Clear the transcript. Call this ONLY after session is saved or discarded.
   * Do NOT call this during stopRecording - it will lose the transcript.
   */
  const clearTranscript = () => {
    console.log('[AudioRecorder] Clearing transcript (session saved or discarded)');
    accumulatedTranscriptRef.current = '';
    setLiveTranscript('');
  };

  return {
    isRecording,
    isPaused,
    audioBlob,
    amplitude,
    error,
    liveTranscript,
    fillerCount, // Live filler count (only when detectFillers=true)
    isOfflineMode, // GAP-003: True if recording without live transcription
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    uploadAndTranscribe,
    sendAudioChunk, // Expose method for sending audio chunks
    getAccumulatedTranscript, // CRITICAL: Use this to capture transcript synchronously
    clearTranscript, // Call after session saved or discarded
  };
}

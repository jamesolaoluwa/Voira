import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { audio } from '@/components/services/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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
  
  // Live transcription WebSocket connection
  const wsRef = useRef(null);
  const wsReadyRef = useRef(false);
  const chunkIntervalRef = useRef(null);
  const accumulatedTranscriptRef = useRef(''); // Track accumulated final transcripts
  
  // Helper to get JWT token for WebSocket auth
  const getAuthToken = async () => {
    try {
      const { supabase } = await import('@/components/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch (err) {
      console.error('Error getting auth token:', err);
      return null;
    }
  };

  /**
   * Start live transcription WebSocket connection using MediaRecorder (audio/webm).
   */
  const startLiveTranscription = async () => {
    try {
      // Get JWT token for authentication
      const token = await getAuthToken();
      if (!token) {
        console.warn('No auth token available for live transcription');
        return;
      }

      // Build WebSocket URL with auth token
      const wsProtocol = API_BASE_URL.startsWith('https://') ? 'wss://' : 'ws://';
      const wsHost = API_BASE_URL.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}${wsHost}/ws/listen?token=${encodeURIComponent(token)}`;
      
      // Open WebSocket connection to backend
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Handle WebSocket connection opened
      ws.onopen = () => {
        console.log('Live transcription WebSocket connected');
        wsReadyRef.current = true;
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
        console.error('WebSocket error:', err);
        setError('Live transcription connection error');
        wsReadyRef.current = false;
      };

      ws.onclose = () => {
        console.log('Live transcription WebSocket closed');
        wsReadyRef.current = false;
        wsRef.current = null;
      };
      
      console.log('[Live Transcription] WebSocket connection established');
      
    } catch (err) {
      console.error('Error starting live transcription:', err);
      setError('Live transcription unavailable');
    }
  };

  /**
   * Stop live transcription and close WebSocket connection.
   */
  const stopLiveTranscription = () => {
    wsReadyRef.current = false;

    // Close WebSocket connection
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (err) {
        console.error('Error closing WebSocket:', err);
      }
      wsRef.current = null;
    }

    // Clear interval if set
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Clear live transcript
    setLiveTranscript('');
  };

  const startRecording = async (options = {}) => {
    const { enableLiveTranscription = true } = options;
    
    // Clear live transcript and accumulated transcript ONLY when starting a NEW recording
    setLiveTranscript('');
    accumulatedTranscriptRef.current = '';
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Set up MediaRecorder with audio/webm format
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
        if (event.data.size > 0) {
          // Store for final blob
          audioChunksRef.current.push(event.data);
          
          // Send to WebSocket for live transcription (if connected)
          if (enableLiveTranscription && wsRef.current && wsReadyRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send(event.data);
            } catch (err) {
              console.error('Error sending audio chunk to WebSocket:', err);
            }
          }
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
      };

      // Start recording with timeslice of 250ms to get chunks frequently
      mediaRecorder.start(250);
      
      mediaRecorderRef.current = mediaRecorder;
      
      setIsRecording(true);
      setIsPaused(false);
      setError(null);
      // Live transcript was cleared at the start of this function
      // It will now accumulate during recording

      // Start live transcription WebSocket connection if enabled
      if (enableLiveTranscription) {
        await startLiveTranscription();
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(err.message);
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
    // Stop live transcription first (close WebSocket)
    stopLiveTranscription();

    // Stop the recorder and return a Promise that resolves with the final Blob
    return new Promise((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const mr = mediaRecorderRef.current;

        const onStop = () => {
          const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setAudioBlob(finalBlob);

          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }

          setIsRecording(false);
          setIsPaused(false);
          mr.removeEventListener('stop', onStop);
          resolve(finalBlob);
        };

        mr.addEventListener('stop', onStop);
        try { mr.stop(); } catch (e) { onStop(); }
      } else {
        // Already stopped or never started
        const finalBlob = audioBlob;
        setIsRecording(false);
        setIsPaused(false);
        resolve(finalBlob);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLiveTranscription();
      stopRecording();
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
  };
}

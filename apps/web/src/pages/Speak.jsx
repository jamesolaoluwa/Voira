import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import FileUpload from '@/components/ui/FileUpload';
import RecordButton from '@/components/ui/RecordButton';
import SessionNamingModal from '@/components/ui/SessionNamingModal';
import CreditsDisplay from '@/components/ui/CreditsDisplay';
import { Mic, Pause, Square, Clock, Type, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import useAudioRecorder from '@/components/recording/AudioRecorder';
import { auth, sessions, credits as creditsAPI } from '@/components/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { saveLocalRecording } from '@/lib/localRecordings';
import useSessionStore from '@/stores/useSessionStore';
import LiveTranscription from '@/components/transcription/LiveTranscription';

/**
 * VALIDATION RULES (Non-Negotiable):
 * 
 * 1. Application Essay Question is REQUIRED for 'application' type
 *    - Recording CANNOT start without a question
 *    - Show inline warning (not modal)
 * 
 * 2. Reference Upload is OPTIONAL
 *    - Valid: Question only, Question + Reference
 *    - Invalid: Reference only (no question)
 * 
 * 3. "What do you want this response to sound like?" is OPTIONAL
 *    - Uses voice profile as default if empty
 *    - Does NOT block recording
 * 
 * 4. For 'free' and 'refine' types, no question is required
 */

const typeLabels = {
  application: 'Application Essay',
  interview: 'Interview Response',
  free: 'Free Speak',
  refine: 'Refine Draft',
};

export default function Speak() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const type = urlParams.get('type') || 'free';
  
  const {
    isRecording: audioIsRecording,
    isPaused: audioIsPaused,
    amplitude: audioAmplitude,
    error: audioError,
    liveTranscript: audioLiveTranscript, // Real-time transcript from WebSocket
    startRecording: audioStartRecording,
    pauseRecording: audioPauseRecording,
    resumeRecording: audioResumeRecording,
    stopRecording: audioStopRecording,
    uploadAndTranscribe,
    getAccumulatedTranscript, // CRITICAL: Use to capture transcript synchronously
    clearTranscript, // Call after session saved or discarded
  } = useAudioRecorder();
  
  const { user: authUser, session, isLoading: authLoading, isAdmin } = useAuth();
  const [user, setUser] = useState(null);
  const [userCredits, setUserCredits] = useState(0);
  const [duration, setDuration] = useState(0);
  const [recordingState, setRecordingState] = useState('idle');
  // recordingState: 'idle' | 'recording' | 'processing' | 'finished' | 'error'
  const [showTranscription, setShowTranscription] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [rawTranscript, setRawTranscript] = useState(''); // Raw verbatim transcript (includes filler words, from WebSocket)
  const [refinedTranscript, setRefinedTranscript] = useState(''); // LLM-refined transcript (generated only after Finish)
  const [transcript, setTranscript] = useState(''); // Deprecated: kept for backward compatibility, will use rawTranscript
  const [contextPrompt, setContextPrompt] = useState(''); // Interview question or application question
  const [companyName, setCompanyName] = useState(''); // Company name for interviews (for research when context is empty)
  const [companyContext, setCompanyContext] = useState(''); // Company/role context for interviews
  const [fillerCount, setFillerCount] = useState(0);
  const [confidenceLevel, setConfidenceLevel] = useState(0);
  const [sessionIntent, setSessionIntent] = useState('');
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [uploadedFileType, setUploadedFileType] = useState(null); // MIME type of uploaded file
  const [referenceText, setReferenceText] = useState(''); // Extracted text from reference file
  
  // Validation state - tracks whether user has attempted to start recording
  const [hasAttemptedStart, setHasAttemptedStart] = useState(false);
  
  const intervalRef = useRef(null);
  
  /**
   * VALIDATION LOGIC
   * 
   * canStartRecording is true ONLY when:
   * - For 'application' type: contextPrompt (question) is non-empty
   * - For 'interview' type: contextPrompt (question) is non-empty
   * - For 'free'/'refine' types: always allowed (no question required)
   * - AND not currently recording/processing
   * 
   * Reference and tone inputs do NOT affect this boolean.
   */
  const requiresQuestion = type === 'application' || type === 'interview';
  const hasValidQuestion = contextPrompt.trim().length > 0;
  const hasReferenceOnly = (uploadedFileUrl || referenceText) && !hasValidQuestion;
  
  const canStartRecording = useMemo(() => {
    // Must not be in recording or processing state
    if (recordingState !== 'idle') return false;
    if (isTranscribing || isGenerating) return false;
    
    // For types that require a question, validate it exists
    if (requiresQuestion && !hasValidQuestion) return false;
    
    return true;
  }, [recordingState, isTranscribing, isGenerating, requiresQuestion, hasValidQuestion]);
  
  /**
   * Get the validation warning message to display
   * Returns null if no warning needed
   */
  const getValidationWarning = () => {
    if (!hasAttemptedStart && !hasReferenceOnly) return null;
    
    if (requiresQuestion && !hasValidQuestion) {
      if (hasReferenceOnly) {
        return 'Please add the application essay question. References alone are not enough.';
      }
      return type === 'application' 
        ? 'Please enter the application essay question before recording.'
        : 'Please enter the interview question before recording.';
    }
    
    return null;
  };
  
  const validationWarning = getValidationWarning();
  const queryClient = useQueryClient();
  const addSessionToStore = useSessionStore(state => state.addSession);
  
  useEffect(() => {
    checkAuthAndLoadCredits();
  }, [authUser, authLoading, session]);
  
  const checkAuthAndLoadCredits = async () => {
    try {
      // Wait until auth initialization completes
      if (authLoading) return;

      // AuthGate will handle redirecting unauthenticated users; here we only
      // populate user-dependent state when available.
      const currentUser = authUser;
      setUser(currentUser);
      if (currentUser) {
        // creditsAPI exposes getCredits(); older code called `.get()` which no longer exists
        let creditsRemaining = currentUser?.credits_remaining ?? 0;
        if (creditsAPI && typeof creditsAPI.getCredits === 'function') {
          try {
            creditsRemaining = await creditsAPI.getCredits();
          } catch (e) {
            console.warn('credits.getCredits failed, falling back to user object:', e);
            creditsRemaining = currentUser?.credits_remaining ?? 0;
          }
        }
        setUserCredits(creditsRemaining || 0);
      }
    } catch (error) {
      // don't redirect here; log the error and let the AuthGate control routing
      console.warn('Error loading credits in Speak:', error);
    }
  };
  
  useEffect(() => {
    if (recordingState === 'recording' && !audioIsPaused) {
      intervalRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    
    return () => {
      clearInterval(intervalRef.current);
    };
  }, [recordingState, audioIsPaused]);

  // Update rawTranscript from audioLiveTranscript during recording
  useEffect(() => {
    if (recordingState === 'recording' && audioLiveTranscript) {
      setRawTranscript(audioLiveTranscript);
    }
  }, [audioLiveTranscript, recordingState]);

  // Debug: Log liveTranscript updates for debugging
  useEffect(() => {
    if (recordingState === 'recording') {
      console.log('[Speak.jsx] liveTranscript value:', audioLiveTranscript?.substring(0, 100) || '(empty)', `[length: ${audioLiveTranscript?.length || 0}]`);
    }
  }, [audioLiveTranscript, recordingState]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handleStart = async () => {
    // Mark that user has attempted to start (for showing validation warnings)
    setHasAttemptedStart(true);
    
    // VALIDATION: Check if recording can start
    if (!canStartRecording) {
      // Don't proceed - validation warning will be shown via validationWarning state
      console.log('[Speak] Recording blocked - validation failed:', {
        requiresQuestion,
        hasValidQuestion,
        hasReferenceOnly,
        recordingState
      });
      return;
    }
    
    // Start recording (credits will be decremented after a successful save)
    setDuration(0);
    setRawTranscript(''); // Clear raw transcript (verbatim speech)
    setRefinedTranscript(''); // Clear refined transcript (LLM output)
    setTranscript(''); // Deprecated: kept for backward compatibility
    setFillerCount(0);
    setConfidenceLevel(0);
    // audioLiveTranscript is cleared by useAudioRecorder when starting a NEW recording
    // DO NOT set recordingState here - wait until MediaRecorder actually starts
    
    // Request microphone permission DIRECTLY in click handler to satisfy user gesture requirement
    let stream = null;
    try {
      console.log('[Speak] Requesting microphone permission...');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[Speak] Microphone permission granted, stream obtained');
    } catch (err) {
      console.error('[Speak] Error requesting microphone permission:', err);
        setRecordingState('idle'); // Reset to idle state on permission failure
        toast({ 
          title: 'Microphone Permission Required', 
          description: err.name === 'NotAllowedError' 
            ? 'Please allow microphone access to record audio.' 
            : err.name === 'NotFoundError'
            ? 'No microphone found. Please connect a microphone and try again.'
            : 'Failed to access microphone. Please check your browser settings.',
          variant: 'destructive',
          duration: 5000
        });
        return; // Exit early if permission denied
      }
      
      // Explicitly enable live transcription and pass the stream
      try {
        console.log('[Speak] Starting audio recording and live transcription...');
        console.log('[Speak] Stream active:', stream.active);
        console.log('[Speak] Stream tracks:', stream.getTracks().length);
        
        // startRecording will throw if MediaRecorder fails to start
        // If it completes successfully, MediaRecorder has started
        await audioStartRecording({ enableLiveTranscription: true, stream });
        
        // startRecording completed successfully - MediaRecorder is now recording
        // setIsRecording(true) is called inside startRecording, but React state is async
        // We don't need to wait for audioIsRecording to update - we trust that startRecording succeeded
        console.log('[Speak] Recording started successfully, setting state to recording');
        setRecordingState('recording');
      } catch (err) {
        console.error('[Speak] Error starting recording:', err);
        console.error('[Speak] Error name:', err.name);
        console.error('[Speak] Error message:', err.message);
        console.error('[Speak] Error stack:', err.stack);
        setRecordingState('idle'); // Reset to idle state on recording start failure
        
        // Clean up stream on error
        try {
          stream.getTracks().forEach(track => track.stop());
        } catch (cleanupErr) {
          console.warn('[Speak] Error cleaning up stream after error:', cleanupErr);
        }
        
        // Provide more specific error message
        let errorMessage = 'Failed to start recording. Please try again.';
        if (err.message?.includes('WebSocket') || err.message?.includes('authentication')) {
          errorMessage = 'Live transcription connection failed. Please refresh and try again.';
        } else if (err.message?.includes('MediaRecorder')) {
          errorMessage = 'Failed to initialize audio recorder. Please check your browser settings.';
        }
        
        toast({ 
          title: 'Recording Failed', 
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      }
  };
  
  const handlePause = () => {
    if (audioIsPaused) {
      audioResumeRecording();
    } else {
      audioPauseRecording();
    }
  };
  
  const handleFinish = async () => {
    // mark processing
    setRecordingState('processing');
    setIsTranscribing(true);

    try {
      // CRITICAL: Stop and get final blob, hasAudioChunks flag, AND transcript from ref
      // Bug #1, #2 fix: Transcript is captured synchronously from accumulatedTranscriptRef
      // inside stopRecording, NOT from React state which may be stale
      const { blob: finalBlob, hasAudioChunks, transcript: capturedTranscript } = await audioStopRecording();

      // CRITICAL: Use transcript returned from stopRecording, NOT React state
      // This fixes Bug #1 (stopLiveTranscription clearing transcript) and
      // Bug #2 (rawTranscript state being stale due to async updates)
      const frozenRawTranscript = capturedTranscript || '';
      
      console.log('[Speak] handleFinish - captured transcript:', frozenRawTranscript?.substring(0, 100) || '(empty)', `[length: ${frozenRawTranscript?.length || 0}]`);
      
      // Update rawTranscript state for UI display (but this is NOT the source of truth for saving)
      if (frozenRawTranscript) {
        setRawTranscript(frozenRawTranscript);
      }
      
      // Validate recording based on audio chunks, not transcript length
      // MediaRecorder timing means chunks may not have been emitted yet when stopped
      if (!hasAudioChunks || !finalBlob || finalBlob.size === 0) {
        // Show user-friendly error and bail out (non-blocking toast)
        setIsTranscribing(false);
        setIsGenerating(false);
        setRawTranscript('');
        setRefinedTranscript('');
        setTranscript('');
        setRecordingState('idle'); // Reset to idle state on validation failure
        // Clear transcript since session is being discarded
        try { clearTranscript(); } catch (e) {}
        toast({ title: 'No audio recorded', description: 'Please record at least a few seconds of audio.' });
        return;
      }

      // Transition to finished state and show Save modal immediately
      // Do not wait for transcription/analysis - allow saving even if transcript arrives later
      setRecordingState('finished');
      
      // Prepare session data with the FROZEN transcript (captured synchronously from ref)
      setSessionData({
        transcript: frozenRawTranscript, // Use captured transcript, NOT React state
        audio_url: null, // Will be set after upload
        refinedDraft: '', // Will be set after analysis
        clarityScore: 75, // Default values
        confidenceScore: 70,
        fillerCount: 0,
        question: contextPrompt,
        type,
      });
      
      // Show Save modal immediately - user can save even if transcript is still processing
      setShowNamingModal(true);
      
      // IMPORTANT: We already have the transcript from live transcription (frozenRawTranscript).
      // The uploadAndTranscribe call is OPTIONAL - used only for audio backup storage.
      // If it fails (e.g., CORS error, network issue), we continue with the live transcript.
      let audioUrl = null;
      let backupTranscript = null;
      
      try {
        // Transcribe/upload the audio (for backup/archival)
        // This is NON-BLOCKING - we use live transcript as primary source
        const resp = await uploadAndTranscribe((partialTranscript) => {
          setTranscript(partialTranscript); // Deprecated: kept for backward compatibility
        }, finalBlob);
        
        backupTranscript = resp?.transcript;
        audioUrl = resp?.file_url ?? null;
      } catch (uploadErr) {
        // Non-critical error - we have live transcript, just log and continue
        console.warn('[Speak] uploadAndTranscribe failed (non-critical):', uploadErr.message);
      }
      
      // PRIMARY SOURCE: Live transcript from WebSocket
      // FALLBACK: Backend transcript (if uploadAndTranscribe succeeded)
      const transcribedText = frozenRawTranscript || backupTranscript || '';

      setTranscript(transcribedText); // Deprecated: kept for backward compatibility
      setIsTranscribing(false);
      setIsGenerating(true);
      
      // Use frozen transcript (captured synchronously) for analysis
      const rawTextForAnalysis = frozenRawTranscript || transcribedText;
      
      // Validate transcript exists before calling analysis
      if (!rawTextForAnalysis || rawTextForAnalysis.trim().length < 3) {
        console.warn('[Speak] Transcript is empty or too short for analysis, skipping refinement');
        // Update session data with empty refinement (user can still save)
        setSessionData({
          transcript: frozenRawTranscript,
          audio_url: audioUrl,
          refinedDraft: '', // No refinement without transcript
          clarityScore: 50,
          confidenceScore: 50,
          fillerCount: 0,
          question: contextPrompt,
          type,
        });
        setIsGenerating(false);
        setShowNamingModal(true);
        toast({ 
          title: 'Limited transcription', 
          description: 'Transcript was short or empty. You can still save the recording.',
          duration: 5000 
        });
        return;
      }
      
      // Call backend /analyze endpoint (combines analytics + LLM refinement)
      let analysis = null;
      try {
        const { apiClient } = await import('@/lib/apiClient');
        
        // Determine desired tone from user input
        const desiredTone = sessionIntent || goalInput || 'natural';
        // Normalize tone to common values
        const toneMap = {
          'confident': 'confident',
          'concise': 'concise',
          'reflective': 'reflective',
          'natural': 'natural',
          'clear': 'natural',
        };
        const normalizedTone = toneMap[desiredTone.toLowerCase()] || 'natural';
        
        // For interviews, extract or use company name
        let interviewCompanyName = undefined;
        if (type === 'interview') {
          // Use provided company name, or try to extract from question
          if (companyName.trim()) {
            interviewCompanyName = companyName.trim();
          } else if (contextPrompt) {
            // Try to extract company name from question (simple heuristic)
            const companyPatterns = [
              /(?:at|for|with|from)\s+([A-Z][a-zA-Z0-9&\s]+?)(?:\s|,|\.|$)/,
              /([A-Z][a-zA-Z0-9&\s]+?)\s+interview/,
              /interview\s+(?:at|with)\s+([A-Z][a-zA-Z0-9&\s]+?)(?:\s|,|\.|$)/,
            ];
            for (const pattern of companyPatterns) {
              const match = contextPrompt.match(pattern);
              if (match && match[1] && match[1].trim().length > 2 && match[1].trim().length < 50) {
                interviewCompanyName = match[1].trim();
                break;
              }
            }
          }
        }
        
        console.log('[Speak] Calling /analyze with transcript length:', rawTextForAnalysis.length);
        analysis = await apiClient.post('/analyze', {
          raw_transcript: rawTextForAnalysis,
          session_type: type,
          desired_tone: normalizedTone,
          user_context: type === 'interview' ? companyContext || undefined : contextPrompt || undefined,
          reference_text: referenceText || undefined,
          reference_file_url: uploadedFileUrl || undefined,
          reference_file_type: uploadedFileType || undefined,
          question: contextPrompt || undefined,
          goal: sessionIntent || goalInput || undefined,
          company_name: type === 'interview' ? interviewCompanyName : undefined,
        });
        console.log('[Speak] /analyze response received, refined_text length:', analysis?.refined_text?.length || 0);
      } catch (analysisError) {
        // Log error but don't block saving - user can still save raw transcript
        console.error('[Speak] Error calling /analyze endpoint:', analysisError);
        analysis = {
          refined_text: '',
          clarity_score: 70,
          confidence_score: 70,
          filler_word_count: 0,
        };
        toast({ 
          title: 'Refinement unavailable', 
          description: 'Could not refine transcript. You can still save the raw recording.',
          duration: 5000 
        });
      }
      
      // Set refined transcript (LLM output)
      setRefinedTranscript(analysis.refined_text || '');
      
      // Update session data with complete transcription and analysis results
      // This updates the modal data if it's already open, or prepares it for when user opens it
      setSessionData({
        transcript: frozenRawTranscript, // Raw verbatim transcript (includes filler words)
        audio_url: audioUrl,
        refinedDraft: analysis.refined_text || '',
        clarityScore: analysis.clarity_score || 70,
        confidenceScore: analysis.confidence_score || 70,
        fillerCount: analysis.filler_word_count || 0,
        question: contextPrompt,
        type,
      });
      
      setIsGenerating(false);
      // State is already 'finished' and modal is already shown
      // Keep them as is - just ensure modal is visible
      setShowNamingModal(true);
    } catch (error) {
      console.error('Error processing recording:', error);
      setIsTranscribing(false);
      setIsGenerating(false);
      setRecordingState('finished');

      // On error: get transcript from ref synchronously as fallback
      const fallbackTranscript = getAccumulatedTranscript() || rawTranscript || transcript || '';
      console.log('[Speak] handleFinish error - fallback transcript:', fallbackTranscript?.substring(0, 100) || '(empty)');
      setSessionData({
        transcript: fallbackTranscript,
        refinedDraft: '', // No refinement on error
        clarityScore: 75,
        confidenceScore: 70,
        fillerCount: 0,
        question: contextPrompt,
        type,
      });
      setShowNamingModal(true);
    }
  };

  const handleSaveSession = async (sessionName) => {
  if (isSaving) return; // prevent double-save
  setIsSaving(true);
  // close naming modal immediately if open
  try { setShowNamingModal(false); } catch (e) {}
  const savingToast = toast({ title: 'Saving session', description: 'Saving your session...' });
  try {
      const payload = {
        title: sessionName || `${typeLabels[type]} Response`,
        transcript: sessionData.transcript || '',
        refined_draft: sessionData.refinedDraft || '',
        type,
        question: sessionData.question,
        goal: sessionIntent || goalInput,
        reference_text: uploadedFileUrl || '',
        audio_url: sessionData.audio_url ?? null,
        duration_seconds: duration,
        clarity_score: sessionData.clarityScore,
        confidence_score: sessionData.confidenceScore,
        filler_count: sessionData.fillerCount,
      };

      // Allow saving even if transcript is empty - user may save audio-only session
      // Transcript can arrive later or be added manually
      const transcriptText = payload.transcript && String(payload.transcript).trim();
      
      // Warn user if transcript is empty or very short
      if (!transcriptText || transcriptText.length < 3) {
        console.warn('[Speak] Saving session with empty transcript - audio URL:', payload.audio_url);
        toast({ 
          title: 'Limited transcript', 
          description: 'Your session has minimal or no transcript. Audio has been saved.',
          duration: 4000 
        });
        // Continue saving - audio URL is present, transcript can be added later
      } else if (transcriptText.length < 50) {
        // Short transcript warning
        toast({ 
          title: 'Short transcript', 
          description: 'Your session has a short transcript. Consider recording for longer next time.',
          duration: 3000 
        });
      }

      // Persist via central sessions API (calls backend /sessions which enforces credits)
      let recording;
      try {
        recording = await sessions.createSessionDraft(payload);
      } catch (error) {
        // Handle backend errors (e.g., insufficient credits)
        if (error.message?.includes('Insufficient credits') || error.message?.includes('402')) {
          toast({ 
            title: 'Insufficient Credits', 
            description: 'You have run out of credits. Please upgrade to Premium or wait for your monthly reset.',
            duration: 6000,
            variant: 'destructive'
          });
          setIsSaving(false);
          return;
        }
        // Re-throw other errors
        throw error;
      }

      // Add to unified session store so all pages update
  try { addSessionToStore({ id: recording.id || `local-${Date.now()}`, title: sessionName || recording.title, createdAt: recording.created_date || new Date().toISOString(), type: recording.type || type, question: payload.question, transcript: payload.transcript, durationSec: recording.duration_seconds || payload.duration_seconds || payload.durationSec || duration, wordsCount: payload.transcript ? payload.transcript.split(/\s+/).filter(Boolean).length : 0, confidenceScore: recording.confidence_score || payload.confidence_score || 0, fillerCount: recording.filler_count || payload.filler_count || 0, wordsPerMinute: recording.words_per_minute || Math.round((payload.transcript ? payload.transcript.split(/\s+/).filter(Boolean).length : 0) / Math.max(1, (recording.duration_seconds || payload.duration_seconds || payload.durationSec || duration) / 60)) }); } catch (e) { console.warn('addSessionToStore failed', e); }

      // Optimistic cache update so Library shows saved session
      try {
        queryClient.setQueryData(['recordings'], (old = []) => {
          const recObj = {
            id: recording.id || `draft-${Date.now()}`,
            title: sessionName || recording.title,
            type: recording.type || type,
            transcript: recording.transcript || payload.transcript,
            durationSec: recording.duration_seconds || payload.duration_seconds || 0,
            createdAt: recording.created_date || new Date().toISOString(),
            confidenceScore: recording.confidence_score,
          };
          const merged = [recObj, ...old.filter(r => r?.id !== recObj.id)];
          // also persist locally as a fallback in case backend list isn't visible in this runtime
          try { saveLocalRecording(recObj); } catch (e) {}
          return merged;
        });
      } catch (e) {
        try { queryClient.invalidateQueries({ queryKey: ['recordings'] }); } catch (ex) {}
      }
      // Always refetch recordings after save to ensure Library shows latest
      try { await queryClient.invalidateQueries({ queryKey: ['recordings'] }); } catch (e) {}

      // Navigate to Draft viewer with saved session
      navigate(createPageUrl('Draft'), {
            state: { 
          sessionData: {
            ...payload,
            id: recording.id,
            title: sessionName || payload.title,
            createdAt: recording.created_date || new Date().toISOString(),
          }
        }
      });

      // update toast to saved
      try { savingToast.update({ title: 'Saved', description: 'Session saved to Library', duration: 4000 }); } catch (e) {}
      setIsSaving(false);
      setRecordingState('idle');
      
      // CRITICAL: Clear transcript AFTER session is saved
      // This allows the next recording to start fresh
      try { clearTranscript(); } catch (e) { console.warn('clearTranscript failed:', e); }
      
      // Credits are now decremented server-side by the backend
      // Backend /sessions endpoint handles credit enforcement
      // Only update local UI state for non-admin users
      if (!isAdmin) {
        // Decrement local optimistic credits for UI (backend already decremented server-side)
        decrementCredits('recording_saved');
      }
    } catch (error) {
      console.error('Error saving session:', error);
  try { savingToast.update({ title: 'Save failed', description: 'Unable to save session right now.', duration: 5000 }); } catch (e) {}
  toast({ title: 'Save failed', description: 'Unable to save session right now. Your draft will be available locally.', duration: 5000 });
      setIsSaving(false);
      navigate(createPageUrl('Draft'), { state: { sessionData } });
    }
  };

  // Helper: safe decrement local credits without calling methods on numbers
  const decrementCredits = (reason) => {
    try {
      setUserCredits(prev => {
        const cur = Number.isFinite(prev) ? prev : (authUser?.credits_remaining ?? 0);
        if (cur <= 0) return 0;
        return Math.max(0, cur - 1);
      });
    } catch (e) {
      console.warn('decrementCredits failed:', e);
    }
  };

  // Helper: create a session draft (temporary mock) — replace backend sessions.create
  // ...existing code...
  
  // Stop recording and cleanup on unmount/navigation
  useEffect(() => {
    return () => {
      // ensure any active recording is stopped
      try { audioStopRecording(); } catch (e) {}
      // Live transcript will be cleared when component unmounts or new recording starts
    };
  }, []);
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10 flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(createPageUrl('Home'))}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {typeLabels[type]}
            </h1>
            <p className="text-zinc-600 dark:text-zinc-500">Speak naturally, Voira will refine your words</p>
          </div>
        </div>
        <CreditsDisplay credits={userCredits} total={user?.role === 'premium_user' ? 200 : 60} compact />
      </motion.div>
      
      {/* Contextual Prompt Input */}
      {(type === 'application' || type === 'interview') && recordingState === 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl mx-auto mb-8"
        >
          <div className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6 space-y-6">
            <div>
              <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
                {type === 'application' 
                  ? 'Paste the application question' 
                  : 'Enter the interview question you\'re answering'}
              </Label>
              <Input
                value={contextPrompt}
                onChange={(e) => {
                  setContextPrompt(e.target.value);
                  // Clear validation warning as user types
                  if (e.target.value.trim().length > 0) {
                    setHasAttemptedStart(false);
                  }
                }}
                placeholder={type === 'application' 
                  ? 'e.g., Tell us about a time you demonstrated leadership...' 
                  : 'e.g., Why do you want to work here?'}
                className={`bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-12 ${
                  validationWarning && !hasValidQuestion ? 'border-red-400 dark:border-red-500/50 focus:border-red-500' : ''
                }`}
              />
              
              {/* Validation Warning - Inline, not modal */}
              {validationWarning && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 mt-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {validationWarning}
                  </p>
                </motion.div>
              )}
              
              {!validationWarning && (
                <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-2">
                  {type === 'application' 
                    ? 'Voira will help you respond naturally, clearly, and authentically.' 
                    : 'Voira will refine your answer while keeping your authentic voice.'}
                </p>
              )}
            </div>
            
            {/* Company Name - Only for interviews */}
            {type === 'interview' && (
              <div>
                <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
                  Company Name (Optional)
                </Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Google, Microsoft, Apple..."
                  className="bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-12"
                />
                <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-2">
                  If provided, Voira will research the company's culture, values, and hiring practices to tailor your response.
                </p>
              </div>
            )}
            
            {/* Company/Role Context - Only for interviews */}
            {type === 'interview' && (
              <div>
                <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
                  Company & Role Context (Optional)
                </Label>
                <Textarea
                  value={companyContext}
                  onChange={(e) => setCompanyContext(e.target.value)}
                  placeholder="e.g., Role: Software Engineer, Values: Innovation, Collaboration, User-focused... (Leave empty to let Voira research the company)"
                  className="bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 min-h-[100px]"
                />
                <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-2">
                  {companyContext ? 
                    'Voira will use your provided context to align your response.' : 
                    'Leave empty and Voira will research the company\'s culture, values, mission, recent initiatives, and hiring practices to tailor your response authentically.'}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Advanced Goal Definition */}
      {recordingState === 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl mx-auto mb-8"
        >
          <div className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6 space-y-6">
            {/* Free-form Goal Input */}
            <div>
              <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
                What do you want this response to sound like?
              </Label>
              <Input
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="e.g., Confident but humble, story-driven with impact..."
                className="bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-12"
                onBlur={(e) => e.target.value && setSessionIntent(e.target.value)}
              />
            </div>

            {/* Style Reference Upload */}
            <FileUpload
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.tif"
              label="Upload Reference Material (Optional)"
              helperText="Upload a PDF, Word document, or image that demonstrates the style you want. Voira will learn the tone and structure — not copy the content."
              onFileSelect={async (file) => {
                if (!file) {
                  setUploadedFileUrl(null);
                  setUploadedFileType(null);
                  setReferenceText('');
                  return;
                }
                
                try {
                  setIsGenerating(true);
                  const { base44 } = await import('@/api/base44Client');
                  
                  // Store file type
                  setUploadedFileType(file.type);
                  
                  // Upload file
                  const { file_url } = await base44.integrations.Core.UploadFile({ file });
                  setUploadedFileUrl(file_url);
                  
                  // Extract text content from file for reference (only for non-image files)
                  // Images will be analyzed via Vision API
                  const isImage = file.type.startsWith('image/');
                  
                  if (!isImage) {
                    try {
                      const extraction = await base44.integrations.Core.ExtractDataFromUploadedFile({
                        file_url,
                        json_schema: {
                          type: 'object',
                          properties: {
                            content: { type: 'string' }
                          }
                        }
                      });
                      
                      if (extraction.status === 'success' && extraction.output?.content) {
                        setReferenceText(extraction.output.content);
                      }
                    } catch (extractError) {
                      console.warn('Error extracting text from reference file:', extractError);
                      // Continue without extracted text - URL is still saved for Vision API
                    }
                  } else {
                    // For images, clear any previous text (will use Vision API)
                    setReferenceText('');
                  }
                } catch (error) {
                  console.error('Error uploading file:', error);
                  toast({ title: 'Upload failed', description: 'Could not upload reference file', duration: 3000 });
                } finally {
                  setIsGenerating(false);
                }
              }}
            />
          </div>
        </motion.div>
      )}

      {/* Main Recording Area */}
      <div className={`flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full transition-all duration-500 ${
        recordingState === 'recording' ? 'brightness-75' : ''
      }`}>
        {recordingState === 'idle' && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-zinc-600 dark:text-zinc-400 text-lg mb-8"
          >
            Record Answer
          </motion.p>
        )}
        
        {/* Voice Visualizer - Only show during idle or recording states */}
        {(recordingState === 'idle' || recordingState === 'recording') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: recordingState === 'recording' ? 1.15 : 1 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <VoiceVisualizer 
              size={recordingState === 'recording' ? 280 : 240} 
              isActive={recordingState === 'recording' && !audioIsPaused} 
              amplitude={audioAmplitude}
            />
          </motion.div>
        )}
        
        {/* Live Indicators */}
        {recordingState === 'recording' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-6 mb-8"
          >
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[hsl(var(--card))] rounded-full border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-xs text-zinc-700 dark:text-zinc-400">Fillers: {fillerCount}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[hsl(var(--card))] rounded-full border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <div className="w-2 h-2 rounded-full bg-teal-400" />
              <span className="text-xs text-zinc-700 dark:text-zinc-400">Confidence: {confidenceLevel}%</span>
            </div>
          </motion.div>
        )}
        
        {/* Timer */}
        <AnimatePresence>
          {showTimer && recordingState === 'recording' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 mb-8 px-6 py-3 bg-white dark:bg-[#1a1a24] rounded-full border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none"
            >
              <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="text-2xl font-mono text-zinc-900 dark:text-zinc-100">{formatTime(duration)}</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-4"
        >
          {recordingState === 'idle' && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                size="lg"
                onClick={handleStart}
                disabled={isTranscribing || isGenerating}
                className="h-16 px-10 bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white rounded-2xl text-lg shadow-lg shadow-violet-500/20 disabled:opacity-50"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Mic className="w-5 h-5 mr-3" />
                </motion.div>
                Start
              </Button>
            </motion.div>
          )}
          {recordingState === 'recording' && (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={handlePause}
                className={`h-14 w-14 rounded-2xl border-white/10 ${audioIsPaused ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-300'}`}
              >
                <Pause className="w-5 h-5" />
              </Button>
              <Button
                size="lg"
                onClick={handleFinish}
                disabled={isTranscribing || isGenerating}
                className="h-14 px-8 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-2xl disabled:opacity-50"
              >
                <Square className="w-4 h-4 mr-2" />
                Finish
              </Button>
            </>
          )}
          {(recordingState === 'processing' || recordingState === 'finished') && (
            <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <Loader2 className="w-5 h-5 animate-spin text-violet-600 dark:text-violet-400" />
              <span className="text-zinc-700 dark:text-zinc-300">
                {isTranscribing ? 'Transcribing...' : isGenerating ? 'Processing...' : 'Processing complete'}
              </span>
            </div>
          )}
        </motion.div>
        
  {/* Live Transcription - Only show when recording is active and enabled */}
  {/* Shows rawTranscript (verbatim speech, includes filler words) */}
  {showTranscription && recordingState === 'recording' && (
    <LiveTranscription 
      transcript={rawTranscript || ''}
    />
  )}
      </div>
      
      {/* Toggle Options */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center justify-center gap-8 mt-8 pt-6 border-t border-zinc-200 dark:border-white/5"
        >
        <div className="flex items-center gap-3">
          <Switch
            id="transcription"
            checked={showTranscription}
            onCheckedChange={setShowTranscription}
          />
          <Label htmlFor="transcription" className="text-sm text-zinc-600 dark:text-zinc-400">
            Live Transcription
          </Label>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="timer"
            checked={showTimer}
            onCheckedChange={setShowTimer}
          />
          <Label htmlFor="timer" className="text-sm text-zinc-600 dark:text-zinc-400">
            Show Timer
          </Label>
        </div>
      </motion.div>

      {/* Session Naming Modal */}
      <SessionNamingModal
        isOpen={showNamingModal}
        onClose={() => setShowNamingModal(false)}
        onSave={handleSaveSession}
        defaultName={`${typeLabels[type]} Response`}
        suggestedNames={[
          `${typeLabels[type]} – Confident Tone`,
          `${typeLabels[type]} – Leadership Focus`,
          `${typeLabels[type]} – ${new Date().toLocaleDateString()}`,
        ]}
      />
    </div>
  );
}
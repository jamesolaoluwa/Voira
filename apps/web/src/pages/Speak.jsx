import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import FileUpload from '@/components/ui/FileUpload';
import RecordButton from '@/components/ui/RecordButton';
import SessionNamingModal from '@/components/ui/SessionNamingModal';
import CreditsDisplay from '@/components/ui/CreditsDisplay';
import { Mic, Pause, Play, Square, Clock, Type, ArrowLeft, Loader2, AlertCircle, Save, X } from 'lucide-react';
import useAudioRecorder from '@/components/recording/AudioRecorder';
import { auth, sessions, credits as creditsAPI, drafts as draftsAPI } from '@/components/services/api';
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
  refine: 'Refine a Draft',
};

/**
 * ============================================================================
 * SESSION RESUME / RECOVERY SYSTEM
 * ============================================================================
 * 
 * PURPOSE:
 * Allows users to recover in-progress recordings if the page is accidentally
 * refreshed or closed during recording.
 * 
 * STORAGE LOCATION:
 * - Data is stored in browser sessionStorage (not localStorage)
 * - Data is LOCAL ONLY - never sent to the backend
 * - Data is NOT persisted across browser restarts
 * 
 * LIFETIME:
 * - sessionStorage is cleared when the browser TAB closes
 * - This is intentional: session resume is for SHORT-TERM recovery only
 * - Long-term persistence would require explicit "Save Draft" functionality
 * 
 * SINGLE ACTIVE SESSION:
 * - Only ONE in-progress session is persisted at a time
 * - Starting a new recording overwrites any previous persisted session
 * - This is an intentional UX decision to avoid ambiguous resume behavior
 * - Users who want to preserve multiple drafts must explicitly save them
 * 
 * WHAT IS PERSISTED:
 * - session_id, type, question, desired_style, word_limit
 * - company_name, company_context (for interview type)
 * - transcript_text, is_user_edited flag, last_updated timestamp
 * 
 * WHAT IS NOT PERSISTED (by design):
 * - Raw audio blobs (too large, would exceed sessionStorage quota)
 * - LLM responses (regenerated on save)
 * - Credit state (fetched fresh from backend)
 * ============================================================================
 */

// Session storage key for persisting in-progress recordings
const SESSION_STORAGE_KEY = 'voira_active_session';

/**
 * Shape of persisted session data (minimal, no audio blobs or LLM responses)
 */
const createSessionSnapshot = (data) => ({
  session_id: data.session_id || crypto.randomUUID(),
  type: data.type,
  question: data.question || '',
  desired_style: data.desired_style || '',
  word_limit: data.word_limit || 'auto',
  company_name: data.company_name || '',
  company_context: data.company_context || '',
  transcript_text: data.transcript_text || '',
  is_user_edited: data.is_user_edited || false,
  last_updated: Date.now(),
});

/**
 * Persist session to sessionStorage (cheap, frequent writes)
 * Called on: transcript updates, user edits, pause, stop
 */
const persistSession = (data) => {
  try {
    const snapshot = createSessionSnapshot(data);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    // sessionStorage may be full or disabled - log but don't crash
    console.warn('[Speak] Failed to persist session:', e);
  }
};

/**
 * Load session from sessionStorage
 * Returns null if no session exists or data is malformed
 */
const loadPersistedSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate shape - reject malformed data
    if (!parsed.session_id || !parsed.last_updated) return null;
    return parsed;
  } catch (e) {
    // Malformed JSON or other error - clear and return null
    console.warn('[Speak] Failed to load persisted session:', e);
    clearPersistedSession();
    return null;
  }
};

/**
 * Clear persisted session from sessionStorage
 * Called on: successful save, explicit discard, starting new recording
 */
const clearPersistedSession = () => {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.warn('[Speak] Failed to clear persisted session:', e);
  }
};

export default function Speak() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const rawType = urlParams.get('type');

  // Free Speak and Interview Response are merged into Practice (Phase 2).
  // Bare /speak also redirects — Application Essay requires ?type=application.
  const shouldRedirectToPractice =
    !rawType || rawType === 'free' || rawType === 'interview';
  const type = rawType === 'refine' ? 'refine' : 'application';

  useEffect(() => {
    if (shouldRedirectToPractice) {
      navigate(createPageUrl('Practice'), { replace: true });
    }
  }, [shouldRedirectToPractice, navigate]);

  const { user: authUser, session, isLoading: authLoading, isAdmin, refreshUser } = useAuth();
  const [lastProfileRefresh, setLastProfileRefresh] = useState(0);
  
  // User settings - filler detection can be enabled in settings
  const [fillerDetectionEnabled, setFillerDetectionEnabled] = useState(false);
  
  // Load user's filler detection setting
  useEffect(() => {
    const loadFillerSetting = async () => {
      if (!session?.access_token) return;
      try {
        const { apiClient } = await import('@/lib/apiClient');
        const settings = await apiClient.get('/user/settings');
        if (settings?.filler_word_detection) {
          setFillerDetectionEnabled(true);
          console.log('[Speak] Filler detection enabled from user settings');
        }
      } catch (error) {
        console.warn('[Speak] Could not load user settings for filler detection:', error);
      }
    };
    loadFillerSetting();
  }, [session?.access_token]);

  // Refresh user profile if > 5 minutes old (Claude.md - Item #4)
  useEffect(() => {
    if (!authUser || !refreshUser) return;

    const now = Date.now();
    const timeSinceLastRefresh = now - lastProfileRefresh;
    const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

    if (lastProfileRefresh === 0 || timeSinceLastRefresh > REFRESH_INTERVAL) {
      refreshUser().then(() => {
        setLastProfileRefresh(now);
      }).catch(err => {
        console.warn('[Speak] Failed to refresh profile:', err);
      });
    }
  }, [authUser, refreshUser, lastProfileRefresh]);
  
  // Use AudioRecorder with optional filler detection based on user setting
  const {
    isRecording: audioIsRecording,
    isPaused: audioIsPaused,
    amplitude: audioAmplitude,
    error: audioError,
    liveTranscript: audioLiveTranscript, // Real-time transcript from WebSocket
    fillerCount: liveFillerCount, // Live filler count (only when fillerDetectionEnabled)
    isOfflineMode: audioIsOfflineMode, // GAP-003: True if recording without live transcription
    startRecording: audioStartRecording,
    pauseRecording: audioPauseRecording,
    resumeRecording: audioResumeRecording,
    stopRecording: audioStopRecording,
    uploadAndTranscribe,
    getAccumulatedTranscript, // CRITICAL: Use to capture transcript synchronously
    clearTranscript, // Call after session saved or discarded
    forceCleanup: audioForceCleanup, // Force cleanup of all audio resources
  } = useAudioRecorder({ detectFillers: fillerDetectionEnabled });
  
  const [user, setUser] = useState(null);
  const [userCredits, setUserCredits] = useState(0);
  const [duration, setDuration] = useState(0);
  const [recordingState, setRecordingState] = useState('idle');
  // recordingState: 'idle' | 'starting' | 'recording' | 'processing' | 'finished' | 'error'
  // 'starting' = mic permission requested, waiting for MediaRecorder to initialize
  const [showTranscription, setShowTranscription] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [rawTranscript, setRawTranscript] = useState(''); // Raw verbatim transcript (includes filler words, from WebSocket)
  const [refinedTranscript, setRefinedTranscript] = useState(''); // LLM-refined transcript (generated only after Finish)
  const [transcript, setTranscript] = useState(''); // Deprecated: kept for backward compatibility, will use rawTranscript
  const [contextPrompt, setContextPrompt] = useState(''); // Interview question or application question
  const [companyName, setCompanyName] = useState(''); // Company name for interviews (for research when context is empty)
  const [companyContext, setCompanyContext] = useState(''); // Company/role context for interviews
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
  const [wordLimit, setWordLimit] = useState('auto'); // Word limit: 'auto' (default) or numeric string
  
  // Session resume state
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [pendingResumeSession, setPendingResumeSession] = useState(null);
  const [isTranscriptUserEdited, setIsTranscriptUserEdited] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  
  // Draft save state (Partial Save / Draft Naming feature)
  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(null); // Track active draft for autosave
  const [lastAutosaveContent, setLastAutosaveContent] = useState(''); // Track content to detect changes
  const autosaveTimerRef = useRef(null);
  
  // EDGE CASE 1 FIX: Guard to prevent autosave during/after session finalization
  // Set to true when handleFinish/handleSaveSession begins, never reset (page navigates away)
  const isFinalizingRef = useRef(false);
  
  // Validation state - tracks whether user has attempted to start recording
  const [hasAttemptedStart, setHasAttemptedStart] = useState(false);
  
  const intervalRef = useRef(null);
  
  /**
   * VALIDATION LOGIC
   * 
   * canStartRecording is true ONLY when:
   * - For 'application' type: contextPrompt (question) is non-empty
   * - For 'interview' type: contextPrompt (question) AND goalInput (desired style) are non-empty
   * - For 'free'/'refine' types: always allowed (no question required)
   * - AND not currently recording/processing
   * 
   * Reference inputs do NOT affect this boolean.
   */
  const requiresQuestion = type === 'application' || type === 'interview';
  const requiresDesiredStyle = type === 'interview'; // GAP-011: desired style required for interview
  const hasValidQuestion = contextPrompt.trim().length > 0;
  const hasValidDesiredStyle = goalInput.trim().length > 0;
  const hasReferenceOnly = (uploadedFileUrl || referenceText) && !hasValidQuestion;
  
  const canStartRecording = useMemo(() => {
    // Must be in idle state - 'starting' blocks re-entry
    if (recordingState !== 'idle') return false;
    if (isTranscribing || isGenerating) return false;
    
    // For types that require a question, validate it exists
    if (requiresQuestion && !hasValidQuestion) return false;
    
    // For interview type, desired style is also required (GAP-011)
    if (requiresDesiredStyle && !hasValidDesiredStyle) return false;
    
    return true;
  }, [recordingState, isTranscribing, isGenerating, requiresQuestion, hasValidQuestion, requiresDesiredStyle, hasValidDesiredStyle]);
  
  // Derived state: is the system currently initializing recording?
  const isStartingRecording = recordingState === 'starting';
  
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
    
    // GAP-011: Desired style is required for interview mode
    if (requiresDesiredStyle && !hasValidDesiredStyle) {
      return 'Please describe what you want this response to sound like before recording.';
    }
    
    return null;
  };
  
  const validationWarning = getValidationWarning();
  const queryClient = useQueryClient();
  const addSessionToStore = useSessionStore(state => state.addSession);
  
  // Check for persisted session on mount
  useEffect(() => {
    const persisted = loadPersistedSession();
    if (persisted && persisted.type === type) {
      // Only show resume prompt if there's meaningful content
      const hasContent = persisted.transcript_text?.trim().length > 0 ||
                        persisted.question?.trim().length > 0;
      if (hasContent) {
        console.log('[Speak] Found persisted session:', persisted.session_id);
        setPendingResumeSession(persisted);
        setShowResumePrompt(true);
      } else {
        // Clear stale empty session
        clearPersistedSession();
      }
    }
  }, [type]);
  
  // Handle resume session
  const handleResumeSession = () => {
    if (!pendingResumeSession) return;
    
    console.log('[Speak] Resuming session:', pendingResumeSession.session_id);
    
    // Restore all fields
    setContextPrompt(pendingResumeSession.question || '');
    setGoalInput(pendingResumeSession.desired_style || '');
    setWordLimit(pendingResumeSession.word_limit || 'auto');
    setCompanyName(pendingResumeSession.company_name || '');
    setCompanyContext(pendingResumeSession.company_context || '');
    setRawTranscript(pendingResumeSession.transcript_text || '');
    setIsTranscriptUserEdited(pendingResumeSession.is_user_edited || false);
    setActiveSessionId(pendingResumeSession.session_id);
    
    // Clear prompt
    setShowResumePrompt(false);
    setPendingResumeSession(null);
    
    toast({
      title: 'Session restored',
      description: 'Your previous recording has been restored.',
      duration: 3000
    });
  };
  
  // Handle discard session
  const handleDiscardSession = () => {
    console.log('[Speak] Discarding persisted session');
    clearPersistedSession();
    setShowResumePrompt(false);
    setPendingResumeSession(null);
    setActiveSessionId(null);
    
    toast({
      title: 'Session discarded',
      description: 'Starting fresh.',
      duration: 2000
    });
  };
  
  useEffect(() => {
    checkAuthAndLoadCredits();
  }, [authUser, authLoading, session]);
  
  // Handle draft resume from navigation state (e.g., from Library or Draft page)
  useEffect(() => {
    if (location.state?.resumeFromDraft) {
      const {
        draftId,
        question,
        desiredStyle,
        wordLimit: draftWordLimit,
        companyName: draftCompanyName,
        companyContext: draftCompanyContext,
        transcript,
        isUserEdited,
      } = location.state;
      
      console.log('[Speak] Resuming from draft:', draftId);
      
      // Rehydrate all fields
      if (draftId) setCurrentDraftId(draftId);
      if (question) setContextPrompt(question);
      if (desiredStyle) setGoalInput(desiredStyle);
      if (draftWordLimit) setWordLimit(String(draftWordLimit));
      if (draftCompanyName) setCompanyName(draftCompanyName);
      if (draftCompanyContext) setCompanyContext(draftCompanyContext);
      if (transcript) {
        setRawTranscript(transcript);
        setLastAutosaveContent(JSON.stringify({
          question,
          desired_style: desiredStyle,
          transcript,
          company_name: draftCompanyName,
          company_context: draftCompanyContext,
        }));
      }
      if (isUserEdited) setIsTranscriptUserEdited(true);
      
      // Clear sessionStorage fallback since we have a backend draft
      clearPersistedSession();
      
      // Clear navigation state to prevent re-loading on refresh
      navigate(location.pathname + location.search, { replace: true, state: {} });
      
      toast({
        title: 'Draft loaded',
        description: 'Continue where you left off.',
        duration: 3000,
      });
    }
  }, [location.state]);
  
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
  
  // Cleanup on unmount - ensure mic is off when leaving the page
  useEffect(() => {
    return () => {
      console.log('[Speak] Component unmounting, forcing audio cleanup');
      audioForceCleanup();
    };
  }, []);
  
  // EDGE CASE 3: Ensure mic is OFF for ALL transitions to idle/error states
  // This guarantees no lingering mic access after errors, permission denial, or completion
  useEffect(() => {
    if (recordingState === 'idle' || recordingState === 'error') {
      console.log(`[Speak] Recording state is '${recordingState}' - ensuring mic cleanup`);
      audioForceCleanup();
    }
  }, [recordingState]);

  // Update rawTranscript from audioLiveTranscript during recording
  // If user has edited, append new transcription instead of overwriting
  useEffect(() => {
    if (recordingState === 'recording' && audioLiveTranscript) {
      if (isTranscriptUserEdited) {
        // User has edited - don't overwrite, they control the content
        // New transcription is still captured by AudioRecorder for final save
      } else {
        setRawTranscript(audioLiveTranscript);
      }
    }
  }, [audioLiveTranscript, recordingState, isTranscriptUserEdited]);

  // Persist session to sessionStorage during recording (cheap, frequent writes)
  // This is for ACCIDENTAL recovery only - separate from backend draft autosave
  useEffect(() => {
    if (recordingState === 'recording' || recordingState === 'processing') {
      persistSession({
        session_id: activeSessionId || crypto.randomUUID(),
        type,
        question: contextPrompt,
        desired_style: goalInput,
        word_limit: wordLimit,
        company_name: companyName,
        company_context: companyContext,
        transcript_text: rawTranscript,
        is_user_edited: isTranscriptUserEdited,
      });
    }
  }, [recordingState, contextPrompt, goalInput, wordLimit, companyName, companyContext, rawTranscript, isTranscriptUserEdited, type, activeSessionId]);
  
  /**
   * Autosave to backend draft every 10 seconds during recording.
   * Only saves if content has changed since last autosave.
   * Creates draft on first save, updates same draft thereafter.
   * 
   * EDGE CASE 1: Autosave is blocked during/after session finalization
   * EDGE CASE 2: Autosave triggers for setup-only content (question, company, style) even without transcript
   */
  useEffect(() => {
    // Only autosave during active recording or paused state
    // EDGE CASE 1: Block autosave during processing/finished states (finalization in progress)
    const canAutosave = recordingState === 'recording' || recordingState === 'paused';
    if (!canAutosave) {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      return;
    }
    
    const autosave = async () => {
      // EDGE CASE 1: Block autosave if finalization has begun
      // This prevents draft resurrection after currentDraftId is cleared
      if (isFinalizingRef.current) {
        console.log('[Speak:Autosave] Blocked - finalization in progress');
        return;
      }
      
      // Get current transcript
      const currentTranscript = getAccumulatedTranscript() || rawTranscript;
      
      // Build content signature to detect changes
      const contentSignature = JSON.stringify({
        question: contextPrompt,
        desired_style: goalInput,
        transcript: currentTranscript,
        company_name: companyName,
        company_context: companyContext,
      });
      
      // Skip if no changes
      if (contentSignature === lastAutosaveContent) {
        console.log('[Speak:Autosave] No changes, skipping');
        return;
      }
      
      // EDGE CASE 2: Allow autosave if ANY meaningful content exists (not just transcript)
      // This ensures users don't lose setup work (question, company, style) if they navigate away
      const hasQuestion = contextPrompt?.trim().length > 0;
      const hasStyle = goalInput?.trim().length > 0;
      const hasCompanyName = companyName?.trim().length > 0;
      const hasCompanyContext = companyContext?.trim().length > 0;
      const hasTranscript = currentTranscript?.trim().length > 0;
      
      if (!hasQuestion && !hasStyle && !hasCompanyName && !hasCompanyContext && !hasTranscript) {
        console.log('[Speak:Autosave] No content to save, skipping');
        return;
      }
      
      try {
        const draftData = {
          name: currentDraftId ? undefined : generateDraftName(contextPrompt), // Only set name on create
          type,
          question: contextPrompt || null,
          desired_style: goalInput || null,
          word_limit: wordLimit && wordLimit !== 'auto' ? parseInt(wordLimit, 10) : null,
          company_name: companyName || null,
          company_context: companyContext || null,
          transcript_text: currentTranscript || '',
          is_user_edited: isTranscriptUserEdited,
        };
        
        if (currentDraftId) {
          // Update existing draft
          console.log('[Speak:Autosave] Updating draft:', currentDraftId);
          await draftsAPI.update(currentDraftId, draftData);
        } else {
          // Create new draft
          console.log('[Speak:Autosave] Creating new draft');
          const savedDraft = await draftsAPI.create(draftData);
          setCurrentDraftId(savedDraft.id);
          console.log('[Speak:Autosave] Draft created:', savedDraft.id);
          
          // Clear sessionStorage since we now have a backend draft
          clearPersistedSession();
        }
        
        setLastAutosaveContent(contentSignature);
        console.log('[Speak:Autosave] Success');
      } catch (error) {
        console.error('[Speak:Autosave] Error:', error);
        // Don't show toast for autosave failures - too noisy
      }
    };
    
    // Start autosave timer (every 10 seconds)
    autosaveTimerRef.current = setInterval(autosave, 10000);
    
    // Cleanup
    return () => {
      if (autosaveTimerRef.current) {
        clearInterval(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [recordingState, contextPrompt, goalInput, wordLimit, companyName, companyContext, rawTranscript, isTranscriptUserEdited, type, currentDraftId, lastAutosaveContent]);

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
    
    // CRITICAL: Set 'starting' state IMMEDIATELY to prevent double-clicks
    // This blocks re-entry via canStartRecording check
    console.log('[Speak] State transition: idle → starting');
    setRecordingState('starting');
    
    // Generate new session ID for this recording
    const newSessionId = crypto.randomUUID();
    setActiveSessionId(newSessionId);
    setIsTranscriptUserEdited(false);
    
    // Reset state for new recording
    setDuration(0);
    setRawTranscript(''); // Clear raw transcript (verbatim speech)
    setRefinedTranscript(''); // Clear refined transcript (LLM output)
    setTranscript(''); // Deprecated: kept for backward compatibility
    setConfidenceLevel(0);
    
    // Request microphone permission DIRECTLY in click handler to satisfy user gesture requirement
    let stream = null;
    try {
      console.log('[Speak] Requesting microphone permission...');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[Speak] Microphone permission granted, stream obtained');
    } catch (err) {
      console.error('[Speak] Error requesting microphone permission:', err);
      console.log('[Speak] State transition: starting → idle (mic permission failed)');
      setRecordingState('idle');
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
      console.log('[Speak] State transition: starting → recording');
      setRecordingState('recording');
    } catch (err) {
      console.error('[Speak] Error starting recording:', err);
      console.error('[Speak] Error name:', err.name);
      console.error('[Speak] Error message:', err.message);
      console.log('[Speak] State transition: starting → idle (recording start failed)');
      setRecordingState('idle');
      
      // Clean up stream on error - CRITICAL: Stop mic when recording fails
      try {
        console.log('[Speak] Cleaning up stream after recording start failure');
        stream.getTracks().forEach(track => {
          console.log(`[Speak] Stopping track: ${track.kind}, state: ${track.readyState}`);
          track.stop();
        });
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
  
  /**
   * Handle pause/resume toggle.
   * On pause: WebSocket is closed to prevent Deepgram 1011 timeout.
   * On resume: WebSocket is reconnected, transcription appends to existing text.
   */
  const handlePause = async () => {
    if (audioIsPaused) {
      console.log('[Speak] Resuming recording...');
      // Resume is async because it reconnects WebSocket
      await audioResumeRecording();
      console.log('[Speak] Recording resumed');
    } else {
      console.log('[Speak] Pausing recording...');
      audioPauseRecording();
      console.log('[Speak] Recording paused');
    }
  };
  
  /**
   * Generate default draft name from question (first ~8 words)
   */
  const generateDraftName = (question) => {
    if (!question || !question.trim()) return 'Untitled Draft';
    const words = question.trim().split(/\s+/).slice(0, 8);
    let name = words.join(' ');
    if (question.trim().split(/\s+/).length > 8) name += '...';
    return name || 'Untitled Draft';
  };
  
  /**
   * Handle Save Draft button click - opens modal
   */
  const handleSaveDraftClick = () => {
    // Pre-populate draft name from question
    setDraftName(generateDraftName(contextPrompt));
    setShowSaveDraftModal(true);
  };
  
  /**
   * Save draft to backend (manual save via modal).
   * No LLM calls, no credits consumed.
   * If a draft already exists (from autosave), updates it with the new name.
   */
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    
    try {
      // Capture current transcript from AudioRecorder ref (if recording)
      // or use rawTranscript state (if not recording)
      const currentTranscript = recordingState === 'recording' || recordingState === 'paused'
        ? getAccumulatedTranscript() || rawTranscript
        : rawTranscript;
      
      const draftData = {
        name: draftName.trim() || generateDraftName(contextPrompt),
        type,
        question: contextPrompt || null,
        desired_style: goalInput || null,
        word_limit: wordLimit && wordLimit !== 'auto' ? parseInt(wordLimit, 10) : null,
        company_name: companyName || null,
        company_context: companyContext || null,
        transcript_text: currentTranscript || '',
        is_user_edited: isTranscriptUserEdited,
      };
      
      let savedDraft;
      
      if (currentDraftId) {
        // Update existing draft (from autosave)
        console.log('[Speak] Updating existing draft:', currentDraftId);
        savedDraft = await draftsAPI.update(currentDraftId, draftData);
        savedDraft = { ...savedDraft, name: draftData.name }; // Ensure name is in response
      } else {
        // Create new draft
        console.log('[Speak] Creating new draft:', draftData);
        savedDraft = await draftsAPI.create(draftData);
        setCurrentDraftId(savedDraft.id);
      }
      
      console.log('[Speak] Draft saved:', savedDraft.id);
      
      // Clear session resume storage since we've explicitly saved
      clearPersistedSession();
      
      // Show success toast
      toast({
        title: 'Draft saved',
        description: `"${draftData.name}" saved successfully.`,
        duration: 3000,
      });
      
      // Close modal and reset state
      setShowSaveDraftModal(false);
      setDraftName('');
      
    } catch (error) {
      console.error('[Speak] Error saving draft:', error);
      toast({
        title: 'Failed to save draft',
        description: error.message || 'Please try again.',
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsSavingDraft(false);
    }
  };
  
  const handleFinish = async () => {
    // EDGE CASE 1: Set finalization guard BEFORE any state changes
    // This prevents autosave from running during/after finalization
    isFinalizingRef.current = true;
    
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
        
        // Parse word_limit from UI dropdown (only when explicitly set, not 'auto')
        // 'auto' means no word_limit is sent, letting backend use its default behavior
        const explicitWordLimit = (type === 'application' || type === 'interview') && wordLimit && wordLimit !== 'auto'
          ? parseInt(wordLimit, 10) 
          : undefined;
        
        console.log('[Speak] Calling /analyze with transcript length:', rawTextForAnalysis.length, 'word_limit:', explicitWordLimit);
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
          word_limit: explicitWordLimit,
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
      // This updates the modal data with full v3 analytics
      setSessionData({
        transcript: frozenRawTranscript, // Raw verbatim transcript (includes filler words)
        audio_url: audioUrl,
        refinedDraft: analysis.refined_text || '',
        clarityScore: analysis.clarity_score || 70,
        confidenceScore: analysis.confidence_score || 70,
        fillerCount: analysis.filler_word_count || 0,
        // v3 Analytics: Include filler density and reliability
        filler_word_frequency: analysis.filler_word_frequency || 0,
        analysis_reliability: analysis.analysis_reliability || 0.5,
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
  
  // EDGE CASE 1: Set finalization guard to prevent autosave during save
  isFinalizingRef.current = true;
  
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
        if (error.status === 402 || error.message?.includes('Insufficient credits')) {
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

      // Add to unified session store so all pages update (with v3 analytics fields)
      try { 
        addSessionToStore({ 
          id: recording.id || `local-${Date.now()}`, 
          title: sessionName || recording.title, 
          createdAt: recording.created_date || new Date().toISOString(), 
          type: recording.type || type, 
          question: payload.question, 
          transcript: payload.transcript, 
          durationSec: recording.duration_seconds || payload.duration_seconds || payload.durationSec || duration, 
          wordsCount: payload.transcript ? payload.transcript.split(/\s+/).filter(Boolean).length : 0, 
          confidenceScore: recording.confidence_score || payload.confidence_score || 0, 
          clarityScore: recording.clarity_score || payload.clarity_score || 0,
          fillerCount: recording.filler_count || payload.filler_count || 0, 
          // v3 Analytics fields
          filler_word_frequency: recording.filler_word_frequency || payload.filler_word_frequency || 0,
          analysis_reliability: recording.analysis_reliability || payload.analysis_reliability || 0.5,
          wordsPerMinute: recording.words_per_minute || Math.round((payload.transcript ? payload.transcript.split(/\s+/).filter(Boolean).length : 0) / Math.max(1, (recording.duration_seconds || payload.duration_seconds || payload.durationSec || duration) / 60)) 
        }); 
      } catch (e) { console.warn('addSessionToStore failed', e); }

      // Optimistic cache update so Library shows saved session (with v3 analytics)
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
            clarityScore: recording.clarity_score,
            fillerCount: recording.filler_count,
            // v3 Analytics fields
            filler_word_frequency: recording.filler_word_frequency || 0,
            analysis_reliability: recording.analysis_reliability || 0.5,
          };
          const merged = [recObj, ...old.filter(r => r?.id !== recObj.id)];
          // also persist locally as a fallback
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
      
      // CRITICAL: Clear persisted session on successful save
      clearPersistedSession();
      setActiveSessionId(null);
      setIsTranscriptUserEdited(false);
      
      // Clear draft state - session is now complete, draft is no longer needed
      // If there was an autosaved draft, delete it from backend
      if (currentDraftId) {
        try {
          console.log('[Speak] Deleting draft after successful save:', currentDraftId);
          await draftsAPI.delete(currentDraftId);
        } catch (e) {
          console.warn('[Speak] Failed to delete draft after save:', e);
        }
        setCurrentDraftId(null);
      }
      setLastAutosaveContent('');
      
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

  // Hooks must run unconditionally; redirect UI gate stays after them.
  if (shouldRedirectToPractice) {
    return null;
  }
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10 flex flex-col">
      {/* Session Resume Banner */}
      <AnimatePresence>
        {showResumePrompt && pendingResumeSession && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
          >
            <div className="bg-white dark:bg-[#1a1a24] rounded-xl border border-zinc-200 dark:border-white/10 shadow-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Unfinished recording found
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                    {pendingResumeSession.transcript_text?.length > 0 
                      ? `${pendingResumeSession.transcript_text.split(' ').length} words captured`
                      : 'Question and settings saved'}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={handleResumeSession}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8"
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDiscardSession}
                      className="text-xs h-8"
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        <CreditsDisplay credits={userCredits} total={user?.monthly_credit_allowance ?? 10} compact />
      </motion.div>
      
      {/* Contextual Prompt Input */}
      {(type === 'application' || type === 'interview') && (recordingState === 'idle' || recordingState === 'starting') && (
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
                {requiresQuestion && <span className="text-red-500 ml-1">*</span>}
              </Label>
              {/* Question input with embedded word limit dropdown */}
              <div className="relative">
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
                  className={`bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-12 pr-28 ${
                    validationWarning && !hasValidQuestion ? 'border-red-400 dark:border-red-500/50 focus:border-red-500' : ''
                  }`}
                />
                {/* Embedded word limit dropdown */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <Select value={wordLimit} onValueChange={setWordLimit}>
                    <SelectTrigger className="h-8 w-24 bg-zinc-100 dark:bg-zinc-800/50 border-0 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700/50 focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#1a1a24] border-zinc-200 dark:border-white/10">
                      <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                      <SelectItem value="100" className="text-xs">100 words</SelectItem>
                      <SelectItem value="150" className="text-xs">150 words</SelectItem>
                      <SelectItem value="250" className="text-xs">250 words</SelectItem>
                      <SelectItem value="500" className="text-xs">500 words</SelectItem>
                      <SelectItem value="750" className="text-xs">750 words</SelectItem>
                      <SelectItem value="1000" className="text-xs">1000 words</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
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
      {(recordingState === 'idle' || recordingState === 'starting') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl mx-auto mb-8"
        >
          <div className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6 space-y-6">
            {/* Free-form Goal Input - Required for interview mode (GAP-011) */}
            <div>
              <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
                What do you want this response to sound like?
                {requiresDesiredStyle && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Input
                value={goalInput}
                onChange={(e) => {
                  setGoalInput(e.target.value);
                  // Clear validation warning as user types
                  if (e.target.value.trim().length > 0) {
                    setHasAttemptedStart(false);
                  }
                }}
                placeholder="e.g., Confident but humble, story-driven with impact..."
                className={`bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-12 ${
                  validationWarning && requiresDesiredStyle && !hasValidDesiredStyle ? 'border-red-400 dark:border-red-500/50 focus:border-red-500' : ''
                }`}
                onBlur={(e) => e.target.value && setSessionIntent(e.target.value)}
              />
              {requiresDesiredStyle && (
                <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-2">
                  Required for interview responses. Describe the tone, confidence level, and style you want.
                </p>
              )}
            </div>

            {/* Style Reference Upload - Hidden for interview mode (GAP-011: out of scope for v1) */}
            {type !== 'interview' && (
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
            )}
          </div>
        </motion.div>
      )}

      {/* Main Recording Area */}
      <div className={`flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full transition-all duration-500 ${
        recordingState === 'recording' ? 'brightness-75' : ''
      }`}>
        {(recordingState === 'idle' || recordingState === 'starting') && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-zinc-600 dark:text-zinc-400 text-lg mb-8"
          >
            {recordingState === 'starting' ? 'Initializing...' : 'Record Answer'}
          </motion.p>
        )}
        
        {/* Voice Visualizer - Only show during idle, starting, or recording states */}
        {(recordingState === 'idle' || recordingState === 'starting' || recordingState === 'recording') && (
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
        
        {/* Live Indicators - Only show pause count if user has enabled tracking in settings */}
        {recordingState === 'recording' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-6 mb-8"
          >
            {/* Thinking pause count - only shown when tracking is enabled in user settings */}
            {fillerDetectionEnabled && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm dark:shadow-none transition-colors ${
                liveFillerCount > 5 
                  ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30' 
                  : 'bg-white dark:bg-[hsl(var(--card))] border-zinc-200 dark:border-white/5'
              }`}>
                <div className={`w-2 h-2 rounded-full ${liveFillerCount > 5 ? 'bg-amber-500 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-xs text-zinc-700 dark:text-zinc-400">Pauses: {liveFillerCount}</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[hsl(var(--card))] rounded-full border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
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
              <Clock className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
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
          {(recordingState === 'idle' || recordingState === 'starting') && (
            <motion.div whileHover={recordingState === 'idle' ? { scale: 1.05 } : {}} whileTap={recordingState === 'idle' ? { scale: 0.95 } : {}}>
              <Button
                size="lg"
                onClick={handleStart}
                disabled={recordingState === 'starting' || isTranscribing || isGenerating || !canStartRecording}
                className="h-16 px-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-2xl text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recordingState === 'starting' ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Mic className="w-5 h-5 mr-3" />
                    </motion.div>
                    Start
                  </>
                )}
              </Button>
            </motion.div>
          )}
          {recordingState === 'recording' && (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={handlePause}
                className={`h-14 w-14 rounded-2xl border-white/10 ${audioIsPaused ? 'bg-zinc-200 dark:bg-white/10 text-zinc-900 dark:text-zinc-100' : 'text-zinc-300'}`}
                title={audioIsPaused ? 'Resume recording' : 'Pause recording'}
              >
                {audioIsPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleSaveDraftClick}
                className="h-14 w-14 rounded-2xl border-white/10 text-zinc-300 hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-white/20"
                title="Save as draft"
              >
                <Save className="w-5 h-5" />
              </Button>
              <Button
                size="lg"
                onClick={handleFinish}
                disabled={isTranscribing || isGenerating}
                className="h-14 px-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-2xl disabled:opacity-50"
              >
                <Square className="w-4 h-4 mr-2" />
                Finish
              </Button>
            </>
          )}
          {(recordingState === 'processing' || recordingState === 'finished') && (
            <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-600 dark:text-zinc-400" />
              <span className="text-zinc-700 dark:text-zinc-300">
                {isTranscribing ? 'Transcribing...' : isGenerating ? 'Processing...' : 'Processing complete'}
              </span>
            </div>
          )}
        </motion.div>
        
  {/* Live Transcription - Only show when recording is active and enabled */}
  {/* Shows rawTranscript (verbatim speech, includes filler words) */}
  {/* User can edit the transcript - edits are preserved and new transcription appends */}
  {/* GAP-003: In offline mode, show indicator that transcription will be added later */}
  {showTranscription && recordingState === 'recording' && (
    <>
      {audioIsOfflineMode && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl mx-auto mb-4"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm text-amber-700 dark:text-amber-400">
              Recording offline — transcription will be added when you save
            </span>
          </div>
        </motion.div>
      )}
      {!audioIsOfflineMode && (
        <LiveTranscription 
          transcript={rawTranscript || ''}
          isEditable={true}
          isUserEdited={isTranscriptUserEdited}
          onEdit={(newText) => {
            setRawTranscript(newText);
            setIsTranscriptUserEdited(true);
          }}
        />
      )}
    </>
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
      
      {/* Save Draft Modal */}
      <AnimatePresence>
        {showSaveDraftModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => !isSavingDraft && setShowSaveDraftModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-xl p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Save as Draft
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSaveDraftModal(false)}
                  disabled={isSavingDraft}
                  className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                Save your progress to continue later. No credits will be used.
              </p>
              
              <div className="mb-6">
                <Label htmlFor="draft-name" className="text-sm text-zinc-700 dark:text-zinc-300 mb-2 block">
                  Draft name (optional)
                </Label>
                <Input
                  id="draft-name"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={generateDraftName(contextPrompt)}
                  className="bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-white/10"
                  disabled={isSavingDraft}
                />
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowSaveDraftModal(false)}
                  disabled={isSavingDraft}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSavingDraft ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Draft
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
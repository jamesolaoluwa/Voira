import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import FileUpload from '@/components/ui/FileUpload';
import RecordButton from '@/components/ui/RecordButton';
import SessionNamingModal from '@/components/ui/SessionNamingModal';
import CreditsDisplay from '@/components/ui/CreditsDisplay';
import { Mic, Pause, Square, Clock, Type, ArrowLeft, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/components/recording/AudioRecorder';
import { auth, sessions, credits as creditsAPI } from '@/components/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { saveLocalRecording } from '@/lib/localRecordings';
import useLiveTranscription from '@/hooks/useLiveTranscription';
import LiveTranscription from '@/components/transcription/LiveTranscription';

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
    startRecording: audioStartRecording,
    pauseRecording: audioPauseRecording,
    resumeRecording: audioResumeRecording,
    stopRecording: audioStopRecording,
    uploadAndTranscribe,
  } = useAudioRecorder();
  
  const { user: authUser, session, isLoading: authLoading } = useAuth();
  const [user, setUser] = useState(null);
  const [userCredits, setUserCredits] = useState(0);
  const [duration, setDuration] = useState(0);
  const [recordingState, setRecordingState] = useState('idle');
  // recordingState: 'idle' | 'recording' | 'processing' | 'finished' | 'error'
  const [showTranscription, setShowTranscription] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [contextPrompt, setContextPrompt] = useState('');
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
  
  const intervalRef = useRef(null);
  const queryClient = useQueryClient();
  
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
    if (audioIsRecording && !audioIsPaused) {
      intervalRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    
    return () => {
      clearInterval(intervalRef.current);
    };
  }, [audioIsRecording, audioIsPaused]);

  const { liveTranscript, isStreaming, reset: resetLive } = useLiveTranscription(audioIsRecording && !audioIsPaused, { cadence: 1200 });
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handleStart = async () => {
  // Start recording (credits will be decremented after a successful save)
    
    setDuration(0);
    setTranscript('');
    setFillerCount(0);
    setConfidenceLevel(0);
  // reset live transcript and chunks for fresh session
  resetLive();
  setRecordingState('recording');
  await audioStartRecording();
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
      // Stop and get final blob
      const finalBlob = await audioStopRecording();

      // Validate recording exists and duration
      if (!finalBlob || finalBlob.size === 0 || duration < 2) {
        // Show user-friendly error and bail out (non-blocking toast)
        setIsTranscribing(false);
        setIsGenerating(false);
        // Refund local decrement if we removed credits earlier
        setUserCredits(prev => prev + 0); // no-op if we didn't decrement
        setTranscript('');
        toast({ title: 'Recording too short', description: 'Please record at least 2 seconds.' });
        return;
      }

  // Transcribe/upload the audio
      const resp = await uploadAndTranscribe((partialTranscript) => {
        setTranscript(partialTranscript);
      }, finalBlob);
  // Use backend transcript if present; otherwise fall back to accumulated live transcript
  const transcribedText = resp?.transcript || (liveTranscript || '');
      const audioUrl = resp?.file_url ?? null;

      setTranscript(transcribedText);
      setIsTranscribing(false);
      setIsGenerating(true);
      
      // Calculate filler words
      const fillerWords = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally'];
      const detectedFillers = fillerWords.reduce((count, word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        return count + (transcribedText.match(regex) || []).length;
      }, 0);
      
      setFillerCount(detectedFillers);
      
      // Generate AI analysis and refined draft
      const analysisPrompt = `
        Analyze this transcript and provide:
        1. A confidence score (0-100) based on tone and word choice
        2. A clarity score (0-100) based on structure and coherence
        3. A refined version that removes fillers, improves clarity, and maintains the authentic voice
        
        Transcript: "${transcribedText}"
        Context: ${contextPrompt || 'Free expression'}
        Goal: ${sessionIntent || goalInput || 'Natural and clear'}
        Type: ${typeLabels[type]}
        
        Return JSON with: { confidenceScore, clarityScore, refinedDraft }
      `;
      
      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt: analysisPrompt,
        response_json_schema: {
          type: 'object',
          properties: {
            confidenceScore: { type: 'number' },
            clarityScore: { type: 'number' },
            refinedDraft: { type: 'string' }
          }
        }
      });
      
      setSessionData({
        transcript: transcribedText,
        audio_url: audioUrl,
        refinedDraft: analysis.refinedDraft,
        clarityScore: analysis.clarityScore,
        confidenceScore: analysis.confidenceScore,
        fillerCount: detectedFillers,
        question: contextPrompt,
        type,
      });
      
      setIsGenerating(false);
      setRecordingState('finished');
      setShowNamingModal(true);
    } catch (error) {
      console.error('Error processing recording:', error);
      setIsTranscribing(false);
      setIsGenerating(false);
      setRecordingState('error');

      // Fallback – use whatever partial transcript exists (or empty)
      setSessionData({
        transcript: transcript || liveTranscript || '',
        refinedDraft: transcript || liveTranscript || '',
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
        transcript: sessionData.transcript || liveTranscript || '',
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

      // Persist via central sessions API (will use base44.entities.Recording.create)
      const recording = await sessions.createSessionDraft(payload);

      // Optimistic cache update so Library shows saved session
      try {
        queryClient.setQueryData(['recordings'], (old = []) => {
          const recObj = {
            id: recording.id || `draft-${Date.now()}`,
            title: recording.title || sessionName,
            type: recording.type || type,
            transcript: recording.transcript || payload.transcript,
            duration_seconds: recording.duration_seconds || payload.duration_seconds || 0,
            created_date: recording.created_date || new Date().toISOString(),
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
            created_at: recording.created_date || new Date().toISOString(),
          }
        }
      });

      // update toast to saved
  try { savingToast.update({ title: 'Saved', description: 'Session saved to Library', duration: 4000 }); } catch (e) {}
      setIsSaving(false);
      setRecordingState('idle');
      resetLive();
      decrementCredits('recording_saved');
      if (creditsAPI && typeof creditsAPI.decrement === 'function') {
        creditsAPI.decrement(1).catch(err => console.warn('Remote decrement failed:', err));
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
      try { resetLive(); } catch (e) {}
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
      {(type === 'application' || type === 'interview') && !audioIsRecording && (
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
                onChange={(e) => setContextPrompt(e.target.value)}
                placeholder={type === 'application' 
                  ? 'e.g., Tell us about a time you demonstrated leadership...' 
                  : 'e.g., Why do you want to work here?'}
                className="bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-12"
                />
                <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-2">
                {type === 'application' 
                  ? 'Voira will help you respond naturally, clearly, and authentically.' 
                  : 'Voira will refine your answer while keeping your authentic voice.'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Advanced Goal Definition */}
      {!audioIsRecording && !sessionIntent && (
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
              onFileSelect={async (file) => {
                try {
                  const { file_url } = await base44.integrations.Core.UploadFile({ file });
                  setUploadedFileUrl(file_url);
                } catch (error) {
                  console.error('Error uploading file:', error);
                }
              }}
              accept=".pdf,.doc,.docx,.txt"
            />
          </div>
        </motion.div>
      )}

      {/* Main Recording Area */}
      <div className={`flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full transition-all duration-500 ${
        audioIsRecording ? 'brightness-75' : ''
      }`}>
        {!audioIsRecording && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-zinc-600 dark:text-zinc-400 text-lg mb-8"
          >
            Record Answer
          </motion.p>
        )}
        
        {/* Voice Visualizer */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: audioIsRecording ? 1.15 : 1 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <VoiceVisualizer 
            size={audioIsRecording ? 280 : 240} 
            isActive={audioIsRecording && !audioIsPaused} 
            amplitude={audioAmplitude}
          />
        </motion.div>
        
        {/* Live Indicators */}
        {audioIsRecording && (
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
          {showTimer && audioIsRecording && (
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
          {!audioIsRecording ? (
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
          ) : (
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
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Transcribing...
                  </>
                ) : isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Finish
                  </>
                )}
              </Button>
            </>
          )}
        </motion.div>
        
  {/* Live Transcription */}
  <LiveTranscription text={(isStreaming && liveTranscript) ? liveTranscript : transcript} isActive={audioIsRecording} />
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
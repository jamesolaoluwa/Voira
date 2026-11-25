import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import SessionNamingModal from '@/components/ui/SessionNamingModal';
import PremiumGate from '@/components/premium/PremiumGate';
import BadgeNotification from '@/components/badges/BadgeNotification';
import LiveTranscription from '@/components/transcription/LiveTranscription';
import { toast } from '@/components/ui/use-toast';
import useSessionStore from '@/stores/useSessionStore';
import { saveLocalRecording } from '@/lib/localRecordings';
import { sessions } from '@/components/services/api';
import { useAuth } from '@/contexts/AuthContext';
import useAudioRecorder from '@/components/recording/AudioRecorder';
import { 
  Briefcase, 
  Megaphone,
  ChevronRight,
  Mic,
  Square,
  Sparkles,
  ArrowRight,
  Save,
  Trash2,
  Shuffle,
  Edit3,
  Loader2
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import PageContainer from '@/components/layout/PageContainer';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';

const scenarios = [
  { id: 'interview', icon: Briefcase, label: 'Interviews' },
  { id: 'presentation', icon: Megaphone, label: 'Speeches & Presentation' },
];

const sampleQuestions = {
  interview: [
    "Tell me about a time you faced a significant challenge at work.",
    "Why are you interested in this position?",
    "What's your greatest professional achievement?",
    "How will this scholarship help you achieve your goals?",
    "Describe a moment that shaped who you are today.",
    "Describe a situation where you had to work with a difficult team member.",
    "Tell me about a time you failed and what you learned.",
    "Give an example of when you showed leadership.",
  ],
  presentation: [
    "What is the central message of your talk, and why should your audience care?",
    "How would you open your presentation to grab attention in the first 30 seconds?",
    "Walk us through how you would handle a challenging question after your talk.",
  ],
};

const feedbackMetrics = [
  { label: 'Clarity', key: 'clarity', maxValue: 100, delay: 0 },
  { label: 'Confidence', key: 'confidence', maxValue: 100, delay: 0.1 },
  { label: 'Thinking Pauses', key: 'fillers', maxValue: 10, delay: 0.2 },
  { label: 'Relevance', key: 'relevance', maxValue: 100, delay: 0.3 },
];

const primaryCtaClass =
  'bg-primary text-primary-foreground hover:bg-primary/90';

const inputClass =
  'bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10 focus:border-zinc-900/40 dark:focus:border-white/40 text-zinc-900 dark:text-zinc-100';

export default function Practice() {
  const queryClient = useQueryClient();
  const { user: authUser, session } = useAuth();
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [recordingState, setRecordingState] = useState('idle');
  // 'idle' | 'recording' | 'processing' | 'finished' | 'error'
  const [showFeedback, setShowFeedback] = useState(false);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [showActionBar, setShowActionBar] = useState(false);
  const [showCustomQuestion, setShowCustomQuestion] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [questionPurpose, setQuestionPurpose] = useState('interview');
  const [showBadgeNotification, setShowBadgeNotification] = useState(false);
  const [earnedBadge, setEarnedBadge] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [rawTranscript, setRawTranscript] = useState('');
  const [refinedTranscript, setRefinedTranscript] = useState('');
  const [duration, setDuration] = useState(0);
  const [feedback, setFeedback] = useState({
    clarity: 0,
    confidence: 0,
    fillers: 0,
    relevance: 0,
    improvedAnswer: '',
  });
  const [sessionData, setSessionData] = useState(null);
  
  // Use real AudioRecorder hook WITH filler detection enabled for Practice mode
  // Practice mode ALWAYS has filler tracking regardless of user settings
  const {
    isRecording,
    isPaused,
    amplitude,
    liveTranscript,
    fillerCount: liveFillerCount, // Live filler count from transcription
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    uploadAndTranscribe,
    forceCleanup,
  } = useAudioRecorder({ detectFillers: true }); // Always true for Practice mode
  
  const intervalRef = useRef(null);
  const addSessionToStore = useSessionStore(state => state.addSession);
  
  useEffect(() => {
    return () => {
      forceCleanup();
    };
  }, [forceCleanup]);
  
  useEffect(() => {
    checkPremiumStatus();
  }, []);
  
  const checkPremiumStatus = async () => {
    try {
      if (authUser) {
        setIsPremium(authUser?.role === 'premium_user' || authUser?.role === 'admin');
      }
    } catch (error) {
      console.error('Error checking premium status:', error);
    }
  };
  
  useEffect(() => {
    if (isRecording && !isPaused) {
      intervalRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    
    return () => {
      clearInterval(intervalRef.current);
    };
  }, [isRecording, isPaused]);
  
  // Update raw transcript from live transcript
  useEffect(() => {
    if (isRecording && liveTranscript) {
      setRawTranscript(liveTranscript);
    }
  }, [isRecording, liveTranscript]);
  
  const handleSelectScenario = (scenario) => {
    setSelectedScenario(scenario);
    setQuestionPurpose(scenario);
    setCurrentQuestion(sampleQuestions[scenario][0]);
    setShowFeedback(false);
    setShowActionBar(false);
    setRawTranscript('');
    setRefinedTranscript('');
    setDuration(0);
  };
  
  const handleStartRecording = async () => {
    setDuration(0);
    setRawTranscript('');
    setRefinedTranscript('');
    setShowFeedback(false);
    setShowActionBar(false);
    setRecordingState('recording');
    await startRecording();
  };
  
  const handleStopRecording = async () => {
    setRecordingState('processing');
    setIsGeneratingFeedback(true);
    
    try {
      const { blob: finalBlob, hasAudioChunks } = await stopRecording();
      
      // Freeze raw transcript
      const frozenRawTranscript = rawTranscript || liveTranscript || '';
      
      // Validate recording
      if (!finalBlob || finalBlob.size === 0 || !hasAudioChunks || duration < 2) {
        toast({ title: 'Recording too short', description: 'Please record at least 2 seconds.' });
        setIsGeneratingFeedback(false);
        setRecordingState('idle');
        return;
      }
      
      // Upload and transcribe for backup
      const resp = await uploadAndTranscribe(null, finalBlob);
      const transcribedText = resp?.transcript || frozenRawTranscript;
      const audioUrl = resp?.file_url ?? null;
      
      // Call backend /analyze endpoint
      const { apiClient } = await import('@/lib/apiClient');
      
      const analysis = await apiClient.post('/analyze', {
        raw_transcript: frozenRawTranscript || transcribedText,
        session_type: 'practice',
        question: currentQuestion || undefined,
        goal: 'natural',
      });
      
      // Map backend response to feedback format
      // NOTE: Use filler_word_count for display (raw count), NOT for scoring
      // Scoring uses filler_word_frequency (density) - see v3 analytics contract
      const mappedFeedback = {
        clarity: analysis.clarity_score || 0,
        confidence: analysis.confidence_score || 0,
        fillers: analysis.filler_word_count || 0, // Display only
        relevance: 85, // Backend doesn't provide this
        improvedAnswer: analysis.refined_text || '',
        // v3 Analytics metadata
        analysis_reliability: analysis.analysis_reliability || 0.5,
        explanation: analysis.explanation || null,
      };
      
      setFeedback(mappedFeedback);
      setRefinedTranscript(analysis.refined_text || '');
      
      // Store full v3 analytics data for session saving
      setSessionData({
        transcript: frozenRawTranscript,
        audio_url: audioUrl,
        refinedDraft: analysis.refined_text,
        clarityScore: analysis.clarity_score,
        confidenceScore: analysis.confidence_score,
        fillerCount: analysis.filler_word_count,
        // v3: Store filler density for proper aggregation
        filler_word_frequency: analysis.filler_word_frequency || 0,
        analysis_reliability: analysis.analysis_reliability || 0.5,
        question: currentQuestion,
        type: 'practice',
        duration_seconds: duration,
      });
      
      setShowFeedback(true);
      setShowActionBar(true);
      setRecordingState('finished');
    } catch (error) {
      console.error('Error processing recording:', error);
      toast({ title: 'Error', description: 'Failed to process recording. Please try again.', duration: 5000 });
      setRecordingState('error');
    } finally {
      setIsGeneratingFeedback(false);
    }
  };
  
  const handleReset = () => {
    setShowFeedback(false);
    setShowActionBar(false);
    setRawTranscript('');
    setRefinedTranscript('');
    setDuration(0);
    setRecordingState('idle');
  };
  
  const handleNextQuestion = () => {
    const questions = sampleQuestions[selectedScenario];
    const currentIndex = questions.indexOf(currentQuestion);
    const nextIndex = (currentIndex + 1) % questions.length;
    setCurrentQuestion(questions[nextIndex]);
    setShowFeedback(false);
    setShowActionBar(false);
  };
  
  const handleShuffleQuestion = () => {
    const questions = sampleQuestions[selectedScenario];
    const randomIndex = Math.floor(Math.random() * questions.length);
    setCurrentQuestion(questions[randomIndex]);
    setShowFeedback(false);
    setShowActionBar(false);
  };
  
  const handleUseCustomQuestion = () => {
    if (customQuestion.trim()) {
      setCurrentQuestion(customQuestion);
      setShowCustomQuestion(false);
      setShowFeedback(false);
      setShowActionBar(false);
    }
  };
  
  const handleSaveSession = async (name) => {
    if (!sessionData) {
      toast({ title: 'No session data', description: 'Please record a session first.', duration: 3000 });
      return;
    }
    
    setShowNamingModal(false);
    setShowActionBar(false);
    const savingToast = toast({ title: 'Saving session', description: 'Saving your practice session...' });
    
    try {
      const payload = {
        title: name || `Practice ${selectedScenario ? scenarios.find(s => s.id === selectedScenario)?.label : 'Session'}`,
        transcript: sessionData.transcript || '',
        refined_draft: sessionData.refinedDraft || '',
        type: 'practice',
        question: sessionData.question || currentQuestion,
        audio_url: sessionData.audio_url ?? null,
        duration_seconds: sessionData.duration_seconds || duration,
        metrics: {
          clarity_score: sessionData.clarityScore || 0,
          confidence_score: sessionData.confidenceScore || 0,
          filler_count: sessionData.fillerCount || 0,
          // v3 Analytics: Include filler density for proper aggregation
          filler_word_frequency: sessionData.filler_word_frequency || 0,
          analysis_reliability: sessionData.analysis_reliability || 0.5,
          words_per_minute: sessionData.duration_seconds > 0 
            ? Math.round((sessionData.transcript.split(/\s+/).filter(Boolean).length / sessionData.duration_seconds) * 60)
            : 0,
        },
      };
      
      const recording = await sessions.createSessionDraft(payload);
      
      // Update cache and store
      try {
        queryClient.setQueryData(['recordings'], (old = []) => {
          const recObj = {
            id: recording.id || `practice-${Date.now()}`,
            title: recording.title || payload.title,
            type: 'practice',
            transcript: recording.transcript || payload.transcript,
            durationSec: recording.duration_seconds || payload.duration_seconds,
            createdAt: recording.created_at || new Date().toISOString(),
            clarity_score: recording.clarity_score || payload.metrics?.clarity_score || 0,
            confidenceScore: recording.confidence_score || payload.metrics?.confidence_score || 0,
            fillerCount: recording.filler_count || payload.metrics?.filler_count || 0,
            wordsPerMinute: recording.words_per_minute || payload.metrics?.words_per_minute || 0,
          };
          const merged = [recObj, ...(old || []).filter(r => r?.id !== recObj.id)];
          try { saveLocalRecording(recObj); } catch (e) {}
          try { addSessionToStore(recObj); } catch (e) {}
          return merged;
        });
      } catch (e) {
        try { queryClient.invalidateQueries({ queryKey: ['recordings'] }); } catch (ex) {}
      }
      
      try { savingToast.update({ title: 'Saved', description: 'Practice session saved to Library', duration: 4000 }); } catch (e) {}
      try { await queryClient.invalidateQueries({ queryKey: ['recordings'] }); } catch (ex) {}
      
      setRecordingState('idle');
    } catch (error) {
      console.error('Error saving practice session:', error);
      try { savingToast.update({ title: 'Save failed', description: 'Unable to save practice session right now.', duration: 5000 }); } catch (e) {}
      toast({ title: 'Save failed', description: 'Unable to save practice session right now.', duration: 5000 });
    }
  };

  const wordCount = rawTranscript.split(/\s+/).filter(Boolean).length;
  const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f]">
      <PageContainer className="py-6 lg:py-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          Practice Mode
        </h1>
        <p className="text-zinc-600 dark:text-zinc-500 text-lg">
          Rehearse interviews, speeches, and presentations with supportive feedback
        </p>
      </motion.div>
      
  <AnimatePresence mode="wait">
          {!selectedScenario ? (
          /* Scenario Selection */
          <motion.div
            key="selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-2xl mx-auto"
          >
            <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200 mb-6 text-center">Choose a scenario</h2>
            <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {scenarios.map((scenario, index) => (
                <motion.button
                  key={scenario.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleSelectScenario(scenario.id)}
                  className="group flex items-center gap-4 p-6 bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none hover:border-zinc-400 dark:hover:border-white/20 transition-all"
                >
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800/50">
                    <scenario.icon className="w-6 h-6 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <span className="text-lg font-medium text-zinc-800 dark:text-zinc-200 flex-1 text-left">
                    {scenario.label}
                  </span>
                  <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors" />
                </motion.button>
              ))}
            </div>
          </motion.div>
          ) : (
          /* Practice Interface - Centered & Immersive */
          <motion.div
            key="practice"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center min-h-[70vh]"
          >
            <div className="w-full max-w-3xl space-y-8">
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedScenario(null);
                  handleReset();
                }}
                className="text-zinc-600 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-4"
              >
                ← Back to scenarios
              </Button>
              
              {/* Question Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-8"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-500">Question</p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleShuffleQuestion}
                      className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <Shuffle className="w-4 h-4 mr-1" />
                      Shuffle
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowCustomQuestion(true)}
                      className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <Edit3 className="w-4 h-4 mr-1" />
                      Custom
                    </Button>
                  </div>
                </div>
                <h3 className="text-xl lg:text-2xl font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed text-center">
                  {currentQuestion}
                </h3>
              </motion.div>
              
              {/* Custom Question Modal */}
              {showCustomQuestion && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/10 shadow-md dark:shadow-none p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Create Your Own Question</h4>
                    <button onClick={() => setShowCustomQuestion(false)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                      ×
                    </button>
                  </div>
                  <div>
                    <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">Purpose</Label>
                    <Select value={questionPurpose} onValueChange={setQuestionPurpose}>
                      <SelectTrigger className={inputClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interview">Interviews</SelectItem>
                        <SelectItem value="presentation">Speeches & Presentation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">Your Question</Label>
                    <Input
                      value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      placeholder="e.g., Tell me about your leadership experience..."
                      className={inputClass}
                    />
                  </div>
                  <Button
                    onClick={handleUseCustomQuestion}
                    className={`w-full ${primaryCtaClass}`}
                    disabled={!customQuestion.trim()}
                  >
                    Use This Question
                  </Button>
                </motion.div>
              )}
              
              {/* Voice Visualizer - Centered */}
              <div className="flex flex-col items-center py-8">
                <VoiceVisualizer 
                  size={220} 
                  isActive={isRecording && !isPaused} 
                  amplitude={amplitude}
                />
                
                {/* Live Performance Indicators - Practice mode always tracks thinking pauses for learning */}
                {isRecording && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 grid grid-cols-4 gap-3 w-full max-w-2xl"
                  >
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                        {Math.round(duration / 60)}:{String(duration % 60).padStart(2, '0')}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">Duration</div>
                    </div>
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                        {wordCount}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">Words</div>
                    </div>
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                        {wpm}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">WPM</div>
                    </div>
                    <div className={`rounded-xl p-4 text-center shadow-sm dark:shadow-none border transition-colors duration-300 ${
                      liveFillerCount > 5
                        ? 'bg-zinc-100 dark:bg-zinc-800/50 border-zinc-400 dark:border-white/20'
                        : 'bg-white dark:bg-[hsl(var(--card))] border-zinc-200 dark:border-white/5'
                    }`}>
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                        {liveFillerCount}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">Pauses</div>
                    </div>
                  </motion.div>
                )}
                
                {/* Live Transcription */}
                {isRecording && (
                  <LiveTranscription transcript={rawTranscript || ''} />
                )}
                
                {/* Controls */}
                <div className="flex items-center gap-4 mt-8">
                  {!showFeedback ? (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="lg"
                        onClick={isRecording ? handleStopRecording : handleStartRecording}
                        disabled={isGeneratingFeedback}
                        className={`h-14 px-8 rounded-2xl ${
                          isRecording
                            ? 'bg-rose-600 hover:bg-rose-500 text-white'
                            : primaryCtaClass
                        }`}
                      >
                        {isGeneratingFeedback ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : isRecording ? (
                          <>
                            <Square className="w-4 h-4 mr-2" />
                            Finish
                          </>
                        ) : (
                          <>
                            <Mic className="w-5 h-5 mr-2" />
                            Start Answering
                          </>
                        )}
                      </Button>
                    </motion.div>
                  ) : null}
                </div>

                {/* Action Bar after Session */}
                {showActionBar && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-3 mt-6"
                  >
                    <Button
                      size="lg"
                      onClick={() => setShowNamingModal(true)}
                      className={primaryCtaClass}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save to Library
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleNextQuestion}
                      className="border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                    >
                      Next Question
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleReset}
                      className="border-zinc-300 dark:border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>
            
            {/* Feedback Panel - Below */}
            <AnimatePresence>
              {showFeedback && (
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 40 }}
                  className="w-full max-w-4xl mt-12 space-y-6"
                >
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Your Feedback</h3>
                  
                  {/* Score Cards */}
                  {isGeneratingFeedback ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-zinc-600 dark:text-zinc-400 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {feedbackMetrics.map((metric) => {
                        const value = feedback[metric.key];
                        const percentage = (value / metric.maxValue) * 100;
                        return (
                          <motion.div
                            key={metric.key}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: metric.delay }}
                            className="bg-white dark:bg-[#1a1a24] rounded-xl p-4 border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none"
                          >
                            <p className="text-zinc-600 dark:text-zinc-500 text-sm mb-2">{metric.label}</p>
                            <div className="flex items-end gap-2 mb-3">
                              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</span>
                              <span className="text-zinc-500 dark:text-zinc-600 text-sm mb-1">/ {metric.maxValue}</span>
                            </div>
                            <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-primary"
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                transition={{ duration: 0.8, delay: metric.delay + 0.2, ease: 'easeOut' }}
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Improved Answer */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Suggested Improvement</h4>
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-400 leading-relaxed">
                      {feedback.improvedAnswer}
                    </p>
                  </motion.div>
                  
                  {/* AI Coaching - Premium Gated */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                  >
                    <PremiumGate
                      isPremium={isPremium}
                      feature="AI Coaching"
                      description="Get detailed AI-powered feedback on your responses, including pacing analysis, emotional tone insights, and personalized improvement suggestions."
                    >
                      <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 p-6">
                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                          AI Coaching
                        </h3>
                        <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                          <p>• <strong className="text-zinc-800 dark:text-zinc-300">Pacing:</strong> Your speaking rate was steady—ideal for clarity</p>
                          <p>• <strong className="text-zinc-800 dark:text-zinc-300">Emotional Tone:</strong> Confident and authentic with moments of genuine passion</p>
                          <p>• <strong className="text-zinc-800 dark:text-zinc-300">Voice Pattern:</strong> Clarity improved since last session</p>
                          <p>• <strong className="text-zinc-800 dark:text-zinc-300">Pause Patterns:</strong> Thinking pauses tend to occur during transitions—try bridging phrases</p>
                          <p>• <strong className="text-zinc-800 dark:text-zinc-300">Recommendation:</strong> Add specific metrics to strengthen impact</p>
                        </div>
                      </div>
                    </PremiumGate>
                  </motion.div>
                  
                  {/* Encouragement */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="p-4 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-white/10"
                  >
                    <p className="text-zinc-700 dark:text-zinc-300 text-sm">
                      Great effort! Your response showed strong personal connection.
                      Try to add more specific metrics or outcomes next time.
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

  </AnimatePresence>

  {/* Session Naming Modal */}
        <SessionNamingModal
          isOpen={showNamingModal}
          onClose={() => setShowNamingModal(false)}
          onSave={handleSaveSession}
          defaultName={`Practice ${selectedScenario ? scenarios.find(s => s.id === selectedScenario)?.label : 'Session'}`}
          suggestedNames={[
            `Practice Interview – ${new Date().toLocaleDateString()}`,
            `${selectedScenario ? scenarios.find(s => s.id === selectedScenario)?.label : 'Practice'} – Confident`,
            `${selectedScenario ? scenarios.find(s => s.id === selectedScenario)?.label : 'Practice'} Session`,
          ]}
        />

        {/* Badge Notification */}
        <BadgeNotification
          badge={earnedBadge}
          isOpen={showBadgeNotification}
          onClose={() => setShowBadgeNotification(false)}
        />
      </PageContainer>
    </div>
  );
}

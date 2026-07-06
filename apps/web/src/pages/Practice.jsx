import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import ScoreCard from '@/components/ui/ScoreCard';
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
  GraduationCap, 
  Users, 
  ChevronRight,
  Mic,
  Square,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Save,
  Trash2,
  Shuffle,
  Plus,
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
  { id: 'interview', icon: Briefcase, label: 'Job Interview', color: 'violet' },
  { id: 'scholarship', icon: GraduationCap, label: 'Scholarship', color: 'teal' },
  { id: 'behavioral', icon: Users, label: 'Behavioral', color: 'amber' },
];

const sampleQuestions = {
  interview: [
    "Tell me about a time you faced a significant challenge at work.",
    "Why are you interested in this position?",
    "What's your greatest professional achievement?",
  ],
  scholarship: [
    "How will this scholarship help you achieve your goals?",
    "Describe a moment that shaped who you are today.",
    "What impact do you want to make in your community?",
  ],
  behavioral: [
    "Describe a situation where you had to work with a difficult team member.",
    "Tell me about a time you failed and what you learned.",
    "Give an example of when you showed leadership.",
  ],
};

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
      // Stop and get final blob
      const finalBlob = await stopRecording();
      
      // Freeze raw transcript
      const frozenRawTranscript = rawTranscript || liveTranscript || '';
      
      // Validate recording
      if (!finalBlob || finalBlob.size === 0 || duration < 2) {
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
          Rehearse interviews with supportive, real-time feedback
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
            <div className="grid gap-4 max-w-3xl mx-auto">
              {scenarios.map((scenario, index) => (
                <motion.button
                  key={scenario.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleSelectScenario(scenario.id)}
                  className="group flex items-center gap-4 p-6 bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none hover:border-violet-400 dark:hover:border-violet-500/30 transition-all"
                >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                    scenario.color === 'violet' ? 'bg-violet-500/20' :
                    scenario.color === 'teal' ? 'bg-teal-500/20' : 'bg-amber-500/20'
                  }`}>
                    <scenario.icon className={`w-6 h-6 ${
                      scenario.color === 'violet' ? 'text-violet-600 dark:text-violet-400' :
                      scenario.color === 'teal' ? 'text-teal-600 dark:text-teal-400' : 'text-amber-600 dark:text-amber-400'
                    }`} />
                  </div>
                  <span className="text-lg font-medium text-zinc-800 dark:text-zinc-200 flex-1 text-left">
                    {scenario.label}
                  </span>
                  <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-600 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors" />
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
                className="text-zinc-500 hover:text-white mb-4"
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
                  <p className="text-sm text-violet-600 dark:text-violet-400">Question</p>
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
                  className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-violet-300 dark:border-violet-500/20 shadow-md dark:shadow-none p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">Create Your Own Question</h4>
                    <button onClick={() => setShowCustomQuestion(false)} className="text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                      ×
                    </button>
                  </div>
                  <div>
                    <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">Purpose</Label>
                    <Select value={questionPurpose} onValueChange={setQuestionPurpose}>
                      <SelectTrigger className="bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interview">Job Interview</SelectItem>
                        <SelectItem value="application">Application Essay</SelectItem>
                        <SelectItem value="scholarship">Scholarship</SelectItem>
                        <SelectItem value="behavioral">Behavioral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">Your Question</Label>
                    <Input
                      value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      placeholder="e.g., Tell me about your leadership experience..."
                      className="bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <Button
                    onClick={handleUseCustomQuestion}
                    className="w-full bg-gradient-to-r from-violet-600 to-violet-500"
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
                      <div className="text-2xl font-bold text-teal-600 dark:text-teal-400 mb-1">
                        {Math.round(duration / 60)}:{String(duration % 60).padStart(2, '0')}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">Duration</div>
                    </div>
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-violet-600 dark:text-violet-400 mb-1">
                        {rawTranscript.split(/\s+/).filter(Boolean).length}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">Words</div>
                    </div>
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                        {duration > 0 ? Math.round((rawTranscript.split(/\s+/).filter(Boolean).length / duration) * 60) : 0}
                      </div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">WPM</div>
                    </div>
                    {/* Live Thinking Pause Counter - Practice mode always tracks for learning */}
                    <div className={`rounded-xl p-4 text-center shadow-sm dark:shadow-none border transition-colors duration-300 ${
                      liveFillerCount > 5 
                        ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30' 
                        : 'bg-white dark:bg-[hsl(var(--card))] border-zinc-200 dark:border-white/5'
                    }`}>
                      <div className={`text-2xl font-bold mb-1 ${
                        liveFillerCount > 5 
                          ? 'text-amber-600 dark:text-amber-400' 
                          : 'text-amber-500 dark:text-amber-500'
                      }`}>
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
                            ? 'bg-rose-600 hover:bg-rose-500' 
                            : 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400'
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
                      className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save to Library
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleNextQuestion}
                      className="border-white/10"
                    >
                      Next Question
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleReset}
                      className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
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
                      <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <ScoreCard label="Clarity" value={feedback.clarity} color="violet" delay={0} />
                      <ScoreCard label="Confidence" value={feedback.confidence} color="teal" delay={0.1} />
                      <ScoreCard label="Thinking Pauses" value={feedback.fillers} maxValue={10} color="amber" delay={0.2} />
                      <ScoreCard label="Relevance" value={feedback.relevance} color="violet" delay={0.3} />
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
                      <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400" />
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
                      <div className="bg-gradient-to-br from-[#1a1a24] to-[#13131a] rounded-2xl border border-white/5 p-6">
                        <h3 className="text-lg font-semibold text-zinc-100 mb-4 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-violet-400" />
                          AI Coaching
                        </h3>
                        <div className="space-y-3 text-sm text-zinc-400">
                          <p>• <strong className="text-zinc-300">Pacing:</strong> Your speaking rate was steady—ideal for clarity</p>
                          <p>• <strong className="text-zinc-300">Emotional Tone:</strong> Confident and authentic with moments of genuine passion</p>
                          <p>• <strong className="text-zinc-300">Voice Pattern:</strong> Clarity improved since last session</p>
                          <p>• <strong className="text-zinc-300">Pause Patterns:</strong> Thinking pauses tend to occur during transitions—try bridging phrases</p>
                          <p>• <strong className="text-zinc-300">Recommendation:</strong> Add specific metrics to strengthen impact</p>
                        </div>
                      </div>
                    </PremiumGate>
                  </motion.div>
                  
                  {/* Encouragement */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="p-4 bg-violet-500/10 rounded-xl border border-violet-500/20"
                  >
                    <p className="text-violet-300 text-sm">
                      💪 Great effort! Your response showed strong personal connection. 
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

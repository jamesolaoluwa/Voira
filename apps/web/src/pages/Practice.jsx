import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import ScoreCard from '@/components/ui/ScoreCard';
import SessionNamingModal from '@/components/ui/SessionNamingModal';
import PremiumGate from '@/components/premium/PremiumGate';
import BadgeNotification from '@/components/badges/BadgeNotification';
import useLiveTranscription from '@/hooks/useLiveTranscription';
import LiveTranscription from '@/components/transcription/LiveTranscription';
import { toast } from '@/components/ui/use-toast';
import useSessionStore from '@/stores/useSessionStore';
import { base44 } from '@/api/base44Client';
import { saveLocalRecording } from '@/lib/localRecordings';
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

const mockFeedback = {
  clarity: 82,
  confidence: 75,
  fillers: 3,
  relevance: 88,
  improvedAnswer: "During my second year leading the community garden project, we faced a critical challenge when our main funding source fell through just weeks before the planting season. Rather than scaling back, I organized an emergency fundraising campaign and reached out to local businesses. Within two weeks, we not only matched our original funding but exceeded it by 20%, allowing us to expand our reach to three additional neighborhoods."
};

export default function Practice() {
  const queryClient = useQueryClient();
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingState, setRecordingState] = useState('idle');
  // 'idle' | 'recording' | 'processing' | 'finished' | 'error'
  const [showFeedback, setShowFeedback] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [showActionBar, setShowActionBar] = useState(false);
  const [showCustomQuestion, setShowCustomQuestion] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [questionPurpose, setQuestionPurpose] = useState('interview');
  const [showBadgeNotification, setShowBadgeNotification] = useState(false);
  const [earnedBadge, setEarnedBadge] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [feedback, setFeedback] = useState(mockFeedback);
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    checkPremiumStatus();
  }, []);
  
  const checkPremiumStatus = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsPremium(currentUser?.role === 'premium_user' || currentUser?.role === 'admin');
    } catch (error) {
      console.error('Error checking premium status:', error);
    }
  };
  
  const handleSelectScenario = (scenario) => {
    setSelectedScenario(scenario);
    setCurrentQuestion(sampleQuestions[scenario][0]);
    setShowFeedback(false);
  };
  
  const amplitudeIntervalRef = useRef(null);

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingState('recording');
    // Simulate amplitude
    amplitudeIntervalRef.current = setInterval(() => {
      setAmplitude(Math.random() * 0.8 + 0.2);
    }, 100);
    
    // Auto-stop after 5 seconds for demo and generate feedback
    setTimeout(async () => {
      setIsRecording(false);
      if (amplitudeIntervalRef.current) {
        clearInterval(amplitudeIntervalRef.current);
        amplitudeIntervalRef.current = null;
      }
      setAmplitude(0);
      setIsGeneratingFeedback(true);
      
      try {
        // Generate AI feedback
        const feedbackPrompt = `
          Analyze this practice interview response and provide feedback:
          
          Question: ${currentQuestion}
          
          Provide a JSON response with:
          - clarity (score 0-100)
          - confidence (score 0-100)
          - fillers (count of filler words, max 10)
          - relevance (score 0-100)
          - improvedAnswer (a refined version of the response)
        `;
        
        const aiResponse = await base44.integrations.Core.InvokeLLM({
          prompt: feedbackPrompt,
          response_json_schema: {
            type: 'object',
            properties: {
              clarity: { type: 'number' },
              confidence: { type: 'number' },
              fillers: { type: 'number' },
              relevance: { type: 'number' },
              improvedAnswer: { type: 'string' }
            }
          }
        });
        
  setFeedback(aiResponse);
        
        // Check for badge earning
        const sessions = await base44.entities.Recording.filter({ type: 'practice' });
  if (sessions.length === 0) {
          const newBadge = {
            badge_type: 'first_session',
            title: 'First Steps',
            description: 'Completed your first practice session',
            icon_color: 'violet'
          };
          await base44.entities.Badge.create(newBadge);
          setEarnedBadge(newBadge);
          setTimeout(() => setShowBadgeNotification(true), 500);
        }
      } catch (error) {
        console.error('Error generating feedback:', error);
        setFeedback(mockFeedback);
      } finally {
        setIsGeneratingFeedback(false);
  setShowFeedback(true);
  setShowActionBar(true);
  setRecordingState('finished');
      }
    }, 5000);
  };
  const { liveTranscript, isStreaming, reset: resetLive } = useLiveTranscription(isRecording, { cadence: 1100 });
  
  const handleReset = () => {
    setShowFeedback(false);
  setIsRecording(false);
  setRecordingState('idle');
  try { resetLive(); } catch (e) {}
  };

  // cleanup on unmount within component
  useEffect(() => {
    return () => {
      try { resetLive(); } catch (e) {}
      if (amplitudeIntervalRef.current) {
        clearInterval(amplitudeIntervalRef.current);
        amplitudeIntervalRef.current = null;
      }
    };
  }, []);
  
  const handleNextQuestion = () => {
    const questions = sampleQuestions[selectedScenario];
    const currentIndex = questions.indexOf(currentQuestion);
    const nextIndex = (currentIndex + 1) % questions.length;
    setCurrentQuestion(questions[nextIndex]);
    setShowFeedback(false);
  };
  
  const handleShuffleQuestion = () => {
    const questions = sampleQuestions[selectedScenario];
    const randomIndex = Math.floor(Math.random() * questions.length);
    setCurrentQuestion(questions[randomIndex]);
    setShowFeedback(false);
  };
  
  const handleUseCustomQuestion = () => {
    if (customQuestion.trim()) {
      setCurrentQuestion(customQuestion);
      setShowCustomQuestion(false);
      setShowFeedback(false);
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
                onClick={() => setSelectedScenario(null)}
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
                  isActive={isRecording} 
                  amplitude={amplitude}
                />
                
                {/* Live Performance Indicators */}
                {isRecording && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 grid grid-cols-3 gap-4 w-full max-w-xl"
                  >
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-teal-600 dark:text-teal-400 mb-1">78%</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">Confidence</div>
                    </div>
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-1">2</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">Fillers</div>
                    </div>
                    <div className="bg-white dark:bg-[hsl(var(--card))] rounded-xl p-4 text-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-white/5">
                      <div className="text-2xl font-bold text-violet-600 dark:text-violet-400 mb-1">145</div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-500">WPM</div>
                    </div>
                  </motion.div>
                )}
                
                {/* Live Transcription (simulated) */}
                <LiveTranscription text={isRecording ? liveTranscript : ''} isActive={isRecording} />
                
                {/* Encouragement */}
                {isRecording && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2 }}
                    className="text-zinc-600 dark:text-zinc-500 text-sm mt-6 text-center"
                  >
                    You're doing great — keep going
                  </motion.p>
                )}
                
                {/* Controls */}
                <div className="flex items-center gap-4 mt-8">
                  {!showFeedback ? (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        size="lg"
                        onClick={isRecording ? () => { setIsRecording(false); setShowFeedback(true); setShowActionBar(true); setAmplitude(0); } : handleStartRecording}
                        className={`h-14 px-8 rounded-2xl ${
                          isRecording 
                            ? 'bg-rose-600 hover:bg-rose-500' 
                            : 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400'
                        }`}
                      >
                        {isRecording ? (
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
                      <ScoreCard label="Filler Words" value={feedback.fillers} maxValue={10} color="amber" delay={0.2} />
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
                          <p>• <strong className="text-zinc-300">Pacing:</strong> Your speaking rate was steady at 145 WPM—ideal for clarity</p>
                          <p>• <strong className="text-zinc-300">Emotional Tone:</strong> Confident and authentic with moments of genuine passion</p>
                          <p>• <strong className="text-zinc-300">Voice Pattern:</strong> Clarity improved by 12% since last session</p>
                          <p>• <strong className="text-zinc-300">Filler Analysis:</strong> "Um" appears mainly during transitions—practice bridging phrases</p>
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
          onSave={async (name) => {
            if (showNamingModal === false) return;
            // close modal immediately to avoid lingering dialog
            setShowNamingModal(false);
            setShowActionBar(false);
            const savingToast = toast({ title: 'Saving session', description: 'Saving your practice session...' });
            try {
              const rec = await base44.entities.Recording.create({
                title: name,
                type: 'practice',
                question: currentQuestion,
                clarity_score: feedback.clarity,
                confidence_score: feedback.confidence,
                filler_count: feedback.fillers,
                refined_draft: feedback.improvedAnswer,
                transcript: liveTranscript || '',
                created_date: new Date().toISOString(),
              });

              // optimistic cache update so Library shows saved item immediately
              try {
                queryClient.setQueryData(['recordings'], (old = []) => {
                  const recObj = {
                    id: rec.id || `draft-${Date.now()}`,
                    title: name || rec.title,
                    type: rec.type || 'practice',
                    transcript: rec.transcript || liveTranscript || '',
                    durationSec: rec.duration_seconds || 0,
                    createdAt: rec.created_date || new Date().toISOString(),
                    clarity_score: rec.clarity_score,
                    confidenceScore: rec.confidence_score,
                    fillerCount: rec.filler_count,
                    wordsPerMinute: rec.words_per_minute,
                  };
                  const merged = [recObj, ...old.filter(r => r?.id !== recObj.id)];
                  try { saveLocalRecording(recObj); } catch (e) {}
                  try { useSessionStore.getState().addSession(recObj); } catch (e) {}
                    return merged;
                });
              } catch (e) {
                try { queryClient.invalidateQueries({ queryKey: ['recordings'] }); } catch (ex) {}
              }
              try { savingToast.update({ title: 'Saved', description: 'Practice session saved to Library', duration: 4000 }); } catch (e) {}
              try { await queryClient.invalidateQueries({ queryKey: ['recordings'] }); } catch (ex) {}
            } catch (error) {
              console.error('Error saving practice session:', error);
              try { savingToast.update({ title: 'Save failed', description: 'Unable to save practice session right now.', duration: 5000 }); } catch (e) {}
              toast({ title: 'Save failed', description: 'Unable to save practice session right now.', duration: 5000 });
            }

            setRecordingState('idle');
            try { resetLive(); } catch (e) {}
          }}
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
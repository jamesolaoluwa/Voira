import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Save, Plus, X, Sparkles, Crown, Loader2 } from 'lucide-react';
import useSessionStore from '@/stores/useSessionStore';
import PremiumGate from '@/components/premium/PremiumGate';
import PageContainer from '@/components/layout/PageContainer';

const toneOptions = [
  { value: 'warm', label: 'Warm', description: 'Friendly and approachable' },
  { value: 'professional', label: 'Professional', description: 'Polished and formal' },
  { value: 'bold', label: 'Bold', description: 'Confident and direct' },
  { value: 'reflective', label: 'Reflective', description: 'Thoughtful and introspective' },
];

const sentenceLengthOptions = [
  { value: 'short', label: 'Short', description: 'Concise and punchy' },
  { value: 'medium', label: 'Medium', description: 'Balanced and clear' },
  { value: 'long', label: 'Long', description: 'Detailed and flowing' },
];

export default function VoiceProfile() {
  const sessions = useSessionStore(state => state.sessions || []);
  const stats = React.useMemo(() => {
    const total = sessions.length;
    if (total === 0) return { avgConfidence: 0, avgWPM: 0, avgFillers: 0 };
    const avgConfidence = Math.round(sessions.reduce((s, x) => s + (x.confidenceScore || 0), 0) / total);
    const avgFillers = Math.round(sessions.reduce((s, x) => s + (x.fillerCount || 0), 0) / total);
    const avgWPM = Math.round(sessions.reduce((s, x) => s + (x.wordsPerMinute || 0), 0) / total);
    return { avgConfidence, avgWPM, avgFillers };
  }, [sessions]);
  const [selectedTone, setSelectedTone] = useState('professional');
  const [confidence, setConfidence] = useState([65]);
  const [emotionalDepth, setEmotionalDepth] = useState([50]);
  const [sentenceLength, setSentenceLength] = useState('medium');
  const [preferredWords, setPreferredWords] = useState(['impactful', 'innovative', 'collaborative']);
  const [avoidedWords, setAvoidedWords] = useState(['basically', 'honestly', 'just']);
  const [newPreferred, setNewPreferred] = useState('');
  const [newAvoided, setNewAvoided] = useState('');
  const [exampleResponses, setExampleResponses] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  
  useEffect(() => {
    loadVoiceProfile();
  }, []);
  
  const loadVoiceProfile = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsPremium(currentUser?.role === 'premium_user' || currentUser?.role === 'admin');
      
      const profiles = await base44.entities.VoiceProfile.list();
      if (profiles && profiles.length > 0) {
        const profile = profiles[0];
        setVoiceProfile(profile);
        setSelectedTone(profile.tone || 'professional');
        setConfidence([profile.confidence_level || 65]);
        setEmotionalDepth([profile.emotional_depth || 50]);
        setSentenceLength(profile.sentence_length || 'medium');
        setPreferredWords(profile.preferred_words || ['impactful', 'innovative', 'collaborative']);
        setAvoidedWords(profile.avoided_words || ['basically', 'honestly', 'just']);
        setExampleResponses(profile.example_responses || '');
      }
    } catch (error) {
      console.error('Error loading voice profile:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const addWord = (type) => {
    if (type === 'preferred' && newPreferred.trim()) {
      setPreferredWords([...preferredWords, newPreferred.trim()]);
      setNewPreferred('');
    } else if (type === 'avoided' && newAvoided.trim()) {
      setAvoidedWords([...avoidedWords, newAvoided.trim()]);
      setNewAvoided('');
    }
  };
  
  const removeWord = (type, word) => {
    if (type === 'preferred') {
      setPreferredWords(preferredWords.filter(w => w !== word));
    } else {
      setAvoidedWords(avoidedWords.filter(w => w !== word));
    }
  };
  
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const profileData = {
        tone: selectedTone,
        confidence_level: confidence[0],
        emotional_depth: emotionalDepth[0],
        sentence_length: sentenceLength,
        preferred_words: preferredWords,
        avoided_words: avoidedWords,
        example_responses: exampleResponses,
      };
      
      if (voiceProfile) {
        await base44.entities.VoiceProfile.update(voiceProfile.id, profileData);
      } else {
        const created = await base44.entities.VoiceProfile.create(profileData);
        setVoiceProfile(created);
      }
    } catch (error) {
      console.error('Error saving voice profile:', error);
    } finally {
      setIsSaving(false);
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
          Voice Profile
        </h1>
        <p className="text-zinc-600 dark:text-zinc-500 text-lg max-w-2xl">
          Teach Voira how you naturally express yourself so every response still sounds like you.
        </p>
  {/* Small stats summary from unified session store */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto items-center">
          <div className="bg-white dark:bg-[#111118] rounded-lg p-3 shadow-sm text-center">
            <div className="text-xs text-zinc-500">Avg. Confidence</div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats?.avgConfidence ?? '-'}%</div>
          </div>
          <div className="bg-white dark:bg-[#111118] rounded-lg p-3 shadow-sm text-center">
            <div className="text-xs text-zinc-500">Avg. WPM</div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats?.avgWPM ?? '-'} WPM</div>
          </div>
          <div className="bg-white dark:bg-[#111118] rounded-lg p-3 shadow-sm text-center">
            <div className="text-xs text-zinc-500">Fillers / Session</div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats?.avgFillers ?? '-'}</div>
          </div>
        </div>
      </motion.div>
      
  <div className="max-w-4xl mx-auto space-y-8">
        {/* Tone Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Tone</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-4">
            This controls the overall feeling and approach Voira uses when refining your responses.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {toneOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedTone(option.value)}
                className={`p-4 rounded-xl text-left transition-all ${
                  selectedTone === option.value
                    ? 'bg-violet-500/20 border border-violet-500/30'
                    : 'bg-zinc-50 dark:bg-[#13131a] border border-transparent hover:border-zinc-300 dark:hover:border-white/10'
                }`}
              >
                <p className={`font-medium ${selectedTone === option.value ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                  {option.label}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </motion.div>
        
        {/* Sliders */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Confidence Level</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-3">
              Adjusts how assertively Voira presents your ideas—from measured to bold.
            </p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 dark:text-zinc-600">Humble</span>
              <span className="text-violet-600 dark:text-violet-400 font-medium">{confidence[0]}%</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-600">Assertive</span>
            </div>
            <Slider
              value={confidence}
              onValueChange={setConfidence}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-violet-500 [&_[role=slider]]:border-violet-400"
            />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Emotional Depth</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-3">
              Controls how much personal feeling and reflection Voira includes in your responses.
            </p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-zinc-500 dark:text-zinc-600">Factual</span>
              <span className="text-teal-600 dark:text-teal-400 font-medium">{emotionalDepth[0]}%</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-600">Expressive</span>
            </div>
            <Slider
              value={emotionalDepth}
              onValueChange={setEmotionalDepth}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-teal-500 [&_[role=slider]]:border-teal-400"
            />
          </motion.div>
        </div>
        
        {/* Sentence Length */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Sentence Length</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-4">
            Determines the rhythm and pacing of your refined responses.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {sentenceLengthOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSentenceLength(option.value)}
                className={`p-4 rounded-xl text-center transition-all ${
                  sentenceLength === option.value
                    ? 'bg-teal-500/20 border border-teal-500/30'
                    : 'bg-zinc-50 dark:bg-[#13131a] border border-transparent hover:border-zinc-300 dark:hover:border-white/10'
                }`}
              >
                <p className={`font-medium ${sentenceLength === option.value ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                  {option.label}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </motion.div>
        
        {/* Words */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Words I Like Using</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {preferredWords.map((word) => (
                <Badge 
                  key={word} 
                  className="bg-violet-500/20 text-violet-300 px-3 py-1 flex items-center gap-1"
                >
                  {word}
                  <button onClick={() => removeWord('preferred', word)} className="ml-1 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newPreferred}
                onChange={(e) => setNewPreferred(e.target.value)}
                placeholder="Add a word..."
                className="bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10"
                onKeyDown={(e) => e.key === 'Enter' && addWord('preferred')}
              />
              <Button 
                size="icon" 
                variant="outline" 
                onClick={() => addWord('preferred')}
                className="border-white/10"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Words to Avoid</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {avoidedWords.map((word) => (
                <Badge 
                  key={word} 
                  className="bg-rose-500/20 text-rose-300 px-3 py-1 flex items-center gap-1"
                >
                  {word}
                  <button onClick={() => removeWord('avoided', word)} className="ml-1 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newAvoided}
                onChange={(e) => setNewAvoided(e.target.value)}
                placeholder="Add a word..."
                className="bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10"
                onKeyDown={(e) => e.key === 'Enter' && addWord('avoided')}
              />
              <Button 
                size="icon" 
                variant="outline" 
                onClick={() => addWord('avoided')}
                className="border-white/10"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        </div>
        
        {/* Example Responses - Premium Learning */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Example Past Responses</h2>
              {!isPremium && <Crown className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
            </div>
            <p className="text-zinc-600 dark:text-zinc-500 text-sm mb-4">
              {isPremium 
                ? 'Paste examples of your writing to help Voira learn your unique style over time'
                : 'Basic profiles available. Upgrade to Premium for adaptive learning that improves with every session.'}
            </p>
            <PremiumGate
              isPremium={isPremium}
              feature="Adaptive Voice Learning"
              description="Premium Voice Profile learns from your responses over time, continuously refining to match your evolving style and voice patterns."
              compact
            >
              <Textarea
                value={exampleResponses}
                onChange={(e) => setExampleResponses(e.target.value)}
                placeholder="Paste an essay, email, or any text that represents your voice..."
                className="bg-zinc-50 dark:bg-[#13131a] border-zinc-300 dark:border-white/10 min-h-32 resize-none"
              />
            </PremiumGate>
          </div>
        </motion.div>
        
  {/* Save Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex justify-end"
        >
          <Button 
            onClick={handleSaveProfile}
            disabled={isSaving || isLoading}
            className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 px-8 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Profile
              </>
            )}
          </Button>
        </motion.div>
      </div>
      </PageContainer>
    </div>
  );
}
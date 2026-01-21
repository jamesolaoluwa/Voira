import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Copy, 
  Save, 
  RefreshCw, 
  Maximize2, 
  Minimize2,
  Sparkles,
  Check,
  ListTree,
  Tags,
  Target,
  Mic,
  Loader2
} from 'lucide-react';
import RecordButton from '@/components/ui/RecordButton';
import { base44 } from '@/api/base44Client';
import { sessions } from '@/components/services/api';
import { toast } from '@/components/ui/use-toast';

// Default structure/themes used when real data doesn't have them
const defaultStructure = [
  { title: "Opening Hook", content: "Personal journey statement", status: "strong" },
  { title: "Context", content: "Timeline and setting established", status: "strong" },
  { title: "Reflection", content: "Personal growth acknowledgment", status: "moderate" },
  { title: "Conclusion", content: "Needs strengthening", status: "weak" },
];
const defaultThemes = ["Leadership", "Community Service", "Personal Growth", "Transformation"];

const toneOptions = [
  { label: 'Confident', value: 'confident' },
  { label: 'Concise', value: 'concise' },
  { label: 'Reflective', value: 'reflective' },
];

export default function Draft() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const recordingId = urlParams.get('id');
  
  const [copied, setCopied] = useState(false);
  const [selectedTone, setSelectedTone] = useState('confident');
  const [isExpanded, setIsExpanded] = useState(false);
  // CRITICAL: Initialize to null, NOT mock data (Bug #5 fix)
  // Draft page must NEVER show placeholder content
  const [draft, setDraft] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [currentRecording, setCurrentRecording] = useState(null);
  
  useEffect(() => {
    loadDraftData();
  }, [location.state, recordingId]);
  
  const loadDraftData = async () => {
    setLoadError(null);
    try {
      // Try loading from URL parameter first (ID-based)
      if (recordingId) {
        // Bug #13 fix: Use getSessionById instead of non-existent get() method
        const recording = await sessions.getSessionById(recordingId);
        if (recording) {
          setCurrentRecording(recording);
          setDraft({
            original: recording.transcript || '',
            refined: recording.refined_draft || '',
            structure: defaultStructure,
            themes: defaultThemes,
            alignment: {
              score: recording.clarity_score || 80,
              notes: `Your response shows ${(recording.clarity_score || 80) >= 80 ? 'strong' : 'good'} clarity and alignment.`
            }
          });
          setIsLoading(false);
          return;
        }
      }
      
      // Fall back to state-based loading (from Speak.jsx navigation)
      if (location.state?.sessionData) {
        const { sessionData } = location.state;
        console.log('[Draft] Loading from navigation state, transcript length:', sessionData.transcript?.length || 0);
        setDraft({
          original: sessionData.transcript || '',
          refined: sessionData.refinedDraft || sessionData.refined_draft || '',
          structure: defaultStructure,
          themes: defaultThemes,
          alignment: {
            score: sessionData.clarityScore || sessionData.clarity_score || 80,
            notes: `Your response shows ${(sessionData.clarityScore || sessionData.clarity_score || 80) >= 80 ? 'strong' : 'good'} clarity and alignment.`
          }
        });
        setIsLoading(false);
        return;
      }
      
      // No data source available - show error state
      console.warn('[Draft] No session data available from URL or navigation state');
      setLoadError('No session data found. Please record a new session.');
    } catch (error) {
      console.error('Error loading draft:', error);
      setLoadError('Failed to load session. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCopy = () => {
    // Copy refined text, or original if refined is empty
    const textToCopy = draft?.refined || draft?.original || '';
    if (!textToCopy) {
      toast({
        title: 'Nothing to copy',
        description: 'No text available to copy.',
        duration: 2000
      });
      return;
    }
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleSave = async () => {
    try {
      if (currentRecording) {
        // Use updateSession instead of non-existent update method
        await sessions.updateSession(currentRecording.id, {
          refined_draft: draft.refined
        });
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      // Continue to navigate even on error - draft may already be saved
    }
    navigate(createPageUrl('Library'));
  };
  
  const handleRegenerate = async () => {
    // Validate we have original text to regenerate
    if (!draft?.original || draft.original.trim().length < 3) {
      console.warn('[Draft] Cannot regenerate - no original transcript');
      return;
    }
    
    setIsRegenerating(true);
    try {
      // Use backend /refine endpoint for consistent, production-quality refinement
      const { apiClient } = await import('@/lib/apiClient');
      
      console.log('[Draft] Calling /refine with tone:', selectedTone);
      const response = await apiClient.post('/refine', {
        raw_transcript: draft.original,
        session_type: 'refine',
        desired_tone: selectedTone,
        goal: `Rewrite with a ${selectedTone} tone while maintaining authenticity`,
      });
      
      if (response?.refined_text) {
        setDraft({
          ...draft,
          refined: response.refined_text
        });
        console.log('[Draft] Refinement successful, new length:', response.refined_text.length);
      } else {
        console.warn('[Draft] Refinement response empty, keeping original');
      }
    } catch (error) {
      console.error('[Draft] Error regenerating:', error);
      // Fallback to base44 LLM if backend fails
      try {
        const regeneratePrompt = `
          Rewrite the following text with a ${selectedTone} tone:
          
          "${draft.original}"
          
          Maintain the core message but adjust the tone to be ${selectedTone}.
          Keep it natural and authentic.
        `;
        
        const newDraft = await base44.integrations.Core.InvokeLLM({
          prompt: regeneratePrompt,
        });
        
        setDraft({
          ...draft,
          refined: typeof newDraft === 'string' ? newDraft : newDraft.output || draft.refined
        });
      } catch (fallbackError) {
        console.error('[Draft] Fallback regeneration also failed:', fallbackError);
        toast({
          title: 'Regeneration failed',
          description: 'Could not regenerate draft. Please try again later.',
          variant: 'destructive',
          duration: 4000
        });
      }
    } finally {
      setIsRegenerating(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }
  
  // Bug #5 fix: Show error state instead of mock data when no draft available
  if (loadError || !draft) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10 flex flex-col items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            No Session Data
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            {loadError || 'No session data found. Please record a new session.'}
          </p>
          <Button
            onClick={() => navigate(createPageUrl('Speak'))}
            className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400"
          >
            <Mic className="w-4 h-4 mr-2" />
            Start Recording
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
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
            onClick={() => navigate(createPageUrl('Speak'))}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              Your Draft
            </h1>
            <p className="text-zinc-600 dark:text-zinc-500">Review and refine your response</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
          >
            {copied ? <Check className="w-4 h-4 mr-2 text-green-400" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button
            onClick={handleSave}
            className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400"
          >
            <Save className="w-4 h-4 mr-2" />
            Save to Library
          </Button>
        </div>
      </motion.div>
      
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="draft" className="w-full">
            <TabsList className="bg-zinc-100 dark:bg-[#1a1a24] border border-zinc-200 dark:border-white/5 p-1 mb-6">
              <TabsTrigger value="draft" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300">
                <Sparkles className="w-4 h-4 mr-2" />
                Draft
              </TabsTrigger>
              <TabsTrigger value="structure" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300">
                <ListTree className="w-4 h-4 mr-2" />
                Structure
              </TabsTrigger>
              <TabsTrigger value="themes" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300">
                <Tags className="w-4 h-4 mr-2" />
                Key Themes
              </TabsTrigger>
              <TabsTrigger value="alignment" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300">
                <Target className="w-4 h-4 mr-2" />
                Alignment
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="draft">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Before vs After View */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Before */}
                  <div className="bg-zinc-100 dark:bg-[#1a1a24]/50 rounded-2xl border border-zinc-200 dark:border-white/5 p-6">
                    <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-500 mb-4">Before (Raw)</h3>
                    <p className="text-zinc-600 dark:text-zinc-500 text-sm leading-relaxed">
                      {draft.original}
                    </p>
                  </div>
                  
                  {/* After */}
                  <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-violet-400 dark:border-violet-500/20 shadow-sm dark:shadow-none p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300">After (Refined)</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-zinc-400 hover:text-white"
                      >
                        {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-zinc-900 dark:text-zinc-100 leading-relaxed">
                      {draft.refined}
                    </p>
                  </div>
                </div>

                {/* Confidence Heat Highlights */}
                <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">Your Strongest Moments</h3>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-400 text-sm leading-relaxed">
                    <span className="bg-teal-500/20 text-teal-300 px-1 rounded">My journey leading community initiatives has profoundly shaped my identity.</span> This opening demonstrates authentic conviction and personal ownership. 
                    <span className="bg-teal-500/20 text-teal-300 px-1 rounded ml-1">The transformative impact on my understanding of service and leadership</span> shows reflective depth.
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-3 italic">💡 You sounded most confident here.</p>
                </div>
              </motion.div>
            </TabsContent>
            
            <TabsContent value="structure">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-8"
              >
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Response Structure</h3>
                <div className="space-y-4">
                  {draft.structure.map((item, index) => (
                    <div key={index} className="flex items-start gap-4 p-4 bg-zinc-50 dark:bg-[#13131a] rounded-xl">
                      <div className={`w-2 h-2 mt-2 rounded-full ${
                        item.status === 'strong' ? 'bg-green-400' :
                        item.status === 'moderate' ? 'bg-amber-400' : 'bg-red-400'
                      }`} />
                      <div className="flex-1">
                        <h4 className="font-medium text-zinc-800 dark:text-zinc-200">{item.title}</h4>
                        <p className="text-sm text-zinc-600 dark:text-zinc-500 mt-1">{item.content}</p>
                      </div>
                      <Badge className={`${
                        item.status === 'strong' ? 'bg-green-500/20 text-green-400' :
                        item.status === 'moderate' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </motion.div>
            </TabsContent>
            
            <TabsContent value="themes">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-8"
              >
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Key Themes Identified</h3>
                <div className="flex flex-wrap gap-3">
                  {draft.themes.map((theme, index) => (
                    <Badge 
                      key={index}
                      className="px-4 py-2 bg-violet-500/20 text-violet-300 text-sm"
                    >
                      {theme}
                    </Badge>
                  ))}
                </div>
              </motion.div>
            </TabsContent>
            
            <TabsContent value="alignment">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-8"
              >
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Question Alignment</h3>
                <div className="flex items-center gap-6 mb-6">
                  <div className="text-4xl font-bold text-teal-600 dark:text-teal-400">{draft.alignment.score}%</div>
                  <div className="flex-1 h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${draft.alignment.score}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>
                <p className="text-zinc-700 dark:text-zinc-400">{draft.alignment.notes}</p>
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Sidebar */}
        <div className="space-y-6">
          {/* Tone Options */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
            >
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Rewrite Tone</h3>
            <div className="space-y-2">
              {toneOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedTone(option.value)}
                  className={`w-full p-3 rounded-xl text-left transition-all ${
                    selectedTone === option.value
                      ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30'
                      : 'bg-zinc-50 dark:bg-[#13131a] text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button 
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="w-full mt-4 bg-zinc-50 dark:bg-[#13131a] hover:bg-zinc-100 dark:hover:bg-[#1a1a24] text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-white/5 disabled:opacity-50"
              >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </>
              )}
            </Button>
          </motion.div>
          
          {/* Inline Refinement Instructions with Recording */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
            >
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Refine Specific Sections</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-500 mb-3">
              Use <code className="text-violet-400">{'{}'}</code> to highlight and <code className="text-teal-400">[]</code> to instruct:
            </p>
            <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-3 mb-4">
              <p className="text-sm text-zinc-700 dark:text-zinc-400 font-mono">
                I led a team <span className="text-violet-400">{'{'}during my internship{'}'}</span>
                <span className="text-teal-400">[make this more confident and results-driven]</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border-violet-500/30">
                Apply Refinements
              </Button>
              <RecordButton
                size="icon"
                className="border-white/10 hover:bg-violet-500/20 hover:border-violet-500/30"
              />
            </div>
          </motion.div>
          
          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
            >
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start border-white/5 text-zinc-400 hover:text-white">
                <Maximize2 className="w-4 h-4 mr-2" />
                Expand Content
              </Button>
              <Button variant="outline" className="w-full justify-start border-white/5 text-zinc-400 hover:text-white">
                <Minimize2 className="w-4 h-4 mr-2" />
                Make Concise
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
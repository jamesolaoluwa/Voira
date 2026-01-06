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

const mockDraft = {
  original: "I believe my experience in leading community initiatives has shaped who I am today. When I started volunteering at the local food bank three years ago, I didn't realize how much it would transform my perspective on service and leadership.",
  refined: "My journey leading community initiatives has profoundly shaped my identity. Three years ago, when I first volunteered at our local food bank, I couldn't have anticipated the transformative impact this experience would have on my understanding of service and leadership.",
  structure: [
    { title: "Opening Hook", content: "Personal journey statement", status: "strong" },
    { title: "Context", content: "Timeline and setting established", status: "strong" },
    { title: "Reflection", content: "Personal growth acknowledgment", status: "moderate" },
    { title: "Conclusion", content: "Needs strengthening", status: "weak" },
  ],
  themes: ["Leadership", "Community Service", "Personal Growth", "Transformation"],
  alignment: {
    score: 85,
    notes: "Strong alignment with scholarship values of community impact and leadership development."
  }
};

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
  const [draft, setDraft] = useState(mockDraft);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentRecording, setCurrentRecording] = useState(null);
  
  useEffect(() => {
    loadDraftData();
  }, [location.state, recordingId]);
  
  const loadDraftData = async () => {
    try {
      // Try loading from URL parameter first (ID-based)
      if (recordingId) {
        const recording = await sessions.get(recordingId);
        if (recording) {
          setCurrentRecording(recording);
          setDraft({
            original: recording.transcript,
            refined: recording.refined_draft,
            structure: mockDraft.structure,
            themes: mockDraft.themes,
            alignment: {
              score: recording.clarity_score || 80,
              notes: `Your response shows ${(recording.clarity_score || 80) >= 80 ? 'strong' : 'good'} clarity and alignment.`
            }
          });
          setIsLoading(false);
          return;
        }
      }
      
      // Fall back to state-based loading
      if (location.state?.sessionData) {
        const { sessionData } = location.state;
        setDraft({
          original: sessionData.transcript,
          refined: sessionData.refinedDraft,
          structure: mockDraft.structure,
          themes: mockDraft.themes,
          alignment: {
            score: sessionData.clarityScore || 80,
            notes: `Your response shows ${(sessionData.clarityScore || 80) >= 80 ? 'strong' : 'good'} clarity and alignment.`
          }
        });
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(draft.refined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleSave = async () => {
    try {
      if (currentRecording) {
        await sessions.update(currentRecording.id, {
          refined_draft: draft.refined
        });
      }
    } catch (error) {
      console.error('Error saving draft:', error);
    }
    navigate(createPageUrl('Library'));
  };
  
  const handleRegenerate = async () => {
    setIsRegenerating(true);
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
    } catch (error) {
      console.error('Error regenerating:', error);
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
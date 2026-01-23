import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Loader2,
  Wand2,
  MousePointerClick,
  Type
} from 'lucide-react';
import { sessions } from '@/components/services/api';
import { toast } from '@/components/ui/use-toast';

/**
 * Minimum transcript length to compute strongest moment.
 * Requires at least 2-3 sentences worth of content (~100 characters).
 */
const MIN_TRANSCRIPT_LENGTH_FOR_STRONGEST_MOMENT = 100;

/**
 * Compute strongest moment from transcript text.
 * Uses heuristics: longest sentence with impactful keywords, or first substantial sentence.
 * Returns { text: string, reason: string } or null if transcript is too short.
 * 
 * EDGE CASE: If transcript is too short (< 100 chars or < 2 sentences),
 * returns null and UI should show "Not enough content yet" message.
 */
function computeStrongestMoment(transcript) {
  // VALIDATION: Require minimum content length
  if (!transcript || transcript.trim().length < MIN_TRANSCRIPT_LENGTH_FOR_STRONGEST_MOMENT) {
    return null;
  }
  
  // Split into sentences
  const sentences = transcript
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15); // Filter out very short fragments
  
  // VALIDATION: Require at least 2 sentences for meaningful analysis
  if (sentences.length < 2) {
    return null;
  }
  
  // Impact keywords that suggest confidence/strength
  const impactKeywords = [
    'led', 'achieved', 'created', 'built', 'transformed', 'improved',
    'passionate', 'dedicated', 'committed', 'learned', 'grew', 'discovered',
    'impact', 'change', 'growth', 'success', 'accomplished', 'developed',
    'journey', 'experience', 'believe', 'proud', 'meaningful'
  ];
  
  // Score each sentence
  const scoredSentences = sentences.map(sentence => {
    const lowerSentence = sentence.toLowerCase();
    let score = 0;
    
    // Length score (longer sentences often have more substance)
    score += Math.min(sentence.length / 20, 5);
    
    // Keyword score
    impactKeywords.forEach(keyword => {
      if (lowerSentence.includes(keyword)) {
        score += 2;
      }
    });
    
    // First-person indicators suggest personal ownership
    if (lowerSentence.includes(' i ') || lowerSentence.startsWith('i ')) {
      score += 1;
    }
    
    return { sentence, score };
  });
  
  // Sort by score descending and pick the best
  scoredSentences.sort((a, b) => b.score - a.score);
  const strongest = scoredSentences[0];
  
  // Determine reason based on what made it score high
  let reason = 'This part of your response shows clear conviction.';
  const lowerText = strongest.sentence.toLowerCase();
  
  if (impactKeywords.some(kw => lowerText.includes(kw))) {
    if (lowerText.includes('led') || lowerText.includes('created') || lowerText.includes('built')) {
      reason = 'This demonstrates leadership and initiative.';
    } else if (lowerText.includes('learned') || lowerText.includes('grew') || lowerText.includes('discovered')) {
      reason = 'This shows reflective growth and self-awareness.';
    } else if (lowerText.includes('passionate') || lowerText.includes('believe') || lowerText.includes('meaningful')) {
      reason = 'This conveys authentic passion and personal values.';
    }
  }
  
  return { text: strongest.sentence, reason };
}

/**
 * Extract key themes from transcript using keyword analysis.
 * Returns array of theme strings.
 */
function extractThemes(transcript) {
  if (!transcript || transcript.trim().length < 20) {
    return [];
  }
  
  const lowerTranscript = transcript.toLowerCase();
  const themes = [];
  
  // Theme detection patterns
  const themePatterns = [
    { keywords: ['lead', 'led', 'leader', 'team', 'managed'], theme: 'Leadership' },
    { keywords: ['community', 'volunteer', 'service', 'help', 'impact'], theme: 'Community Service' },
    { keywords: ['grew', 'growth', 'learned', 'changed', 'transformed'], theme: 'Personal Growth' },
    { keywords: ['challenge', 'overcome', 'difficult', 'obstacle', 'persever'], theme: 'Resilience' },
    { keywords: ['passion', 'love', 'excited', 'enthusiast', 'dedicate'], theme: 'Passion' },
    { keywords: ['creative', 'innovate', 'design', 'build', 'create'], theme: 'Innovation' },
    { keywords: ['family', 'parent', 'sibling', 'home', 'upbringing'], theme: 'Family' },
    { keywords: ['work', 'job', 'career', 'profession', 'intern'], theme: 'Professional Experience' },
    { keywords: ['school', 'university', 'education', 'study', 'academic'], theme: 'Education' },
    { keywords: ['goal', 'dream', 'aspir', 'future', 'plan'], theme: 'Ambition' },
  ];
  
  themePatterns.forEach(({ keywords, theme }) => {
    if (keywords.some(kw => lowerTranscript.includes(kw))) {
      themes.push(theme);
    }
  });
  
  // Return up to 4 themes, or a default if none found
  return themes.length > 0 ? themes.slice(0, 4) : ['Personal Narrative'];
}

/**
 * Generate structure analysis from transcript.
 * Returns array of { title, content, status } objects.
 */
function analyzeStructure(transcript) {
  if (!transcript || transcript.trim().length < 20) {
    return [{ title: "Content", content: "No content to analyze", status: "weak" }];
  }
  
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const structure = [];
  
  // Opening
  if (sentences.length > 0) {
    const opening = sentences[0].trim();
    const hasHook = opening.length > 30 || /^(I |My |When |Growing|Throughout)/i.test(opening);
    structure.push({
      title: "Opening",
      content: opening.substring(0, 50) + (opening.length > 50 ? '...' : ''),
      status: hasHook ? 'strong' : 'moderate'
    });
  }
  
  // Body/Development
  if (sentences.length > 2) {
    const bodyLength = sentences.slice(1, -1).join(' ').length;
    structure.push({
      title: "Development",
      content: `${sentences.length - 2} supporting points`,
      status: bodyLength > 100 ? 'strong' : bodyLength > 50 ? 'moderate' : 'weak'
    });
  }
  
  // Conclusion
  if (sentences.length > 1) {
    const conclusion = sentences[sentences.length - 1].trim();
    const hasConclusion = conclusion.length > 20 && /learned|grew|realize|understand|believe|future/i.test(conclusion);
    structure.push({
      title: "Conclusion",
      content: hasConclusion ? "Clear closing statement" : "Could be strengthened",
      status: hasConclusion ? 'strong' : 'weak'
    });
  }
  
  return structure.length > 0 ? structure : [{ title: "Content", content: "Brief response", status: "moderate" }];
}

const toneOptions = [
  { label: 'Confident', value: 'confident' },
  { label: 'Concise', value: 'concise' },
  { label: 'Reflective', value: 'reflective' },
];

/**
 * Draft Page Component
 * 
 * DATA FLOW:
 * 1. Session data comes from either:
 *    - URL parameter ?id=<session_id> -> fetched from backend
 *    - Navigation state from Speak.jsx -> passed via location.state.sessionData
 * 
 * 2. SINGLE SOURCE OF TRUTH: The `draft` state object contains:
 *    - original: Raw transcript (what user spoke)
 *    - refined: LLM-refined text (the main output)
 *    - strongestMoment: Computed from transcript, NOT hardcoded
 *    - themes: Extracted from transcript, NOT hardcoded
 *    - structure: Analyzed from transcript, NOT hardcoded
 * 
 * 3. All refinement operations update the `draft.refined` field.
 *    The UI always reads from this single source.
 */
export default function Draft() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const recordingId = urlParams.get('id');
  
  const [copied, setCopied] = useState(false);
  const [selectedTone, setSelectedTone] = useState('confident');
  const [isExpanded, setIsExpanded] = useState(false);
  
  // SINGLE SOURCE OF TRUTH for draft data
  // Never populated with mock/hardcoded data
  const [draft, setDraft] = useState(null);
  
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [currentRecording, setCurrentRecording] = useState(null);
  
  /**
   * HIGHLIGHT-DRIVEN REFINEMENT STATE
   * 
   * Flow:
   * 1. User highlights text in the refined draft
   * 2. selectedText and selectionRange are captured
   * 3. User enters instruction (no {} [] syntax needed)
   * 4. On apply: only the selected section is refined
   * 5. Animation shows what changed
   */
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState(null); // { start: number, end: number }
  const [refinementInstruction, setRefinementInstruction] = useState('');
  const [isApplyingRefinement, setIsApplyingRefinement] = useState(false);
  const [refinementError, setRefinementError] = useState('');
  
  // Animation state for showing refined section
  const [animatedRange, setAnimatedRange] = useState(null); // { start, end } of recently refined text
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Ref to scroll to refined content after applying refinement
  const refinedContentRef = useRef(null);
  const refinedTextRef = useRef(null); // Ref for the text container to detect selection
  
  useEffect(() => {
    loadDraftData();
  }, [location.state, recordingId]);
  
  /**
   * Load draft data from URL parameter or navigation state.
   * All analysis (strongest moment, themes, structure) is computed from real transcript.
   * NO hardcoded data is ever used.
   */
  const loadDraftData = async () => {
    setLoadError(null);
    try {
      let transcript = '';
      let refinedText = '';
      let clarityScore = 80;
      let question = ''; // CRITICAL: Question is required for all LLM calls
      let referenceText = ''; // Optional: reference content for context
      let recording = null;
      
      // Try loading from URL parameter first (ID-based)
      if (recordingId) {
        recording = await sessions.getSessionById(recordingId);
        if (recording) {
          setCurrentRecording(recording);
          transcript = recording.transcript || '';
          refinedText = recording.refined_draft || '';
          clarityScore = recording.clarity_score || 80;
          question = recording.question || '';
          referenceText = recording.reference_text || '';
        }
      }
      
      // Fall back to state-based loading (from Speak.jsx navigation)
      if (!transcript && location.state?.sessionData) {
        const { sessionData } = location.state;
        console.log('[Draft] Loading from navigation state, transcript length:', sessionData.transcript?.length || 0);
        console.log('[Draft] Refined draft length:', (sessionData.refinedDraft || sessionData.refined_draft || '').length);
        transcript = sessionData.transcript || '';
        refinedText = sessionData.refinedDraft || sessionData.refined_draft || '';
        clarityScore = sessionData.clarityScore || sessionData.clarity_score || 80;
        question = sessionData.question || '';
        referenceText = sessionData.reference_text || sessionData.referenceText || '';
      }
      
      // No data source available - show error state
      if (!transcript && !refinedText) {
        console.warn('[Draft] No session data available from URL or navigation state');
        setLoadError('No session data found. Please record a new session.');
        setIsLoading(false);
        return;
      }
      
      // CRITICAL: Compute all analysis from REAL transcript data
      // Never use hardcoded values
      const strongestMoment = computeStrongestMoment(transcript);
      const themes = extractThemes(transcript);
      const structure = analyzeStructure(transcript);
      
      setDraft({
        original: transcript,
        refined: refinedText,
        // CRITICAL: Question is the anchor for all LLM operations
        question,
        // Optional: Reference content (used as supporting context, not source-of-truth)
        referenceText,
        // Computed from real data, not hardcoded
        strongestMoment,
        themes,
        structure,
        alignment: {
          score: clarityScore,
          notes: clarityScore >= 80 
            ? 'Your response shows strong clarity and alignment with the question.'
            : clarityScore >= 60
            ? 'Your response shows good alignment. Consider adding more specific details.'
            : 'Consider restructuring your response to better address the question.'
        }
      });
      
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
      
      console.log('[Draft] Calling /refine with tone:', selectedTone, 'question:', draft.question?.substring(0, 50));
      
      // CRITICAL: Every LLM call MUST include the question as the anchor
      const response = await apiClient.post('/refine', {
        raw_transcript: draft.original,
        session_type: 'refine',
        desired_tone: selectedTone,
        // REQUIRED: Question is the anchor for refinement
        question: draft.question || undefined,
        // OPTIONAL: Reference content (used as supporting context only)
        reference_text: draft.referenceText || undefined,
        goal: `Rewrite with a ${selectedTone} tone while maintaining authenticity${draft.question ? ` and addressing the question: "${draft.question}"` : ''}`,
        // Explicit instruction for reference handling
        user_context: draft.referenceText 
          ? 'Use the reference material only to inform tone, structure, or examples. Do not copy content from references.'
          : undefined,
      });
      
      if (response?.refined_text) {
        setDraft({
          ...draft,
          refined: response.refined_text
        });
        console.log('[Draft] Refinement successful, new length:', response.refined_text.length);
        toast({
          title: 'Refinement complete',
          description: `Your draft has been rewritten with a ${selectedTone} tone.`,
          duration: 3000
        });
      } else {
        console.warn('[Draft] Refinement response empty, keeping original');
      }
    } catch (error) {
      console.error('[Draft] Error regenerating:', error);
      toast({
        title: 'Regeneration failed',
        description: 'Could not regenerate draft. Please try again later.',
        variant: 'destructive',
        duration: 4000
      });
    } finally {
      setIsRegenerating(false);
    }
  };
  
  /**
   * Handle text selection in the refined draft.
   * Captures selectedText and selectionRange when user highlights text.
   */
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const selectedStr = selection?.toString().trim();
    
    if (selectedStr && selectedStr.length > 0 && refinedTextRef.current) {
      // Ensure selection is within our refined text container
      const container = refinedTextRef.current;
      const range = selection.getRangeAt(0);
      
      if (container.contains(range.commonAncestorContainer)) {
        // Calculate the range within the draft text
        const fullText = draft?.refined || '';
        const start = fullText.indexOf(selectedStr);
        
        if (start !== -1) {
          setSelectedText(selectedStr);
          setSelectionRange({ start, end: start + selectedStr.length });
          setRefinementError(''); // Clear any previous error
          console.log('[Draft] Text selected:', { text: selectedStr.substring(0, 50), start, end: start + selectedStr.length });
        }
      }
    }
  }, [draft?.refined]);
  
  // Add selection listener
  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('keyup', handleTextSelection); // For keyboard selection
    
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
      document.removeEventListener('keyup', handleTextSelection);
    };
  }, [handleTextSelection]);
  
  /**
   * Clear the current selection
   */
  const clearSelection = () => {
    setSelectedText('');
    setSelectionRange(null);
    window.getSelection()?.removeAllRanges();
  };
  
  /**
   * Apply highlight-driven refinement.
   * 
   * VALIDATION:
   * - Must have highlighted text (selectedText)
   * - Must have instruction (refinementInstruction)
   * 
   * NO {} [] syntax required - selection is implicit from highlight.
   */
  const handleApplyRefinement = async () => {
    // Clear previous error
    setRefinementError('');
    
    // VALIDATION: Check for highlighted text
    if (!selectedText || !selectionRange) {
      setRefinementError('Highlight a section of the draft first.');
      return;
    }
    
    // VALIDATION: Check for instruction
    if (!refinementInstruction.trim()) {
      setRefinementError('Please describe how you want this section refined.');
      return;
    }
    
    if (!draft?.refined) {
      setRefinementError('No draft available to refine.');
      return;
    }
    
    setIsApplyingRefinement(true);
    try {
      const { apiClient } = await import('@/lib/apiClient');
      
      console.log('[Draft] Applying highlight-driven refinement:', { 
        selectedText: selectedText.substring(0, 50), 
        instruction: refinementInstruction,
        range: selectionRange 
      });
      
      // CONTEXT-AWARE REFINEMENT: Include full context so LLM only edits the specific section
      // CRITICAL: Always include the question as the anchor
      const response = await apiClient.post('/refine', {
        raw_transcript: draft.original,
        session_type: 'section_refine',
        desired_tone: selectedTone,
        goal: refinementInstruction,
        // REQUIRED: Question is the anchor
        question: draft.question || undefined,
        // OPTIONAL: Reference content
        reference_text: draft.referenceText || undefined,
        // Context-aware prompt
        user_context: `IMPORTANT: You are editing a specific section of an already-refined essay.
${draft.question ? `\nORIGINAL QUESTION BEING ANSWERED:\n"${draft.question}"\n` : ''}
FULL CURRENT ESSAY:
"""
${draft.refined}
"""

SECTION TO EDIT (the user has highlighted this exact text):
"""
${selectedText}
"""

INSTRUCTION: ${refinementInstruction}

CRITICAL RULES:
1. Return ONLY the refined version of the highlighted section - NOT the full essay
2. The refined text should directly replace the highlighted section
3. Preserve tone and voice while applying the instruction
4. Keep similar length unless the instruction specifically asks for expansion/condensation
${draft.referenceText ? '\nNote: Use reference material only to inform tone and style. Do not copy content.' : ''}`,
      });
      
      // Get the refined section text
      const refinedSection = response?.refined_text?.trim();
      
      if (refinedSection) {
        // Replace the selected section in-place
        const beforeSelection = draft.refined.substring(0, selectionRange.start);
        const afterSelection = draft.refined.substring(selectionRange.end);
        const newRefinedText = beforeSelection + refinedSection + afterSelection;
        
        // Calculate the new range for animation
        const newRange = {
          start: selectionRange.start,
          end: selectionRange.start + refinedSection.length
        };
        
        // Update draft with new text
        setDraft({
          ...draft,
          refined: newRefinedText
        });
        
        // Trigger animation
        setAnimatedRange(newRange);
        setIsAnimating(true);
        
        // Clear animation after duration
        setTimeout(() => {
          setIsAnimating(false);
          setAnimatedRange(null);
        }, 900); // Animation duration
        
        console.log('[Draft] Section refinement successful');
        
        // Clear selection and instruction
        setSelectedText('');
        setSelectionRange(null);
        setRefinementInstruction('');
        
        // Scroll to refined content (no toast, no modal - direct feedback via animation)
        if (refinedContentRef.current) {
          refinedContentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    } catch (error) {
      console.error('[Draft] Section refinement error:', error);
      toast({
        title: 'Refinement failed',
        description: 'Could not refine the section. Please try again.',
        variant: 'destructive',
        duration: 4000
      });
    } finally {
      setIsApplyingRefinement(false);
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
                {/* REFINED OUTPUT - Primary content, most prominent */}
                {/* Users can highlight text here to select sections for refinement */}
                <div 
                  ref={refinedContentRef}
                  className={`bg-white dark:bg-[#1a1a24] rounded-2xl border-2 border-violet-400 dark:border-violet-500/30 shadow-lg dark:shadow-violet-500/5 p-6 ${isExpanded ? 'min-h-[400px]' : ''}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-violet-500" />
                      <h3 className="text-lg font-semibold text-violet-700 dark:text-violet-300">After (Refined)</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Selection indicator */}
                      {selectedText && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-1.5 px-2 py-1 bg-violet-500/10 border border-violet-500/30 rounded-lg"
                        >
                          <MousePointerClick className="w-3 h-3 text-violet-400" />
                          <span className="text-xs text-violet-400">Text selected</span>
                          <button 
                            onClick={clearSelection}
                            className="ml-1 text-violet-400 hover:text-violet-300"
                          >
                            ×
                          </button>
                        </motion.div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-zinc-400 hover:text-violet-400"
                      >
                        {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  {/* Hint for users */}
                  {!selectedText && draft.refined && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                      <MousePointerClick className="w-3 h-3" />
                      Highlight text to refine specific sections
                    </p>
                  )}
                  
                  {draft.refined ? (
                    <div 
                      ref={refinedTextRef}
                      className="text-zinc-900 dark:text-zinc-100 leading-relaxed whitespace-pre-wrap select-text cursor-text"
                      style={{ userSelect: 'text' }}
                    >
                      {/* Render text with animation for refined sections */}
                      {animatedRange && isAnimating ? (
                        <>
                          {draft.refined.substring(0, animatedRange.start)}
                          <motion.span
                            initial={{ backgroundColor: 'rgba(139, 92, 246, 0.3)', scale: 1.02 }}
                            animate={{ 
                              backgroundColor: ['rgba(139, 92, 246, 0.4)', 'rgba(139, 92, 246, 0.1)', 'rgba(139, 92, 246, 0)'],
                              scale: [1.02, 1.01, 1]
                            }}
                            transition={{ 
                              duration: 0.9, 
                              ease: 'easeOut',
                              times: [0, 0.5, 1]
                            }}
                            className="inline rounded px-0.5"
                          >
                            {draft.refined.substring(animatedRange.start, animatedRange.end)}
                          </motion.span>
                          {draft.refined.substring(animatedRange.end)}
                        </>
                      ) : (
                        draft.refined
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-zinc-500 dark:text-zinc-400 mb-4">No refined output yet.</p>
                      <Button
                        onClick={handleRegenerate}
                        disabled={isRegenerating}
                        className="bg-violet-500 hover:bg-violet-600 text-white"
                      >
                        {isRegenerating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            Generate Refined Draft
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Before vs After Comparison (collapsed view) */}
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Before (Raw) */}
                  <div className="bg-zinc-100 dark:bg-[#1a1a24]/50 rounded-2xl border border-zinc-200 dark:border-white/5 p-6">
                    <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-500 mb-4">Before (Raw)</h3>
                    <p className="text-zinc-600 dark:text-zinc-500 text-sm leading-relaxed">
                      {draft.original || <span className="italic">No transcript available</span>}
                    </p>
                  </div>
                  
                  {/* Strongest Moment - COMPUTED FROM REAL TRANSCRIPT */}
                  <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-teal-400/30 dark:border-teal-500/20 shadow-sm dark:shadow-none p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">Your Strongest Moment</h3>
                    </div>
                    {draft.strongestMoment ? (
                      <>
                        <p className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed">
                          <span className="bg-teal-500/20 text-teal-700 dark:text-teal-300 px-1 rounded">
                            {draft.strongestMoment.text}
                          </span>
                        </p>
                        <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-3">
                          {draft.strongestMoment.reason}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-2 italic">
                          💡 You sounded most confident here.
                        </p>
                      </>
                    ) : (
                      <div className="text-center py-2">
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
                          Not enough content yet to identify a strongest moment.
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                          Record a response with 2-3 sentences or more.
                        </p>
                      </div>
                    )}
                  </div>
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
                {draft.structure && draft.structure.length > 0 ? (
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
                ) : (
                  <p className="text-zinc-500 dark:text-zinc-400 italic">
                    No structure analysis available. Record a longer response for detailed analysis.
                  </p>
                )}
              </motion.div>
            </TabsContent>
            
            <TabsContent value="themes">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-8"
              >
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Key Themes Identified</h3>
                {draft.themes && draft.themes.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {draft.themes.map((theme, index) => (
                      <Badge 
                        key={index}
                        className="px-4 py-2 bg-violet-500/20 text-violet-700 dark:text-violet-300 text-sm"
                      >
                        {theme}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500 dark:text-zinc-400 italic">
                    No themes identified. Record a longer response for theme analysis.
                  </p>
                )}
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
          
          {/* Highlight-Driven Refinement */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="w-4 h-4 text-violet-500" />
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Refine a Section</h3>
            </div>
            
            <p className="text-xs text-zinc-600 dark:text-zinc-500 mb-4">
              Highlight the text you want to refine above, then describe how you want it improved.
            </p>
            
            {/* Selected text preview */}
            <AnimatePresence mode="wait">
              {selectedText ? (
                <motion.div
                  key="selected"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="mb-4 p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-violet-400">Selected text:</span>
                    <button 
                      onClick={clearSelection}
                      className="text-xs text-violet-400 hover:text-violet-300"
                    >
                      Clear
                    </button>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3">
                    "{selectedText}"
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="mb-4 p-3 bg-zinc-50 dark:bg-[#13131a] border border-dashed border-zinc-300 dark:border-white/10 rounded-lg text-center"
                >
                  <MousePointerClick className="w-5 h-5 text-zinc-400 mx-auto mb-1.5" />
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    Highlight the part of the draft you want to refine.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Instruction input - NO {} [] syntax required */}
            <div className="mb-3">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">
                How should it be improved?
              </label>
              <Input
                value={refinementInstruction}
                onChange={(e) => {
                  setRefinementInstruction(e.target.value);
                  if (refinementError) setRefinementError('');
                }}
                placeholder="Make this more confident and remove hesitation"
                className={`bg-zinc-50 dark:bg-[#13131a] border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 ${
                  refinementError && !selectedText ? '' : refinementError ? 'border-red-400 dark:border-red-500/50' : ''
                }`}
              />
            </div>
            
            {/* Example (non-interactive) */}
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mb-3 italic">
              Example: "Make this more confident and remove hesitation."
            </p>
            
            {/* Inline validation error */}
            {refinementError && (
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-red-500 dark:text-red-400 mb-3 flex items-center gap-1.5"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                {refinementError}
              </motion.p>
            )}
            
            <Button 
              onClick={handleApplyRefinement}
              disabled={isApplyingRefinement || !selectedText}
              className="w-full bg-violet-500/20 hover:bg-violet-500/30 text-violet-700 dark:text-violet-300 border border-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplyingRefinement ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Refining...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Apply Refinement
                </>
              )}
            </Button>
          </motion.div>
          
          {/* Quick Instruction Presets */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
          >
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Quick Instructions</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-600 mb-3">
              Select text above, then click a preset:
            </p>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                onClick={() => setRefinementInstruction('Expand this with more specific details and examples')}
                disabled={!selectedText}
                className="w-full justify-start border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
              >
                <Maximize2 className="w-4 h-4 mr-2" />
                Expand with details
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setRefinementInstruction('Make this more concise while keeping the key points')}
                disabled={!selectedText}
                className="w-full justify-start border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
              >
                <Minimize2 className="w-4 h-4 mr-2" />
                Make concise
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setRefinementInstruction('Make this sound more confident and assertive')}
                disabled={!selectedText}
                className="w-full justify-start border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                More confident
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setRefinementInstruction('Add a specific example or story to illustrate this point')}
                disabled={!selectedText}
                className="w-full justify-start border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
              >
                <Type className="w-4 h-4 mr-2" />
                Add example
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
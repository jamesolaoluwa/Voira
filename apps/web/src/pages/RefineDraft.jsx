import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import VoiceVisualizer from '@/components/ui/VoiceVisualizer';
import FileUpload from '@/components/ui/FileUpload';
import { ArrowLeft, Mic, Square, Upload, FileText, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/components/recording/AudioRecorder';
import { toast } from '@/components/ui/use-toast';
import { saveLocalRecording } from '@/lib/localRecordings';
import useSessionStore from '@/stores/useSessionStore';

export default function RefineDraft() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  
  const [question, setQuestion] = useState('');
  const [existingDraft, setExistingDraft] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [uploadedFileType, setUploadedFileType] = useState(null);
  const [voiceNotes, setVoiceNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const {
    isRecording,
    isPaused,
    amplitude,
    liveTranscript, // Live transcript from WebSocket
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    uploadAndTranscribe,
    forceCleanup,
  } = useAudioRecorder();
  
  useEffect(() => {
    return () => {
      forceCleanup();
    };
  }, [forceCleanup]);
  
  // Update voice notes from live transcript
  useEffect(() => {
    if (isRecording && liveTranscript) {
      setVoiceNotes(liveTranscript);
    }
  }, [isRecording, liveTranscript]);

  const handleFileSelect = async (file) => {
    if (!file) {
      setUploadedFile(null);
      setUploadedFileUrl(null);
      setUploadedFileType(null);
      setExistingDraft('');
      return;
    }
    
    setUploadedFile(file);
    setIsProcessing(true);
    
    try {
      // Store file type
      setUploadedFileType(file.type);
      
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploadedFileUrl(file_url);
      
      // Extract text from file (only for non-image files)
      // Images will be analyzed via Vision API
      const isImage = file.type.startsWith('image/');
      
      if (!isImage) {
        const extraction = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: 'object',
            properties: {
              content: { type: 'string' }
            }
          }
        });
        
        if (extraction.status === 'success') {
          setExistingDraft(extraction.output.content);
        }
      } else {
        // For images, clear draft (will use Vision API for analysis)
        setExistingDraft('');
      }
    } catch (error) {
      console.error('Error processing file:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartRecording = async () => {
    setVoiceNotes(''); // Clear previous voice notes
    await startRecording();
  };

  const handleStopRecording = async () => {
    stopRecording();
    // Voice notes are already updated from liveTranscript via useEffect
    // No need to call uploadAndTranscribe - live transcript is sufficient
  };

  const handleRefine = async () => {
    if (!existingDraft && !uploadedFile) {
      toast({ title: 'No draft provided', description: 'Please provide an existing draft to refine' });
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Call backend /refine endpoint
      const { apiClient } = await import('@/lib/apiClient');
      
      // Build user context from question and voice notes
      const userContext = [
        question ? `Question/Context: ${question}` : null,
        voiceNotes ? `User's Voice Instructions: ${voiceNotes}` : null,
      ].filter(Boolean).join('\n\n') || undefined;
      
      const result = await apiClient.post('/refine', {
        raw_transcript: existingDraft,
        session_type: 'refine', // Mark as refine draft session
        desired_tone: 'natural',
        user_context: userContext, // Contains question and voice instructions
        reference_text: undefined, // Could add reference text support later
        reference_file_url: uploadedFileUrl || undefined,
        reference_file_type: uploadedFileType || undefined,
        question: question || undefined,
        goal: voiceNotes || undefined, // User's voice instructions are the goal
      });
      
      // Transform response to match expected format
      const refinedResult = {
        refinedDraft: result.refined_text,
        changesSummary: 'Draft refined to improve clarity and flow while maintaining your authentic voice.',
      };
      
      // If an existing session id is provided (overwrite), update; otherwise create
      const urlParams = new URLSearchParams(window.location.search);
      const recordingId = urlParams.get('id') || location.state?.sessionData?.id;
      const { sessions: sessionsApi } = await import('@/components/services/api');
      let recording;
      if (recordingId) {
        // update existing
        await sessionsApi.updateSession(recordingId, {
          transcript: voiceNotes || 'Direct refinement',
          refined_draft: refinedResult.refinedDraft,
        });
        recording = { id: recordingId };
        // optimistic cache update
          try {
          queryClient.setQueryData(['recordings'], (old = []) => {
            return (old || []).map(r => r.id === recordingId ? { ...r, transcript: voiceNotes || r.transcript, refined_draft: refinedResult.refinedDraft } : r);
          });
          // persist locally as fallback (normalized fields)
          try { saveLocalRecording({ id: recordingId, title: 'Refined Draft', transcript: voiceNotes || '', refined_draft: refinedResult.refinedDraft, type: 'refine', createdAt: new Date().toISOString() }); } catch (e) {}
        } catch (e) { try { queryClient.invalidateQueries({ queryKey: ['recordings'] }); } catch (ex) {} }
        } else {
        // create new
        recording = await sessionsApi.createSessionDraft({
          title: 'Refined Draft',
          transcript: voiceNotes || 'Direct refinement',
          refined_draft: refinedResult.refinedDraft,
          type: 'refine',
          question,
        });
  try { saveLocalRecording({ id: recording.id || `local-${Date.now()}`, title: recording.title || 'Refined Draft', transcript: recording.transcript || voiceNotes || '', refined_draft: refinedResult.refinedDraft, type: 'refine', createdAt: recording.created_date || new Date().toISOString() }); } catch (e) {}
  try { useSessionStore.getState().addSession({ id: recording.id || `local-${Date.now()}`, title: recording.title || 'Refined Draft', createdAt: recording.created_date || new Date().toISOString(), type: 'refine', question, transcript: recording.transcript || voiceNotes || '', durationSec: 0, wordsCount: (voiceNotes || '').split(/\s+/).filter(Boolean).length, confidenceScore: 0, fillerCount: 0, wordsPerMinute: 0 }); } catch (e) {}
      }

      // Navigate to Draft page
      navigate(createPageUrl('Draft'), {
        state: {
          sessionData: {
            id: recording.id,
            title: 'Refined Draft',
            transcript: voiceNotes,
            refinedDraft: refinedResult.refinedDraft,
            type: 'refine',
            question,
          }
        }
      });
    } catch (error) {
      console.error('Error refining draft:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(createPageUrl('Home'))}
          className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            Refine Existing Draft
          </h1>
          <p className="text-zinc-600 dark:text-zinc-500">Upload your draft and tell Voira how to improve it</p>
        </div>
      </motion.div>

      <div className="max-w-3xl mx-auto space-y-8">
        {/* Question/Context */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6"
        >
          <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
            Application Question or Context (Optional)
          </Label>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., Describe a challenge you overcame..."
            className="bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
        </motion.div>

        {/* Existing Draft Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6 space-y-4"
        >
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            Your Existing Draft
          </h3>
          
          {/* File Upload */}
          <div>
            <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
              Upload File (PDF, Word, or Image)
            </Label>
            <FileUpload
              onFileSelect={handleFileSelect}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.tif"
              label="Drop your draft here or click to upload"
              helperText="Voira will extract the content from PDF, Word documents, or images and help you refine it"
            />
          </div>

          {/* OR separator */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white dark:bg-[hsl(var(--card))] px-4 text-zinc-500 dark:text-zinc-500">OR</span>
            </div>
          </div>

          {/* Text Input */}
          <div>
            <Label className="text-zinc-800 dark:text-zinc-300 mb-2 block">
              Paste Your Draft
            </Label>
            <Textarea
              value={existingDraft}
              onChange={(e) => setExistingDraft(e.target.value)}
              placeholder="Paste your existing draft here..."
              className="bg-white dark:bg-[#13131a] border-zinc-300 dark:border-white/10 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 min-h-[200px]"
            />
          </div>
        </motion.div>

        {/* Voice Instructions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-[hsl(var(--card))] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6 space-y-6"
        >
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Mic className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
            Tell Voira What to Change
          </h3>

          <div className="flex flex-col items-center gap-6">
            <VoiceVisualizer 
              size={180} 
              isActive={isRecording && !isPaused} 
              amplitude={amplitude}
            />

            {!isRecording ? (
              <Button
                size="lg"
                onClick={handleStartRecording}
                disabled={isProcessing}
                className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white/90"
              >
                <Mic className="w-5 h-5 mr-2" />
                Record Changes
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleStopRecording}
                className="bg-rose-600 hover:bg-rose-500"
              >
                <Square className="w-4 h-4 mr-2" />
                Finish Recording
              </Button>
            )}

            {voiceNotes && (
              <div className="w-full bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4 border border-zinc-200 dark:border-white/10">
                <p className="text-sm text-zinc-600 dark:text-zinc-500 mb-2">Your Instructions:</p>
                <p className="text-zinc-800 dark:text-zinc-300">{voiceNotes}</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Submit Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center"
        >
          <Button
            size="lg"
            onClick={handleRefine}
            disabled={isProcessing || (!existingDraft && !uploadedFile)}
            className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white/90 px-12 h-14 text-lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Refine Draft
              </>
            )}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { removeLocalRecording, saveLocalRecording, clearLocalRecordings } from '@/lib/localRecordings';
import { toast } from '@/components/ui/use-toast';
import useSessionStore from '@/stores/useSessionStore';
import { getLocalRecordings } from '@/lib/localRecordings';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { sessions as sessionsApi, drafts as draftsApi } from '@/components/services/api';
import { 
  Search, 
  Filter, 
  FileText, 
  Clock, 
  Mic,
  GraduationCap,
  Briefcase,
  MessageSquare,
  ChevronRight,
  Trash2,
  Loader2,
  Trash2 as TrashIcon,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';

const typeIcons = {
  application: GraduationCap,
  interview: Briefcase,
  free: MessageSquare,
  practice: Mic,
};

const typeLabels = {
  application: 'Application',
  interview: 'Interview',
  free: 'Free Speak',
  practice: 'Practice',
};

const filterOptions = ['All', 'Application', 'Practice', 'Drafts'];

const PRACTICE_TYPES = new Set(['practice', 'interview', 'free']);

export default function Library() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [drafts, setDrafts] = useState([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const queryClient = useQueryClient();
  
  // Use unified session store as authoritative source
  const sessions = useSessionStore(state => state.sessions || []);
  const setSessions = useSessionStore(state => state.setSessions);
  // Filter out seed/demo data - only show real user recordings
  const safeRecordings = React.useMemo(() => {
    const allSessions = Array.isArray(sessions) ? sessions : [];
    return allSessions.filter(s => s.id && !s.id.startsWith('seed-'));
  }, [sessions]);
  
  const deleteMutation = useMutation({
    mutationFn: (id) => sessionsApi.deleteSession(id),
    onSuccess: (_data, id) => {
  // also remove from our frontend store so Library (which uses the store) updates
  try { useSessionStore.getState().removeSession(id); } catch (e) {}
      // remove from local fallback as well
      try { removeLocalRecording(id); } catch (e) {}
      // remove from query cache immediately
      try {
        queryClient.setQueryData(['recordings'], (old = []) => (old || []).filter(r => r?.id !== id));
      } catch (e) {}
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
    },
  });

  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState(null); // { id, isDraft, currentTitle }
  const [renameValue, setRenameValue] = React.useState('');
  const [isRenaming, setIsRenaming] = React.useState(false);
  
  // Fetch sessions on mount
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setIsLoading(true);
        const fetchedSessions = await sessionsApi.listSessions();
        
        // Normalize backend session data to store format
        // CRITICAL: Mark source as 'backend' to distinguish from local-only items
        const normalizedSessions = fetchedSessions.map(session => {
          const transcript = session.transcript || '';
          const durationSec = session.duration_seconds || 0;
          // Calculate wordsCount from transcript (same logic as store's addSession)
          const wordsCount = Math.max(0, Math.round((transcript.split(/\s+/) || []).filter(Boolean).length));
          const wordsPerMinute = wordsCount && durationSec ? Math.round((wordsCount / (durationSec / 60))) : 0;
          
          return {
            id: session.id,
            title: session.title || '',
            type: session.type || 'free',
            question: session.question || '',
            goal: session.goal || '',
            reference_text: session.reference_text || '',
            referenceText: session.reference_text || '',
            transcript: transcript,
            // CRITICAL: Keep the refined essay on the session object so that
            // when Library passes sessionData through router state to Draft.jsx
            // the already-generated essay re-hydrates instead of rendering blank.
            refined_draft: session.refined_draft || '',
            refinedDraft: session.refined_draft || '',
            highlights: session.highlights || [],
            durationSec: durationSec,
            duration_seconds: durationSec,
            wordsCount: wordsCount,
            words_count: wordsCount,
            confidenceScore: session.confidence_score || session.clarity_score || 0,
            confidence_score: session.confidence_score || 0,
            clarityScore: session.clarity_score || 0,
            clarity_score: session.clarity_score || 0,
            fillerCount: session.filler_count || 0,
            filler_count: session.filler_count || 0,
            wordsPerMinute: session.words_per_minute || wordsPerMinute || 0,
            words_per_minute: session.words_per_minute || wordsPerMinute || 0,
            createdAt: session.created_at || new Date().toISOString(),
            created_at: session.created_at || new Date().toISOString(),
            created_date: session.created_at || new Date().toISOString(),
            updatedAt: session.updated_at || session.created_at || new Date().toISOString(),
            updated_at: session.updated_at || session.created_at || new Date().toISOString(),
            // CRITICAL: Mark as backend-sourced to prevent invalid API calls
            source: 'backend',
            // Discriminator for Library UI (session vs draft)
            itemKind: 'session',
          };
        });
        
        // Update store with fetched sessions from backend
        // If backend returns empty array, that means user has no sessions (clear store)
        // If backend returns sessions, update store with those sessions
        setSessions(normalizedSessions);
      } catch (error) {
        console.error('Error fetching sessions:', error);
        // Don't overwrite store on error - keep existing sessions in store
        // Only show toast for network/CORS errors, not for auth errors (which are expected)
        if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
          console.warn('Backend unavailable - using local sessions only');
          // Don't show error toast if backend is just unavailable - user can still see local sessions
        } else {
          toast({
            title: 'Failed to load sessions',
            description: error.message || 'Could not load your sessions',
            variant: 'destructive',
          });
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSessions();
  }, [setSessions]);
  
  // Fetch drafts on mount
  useEffect(() => {
    const fetchDrafts = async () => {
      try {
        setIsLoadingDrafts(true);
        const fetchedDrafts = await draftsApi.list();
        
        // Normalize draft data for display
        const normalizedDrafts = (fetchedDrafts || []).map(draft => ({
          id: draft.id,
          name: draft.name,
          title: draft.name, // Alias for consistent display
          type: draft.type || 'free',
          question: draft.question || '',
          desired_style: draft.desired_style || '',
          word_limit: draft.word_limit,
          company_name: draft.company_name || '',
          company_context: draft.company_context || '',
          transcript: draft.transcript_text || '',
          transcript_text: draft.transcript_text || '',
          is_user_edited: draft.is_user_edited || false,
          createdAt: draft.created_at,
          created_at: draft.created_at,
          updatedAt: draft.updated_at,
          updated_at: draft.updated_at,
          // Mark as draft for UI differentiation
          isDraft: true,
          source: 'backend',
          // Discriminator for Library UI (session vs draft)
          itemKind: 'draft',
        }));
        
        setDrafts(normalizedDrafts);
      } catch (error) {
        console.error('Error fetching drafts:', error);
        // Don't show error toast - drafts are optional
      } finally {
        setIsLoadingDrafts(false);
      }
    };
    
    fetchDrafts();
  }, []);
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  // Combine sessions and drafts for unified display
  const allItems = React.useMemo(() => {
    // Sessions (completed recordings)
    const sessionItems = safeRecordings.map(rec => ({
      ...rec,
      isDraft: false,
    }));
    
    // Drafts (unfinished work)
    const draftItems = drafts.map(draft => ({
      ...draft,
      isDraft: true,
    }));
    
    // Combine and sort by most recent first
    return [...sessionItems, ...draftItems].sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || a.updated_at || a.created_at);
      const dateB = new Date(b.updatedAt || b.createdAt || b.updated_at || b.created_at);
      return dateB - dateA;
    });
  }, [safeRecordings, drafts]);
  
  const filteredRecordings = allItems.filter(rec => {
    const title = (rec && (rec.title || rec.name)) ? String(rec.title || rec.name) : '';
    const tags = Array.isArray(rec?.tags) ? rec.tags : [];
    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tags.some(tag => String(tag).toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Handle filter logic including "Drafts" and merged "Practice" types
    let matchesFilter = false;
    if (activeFilter === 'All') {
      matchesFilter = true;
    } else if (activeFilter === 'Drafts') {
      matchesFilter = rec.isDraft === true;
    } else if (activeFilter === 'Application') {
      matchesFilter = !rec.isDraft && rec.type === 'application';
    } else if (activeFilter === 'Practice') {
      matchesFilter = !rec.isDraft && PRACTICE_TYPES.has(rec.type);
    }
    
    return matchesSearch && matchesFilter;
  });
  
  const deleteAllMutation = useMutation({
    mutationFn: () => sessionsApi.deleteAllSessions(),
    onSuccess: () => {
      // Clear store
      setSessions([]);
      // Clear localStorage
      try { clearLocalRecordings(); } catch (e) {}
      // Clear query cache
      try {
        queryClient.setQueryData(['recordings'], []);
      } catch (e) {}
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
      
      toast({
        title: 'All sessions deleted',
        description: 'All your sessions have been permanently deleted.',
      });
      setShowDeleteAllDialog(false);
    },
    onError: (error) => {
      console.error('Error deleting all sessions:', error);
      toast({
        title: 'Failed to delete sessions',
        description: error.message || 'Could not delete all sessions',
        variant: 'destructive',
      });
    },
  });
  
  const handleDeleteAll = () => {
    deleteAllMutation.mutate();
  };

  const onConfirmRename = async () => {
    if (!renameTarget?.id) return;
    const trimmed = (renameValue || '').trim();
    if (!trimmed) {
      toast({
        title: 'Name cannot be empty',
        variant: 'destructive',
      });
      return;
    }
    if (trimmed === (renameTarget.currentTitle || '')) {
      setRenameTarget(null);
      setRenameValue('');
      return;
    }

    setIsRenaming(true);
    const { id, isDraft } = renameTarget;

    if (isDraft) {
      // Optimistic local update
      const prevDrafts = drafts;
      setDrafts(prev => prev.map(d => (d.id === id ? { ...d, name: trimmed, title: trimmed } : d)));
      try {
        await draftsApi.update(id, { name: trimmed });
        toast({ title: 'Draft renamed' });
      } catch (error) {
        console.error('[Library] Failed to rename draft:', error);
        setDrafts(prevDrafts);
        toast({
          title: 'Failed to rename draft',
          description: error.message || 'Please try again',
          variant: 'destructive',
        });
      } finally {
        setIsRenaming(false);
        setRenameTarget(null);
        setRenameValue('');
      }
      return;
    }

    // Session rename (optimistic store update + backend PUT)
    const storeBefore = useSessionStore.getState().sessions || [];
    const snapshot = storeBefore.find(s => s.id === id);
    try {
      useSessionStore.getState().updateSession(id, { title: trimmed });
    } catch (e) {}

    try {
      await sessionsApi.renameSession(id, trimmed);
      toast({ title: 'Session renamed' });
    } catch (error) {
      console.error('[Library] Failed to rename session:', error);
      // Revert optimistic update
      if (snapshot) {
        try {
          useSessionStore.getState().updateSession(id, { title: snapshot.title });
        } catch (e) {}
      }
      toast({
        title: 'Failed to rename session',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsRenaming(false);
      setRenameTarget(null);
      setRenameValue('');
    }
  };
  
  // undo-capable delete: remove from store immediately and show undo toast
  const handleDelete = (id, isDraft = false) => {
    if (isDraft) {
      // Handle draft deletion
      const draft = drafts.find(d => d.id === id);
      if (!draft) return;
      
      // Remove from local state immediately
      setDrafts(prev => prev.filter(d => d.id !== id));
      
      let undone = false;
      
      toast({
        title: 'Draft deleted',
        description: 'You can undo this action',
        duration: 4000,
        action: {
          label: 'Undo',
          onClick: () => {
            undone = true;
            setDrafts(prev => [draft, ...prev]);
          }
        }
      });
      
      // After undo window, actually delete from backend
      setTimeout(async () => {
        if (!undone) {
          try {
            await draftsApi.delete(id);
            console.log('[Library] Draft deleted from backend:', id);
          } catch (error) {
            console.error('[Library] Error deleting draft from backend:', error);
            // Restore on error
            setDrafts(prev => [draft, ...prev]);
            toast({
              title: 'Failed to delete draft',
              description: error.message || 'Please try again',
              variant: 'destructive',
            });
          }
        }
      }, 4500);
      
      return;
    }
    
    // Handle session deletion (existing logic)
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    // remove from local store immediately
    useSessionStore.getState().removeSession(id);
    try { removeLocalRecording(id); } catch (e) {}
    try { queryClient.setQueryData(['recordings'], (old = []) => (old || []).filter(r => r?.id !== id)); } catch (e) {}

    let undone = false;
    const undoKey = `undo-delete-${id}`;

    const undoToast = toast({
      title: 'Recording deleted',
      description: 'You can undo this action',
      duration: 4000,
      action: {
        label: 'Undo',
        onClick: () => {
          undone = true;
          // restore to store and local fallback
          useSessionStore.getState().addSession(session);
          try { saveLocalRecording(session); } catch (e) {}
          try { queryClient.setQueryData(['recordings'], (old = []) => [session, ...(old || [])]); } catch (e) {}
        }
      }
    });

    // delay remote delete so the user can undo
    setTimeout(() => {
      if (undone) return;
      deleteMutation.mutate(id);
    }, 4000);
  };
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
              Library
            </h1>
            <p className="text-zinc-600 dark:text-zinc-500 text-lg">
              Your collection of recordings and drafts
            </p>
          </div>
          {safeRecordings.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteAllDialog(true)}
              disabled={deleteAllMutation.isPending}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 border-rose-200 dark:border-rose-800"
            >
              {deleteAllMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <TrashIcon className="w-4 h-4 mr-2" />
                  Delete All
                </>
              )}
            </Button>
          )}
        </div>
      </motion.div>
      
      {/* Search and Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-4 mb-8"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recordings..."
            className="pl-11 bg-white dark:bg-[#1a1a24] border-zinc-300 dark:border-white/5 focus:border-zinc-900/40 dark:focus:border-white/40"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500" />
          <div className="flex gap-2">
            {filterOptions.map((filter) => (
              <Button
                key={filter}
                variant={activeFilter === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter(filter)}
                className={activeFilter === filter 
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white/90 border-transparent' 
                  : 'border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5'}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>
      </motion.div>
      
      {/* Recordings List */}
      <div className="space-y-4">
        {(isLoading || isLoadingDrafts) ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-zinc-400 dark:text-zinc-500 animate-spin" />
          </div>
        ) : (
          <AnimatePresence>
            {filteredRecordings.map((recording, index) => {
              const TypeIcon = typeIcons[recording.type] || Mic;
              const isDraft = recording.isDraft;
              
              // Determine link destination based on whether it's a draft or session
              const linkTo = isDraft 
                ? createPageUrl('Draft') + `?draft_id=${recording.id}`
                : createPageUrl('Draft') + `?id=${recording.id}`;
              
              return (
                <motion.div
                  key={`${isDraft ? 'draft' : 'session'}-${recording.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`group bg-white dark:bg-[#1a1a24] rounded-2xl border shadow-sm dark:shadow-none p-6 transition-all ${
                    isDraft 
                      ? 'border-amber-300/50 dark:border-amber-500/20 hover:border-amber-400 dark:hover:border-amber-500/40' 
                      : 'border-zinc-200 dark:border-white/5 hover:border-zinc-400 dark:hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                            isDraft
                              ? 'bg-amber-500/20'
                              : 'bg-zinc-100 dark:bg-zinc-800/50'
                          }`}>
                            <TypeIcon className={`w-5 h-5 ${
                              isDraft
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-zinc-700 dark:text-zinc-300'
                            }`} />
                          </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <Link 
                        to={linkTo}
                        state={{ 
                          // Pass full data to avoid unnecessary API calls
                          sessionData: recording,
                          source: recording.source || 'local',
                          isDraft: isDraft,
                        }}
                      >
                        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors truncate">
                          {recording.title || recording.name || recording.question || `${typeLabels[recording.type] || 'Recording'} – ${new Date(recording.createdAt || recording.created_date || Date.now()).toLocaleDateString()}`}
                        </h3>
                      </Link>
                      
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {/* Draft badge - shown first if it's a draft */}
                        {isDraft && (
                          <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            Draft
                          </Badge>
                        )}
                        
                        <Badge className="bg-zinc-100 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-white/10">
                          {typeLabels[recording.type] || 'Recording'}
                        </Badge>
                        
                        {recording.tags && recording.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="border-white/10 text-zinc-500">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-3 text-sm text-zinc-600 dark:text-zinc-500">
                        {!isDraft && (recording.durationSec || recording.duration_seconds) && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(recording.durationSec || recording.duration_seconds)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {formatDate(recording.updatedAt || recording.updated_at || recording.createdAt || recording.created_date)}
                        </span>
                        {!isDraft && (recording.confidenceScore || recording.clarity_score) ? (
                          <span>
                            Confidence: <span className="text-zinc-700 dark:text-zinc-300">{recording.confidenceScore || recording.clarity_score}%</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="More actions"
                            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              const currentTitle = recording.title || recording.name || '';
                              setRenameTarget({
                                id: recording.id,
                                isDraft,
                                currentTitle,
                              });
                              setRenameValue(currentTitle);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600"
                            onSelect={(e) => {
                              e.preventDefault();
                              setDeleteTarget({ id: recording.id, isDraft });
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Link 
                        to={linkTo}
                        state={{ 
                          sessionData: recording,
                          source: recording.source || 'local',
                          isDraft: isDraft,
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        
        {!isLoading && filteredRecordings.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white dark:bg-[#1a1a24] flex items-center justify-center shadow-sm dark:shadow-none border border-zinc-200 dark:border-transparent">
              <FileText className="w-8 h-8 text-zinc-400 dark:text-zinc-600" />
            </div>
            <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-400 mb-2">No recordings found</h3>
            <p className="text-zinc-500 dark:text-zinc-600">Try adjusting your search or filters</p>
          </motion.div>
        )}
      </div>
      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.isDraft ? 'draft' : 'session'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteTarget?.isDraft ? 'draft' : 'session'}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!deleteTarget?.id) return;
              
              if (deleteTarget.isDraft) {
                // Handle draft deletion
                handleDelete(deleteTarget.id, true);
              } else {
                // Handle session deletion (existing logic)
                // optimistic remove from frontend store + local fallback so UI updates immediately
                try { useSessionStore.getState().removeSession(deleteTarget.id); } catch (e) {}
                try { removeLocalRecording(deleteTarget.id); } catch (e) {}
                try { queryClient.setQueryData(['recordings'], (old = []) => (old || []).filter(r => r?.id !== deleteTarget.id)); } catch (e) {}
                // then call remote delete
                deleteMutation.mutate(deleteTarget.id);
              }
              setDeleteTarget(null);
            }} className="bg-rose-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Rename dialog */}
      <AlertDialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open && !isRenaming) {
            setRenameTarget(null);
            setRenameValue('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rename {renameTarget?.isDraft ? 'draft' : 'session'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new name for this {renameTarget?.isDraft ? 'draft' : 'session'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!isRenaming) onConfirmRename();
            }}
            className="mt-2"
          >
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="New name"
              maxLength={200}
              disabled={isRenaming}
            />
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (isRenaming) return;
                setRenameTarget(null);
                setRenameValue('');
              }}
              disabled={isRenaming}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onConfirmRename();
              }}
              disabled={isRenaming || !renameValue.trim()}
            >
              {isRenaming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete All confirmation dialog */}
      <AlertDialog open={showDeleteAllDialog} onOpenChange={(open) => { if (!open) setShowDeleteAllDialog(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all sessions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete all {safeRecordings.length} session{safeRecordings.length !== 1 ? 's' : ''}? 
              This action cannot be undone and all your recordings and drafts will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteAllDialog(false)} disabled={deleteAllMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAll} 
              disabled={deleteAllMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleteAllMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete All'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
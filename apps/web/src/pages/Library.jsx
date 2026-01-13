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
import { sessions as sessionsApi } from '@/components/services/api';
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
  Trash2 as TrashIcon
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

const filterOptions = ['All', 'Application', 'Interview', 'Free Speak'];

export default function Library() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  
  // Use unified session store as authoritative source
  const sessions = useSessionStore(state => state.sessions || []);
  const setSessions = useSessionStore(state => state.setSessions);
  const safeRecordings = Array.isArray(sessions) ? sessions : [];
  
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recording.delete(id),
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
  
  // Fetch sessions on mount
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setIsLoading(true);
        const fetchedSessions = await sessionsApi.listSessions();
        
        // Normalize backend session data to store format
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
            transcript: transcript,
            durationSec: durationSec,
            duration_seconds: durationSec,
            wordsCount: wordsCount,
            words_count: wordsCount,
            confidenceScore: session.confidence_score || session.clarity_score || 0,
            confidence_score: session.confidence_score || 0,
            clarity_score: session.clarity_score || 0,
            fillerCount: session.filler_count || 0,
            filler_count: session.filler_count || 0,
            wordsPerMinute: session.words_per_minute || wordsPerMinute || 0,
            words_per_minute: session.words_per_minute || wordsPerMinute || 0,
            createdAt: session.created_at || new Date().toISOString(),
            created_at: session.created_at || new Date().toISOString(),
            created_date: session.created_at || new Date().toISOString(),
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
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  const filteredRecordings = safeRecordings.filter(rec => {
    const title = (rec && rec.title) ? String(rec.title) : '';
    const tags = Array.isArray(rec?.tags) ? rec.tags : [];
    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tags.some(tag => String(tag).toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = activeFilter === 'All' || 
                         (rec && typeLabels[rec.type] && typeLabels[rec.type].toLowerCase() === activeFilter.toLowerCase());
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
  
  // undo-capable delete: remove from store immediately and show undo toast
  const handleDelete = (id) => {
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
            className="pl-11 bg-white dark:bg-[#1a1a24] border-zinc-300 dark:border-white/5 focus:border-violet-500"
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
                  ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border-violet-500/30' 
                  : 'border-white/10 text-zinc-400 hover:text-white hover:bg-white/5'}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>
      </motion.div>
      
      {/* Recordings List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : (
          <AnimatePresence>
            {filteredRecordings.map((recording, index) => {
              const TypeIcon = typeIcons[recording.type] || Mic;
              return (
                <motion.div
                  key={recording.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="group bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none p-6 hover:border-violet-400 dark:hover:border-violet-500/20 transition-all"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                            recording.type === 'application' ? 'bg-violet-500/20' :
                            recording.type === 'interview' ? 'bg-teal-500/20' : 'bg-amber-500/20'
                          }`}>
                            <TypeIcon className={`w-5 h-5 ${
                              recording.type === 'application' ? 'text-violet-400' :
                              recording.type === 'interview' ? 'text-teal-400' : 'text-amber-400'
                            }`} />
                          </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <Link to={createPageUrl('Draft') + `?id=${recording.id}`}>
                        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate">
                          {recording.title || recording.question || `${typeLabels[recording.type] || 'Recording'} – ${new Date(recording.createdAt || recording.created_date || Date.now()).toLocaleDateString()}`}
                        </h3>
                      </Link>
                      
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        <Badge className={`${
                          recording.type === 'application' ? 'bg-violet-500/20 text-violet-300' :
                          recording.type === 'interview' ? 'bg-teal-500/20 text-teal-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {typeLabels[recording.type] || 'Recording'}
                        </Badge>
                        
                        {recording.tags && recording.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="border-white/10 text-zinc-500">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-3 text-sm text-zinc-600 dark:text-zinc-500">
                        { (recording.durationSec || recording.duration_seconds) && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(recording.durationSec || recording.duration_seconds)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {formatDate(recording.createdAt || recording.created_date)}
                        </span>
                        {recording.confidenceScore || recording.clarity_score ? (
                          <span>
                            Confidence: <span className="text-teal-400">{recording.confidenceScore || recording.clarity_score}%</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(recording.id)}
                        disabled={deleteMutation.isPending}
                        className="text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                      <Link to={createPageUrl('Draft') + `?id=${recording.id}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-zinc-500 hover:text-violet-400"
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
            <AlertDialogTitle>Delete session</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this session? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!deleteTarget) return;
              // optimistic remove from frontend store + local fallback so UI updates immediately
              try { useSessionStore.getState().removeSession(deleteTarget); } catch (e) {}
              try { removeLocalRecording(deleteTarget); } catch (e) {}
              try { queryClient.setQueryData(['recordings'], (old = []) => (old || []).filter(r => r?.id !== deleteTarget)); } catch (e) {}
              // then call remote delete
              deleteMutation.mutate(deleteTarget);
              setDeleteTarget(null);
            }} className="bg-rose-600">Delete</AlertDialogAction>
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
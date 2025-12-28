import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Loader2
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
  const queryClient = useQueryClient();
  
  const { data: recordings = [], isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: () => base44.entities.Recording.list('-created_date'),
  });
  
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recording.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  const safeRecordings = Array.isArray(recordings) ? recordings : [];
  const filteredRecordings = safeRecordings.filter(rec => {
    const title = (rec && rec.title) ? String(rec.title) : '';
    const tags = Array.isArray(rec?.tags) ? rec.tags : [];
    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tags.some(tag => String(tag).toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = activeFilter === 'All' || 
                         (rec && typeLabels[rec.type] && typeLabels[rec.type].toLowerCase() === activeFilter.toLowerCase());
    return matchesSearch && matchesFilter;
  });
  
  const handleDelete = (id) => {
    deleteMutation.mutate(id);
  };
  
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0f] p-6 lg:p-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl lg:text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          Library
        </h1>
        <p className="text-zinc-600 dark:text-zinc-500 text-lg">
          Your collection of recordings and drafts
        </p>
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
                          {recording.title}
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
                        {recording.duration_seconds && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(recording.duration_seconds)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {formatDate(recording.created_date)}
                        </span>
                        {recording.clarity_score && (
                          <span>
                            Clarity: <span className="text-teal-400">{recording.clarity_score}%</span>
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(recording.id)}
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
    </div>
  );
}
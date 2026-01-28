/**
 * Admin Drafts Page
 * 
 * View all drafts (metadata only - no content).
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  FileText, 
  User,
  Calendar,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAdminDrafts } from '@/hooks/useAdminApi';

const DRAFT_TYPES = [
  { value: undefined, label: 'All Types' },
  { value: 'essay', label: 'Essay' },
  { value: 'interview', label: 'Interview' },
];

function DraftRow({ draft }) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
            <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
              {draft.name || 'Untitled Draft'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
              {draft.question || 'No question'}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'px-2 py-1 rounded-full text-xs font-medium capitalize',
          draft.type === 'essay' && 'bg-violet-500/20 text-violet-600 dark:text-violet-400',
          draft.type === 'interview' && 'bg-teal-500/20 text-teal-600 dark:text-teal-400',
          !draft.type && 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
        )}>
          {draft.type || 'unknown'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex items-center gap-1">
          <User className="w-4 h-4" />
          <span className="line-clamp-1 max-w-[150px]" title={draft.user_email}>
            {draft.user_email || 'Unknown'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        {draft.word_limit || '—'}
      </td>
      <td className="px-4 py-3 text-sm">
        {draft.is_user_edited ? (
          <span className="flex items-center gap-1 text-teal-500">
            <Pencil className="w-4 h-4" />
            Edited
          </span>
        ) : (
          <span className="text-zinc-400">No</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-400">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {new Date(draft.created_at).toLocaleDateString()}
        </div>
      </td>
    </motion.tr>
  );
}

export default function AdminDrafts() {
  const [page, setPage] = useState(1);
  const [filterUserId, setFilterUserId] = useState('');
  const [filterType, setFilterType] = useState(undefined);
  
  const { data, isLoading, error } = useAdminDrafts({
    page,
    pageSize: 20,
    userId: filterUserId || undefined,
  });

  // Note: type filter isn't in the backend yet, but we can filter client-side if needed
  const filteredDrafts = filterType 
    ? data?.drafts?.filter(d => d.type === filterType) 
    : data?.drafts;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Drafts
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          View all user drafts (metadata only)
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Filter by user ID..."
            value={filterUserId}
            onChange={(e) => {
              setFilterUserId(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          {DRAFT_TYPES.map(({ value, label }) => (
            <Button
              key={label}
              size="sm"
              variant={filterType === value ? 'default' : 'outline'}
              onClick={() => setFilterType(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Drafts Table */}
      <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-zinc-600 dark:text-zinc-400">
              Failed to load drafts: {error.message}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-[#13131a] border-b border-zinc-200 dark:border-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Draft
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Word Limit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Edited
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                <AnimatePresence mode="popLayout">
                  {filteredDrafts?.map((draft) => (
                    <DraftRow key={draft.id} draft={draft} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            
            {filteredDrafts?.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No drafts found
              </div>
            )}
          </div>
        )}
        
        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-white/5">
            <p className="text-sm text-zinc-500">
              Page {data.page} of {data.total_pages} ({data.total_count} total)
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Note */}
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        <strong>Privacy:</strong> This view shows draft metadata only. Question content, transcripts, and refined text are not accessible through the admin panel.
      </p>
    </div>
  );
}

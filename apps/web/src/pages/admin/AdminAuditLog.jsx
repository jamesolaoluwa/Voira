/**
 * Admin Audit Log Page
 * 
 * View all admin actions for accountability and debugging.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ScrollText, 
  User,
  Calendar,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Ban,
  CheckCircle,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminAuditLog } from '@/hooks/useAdminApi';

const ACTION_ICONS = {
  credit_adjustment: CreditCard,
  user_disabled: Ban,
  user_enabled: CheckCircle,
};

const ACTION_COLORS = {
  credit_adjustment: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  user_disabled: 'text-red-600 dark:text-red-400 bg-red-500/10',
  user_enabled: 'text-teal-600 dark:text-teal-400 bg-teal-500/10',
};

const ACTION_FILTERS = [
  { value: undefined, label: 'All Actions' },
  { value: 'credit_adjustment', label: 'Credit Adjustments' },
  { value: 'user_disabled', label: 'Disables' },
  { value: 'user_enabled', label: 'Enables' },
];

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

function AuditLogEntry({ entry }) {
  const Icon = ACTION_ICONS[entry.action] || ScrollText;
  const colorClass = ACTION_COLORS[entry.action] || 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10';
  
  // Format details for display
  const getActionDescription = () => {
    const details = entry.details || {};
    
    switch (entry.action) {
      case 'credit_adjustment':
        const amount = details.amount || 0;
        const prefix = amount > 0 ? '+' : '';
        return (
          <span>
            Adjusted credits by <strong className={amount > 0 ? 'text-teal-500' : 'text-red-500'}>
              {prefix}{amount}
            </strong>
            {details.reason && (
              <span className="text-zinc-400"> — "{details.reason}"</span>
            )}
          </span>
        );
      case 'user_disabled':
        return (
          <span>
            Disabled account
            {details.reason && (
              <span className="text-zinc-400"> — "{details.reason}"</span>
            )}
          </span>
        );
      case 'user_enabled':
        return <span>Enabled account</span>;
      default:
        return <span>{entry.action.replace(/_/g, ' ')}</span>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-4 p-4 bg-white dark:bg-[#1a1a24] rounded-xl border border-zinc-200 dark:border-white/5"
    >
      <div className={cn('p-2 rounded-lg shrink-0', colorClass)}>
        <Icon className="w-5 h-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {entry.admin_email}
          </span>
          <span className="text-zinc-400">→</span>
          <span className="text-zinc-600 dark:text-zinc-400 text-sm">
            {entry.target_type}: {entry.target_id?.slice(0, 8)}...
          </span>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {getActionDescription()}
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatTimestamp(entry.created_at)}
          </span>
          {entry.ip_address && (
            <span>IP: {entry.ip_address}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminAuditLog() {
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState(undefined);
  
  const { data, isLoading, error } = useAdminAuditLog({
    page,
    pageSize: 30,
    action: filterAction,
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Audit Log
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Complete history of admin actions for accountability
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-zinc-400" />
        {ACTION_FILTERS.map(({ value, label }) => (
          <Button
            key={label}
            size="sm"
            variant={filterAction === value ? 'default' : 'outline'}
            onClick={() => { setFilterAction(value); setPage(1); }}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Audit Log List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-zinc-600 dark:text-zinc-400">
            Failed to load audit log: {error.message}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {data?.entries?.map((entry) => (
              <AuditLogEntry key={entry.id} entry={entry} />
            ))}
          </AnimatePresence>
          
          {data?.entries?.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-[#1a1a24] rounded-xl border border-zinc-200 dark:border-white/5">
              <ScrollText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500">No audit log entries found</p>
            </div>
          )}
        </div>
      )}
        
      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between py-3">
          <p className="text-sm text-zinc-500">
            Page {data.page} of {data.total_pages} ({data.total_count} entries)
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

      {/* Info Note */}
      <p className="text-sm text-zinc-400 dark:text-zinc-500">
        All admin write actions are logged permanently. Audit logs cannot be deleted or modified.
      </p>
    </div>
  );
}

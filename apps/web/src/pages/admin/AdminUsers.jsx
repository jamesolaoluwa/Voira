/**
 * Admin Users Page
 * 
 * View and manage users - adjust credits, disable/enable accounts.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  User, 
  CreditCard, 
  Ban, 
  CheckCircle,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { 
  useAdminUsers, 
  useAdminUserDetail,
  useAdjustCredits, 
  useDisableUser, 
  useEnableUser 
} from '@/hooks/useAdminApi';

// ============================================
// USER ROW COMPONENT
// ============================================

function UserRow({ user, onSelect }) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => onSelect(user)}
      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
            <User className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {user.full_name || 'Unknown'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {user.email}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        <span className={cn(
          'px-2 py-1 rounded-full text-xs font-medium',
          user.role === 'premium_user' 
            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
        )}>
          {user.role?.replace('_', ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex items-center gap-1">
          <CreditCard className="w-4 h-4" />
          {user.credits_remaining}
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        {user.is_disabled ? (
          <span className="flex items-center gap-1 text-red-500">
            <Ban className="w-4 h-4" />
            Disabled
          </span>
        ) : (
          <span className="flex items-center gap-1 text-teal-500">
            <CheckCircle className="w-4 h-4" />
            Active
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-400">
        {new Date(user.created_at).toLocaleDateString()}
      </td>
    </motion.tr>
  );
}

// ============================================
// USER DETAIL MODAL
// ============================================

function UserDetailModal({ userId, onClose }) {
  const { data: user, isLoading, error } = useAdminUserDetail(userId);
  const adjustCredits = useAdjustCredits();
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  
  const [creditAmount, setCreditAmount] = useState(10);
  const [actionReason, setActionReason] = useState('');
  const [activeAction, setActiveAction] = useState(null); // 'credits' | 'disable' | null

  const handleAdjustCredits = async (delta) => {
    if (!actionReason || actionReason.length < 10) {
      alert('Please provide a reason (at least 10 characters)');
      return;
    }
    
    const current = user?.credits_remaining ?? 0;
    const newCredits = Math.max(0, current + delta);

    try {
      await adjustCredits.mutateAsync({
        userId,
        amount: newCredits,
        reason: actionReason,
      });
      setActionReason('');
      setActiveAction(null);
    } catch (err) {
      alert(`Failed to adjust credits: ${err.message}`);
    }
  };

  const handleToggleDisable = async () => {
    if (!user.is_disabled && (!actionReason || actionReason.length < 10)) {
      alert('Please provide a reason (at least 10 characters)');
      return;
    }
    
    try {
      if (user.is_disabled) {
        await enableUser.mutateAsync({ userId });
      } else {
        await disableUser.mutateAsync({ userId, reason: actionReason });
      }
      setActionReason('');
      setActiveAction(null);
    } catch (err) {
      alert(`Failed to ${user.is_disabled ? 'enable' : 'disable'} user: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center">
              <User className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {user?.full_name || 'User Details'}
              </h2>
              <p className="text-sm text-zinc-500">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-zinc-600 dark:text-zinc-400">
                Failed to load user details
              </p>
            </div>
          ) : (
            <>
              {/* User Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Role</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                    {user?.role?.replace('_', ' ')}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Credits</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {user?.credits_remaining}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Status</p>
                  <p className={cn(
                    'text-sm font-medium',
                    user?.is_disabled ? 'text-red-500' : 'text-teal-500'
                  )}>
                    {user?.is_disabled ? 'Disabled' : 'Active'}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Sessions</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {user?.session_count ?? 0}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Drafts</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {user?.draft_count ?? 0}
                  </p>
                </div>
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4">
                  <p className="text-xs text-zinc-500 mb-1">Joined</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Actions
                </h3>
                
                {/* Credit Adjustment */}
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-amber-500" />
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        Adjust Credits
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveAction(activeAction === 'credits' ? null : 'credits')}
                    >
                      {activeAction === 'credits' ? 'Cancel' : 'Adjust'}
                    </Button>
                  </div>
                  
                  {activeAction === 'credits' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => handleAdjustCredits(-creditAmount)}
                          disabled={adjustCredits.isPending}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                          className="w-20 text-center"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => handleAdjustCredits(creditAmount)}
                          disabled={adjustCredits.isPending}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div>
                        <Label className="text-xs text-zinc-500">Reason (required)</Label>
                        <Input
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          placeholder="e.g., Compensation for bug, Support request..."
                          className="mt-1"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Disable/Enable */}
                <div className="bg-zinc-50 dark:bg-[#13131a] rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Ban className="w-5 h-5 text-red-500" />
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {user?.is_disabled ? 'Enable Account' : 'Disable Account'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={user?.is_disabled ? 'default' : 'destructive'}
                      onClick={() => {
                        if (user?.is_disabled) {
                          handleToggleDisable();
                        } else {
                          setActiveAction(activeAction === 'disable' ? null : 'disable');
                        }
                      }}
                      disabled={disableUser.isPending || enableUser.isPending}
                    >
                      {user?.is_disabled ? 'Enable' : activeAction === 'disable' ? 'Cancel' : 'Disable'}
                    </Button>
                  </div>
                  
                  {activeAction === 'disable' && !user?.is_disabled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-3"
                    >
                      <div>
                        <Label className="text-xs text-zinc-500">Reason (required)</Label>
                        <Input
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          placeholder="e.g., Violation of ToS, Abuse detected..."
                          className="mt-1"
                        />
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleToggleDisable}
                        disabled={disableUser.isPending || actionReason.length < 10}
                      >
                        Confirm Disable
                      </Button>
                    </motion.div>
                  )}
                  
                  {user?.is_disabled && user?.disabled_reason && (
                    <p className="text-xs text-zinc-500">
                      Disabled for: {user.disabled_reason}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// MAIN USERS PAGE
// ============================================

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [searchEmail, setSearchEmail] = useState('');
  const [filterDisabled, setFilterDisabled] = useState(undefined);
  const [selectedUserId, setSelectedUserId] = useState(null);
  
  const { data, isLoading, error } = useAdminUsers({
    page,
    pageSize: 20,
    email: searchEmail || undefined,
    disabled: filterDisabled,
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Users
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          View and manage user accounts
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Search by email..."
            value={searchEmail}
            onChange={(e) => {
              setSearchEmail(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filterDisabled === undefined ? 'default' : 'outline'}
            onClick={() => { setFilterDisabled(undefined); setPage(1); }}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={filterDisabled === false ? 'default' : 'outline'}
            onClick={() => { setFilterDisabled(false); setPage(1); }}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={filterDisabled === true ? 'default' : 'outline'}
            onClick={() => { setFilterDisabled(true); setPage(1); }}
          >
            Disabled
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-[#1a1a24] rounded-2xl border border-zinc-200 dark:border-white/5 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-zinc-600 dark:text-zinc-400">
              Failed to load users: {error.message}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-[#13131a] border-b border-zinc-200 dark:border-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Credits
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                <AnimatePresence mode="popLayout">
                  {data?.users?.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      onSelect={(u) => setSelectedUserId(u.id)}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            
            {data?.users?.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No users found
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

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUserId && (
          <UserDetailModal
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

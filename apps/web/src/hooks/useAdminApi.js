/**
 * Admin API Hooks
 * 
 * React Query hooks for admin dashboard data fetching and mutations.
 * Provides caching, refetching, and optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/adminApi';

// Query key factory for consistent cache management
export const adminQueryKeys = {
  all: ['admin'],
  users: () => [...adminQueryKeys.all, 'users'],
  usersList: (params) => [...adminQueryKeys.users(), 'list', params],
  userDetail: (userId) => [...adminQueryKeys.users(), 'detail', userId],
  sessions: () => [...adminQueryKeys.all, 'sessions'],
  sessionsList: (params) => [...adminQueryKeys.sessions(), 'list', params],
  drafts: () => [...adminQueryKeys.all, 'drafts'],
  draftsList: (params) => [...adminQueryKeys.drafts(), 'list', params],
  analytics: () => [...adminQueryKeys.all, 'analytics'],
  analyticsData: (params) => [...adminQueryKeys.analytics(), params],
  auditLog: () => [...adminQueryKeys.all, 'audit-log'],
  auditLogList: (params) => [...adminQueryKeys.auditLog(), 'list', params],
};

// ============================================
// USER HOOKS
// ============================================

/**
 * Fetch paginated user list
 * @param {Object} params - Query parameters
 * @param {number} [params.page=1] - Page number
 * @param {number} [params.pageSize=20] - Items per page
 * @param {string} [params.email] - Email filter
 * @param {boolean} [params.disabled] - Disabled status filter
 * @param {Object} options - React Query options
 */
export function useAdminUsers(params = {}, options = {}) {
  return useQuery({
    queryKey: adminQueryKeys.usersList(params),
    queryFn: () => adminApi.users.list(params),
    staleTime: 30_000, // 30 seconds
    ...options,
  });
}

/**
 * Fetch single user details
 * @param {string} userId - User ID
 * @param {Object} options - React Query options
 */
export function useAdminUserDetail(userId, options = {}) {
  return useQuery({
    queryKey: adminQueryKeys.userDetail(userId),
    queryFn: () => adminApi.users.get(userId),
    enabled: !!userId,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Mutation to adjust user credits
 * Invalidates user list and detail on success
 */
export function useAdjustCredits() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, amount, reason }) => 
      adminApi.users.adjustCredits(userId, amount, reason),
    onSuccess: (_, { userId }) => {
      // Invalidate user queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
      // Also invalidate audit log since this creates an entry
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.auditLog() });
    },
  });
}

/**
 * Mutation to disable a user account
 * Invalidates user list and detail on success
 */
export function useDisableUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, reason }) => 
      adminApi.users.disable(userId, reason),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.auditLog() });
    },
  });
}

/**
 * Mutation to enable a disabled user account
 * Invalidates user list and detail on success
 */
export function useEnableUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId }) => adminApi.users.enable(userId),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.auditLog() });
    },
  });
}

// ============================================
// SESSION HOOKS
// ============================================

/**
 * Fetch paginated session list (metadata only)
 * @param {Object} params - Query parameters
 * @param {number} [params.page=1] - Page number
 * @param {number} [params.pageSize=20] - Items per page
 * @param {string} [params.userId] - User ID filter
 * @param {string} [params.type] - Session type filter
 * @param {Object} options - React Query options
 */
export function useAdminSessions(params = {}, options = {}) {
  return useQuery({
    queryKey: adminQueryKeys.sessionsList(params),
    queryFn: () => adminApi.sessions.list(params),
    staleTime: 30_000,
    ...options,
  });
}

// ============================================
// DRAFT HOOKS
// ============================================

/**
 * Fetch paginated draft list (metadata only)
 * @param {Object} params - Query parameters
 * @param {number} [params.page=1] - Page number
 * @param {number} [params.pageSize=20] - Items per page
 * @param {string} [params.userId] - User ID filter
 * @param {Object} options - React Query options
 */
export function useAdminDrafts(params = {}, options = {}) {
  return useQuery({
    queryKey: adminQueryKeys.draftsList(params),
    queryFn: () => adminApi.drafts.list(params),
    staleTime: 30_000,
    ...options,
  });
}

// ============================================
// ANALYTICS HOOKS
// ============================================

/**
 * Fetch admin dashboard analytics
 * @param {Object} params - Query parameters
 * @param {number} [params.days=30] - Number of days
 * @param {Object} options - React Query options
 */
export function useAdminAnalytics(params = {}, options = {}) {
  return useQuery({
    queryKey: adminQueryKeys.analyticsData(params),
    queryFn: () => adminApi.analytics.get(params),
    staleTime: 60_000, // 1 minute - analytics don't change that fast
    ...options,
  });
}

// ============================================
// AUDIT LOG HOOKS
// ============================================

/**
 * Fetch paginated audit log
 * @param {Object} params - Query parameters
 * @param {number} [params.page=1] - Page number
 * @param {number} [params.pageSize=50] - Items per page
 * @param {string} [params.adminId] - Admin ID filter
 * @param {string} [params.action] - Action type filter
 * @param {string} [params.targetType] - Target type filter
 * @param {Object} options - React Query options
 */
export function useAdminAuditLog(params = {}, options = {}) {
  return useQuery({
    queryKey: adminQueryKeys.auditLogList(params),
    queryFn: () => adminApi.auditLog.list(params),
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Fetch audit log statistics for growth monitoring
 * @param {Object} options - React Query options
 */
export function useAdminAuditLogStats(options = {}) {
  return useQuery({
    queryKey: ['admin', 'auditLogStats'],
    queryFn: () => adminApi.auditLog.getStats(),
    staleTime: 60_000, // 1 minute
    ...options,
  });
}

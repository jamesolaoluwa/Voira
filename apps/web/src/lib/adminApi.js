/**
 * Admin API Client
 * 
 * Provides functions for admin dashboard operations.
 * All endpoints require admin privileges - backend enforces via require_admin() dependency.
 * 
 * Security:
 * - All requests include auth token via apiClient
 * - Backend rejects non-admin users with 403
 * - No sensitive data (transcripts, audio) exposed through these endpoints
 */

import { apiClient } from '@/lib/apiClient';

// ============================================
// USERS
// ============================================

export const adminUsers = {
  /**
   * List all users with pagination and optional filters
   * @param {Object} params - Query parameters
   * @param {number} [params.page=1] - Page number (1-indexed)
   * @param {number} [params.pageSize=20] - Items per page
   * @param {string} [params.email] - Filter by email (partial match)
   * @param {boolean} [params.disabled] - Filter by disabled status
   */
  async list({ page = 1, pageSize = 20, email, disabled } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    
    if (email) params.append('email', email);
    if (disabled !== undefined) params.append('disabled', String(disabled));
    
    return apiClient.get(`/admin/users?${params}`);
  },

  /**
   * Get detailed information about a specific user
   * @param {string} userId - User ID
   */
  async get(userId) {
    return apiClient.get(`/admin/users/${userId}`);
  },

  /**
   * Adjust a user's credit balance
   * @param {string} userId - User ID
   * @param {number} amount - Credit adjustment (positive = add, negative = subtract)
   * @param {string} reason - Reason for adjustment (required, min 10 chars)
   */
  async adjustCredits(userId, newCredits, reason) {
    return apiClient.post(`/admin/users/${userId}/credits`, {
      new_credits: newCredits,
      reason,
    });
  },

  /**
   * Disable a user account
   * @param {string} userId - User ID
   * @param {string} reason - Reason for disabling (required, min 10 chars)
   */
  async disable(userId, reason) {
    return apiClient.post(`/admin/users/${userId}/disable`, {
      reason,
    });
  },

  /**
   * Enable a previously disabled user account
   * @param {string} userId - User ID
   */
  async enable(userId) {
    return apiClient.post(`/admin/users/${userId}/enable`, {});
  },
};

// ============================================
// SESSIONS
// ============================================

export const adminSessions = {
  /**
   * List all sessions with pagination and optional filters
   * NOTE: Returns metadata only - no transcript/audio content
   * 
   * @param {Object} params - Query parameters
   * @param {number} [params.page=1] - Page number (1-indexed)
   * @param {number} [params.pageSize=20] - Items per page
   * @param {string} [params.userId] - Filter by user ID
   * @param {string} [params.type] - Filter by session type (essay, interview, etc.)
   */
  async list({ page = 1, pageSize = 20, userId, type } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    
    if (userId) params.append('user_id', userId);
    if (type) params.append('type', type);
    
    return apiClient.get(`/admin/sessions?${params}`);
  },
};

// ============================================
// DRAFTS
// ============================================

export const adminDrafts = {
  /**
   * List all drafts with pagination and optional filters
   * NOTE: Returns metadata only - no transcript/content
   * 
   * @param {Object} params - Query parameters
   * @param {number} [params.page=1] - Page number (1-indexed)
   * @param {number} [params.pageSize=20] - Items per page
   * @param {string} [params.userId] - Filter by user ID
   */
  async list({ page = 1, pageSize = 20, userId } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    
    if (userId) params.append('user_id', userId);
    
    return apiClient.get(`/admin/drafts?${params}`);
  },
};

// ============================================
// ANALYTICS
// ============================================

export const adminAnalytics = {
  /**
   * Get aggregate analytics for the admin dashboard
   * @param {Object} params - Query parameters
   * @param {number} [params.days=30] - Number of days to include
   */
  async get({ days = 30 } = {}) {
    return apiClient.get(`/admin/analytics?days=${days}`);
  },
};

// ============================================
// AUDIT LOG
// ============================================

export const adminAuditLog = {
  /**
   * List audit log entries with pagination and optional filters
   * @param {Object} params - Query parameters
   * @param {number} [params.page=1] - Page number (1-indexed)
   * @param {number} [params.pageSize=50] - Items per page
   * @param {string} [params.adminId] - Filter by admin who performed action
   * @param {string} [params.action] - Filter by action type
   * @param {string} [params.targetType] - Filter by target type (user, session, etc.)
   */
  async list({ page = 1, pageSize = 50, adminId, action, targetType } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    
    if (adminId) params.append('admin_id', adminId);
    if (action) params.append('action', action);
    if (targetType) params.append('target_type', targetType);
    
    return apiClient.get(`/admin/audit-log?${params}`);
  },

  /**
   * Get audit log statistics for growth monitoring
   * @returns {Promise<Object>} Stats including total entries, recent counts, oldest/newest dates
   */
  async getStats() {
    return apiClient.get('/admin/audit-log/stats');
  },
};

// Export all as namespace
export const adminApi = {
  users: adminUsers,
  sessions: adminSessions,
  drafts: adminDrafts,
  analytics: adminAnalytics,
  auditLog: adminAuditLog,
};

export default adminApi;

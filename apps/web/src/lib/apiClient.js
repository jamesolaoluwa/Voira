/**
 * API Client for backend communication
 * Handles authentication headers, timeouts, and error handling
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Get auth token from Supabase session
 */
async function getAuthToken() {
  const { supabase } = await import('@/components/lib/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Make authenticated API request
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @param {boolean} options.requireAuth - If true, throws if no auth token available (default: false)
 * @param {number} options.timeoutMs - Request timeout in milliseconds (default: 30000)
 */
async function apiRequest(endpoint, options = {}) {
  const { requireAuth = false, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const token = await getAuthToken();
  
  if (requireAuth && !token) {
    const error = new Error('Authentication required but no session available');
    error.status = 401;
    error.code = 'NO_SESSION';
    throw error;
  }
  
  const isFormData = fetchOptions.body instanceof FormData;
  const headers = {};
  
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  Object.assign(headers, fetchOptions.headers);
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    const error = new Error(errorData.detail || `API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  
  return response.json();
}

export const apiClient = {
  get: (endpoint, options = {}) => apiRequest(endpoint, { method: 'GET', ...options }),
  post: (endpoint, data, options = {}) => {
    if (data instanceof FormData) {
      return apiRequest(endpoint, {
        method: 'POST',
        body: data,
        ...options,
      });
    }
    return apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options,
    });
  },
  put: (endpoint, data, options = {}) => apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...options,
  }),
  delete: (endpoint, options = {}) => apiRequest(endpoint, { method: 'DELETE', ...options }),
};

/**
 * Fetch a short-lived WebSocket ticket (avoids putting JWTs in query strings).
 */
export async function fetchWebSocketTicket() {
  const result = await apiClient.post('/ws/ticket', {}, { requireAuth: true, timeoutMs: 10000 });
  if (!result?.ticket) {
    throw new Error('Failed to obtain WebSocket ticket');
  }
  return result.ticket;
}

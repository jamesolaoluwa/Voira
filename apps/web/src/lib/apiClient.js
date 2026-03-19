/**
 * API Client for backend communication
 * Handles authentication headers and error handling
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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
 */
async function apiRequest(endpoint, options = {}) {
  const { requireAuth = false, ...fetchOptions } = options;
  const token = await getAuthToken();
  
  // Guard: If endpoint requires auth but no token, fail fast without making request
  if (requireAuth && !token) {
    const error = new Error('Authentication required but no session available');
    error.status = 401;
    error.code = 'NO_SESSION';
    throw error;
  }
  
  // For FormData, let browser set Content-Type with boundary
  // For JSON, set Content-Type explicitly
  const isFormData = fetchOptions.body instanceof FormData;
  const headers = {};
  
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Merge any provided headers (FormData uploads can override)
  Object.assign(headers, fetchOptions.headers);
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: response.statusText }));
    const error = new Error(errorData.detail || `API error: ${response.status}`);
    error.status = response.status; // Attach status code for error handling
    throw error;
  }
  
  return response.json();
}

export const apiClient = {
  get: (endpoint, options = {}) => apiRequest(endpoint, { method: 'GET', ...options }),
  post: (endpoint, data, options = {}) => {
    // Support both JSON and FormData
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


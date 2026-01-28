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
 */
async function apiRequest(endpoint, options = {}) {
  const token = await getAuthToken();
  
  // For FormData, let browser set Content-Type with boundary
  // For JSON, set Content-Type explicitly
  const isFormData = options.body instanceof FormData;
  const headers = {};
  
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  
  // Merge any provided headers (FormData uploads can override)
  Object.assign(headers, options.headers);
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
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
  get: (endpoint) => apiRequest(endpoint, { method: 'GET' }),
  post: (endpoint, data) => {
    // Support both JSON and FormData
    if (data instanceof FormData) {
      return apiRequest(endpoint, {
        method: 'POST',
        body: data,
      });
    }
    return apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  put: (endpoint, data) => apiRequest(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  delete: (endpoint) => apiRequest(endpoint, { method: 'DELETE' }),
};


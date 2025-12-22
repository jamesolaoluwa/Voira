import { createClient } from '@base44/sdk';
// import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// Create a client with authentication required
export const base44 = createClient({
  appId: "694481d7a7391caf3ba6ba15", 
  requiresAuth: true // Ensure authentication is required for all operations
});

import { createClient } from '@supabase/supabase-js';

// Supabase configuration - MUST be set via environment variables
// These have no valid defaults - app will fail gracefully if not configured
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate configuration at startup
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Missing required environment variables: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY. ' +
    'Authentication and database features will not work.'
  );
}

// Create client with fallback empty strings to prevent crash
// Operations will fail but app can still render
export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co', 
  supabaseAnonKey || 'invalid-key'
);
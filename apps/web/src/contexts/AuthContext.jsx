import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/components/lib/supabase';
import { auth as apiAuth } from '@/components/services/api';
import { isAdminByEmail } from '@/lib/isAdmin';

const AuthContext = createContext(null);

// Timeout for profile fetch operations
const PROFILE_FETCH_TIMEOUT_MS = 10000;

/**
 * Detect if we're in the middle of an OAuth redirect.
 * Supabase v2 uses URL hash for implicit flow or query params for PKCE.
 * During redirect, we should NOT call /auth/me - let onAuthStateChange handle it.
 */
function isOAuthRedirectInProgress() {
  const hash = window.location.hash;
  const search = window.location.search;
  
  // Check for OAuth tokens in hash (implicit flow)
  if (hash.includes('access_token=') || hash.includes('refresh_token=')) {
    return true;
  }
  
  // Check for OAuth code in query params (PKCE flow)
  if (search.includes('code=') && search.includes('state=')) {
    return true;
  }
  
  // Check for error responses from OAuth
  if (hash.includes('error=') || search.includes('error=')) {
    return true;
  }
  
  return false;
}

/**
 * Build fallback user profile from session data when backend is unavailable
 */
function buildFallbackUser(session) {
  return {
    id: session.user.id,
    email: session.user.email,
    full_name: session.user.user_metadata?.full_name || 'User',
    role: session.user.user_metadata?.role || 'free_user',
    // Default credits for fallback - will be updated when backend is available
    credits_remaining: 10,
    monthly_credit_allowance: 10,
  };
}

/**
 * Promise wrapper that adds a timeout
 */
function withTimeout(promise, ms, errorMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), ms)
    )
  ]);
}

/**
 * Fetch user profile from backend, with session guard and timeout.
 * Only calls /auth/me if session has a valid access token.
 * Falls back to session data if backend is slow or unavailable.
 */
async function fetchUserProfile(session) {
  if (!session?.access_token) {
    console.debug('[AuthContext] No access token, skipping /auth/me');
    return null;
  }
  
  try {
    // Add timeout to prevent hanging if backend is slow/down
    const richer = await withTimeout(
      apiAuth.getMe(),
      PROFILE_FETCH_TIMEOUT_MS,
      'Profile fetch timed out'
    );
    return richer || buildFallbackUser(session);
  } catch (e) {
    console.warn('[AuthContext] getMe failed, using fallback:', e.message);
    return buildFallbackUser(session);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const lastCheckedEmailRef = useRef(null);
  
  // Track if we've already fetched profile for this session to prevent duplicates
  const lastFetchedSessionIdRef = useRef(null);
  // Track if initial load is complete
  const initialLoadCompleteRef = useRef(false);

  // Function to manually refresh user profile (e.g., after subscription changes)
  const refreshUser = useCallback(async () => {
    if (!session?.access_token) {
      console.debug('[AuthContext] refreshUser: No session, skipping');
      return null;
    }
    try {
      console.debug('[AuthContext] refreshUser: Fetching fresh profile');
      const profile = await fetchUserProfile(session);
      setUser(profile);
      return profile;
    } catch (e) {
      console.warn('[AuthContext] refreshUser failed:', e.message);
      return null;
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;

    // Helper to process session and fetch profile
    async function processSession(newSession) {
      if (!mounted) return;
      
      try {
        setSession(newSession ?? null);
        
        if (newSession?.user) {
          const sessionId = newSession.access_token?.substring(0, 20);
          
          // Only fetch if this is a new session
          if (sessionId !== lastFetchedSessionIdRef.current) {
            lastFetchedSessionIdRef.current = sessionId;
            const profile = await fetchUserProfile(newSession);
            if (mounted) setUser(profile);
          }
        } else {
          lastFetchedSessionIdRef.current = null;
          setUser(null);
          setIsAdmin(false);
        }
      } catch (e) {
        console.error('[AuthContext] Error processing session:', e);
        // On error, still clear loading state
        if (mounted) {
          setUser(null);
          setSession(null);
        }
      } finally {
        if (mounted) {
          initialLoadCompleteRef.current = true;
          setIsLoading(false);
        }
      }
    }

    // 1. Subscribe to auth changes FIRST
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.debug('[AuthContext] onAuthStateChange:', event, 'hasSession:', !!newSession);
      await processSession(newSession);
    });

    // 2. Get initial session immediately (covers page load and OAuth redirect)
    // Supabase v2 getSession() automatically processes OAuth tokens from URL
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      console.debug('[AuthContext] Initial getSession:', !!initialSession);
      // Only process if we haven't already completed initial load
      if (mounted && !initialLoadCompleteRef.current) {
        await processSession(initialSession);
      }
    }).catch((e) => {
      console.error('[AuthContext] getSession failed:', e);
      if (mounted && !initialLoadCompleteRef.current) {
        initialLoadCompleteRef.current = true;
        setSession(null);
        setUser(null);
        setIsLoading(false);
      }
    });

    // Cleanup
    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  // Ensure admin check runs only when a fully-hydrated session user email is available
  // This guarantees we don't call isAdminByEmail with null/undefined and that the
  // check re-runs whenever the authenticated user changes (login/logout/refresh).
  useEffect(() => {
    let mounted = true;

    // If session is explicitly null (signed out), clear admin flag.
    if (session === null) {
      if (mounted) {
        setIsAdmin(false);
        lastCheckedEmailRef.current = null;
      }
      return () => { mounted = false; };
    }

    // Prefer the richer `user` email (from getMe) falling back to session.user.email
    const rawEmail = user?.email || session?.user?.email;
    const email = rawEmail ? String(rawEmail).toLowerCase().trim() : null;

    if (!email) {
      // No email available yet; do not modify isAdmin (avoid stomping existing true value).
      return () => { mounted = false; };
    }

    (async () => {
      try {
        const adminCheck = await isAdminByEmail(email);
        if (!mounted) return;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug(`[AuthContext] isAdmin check for ${email}:`, adminCheck);
        }

        // If result is true, set admin and record the checked email.
        if (adminCheck === true) {
          setIsAdmin(true);
          lastCheckedEmailRef.current = email;
          return;
        }

        // If result is false, only clear admin if this is a different email than
        // the one we previously marked as admin (prevents overwriting true for same email).
        if (lastCheckedEmailRef.current !== email) {
          setIsAdmin(false);
          lastCheckedEmailRef.current = email;
        }
      } catch (e) {
        // On error, avoid clearing a previously-true admin flag.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[AuthContext] isAdmin check failed for', email, e);
        }
      }
    })();

    return () => { mounted = false; };
  }, [user?.email, session?.user?.email, session]);

  const signOut = async () => {
    try {
      await apiAuth.signOut();
    } finally {
      setUser(null);
      setSession(null);
      setIsAdmin(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;

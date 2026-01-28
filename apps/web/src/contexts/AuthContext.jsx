import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/components/lib/supabase';
import { auth as apiAuth, processOAuthRedirect } from '@/components/services/api';
import { isAdminByEmail } from '@/lib/isAdmin';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const lastCheckedEmailRef = React.useRef(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      setIsLoading(true);

      // If redirected from OAuth, parse the URL fragment/auth codes first and store session.
      // We avoid cleaning the URL until after we have a valid session to prevent losing tokens
      // before they are processed by the Supabase client.
      if (typeof window !== 'undefined' && (window.location.href.includes('access_token') || window.location.href.includes('code') || window.location.href.includes('token'))) {
        console.debug('[AuthContext] Detected OAuth/verify redirect in URL, calling processOAuthRedirect');
        try {
          const parsed = await processOAuthRedirect();
          console.debug('[AuthContext] processOAuthRedirect result', parsed);
          // Only clean the URL if we have a session now
          if (parsed && parsed.user) {
            try { history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch (e) { }
          }
        } catch (e) { console.warn('[AuthContext] processOAuthRedirect failed', e); }
      }

      try {
        console.debug('[AuthContext] fetching session with apiAuth.getSession()');
        const s = await apiAuth.getSession();
        console.debug('[AuthContext] getSession result', s);
        if (!mounted) return;
        setSession(s);

  if (s && s.user) {
          // try to get richer profile
          try {
            console.debug('[AuthContext] fetching richer profile with apiAuth.getMe()');
            const richer = await apiAuth.getMe();
            console.debug('[AuthContext] getMe result', richer);
            if (!mounted) return;
            const finalUser = richer || {
              id: s.user.id,
              email: s.user.email,
              full_name: s.user.user_metadata?.full_name || 'User',
              role: s.user.user_metadata?.role || 'free_user',
            };
            setUser(finalUser);
          } catch (e) {
            console.warn('[AuthContext] getMe failed', e);
            const fallbackUser = {
              id: s.user.id,
              email: s.user.email,
              full_name: s.user.user_metadata?.full_name || 'User',
              role: s.user.user_metadata?.role || 'free_user',
            };
            setUser(fallbackUser);
            setUser(fallbackUser);
          }
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      } catch (e) {
        console.warn('[AuthContext] error fetching session/profile', e);
        setUser(null);
        setSession(null);
      } finally {
        if (mounted) setIsLoading(false);
      }

      // subscribe to auth changes
      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return;
        setSession(session ?? null);
        if (session && session.user) {
          try {
            const richer = await apiAuth.getMe();
            const finalUser = richer || { id: session.user.id, email: session.user.email };
            setUser(finalUser);
          } catch (e) {
            const fallbackUser = { id: session.user.id, email: session.user.email };
            setUser(fallbackUser);
          }
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      });

      return () => {
        mounted = false;
        if (listener?.subscription) listener.subscription.unsubscribe();
      };
    }

    const cleanup = init();
    return () => { if (cleanup && typeof cleanup.then === 'function') cleanup.then(fn => fn).catch(()=>{}); };
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
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { supabase } from '@/components/lib/supabase'
import { initSentry, setUser as setSentryUser } from '@/lib/sentry.jsx'

// Initialize Sentry for error tracking (must be done before app renders)
initSentry();

async function bootstrap() {
    // If the app was redirected back from an OAuth provider, Supabase
    // may include session info in the URL. getSessionFromUrl parses that
    // and returns the session so the client is populated.
    // However, we must NOT run this when serving the password recovery page
    // because recovery tokens live in the hash and need isolated handling.
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    if (pathname !== '/reset-password' && typeof window !== 'undefined' && window.location.href.includes('access_token')) {
        try {
            await supabase.auth.getSessionFromUrl({ storeSession: true });
            // Clean up the URL by removing the hash fragment (optional)
            history.replaceState({}, document.title, window.location.pathname + window.location.search);
        } catch (e) {
            // ignore; fallback to normal flow
            console.warn('Error parsing auth session from URL', e);
        }
    }

    // Set up Sentry user context when auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            setSentryUser(session.user.id, session.user.email);
        } else {
            setSentryUser(null);
        }
    });

    ReactDOM.createRoot(document.getElementById('root')).render(
        <App />
    );
}

bootstrap();
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { supabase } from '@/components/lib/supabase'
import { initSentry, setUser as setSentryUser } from '@/lib/sentry.jsx'

// Initialize Sentry for error tracking (must be done before app renders)
initSentry();

async function bootstrap() {
    // Supabase v2 automatically handles OAuth redirects and session persistence.
    // When redirected back from Google OAuth, Supabase detects the tokens in the
    // URL hash and processes them automatically via onAuthStateChange.
    // No manual URL parsing is needed.

    // Set up Sentry user context when auth state changes
    // This also handles OAuth redirects - Supabase will fire SIGNED_IN event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            setSentryUser(session.user.id, session.user.email);
        } else {
            setSentryUser(null);
        }
        
        // Clean up URL hash after OAuth redirect (optional, improves UX)
        if (event === 'SIGNED_IN' && window.location.hash.includes('access_token')) {
            // Use replaceState to remove tokens from URL without page reload
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
    });

    ReactDOM.createRoot(document.getElementById('root')).render(
        <App />
    );
}

bootstrap();
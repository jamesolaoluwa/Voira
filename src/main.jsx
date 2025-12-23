import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { supabase } from '@/components/lib/supabase'

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

    ReactDOM.createRoot(document.getElementById('root')).render(
        <App />
    );
}

bootstrap();
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionStore } from '@/stores/useSessionStore';
import { sessions as sessionsApi } from '@/components/services/api';

// Module-level guard so navigating between authenticated pages doesn't refetch
// on every mount. Sessions are refreshed at most once per FRESH_WINDOW_MS.
const FRESH_WINDOW_MS = 30_000;
let _lastFetchedAt = 0;
let _inFlight = false;

function normalizeSession(session) {
  const transcript = session.transcript || '';
  const durationSec = session.duration_seconds || 0;
  const wordsCount = Math.max(
    0,
    Math.round((transcript.split(/\s+/) || []).filter(Boolean).length)
  );
  const wordsPerMinute =
    wordsCount && durationSec ? Math.round(wordsCount / (durationSec / 60)) : 0;

  return {
    id: session.id,
    title: session.title || '',
    type: session.type || 'free',
    question: session.question || '',
    goal: session.goal || '',
    reference_text: session.reference_text || '',
    referenceText: session.reference_text || '',
    transcript,
    refined_draft: session.refined_draft || '',
    refinedDraft: session.refined_draft || '',
    highlights: session.highlights || [],
    durationSec,
    duration_seconds: durationSec,
    wordsCount,
    words_count: wordsCount,
    confidenceScore: session.confidence_score || session.clarity_score || 0,
    confidence_score: session.confidence_score || 0,
    clarityScore: session.clarity_score || 0,
    clarity_score: session.clarity_score || 0,
    fillerCount: session.filler_count || 0,
    filler_count: session.filler_count || 0,
    wordsPerMinute: session.words_per_minute || wordsPerMinute || 0,
    words_per_minute: session.words_per_minute || wordsPerMinute || 0,
    createdAt: session.created_at || new Date().toISOString(),
    created_at: session.created_at || new Date().toISOString(),
    created_date: session.created_at || new Date().toISOString(),
    updatedAt: session.updated_at || session.created_at || new Date().toISOString(),
    updated_at: session.updated_at || session.created_at || new Date().toISOString(),
    source: 'backend',
    itemKind: 'session',
  };
}

/**
 * Populate the session store from the backend for authenticated users.
 *
 * Sessions were previously fetched only inside Library.jsx, so Home/Growth/
 * Profile showed stale or empty data if visited first. Mounting this hook in
 * Layout (which wraps all protected routes) ensures the store is hydrated
 * app-wide. Failures are non-fatal: the store keeps any existing (local)
 * sessions so the UI degrades gracefully when the backend is unavailable.
 */
export function useSyncSessions({ force = false } = {}) {
  const { session } = useAuth();
  const setSessions = useSessionStore((s) => s.setSessions);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;

    const now = Date.now();
    if (!force && (_inFlight || now - _lastFetchedAt < FRESH_WINDOW_MS)) return;

    let cancelled = false;
    _inFlight = true;

    (async () => {
      try {
        const fetched = await sessionsApi.listSessions();
        if (cancelled) return;
        const normalized = (fetched || []).map(normalizeSession);
        setSessions(normalized);
        _lastFetchedAt = Date.now();
      } catch (error) {
        // Backend unavailable / auth expired — keep existing store contents.
        console.warn('useSyncSessions: could not refresh sessions:', error?.message);
      } finally {
        _inFlight = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token, force, setSessions]);
}

export default useSyncSessions;

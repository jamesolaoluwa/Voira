import { create } from 'zustand';
import { saveLocalRecording, getLocalRecordings } from '@/lib/localRecordings';

/**
 * Session Store (v3 Analytics Compliant)
 * 
 * IMPORTANT: This store ONLY manages session data persistence and retrieval.
 * All analytics calculations MUST use the utilities in @/lib/analytics.js
 * 
 * DO NOT:
 * - Compute scores or trends here
 * - Use legacy field names without mapping
 * - Create new aggregation functions
 * 
 * The getStatsSummary method is DEPRECATED - use computeGrowthStats from analytics.js instead.
 */

// Import v3 analytics for compatibility layer
import { mapLegacySession, computeGrowthStats, DEFAULT_BASELINE } from '@/lib/analytics';

/**
 * @deprecated Use computeGrowthStats from @/lib/analytics.js instead
 * This function is kept for backward compatibility only.
 */
function computeStats(sessions) {
  // Delegate to v3 analytics
  const stats = computeGrowthStats(sessions, DEFAULT_BASELINE);
  
  // Map to legacy format for backward compatibility
  return {
    totalSessions: stats.totalSessions,
    avgConfidence: stats.avgConfidence,
    avgFillers: stats.avgFillerDensity, // Note: now returns density, not count
    avgWPM: stats.avgWPM,
    lastSessionAt: sessions.length > 0 
      ? sessions.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b).createdAt
      : null,
    improvementTrend: {
      confidenceDelta: stats.trends.confidence.change,
      fillerReductionPct: stats.trends.fillers.reductionPct,
      paceStability: stats.trends.pace.variance,
    },
  };
}

export const useSessionStore = create((set, get) => ({
  // Initialize with local recordings only
  sessions: (() => {
    const local = getLocalRecordings() || [];
    return local.length > 0 ? local : [];
  })(),
  setSessions: (sessions) => set(prev => ({ ...prev, sessions })),
  
  /**
   * Add a session to the store.
   * 
   * This method normalizes field names to support both legacy (camelCase)
   * and v3 (snake_case) formats. The stored format uses camelCase for
   * backward compatibility with existing UI components.
   * 
   * v3 Analytics fields that should be preserved:
   * - analysis_reliability: Epistemic reliability (0-1)
   * - filler_word_frequency: Filler density (use for scoring, NOT filler_count)
   */
  addSession: (session) => {
    // Map legacy fields using v3 analytics utility
    const mapped = mapLegacySession(session);
    
    const durationSecVal = mapped.duration_seconds || session.durationSec || 0;
    const wordsCountVal = mapped.word_count || session.wordsCount || 
      Math.max(0, Math.round(((session.transcript || '').split(/\s+/) || []).filter(Boolean).length));
    const wordsPerMinuteVal = mapped.words_per_minute || session.wordsPerMinute || 
      (wordsCountVal && durationSecVal ? Math.round((wordsCountVal / (durationSecVal / 60))) : 0);

    const s = {
      id: session.id || `local-${Date.now()}`,
      createdAt: session.createdAt || session.created_at || new Date().toISOString(),
      title: session.title || session.question || '',
      type: session.type || 'speak',
      question: session.question || '',
      transcript: session.transcript || '',
      refinedDraft: session.refinedDraft || session.refined_draft || '',
      refined_draft: session.refinedDraft || session.refined_draft || '',
      durationSec: durationSecVal,
      wordsCount: wordsCountVal,
      // v3 Analytics fields (use mapped values)
      confidenceScore: mapped.confidence_score || 0,
      clarityScore: mapped.clarity_score || 0,
      fillerCount: mapped.filler_word_count || 0,
      filler_word_frequency: mapped.filler_word_frequency || 0, // v3: Use for scoring
      analysis_reliability: mapped.analysis_reliability || 0.5, // v3: Epistemic reliability
      wordsPerMinute: wordsPerMinuteVal,
      // CRITICAL: Mark source to prevent invalid API calls for local-only items
      source: session.source || 'local',
    };
    // update state
    set(prev => ({ ...prev, sessions: [s, ...(prev.sessions || [])] }));
    // side-effect: persist locally
    try { saveLocalRecording(s); } catch (e) {}
  },
  removeSession: (id) => {
    if (!id) {
      console.warn('removeSession called with falsy id, ignoring');
      return set(prev => ({ ...prev }));
    }
    return set(prev => ({ ...prev, sessions: (prev.sessions || []).filter(s => s.id !== id) }));
  },
  getSessions: () => get().sessions,
  getStatsSummary: () => computeStats(get().sessions || []),
  // derived helpers
  getConsistencyScore: (n = 6) => {
    const sessions = (get().sessions || []).slice(0, n);
    if (sessions.length === 0) return 0;
    const conf = sessions.map(s => s.confidenceScore || 0);
    const wpm = sessions.map(s => s.wordsPerMinute || 0);
    const varConf = conf.reduce((a, x) => a + Math.pow(x - (conf.reduce((s, v) => s + v, 0) / conf.length), 2), 0) / conf.length || 0;
    const varWpm = wpm.reduce((a, x) => a + Math.pow(x - (wpm.reduce((s, v) => s + v, 0) / wpm.length), 2), 0) / wpm.length || 0;
    return Math.round(100 - (Math.sqrt(varConf) + Math.sqrt(varWpm)) / 2);
  },
  getStreak: () => {
    const sessions = (get().sessions || []).map(s => new Date(s.createdAt));
    if (!sessions.length) return 0;
    sessions.sort((a, b) => b - a);
    let streak = 0;
    let last = null;
    for (const d of sessions) {
      if (!last) { streak = 1; last = d; continue; }
      const diffDays = Math.floor((last - d) / (1000 * 60 * 60 * 24));
      if (diffDays === 0 || diffDays === 1) { streak++; last = d; } else break;
    }
    return streak;
  },
  getBestSession: () => {
    const sessions = get().sessions || [];
    if (!sessions.length) return null;
    return sessions.reduce((a, b) => (b.confidenceScore || 0) > (a.confidenceScore || 0) ? b : a, sessions[0]);
  },
  lastImprovementInsight: () => {
    const sessions = get().sessions || [];
    if (sessions.length < 2) return '';
    const last = sessions[0];
    const prevWeek = sessions.slice(1, 8);
    const prevAvgFill = prevWeek.reduce((s, x) => s + (x.fillerCount || 0), 0) / Math.max(1, prevWeek.length);
    const change = prevAvgFill ? Math.round(((prevAvgFill - (last.fillerCount || 0)) / Math.max(1, prevAvgFill)) * 100) : 0;
    if (change > 0) return `Your filler words dropped ${change}% since last week`;
    return '';
  }
}));

export default useSessionStore;

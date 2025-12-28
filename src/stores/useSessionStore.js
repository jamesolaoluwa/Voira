import { create } from 'zustand';
import { saveLocalRecording, getLocalRecordings } from '@/lib/localRecordings';

// Session shape documented in the task
// id, createdAt, type, question, transcript, durationSec, wordsCount, confidenceScore, fillerCount, wordsPerMinute

const seedDeterministic = () => {
  // deterministic seed data for demo purposes
  const now = new Date('2025-12-28T12:00:00Z');
  return [
    {
      id: 'seed-1',
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      type: 'practice',
      question: 'Tell me about a time you led a project',
      transcript: 'I led a project where I coordinated a team of five...',
      durationSec: 60,
      wordsCount: 120,
      confidenceScore: 78,
      fillerCount: 3,
      wordsPerMinute: 120,
    },
    {
      id: 'seed-2',
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      type: 'interview',
      question: 'Why do you want to work here?',
      transcript: 'I admire the mission and the team...',
      durationSec: 45,
      wordsCount: 90,
      confidenceScore: 84,
      fillerCount: 2,
      wordsPerMinute: 120,
    },
    {
      id: 'seed-3',
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      type: 'application',
      question: 'Personal statement',
      transcript: 'My journey started when...',
      durationSec: 90,
      wordsCount: 180,
      confidenceScore: 81,
      fillerCount: 4,
      wordsPerMinute: 120,
    },
  ];
};

function computeStats(sessions) {
  const total = sessions.length;
  if (total === 0) return {
    totalSessions: 0,
    avgConfidence: 0,
    avgFillers: 0,
    avgWPM: 0,
    lastSessionAt: null,
    improvementTrend: {
      confidenceDelta: 0,
      fillerReductionPct: 0,
      paceStability: 0,
    },
  };

  const avgConfidence = Math.round((sessions.reduce((s, x) => s + (x.confidenceScore || 0), 0) / total));
  const avgFillers = Math.round((sessions.reduce((s, x) => s + (x.fillerCount || 0), 0) / total));
  const avgWPM = Math.round((sessions.reduce((s, x) => s + (x.wordsPerMinute || 0), 0) / total));
  const lastSessionAt = sessions.reduce((a, b) => new Date(a.createdAt) > new Date(b.createdAt) ? a : b).createdAt;

  // simple trend: compare last half vs first half
  const half = Math.max(1, Math.floor(total / 2));
  const firstHalf = sessions.slice(0, half);
  const lastHalf = sessions.slice(-half);
  const firstAvgConf = firstHalf.reduce((s, x) => s + (x.confidenceScore || 0), 0) / firstHalf.length;
  const lastAvgConf = lastHalf.reduce((s, x) => s + (x.confidenceScore || 0), 0) / lastHalf.length;

  const confidenceDelta = Math.round(lastAvgConf - firstAvgConf);
  const firstAvgFill = firstHalf.reduce((s, x) => s + (x.fillerCount || 0), 0) / firstHalf.length;
  const lastAvgFill = lastHalf.reduce((s, x) => s + (x.fillerCount || 0), 0) / lastHalf.length;
  const fillerReductionPct = firstAvgFill === 0 ? 0 : Math.round(((firstAvgFill - lastAvgFill) / firstAvgFill) * 100);

  const paceStability = Math.round(sessions.reduce((s, x) => s + Math.abs((x.wordsPerMinute || 0) - avgWPM), 0) / total);

  return {
    totalSessions: total,
    avgConfidence,
    avgFillers,
    avgWPM,
    lastSessionAt,
    improvementTrend: {
      confidenceDelta,
      fillerReductionPct,
      paceStability,
    },
  };
}

export const useSessionStore = create((set, get) => ({
  sessions: (() => {
    // merge local fallback (from save flows) with deterministic seed if none exist
    const local = getLocalRecordings() || [];
    if (local.length > 0) return local;
    return seedDeterministic();
  })(),
  setSessions: (sessions) => set(prev => ({ ...prev, sessions })),
  addSession: (session) => {
    // normalize fields (pure computation)
    const durationSecVal = session.durationSec || session.duration_seconds || 0;
    const wordsCountVal = session.wordsCount || session.words_count || Math.max(0, Math.round(((session.transcript || '').split(/\s+/) || []).filter(Boolean).length));
    const wordsPerMinuteVal = session.wordsPerMinute || session.words_per_minute || (wordsCountVal && durationSecVal ? Math.round((wordsCountVal / (durationSecVal / 60))) : 0);

    const s = {
      id: session.id || `local-${Date.now()}`,
      createdAt: session.createdAt || new Date().toISOString(),
      type: session.type || 'speak',
      question: session.question || '',
      transcript: session.transcript || '',
      durationSec: durationSecVal,
      wordsCount: wordsCountVal,
      confidenceScore: session.confidenceScore || session.confidence_score || 0,
      fillerCount: session.fillerCount || session.filler_count || 0,
      wordsPerMinute: wordsPerMinuteVal,
    };
    // update state
    set(prev => ({ ...prev, sessions: [s, ...(prev.sessions || [])] }));
    // side-effect: persist locally (do not mutate state here)
    try { saveLocalRecording(s); } catch (e) {}
  },
  removeSession: (id) => set(prev => ({ ...prev, sessions: (prev.sessions || []).filter(s => s.id !== id) })),
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

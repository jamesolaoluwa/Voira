/**
 * Analytics Contract (v3) - Frontend Utilities
 * 
 * This module is the SINGLE SOURCE OF TRUTH for analytics data handling.
 * All UI components MUST use these utilities.
 * 
 * ============================================================================
 * USAGE RULES (STRICT - DO NOT VIOLATE)
 * ============================================================================
 * 
 * 1. NEVER compute analytics client-side
 *    - All metrics come from server via this contract
 *    - UI renders, never calculates scores
 * 
 * 2. NEVER use raw counts for scoring
 *    - Use filler_density (filler_word_frequency), not filler_count
 *    - Use normalized metrics for comparisons
 * 
 * 3. ALWAYS consider reliability
 *    - Low reliability → scores reflect baseline expectation
 *    - Aggregations must weight by reliability
 * 
 * 4. ALWAYS use baseline expectation as anchor
 *    - "Improvement" = deviation from baseline expectation
 *    - Not arbitrary comparison against 50 or previous session
 * 
 * 5. PROPAGATE full analytics object
 *    - Don't extract partial fields and lose context
 *    - Pass the complete analytics result to components
 * 
 * ============================================================================
 */

/**
 * Default baseline expectations (global population)
 * These are used when no user-specific baseline exists.
 */
export const DEFAULT_BASELINE = {
  confidenceExpectation: 55,
  clarityExpectation: 60,
  fillerDensity: 3.5,
  stanceRatio: 0.55,
};

/**
 * Reliability thresholds
 */
export const RELIABILITY_THRESHOLDS = {
  HIGH: 0.7,      // Score fully reflects data
  MEDIUM: 0.5,    // Score partially reflects baseline
  LOW: 0.4,       // Score mostly reflects baseline
};

/**
 * Map legacy session fields to v3 analytics contract.
 * Use this when loading old session data.
 * 
 * @param {Object} session - Session with potentially legacy fields
 * @returns {Object} Session with v3 field names
 */
export function mapLegacySession(session) {
  if (!session) return session;
  
  return {
    ...session,
    // Map camelCase to snake_case (v3 uses snake_case)
    confidence_score: session.confidenceScore ?? session.confidence_score ?? 50,
    clarity_score: session.clarityScore ?? session.clarity_score ?? 50,
    filler_word_count: session.fillerCount ?? session.filler_count ?? session.filler_word_count ?? 0,
    filler_word_frequency: session.filler_word_frequency ?? session.filler_density ?? 0,
    analysis_reliability: session.analysis_reliability ?? 0.5,
    word_count: session.wordsCount ?? session.word_count ?? 0,
    words_per_minute: session.wordsPerMinute ?? session.words_per_minute ?? 0,
    duration_seconds: session.durationSec ?? session.duration_seconds ?? 0,
  };
}

/**
 * Check if analysis is reliable enough to trust.
 * 
 * @param {number} reliability - Analysis reliability (0-1)
 * @returns {boolean} True if reliable
 */
export function isReliable(reliability) {
  return reliability >= RELIABILITY_THRESHOLDS.MEDIUM;
}

/**
 * Get reliability label for display.
 * 
 * @param {number} reliability - Analysis reliability (0-1)
 * @returns {string} Human-readable label
 */
export function getReliabilityLabel(reliability) {
  if (reliability >= RELIABILITY_THRESHOLDS.HIGH) return 'High';
  if (reliability >= RELIABILITY_THRESHOLDS.MEDIUM) return 'Moderate';
  if (reliability >= RELIABILITY_THRESHOLDS.LOW) return 'Low';
  return 'Very Low';
}

/**
 * Compute reliability-weighted average of a metric across sessions.
 * 
 * This is the CORRECT way to aggregate scores across sessions.
 * Low-reliability sessions contribute less to the average.
 * 
 * @param {Array} sessions - Array of session objects
 * @param {string} metricKey - Key to aggregate (confidence_score, clarity_score, etc.)
 * @returns {{ average: number, totalWeight: number }}
 */
export function aggregateReliabilityWeighted(sessions, metricKey) {
  if (!sessions || sessions.length === 0) {
    return { average: 0, totalWeight: 0 };
  }
  
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const session of sessions) {
    const mapped = mapLegacySession(session);
    const reliability = mapped.analysis_reliability ?? 0.5;
    const value = mapped[metricKey] ?? 0;
    
    // Weight by reliability squared (penalize low reliability more)
    const weight = reliability ** 2;
    
    weightedSum += value * weight;
    totalWeight += weight;
  }
  
  if (totalWeight === 0) {
    return { average: 0, totalWeight: 0 };
  }
  
  return {
    average: Math.round(weightedSum / totalWeight),
    totalWeight: totalWeight,
  };
}

/**
 * Compute trend vs baseline expectation.
 * 
 * This is the CORRECT definition of "improvement" -
 * not comparing to previous sessions, but to personalized baseline.
 * 
 * @param {Array} sessions - Sessions sorted by date (newest first)
 * @param {number} baselineExpectation - User's expected baseline for this metric
 * @param {string} metricKey - Metric to analyze
 * @param {number} recentWindow - Number of recent sessions to consider
 * @returns {{ currentVsBaseline: number, direction: string, average: number }}
 */
export function computeTrendVsBaseline(
  sessions,
  baselineExpectation,
  metricKey,
  recentWindow = 5
) {
  if (!sessions || sessions.length === 0) {
    return {
      currentVsBaseline: 0,
      direction: 'stable',
      average: baselineExpectation,
    };
  }
  
  const recent = sessions.slice(0, recentWindow);
  const { average, totalWeight } = aggregateReliabilityWeighted(recent, metricKey);
  
  if (totalWeight === 0) {
    return {
      currentVsBaseline: 0,
      direction: 'stable',
      average: baselineExpectation,
    };
  }
  
  const deviation = average - baselineExpectation;
  
  let direction;
  if (deviation > 5) {
    direction = 'improving';
  } else if (deviation < -5) {
    direction = 'declining';
  } else {
    direction = 'stable';
  }
  
  return {
    currentVsBaseline: Math.round(deviation),
    direction,
    average,
  };
}

/**
 * Compute filler trend using DENSITY, not raw counts.
 * 
 * This is the CORRECT way to track filler reduction -
 * normalized density is comparable across different session lengths.
 * 
 * @param {Array} sessions - Sessions sorted by date (newest first)
 * @param {number} baselineDensity - Expected filler density
 * @param {number} recentWindow - Number of recent sessions to consider
 * @returns {{ currentDensity: number, reductionPct: number, direction: string }}
 */
export function computeFillerTrend(
  sessions,
  baselineDensity = DEFAULT_BASELINE.fillerDensity,
  recentWindow = 5
) {
  if (!sessions || sessions.length === 0) {
    return {
      currentDensity: 0,
      baselineDensity,
      reductionPct: 0,
      direction: 'stable',
    };
  }
  
  const recent = sessions.slice(0, recentWindow);
  
  let totalDensity = 0;
  let totalReliability = 0;
  
  for (const session of recent) {
    const mapped = mapLegacySession(session);
    const reliability = mapped.analysis_reliability ?? 0.5;
    // Use filler_word_frequency (density), NOT filler_word_count
    const density = mapped.filler_word_frequency ?? 0;
    
    totalDensity += density * reliability;
    totalReliability += reliability;
  }
  
  if (totalReliability === 0) {
    return {
      currentDensity: 0,
      baselineDensity,
      reductionPct: 0,
      direction: 'stable',
    };
  }
  
  const avgDensity = totalDensity / totalReliability;
  
  let reductionPct = 0;
  if (baselineDensity > 0) {
    reductionPct = ((baselineDensity - avgDensity) / baselineDensity) * 100;
  }
  
  let direction;
  if (reductionPct > 10) {
    direction = 'improving';
  } else if (reductionPct < -10) {
    direction = 'declining';
  } else {
    direction = 'stable';
  }
  
  return {
    currentDensity: Math.round(avgDensity * 100) / 100,
    baselineDensity,
    reductionPct: Math.round(reductionPct),
    direction,
  };
}

/**
 * Compute speaking pace trend with stability analysis.
 * 
 * @param {Array} sessions - Sessions sorted by date (newest first)
 * @returns {{ avgWPM: number, variance: number, stability: string }}
 */
export function computePaceTrend(sessions) {
  if (!sessions || sessions.length === 0) {
    return { avgWPM: 0, variance: 0, stability: 'unknown' };
  }
  
  const wpms = sessions
    .map(s => mapLegacySession(s).words_per_minute ?? 0)
    .filter(wpm => wpm > 0);
  
  if (wpms.length === 0) {
    return { avgWPM: 0, variance: 0, stability: 'unknown' };
  }
  
  const avgWPM = Math.round(wpms.reduce((a, b) => a + b, 0) / wpms.length);
  const variance = Math.round(
    wpms.reduce((sum, wpm) => sum + Math.abs(wpm - avgWPM), 0) / wpms.length
  );
  
  let stability;
  if (variance < 15) {
    stability = 'Stable';
  } else if (variance < 25) {
    stability = 'Moderate';
  } else {
    stability = 'Variable';
  }
  
  return { avgWPM, variance, stability };
}

/**
 * Prepare sessions for chart display.
 * 
 * IMPORTANT: Charts should use these prepared data points,
 * NOT recompute values from raw session data.
 * 
 * @param {Array} sessions - Sessions sorted by date (newest first)
 * @param {number} limit - Max number of data points
 * @returns {Object} Chart data arrays
 */
export function prepareChartData(sessions, limit = 12) {
  if (!sessions || sessions.length === 0) {
    return {
      fillerData: [{ session: 'S1', density: 0 }],
      confidenceData: [{ session: 'S1', score: 50 }],
      clarityData: [{ session: 'S1', score: 50 }],
      paceData: [{ session: 'S1', wpm: 0 }],
    };
  }
  
  // Take recent sessions and reverse for chronological order
  const recent = sessions.slice(0, limit).reverse();
  
  const fillerData = recent.map((s, i) => {
    const mapped = mapLegacySession(s);
    return {
      session: `S${i + 1}`,
      // Use density, not count
      density: mapped.filler_word_frequency ?? 0,
      // Also include raw count for display (but NOT for scoring)
      count: mapped.filler_word_count ?? 0,
      reliability: mapped.analysis_reliability ?? 0.5,
    };
  });
  
  const confidenceData = recent.map((s, i) => {
    const mapped = mapLegacySession(s);
    return {
      session: `S${i + 1}`,
      score: mapped.confidence_score ?? 50,
      reliability: mapped.analysis_reliability ?? 0.5,
    };
  });
  
  const clarityData = recent.map((s, i) => {
    const mapped = mapLegacySession(s);
    return {
      session: `S${i + 1}`,
      score: mapped.clarity_score ?? 50,
      reliability: mapped.analysis_reliability ?? 0.5,
    };
  });
  
  const paceData = recent.map((s, i) => {
    const mapped = mapLegacySession(s);
    return {
      session: `S${i + 1}`,
      wpm: mapped.words_per_minute ?? 0,
    };
  });
  
  return { fillerData, confidenceData, clarityData, paceData };
}

/**
 * Compute all growth stats using v3 analytics contract.
 * 
 * This function REPLACES all client-side stat calculations.
 * 
 * @param {Array} sessions - All user sessions
 * @param {Object} baseline - User's baseline (or use DEFAULT_BASELINE)
 * @returns {Object} Complete growth stats
 */
export function computeGrowthStats(sessions, baseline = DEFAULT_BASELINE) {
  const realSessions = (sessions || []).filter(
    s => s.id && !s.id.startsWith('seed-')
  );
  
  if (realSessions.length === 0) {
    return {
      totalSessions: 0,
      avgConfidence: 0,
      avgClarity: 0,
      avgFillerDensity: 0,
      avgWPM: 0,
      trends: {
        confidence: { direction: 'stable', change: 0 },
        clarity: { direction: 'stable', change: 0 },
        fillers: { direction: 'stable', reductionPct: 0 },
        pace: { stability: 'unknown', variance: 0 },
      },
      improvements: [],
    };
  }
  
  // Reliability-weighted averages
  const { average: avgConfidence } = aggregateReliabilityWeighted(
    realSessions, 'confidence_score'
  );
  const { average: avgClarity } = aggregateReliabilityWeighted(
    realSessions, 'clarity_score'
  );
  
  // Filler trend (using density)
  const fillerTrend = computeFillerTrend(
    realSessions, baseline.fillerDensity
  );
  
  // Confidence trend vs baseline
  const confidenceTrend = computeTrendVsBaseline(
    realSessions,
    baseline.confidenceExpectation,
    'confidence_score'
  );
  
  // Clarity trend vs baseline
  const clarityTrend = computeTrendVsBaseline(
    realSessions,
    baseline.clarityExpectation,
    'clarity_score'
  );
  
  // Pace trend
  const paceTrend = computePaceTrend(realSessions);
  
  // Build improvements array (for display)
  const improvements = [
    {
      trait: 'Thinking Pause Reduction',
      change: fillerTrend.direction === 'improving'
        ? `-${Math.abs(fillerTrend.reductionPct)}%`
        : fillerTrend.direction === 'declining'
          ? `+${Math.abs(fillerTrend.reductionPct)}%`
          : '0%',
      positive: fillerTrend.reductionPct >= 0,
    },
    {
      trait: 'Confidence Score',
      change: confidenceTrend.currentVsBaseline > 0
        ? `+${confidenceTrend.currentVsBaseline}`
        : `${confidenceTrend.currentVsBaseline}`,
      positive: confidenceTrend.currentVsBaseline >= 0,
      note: 'vs baseline',
    },
    {
      trait: 'Speaking Pace',
      change: paceTrend.stability,
      positive: paceTrend.variance < 25,
    },
    {
      trait: 'Sessions Completed',
      change: `${realSessions.length}`,
      positive: true,
    },
  ];
  
  return {
    totalSessions: realSessions.length,
    avgConfidence,
    avgClarity,
    avgFillerDensity: fillerTrend.currentDensity,
    avgWPM: paceTrend.avgWPM,
    trends: {
      confidence: {
        direction: confidenceTrend.direction,
        change: confidenceTrend.currentVsBaseline,
      },
      clarity: {
        direction: clarityTrend.direction,
        change: clarityTrend.currentVsBaseline,
      },
      fillers: {
        direction: fillerTrend.direction,
        reductionPct: fillerTrend.reductionPct,
      },
      pace: {
        stability: paceTrend.stability,
        variance: paceTrend.variance,
      },
    },
    improvements,
  };
}

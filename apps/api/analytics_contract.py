"""
Canonical Analytics Contract (v4)

This module defines the SINGLE SOURCE OF TRUTH for all analytics data structures.
All UI components, stores, and backend endpoints MUST use these contracts.

============================================================================
VERSION CONTRACT
============================================================================

This contract is aligned with adaptive_analytics.py v4.0.0.
Changes to this contract require corresponding analytics engine updates.

============================================================================
USAGE RULES (STRICT)
============================================================================

1. NEVER compute analytics client-side
   - All metrics come from server via this contract
   - UI renders, never calculates

2. NEVER use raw counts for scoring
   - Use filler_density, not filler_count
   - Use normalized metrics for comparisons

3. ALWAYS consider reliability
   - Low reliability → scores reflect baseline expectation
   - Aggregations must weight by reliability

4. ALWAYS use baseline expectation as anchor
   - "Improvement" = deviation from baseline expectation
   - Not arbitrary comparison against 50 or previous session

5. PROPAGATE full analytics object
   - Don't extract partial fields and lose context
   - Pass the complete AnalyticsResult to components

6. RESPECT EPISTEMIC UNCERTAINTY
   - Uncertainty ≠ Neutrality
   - Low reliability interpolates toward baseline, NOT 50
   - Uncertainty propagates through all aggregations

============================================================================
ALGORITHMIC INVARIANTS (Enforced by analytics engine)
============================================================================

1. MONOTONICITY
   - ∂confidence/∂filler_density ≤ 0 (more fillers → lower confidence)
   - ∂clarity/∂sentence_completion ≥ 0 (more completion → higher clarity)

2. BOUNDEDNESS
   - All scores ∈ [0, 100]
   - All reliability ∈ [0, 1]
   - Soft bounds: scores typically ∈ [15, 95]

3. STABILITY
   - Small input changes cannot cause large output swings
   - Adversarial inputs degrade gracefully

4. INTERACTION CORRECTION
   - Correlated features don't double-penalize
   - Combined penalty capped

============================================================================
"""

from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum

# Contract version - must match adaptive_analytics.ALGORITHM_VERSION major version
CONTRACT_VERSION = "4.0.0"


class MetricType(Enum):
    """Types of metrics in the analytics system."""

    SCORE = "score"  # 0-100 composite score
    DENSITY = "density"  # Normalized rate (per 100 words)
    RATIO = "ratio"  # 0-1 proportion
    COUNT = "count"  # Raw count (display only, never for scoring)
    PERCENTAGE = "percentage"  # 0-100%


@dataclass
class ReliabilityInfo:
    """
    Epistemic reliability of the analysis.

    When reliability is low, scores reflect baseline expectation, not data.
    UI should display reliability indicators when < 0.7.
    """

    value: float  # ∈ [0, 1]
    data_sufficiency: float  # How much data we have
    feature_agreement: float  # How consistent features are
    variance_stability: float  # How stable the signal is
    is_trustworthy: bool  # Convenience: value >= 0.6

    @classmethod
    def from_dict(cls, d: Dict) -> "ReliabilityInfo":
        factors = d.get("reliability_factors", {})
        value = d.get("reliability", 0)
        return cls(
            value=value,
            data_sufficiency=factors.get("data_sufficiency", 0),
            feature_agreement=factors.get("feature_agreement", 0),
            variance_stability=factors.get("variance_stability", 0),
            is_trustworthy=value >= 0.6,
        )


@dataclass
class DriftInfo:
    """
    Continuous drift tracking for baseline adaptation.

    Drift indicates user behavior change over time.
    """

    tracked: bool
    filler_magnitude: float = 0.0
    filler_direction: int = 0  # -1 degrading, 0 stable, +1 improving
    filler_persistence: int = 0
    stance_magnitude: float = 0.0
    stance_direction: int = 0
    stance_persistence: int = 0

    @classmethod
    def from_dict(cls, d: Optional[Dict]) -> "DriftInfo":
        if not d or not d.get("drift_tracked"):
            return cls(tracked=False)
        return cls(
            tracked=True,
            filler_magnitude=d.get("filler_drift", {}).get("magnitude", 0),
            filler_direction=d.get("filler_drift", {}).get("direction", 0),
            filler_persistence=d.get("filler_drift", {}).get("persistence", 0),
            stance_magnitude=d.get("stance_drift", {}).get("magnitude", 0),
            stance_direction=d.get("stance_drift", {}).get("direction", 0),
            stance_persistence=d.get("stance_drift", {}).get("persistence", 0),
        )


@dataclass
class CounterfactualInfo:
    """
    Counterfactual analysis for a feature.

    Answers: "If this feature were at baseline, what would the score be?"
    """

    feature: str
    actual_value: float
    baseline_value: float
    score_delta: float  # How much this feature affected the score
    sensitivity: float  # ∂score/∂feature

    @classmethod
    def from_dict(cls, d: Dict) -> "CounterfactualInfo":
        return cls(
            feature=d.get("feature", ""),
            actual_value=d.get("actual", 0),
            baseline_value=d.get("baseline", 0),
            score_delta=d.get("score_delta", 0),
            sensitivity=d.get("sensitivity", 0),
        )


@dataclass
class ContributingFactor:
    """A factor contributing to a score."""

    name: str
    value: float
    contribution: float
    explanation: str
    z_score: float

    @classmethod
    def from_dict(cls, d: Dict) -> "ContributingFactor":
        return cls(
            name=d.get("name", ""),
            value=d.get("value", 0),
            contribution=d.get("contribution", 0),
            explanation=d.get("explanation", ""),
            z_score=d.get("z_score", 0),
        )


@dataclass
class ScoreExplanation:
    """
    Complete explanation for a score (confidence or clarity).

    This is the canonical structure for understanding WHY a score has its value.
    """

    score: int  # Final score (0-100)
    raw_score: float  # Score before epistemic adjustment
    reliability: float  # Analysis reliability
    baseline_expectation: float  # Prior expectation
    epistemic_adjustment: float  # How much reliability shifted the score
    reliability_note: str  # Human-readable reliability description
    top_positive_factors: List[ContributingFactor]
    top_negative_factors: List[ContributingFactor]
    counterfactuals: List[CounterfactualInfo]

    @classmethod
    def from_dict(cls, d: Dict) -> "ScoreExplanation":
        return cls(
            score=d.get("score", 0),
            raw_score=d.get("raw_score", 0),
            reliability=d.get("reliability", 0),
            baseline_expectation=d.get("baseline_expectation", 50),
            epistemic_adjustment=d.get("epistemic_adjustment", 0),
            reliability_note=d.get("reliability_note", ""),
            top_positive_factors=[
                ContributingFactor.from_dict(f) for f in d.get("top_positive", [])
            ],
            top_negative_factors=[
                ContributingFactor.from_dict(f) for f in d.get("top_negative", [])
            ],
            counterfactuals=[
                CounterfactualInfo.from_dict(cf) for cf in d.get("counterfactuals", [])
            ],
        )


@dataclass
class BaselineInfo:
    """
    Baseline information used for scoring.

    Baselines are the anchor for "improvement" calculations.
    """

    is_user_specific: bool
    sample_count: int
    confidence_expectation: float  # Prior for confidence
    clarity_expectation: float  # Prior for clarity
    filler_density_ci: Tuple[float, float]  # 95% CI for expected filler density
    stance_ratio_ci: Tuple[float, float]  # 95% CI for expected stance ratio

    @classmethod
    def from_dict(cls, d: Dict) -> "BaselineInfo":
        return cls(
            is_user_specific=d.get("is_user_specific", False),
            sample_count=d.get("sample_count", 0),
            confidence_expectation=d.get("confidence_expectation", 55),
            clarity_expectation=d.get("clarity_expectation", 60),
            filler_density_ci=tuple(d.get("filler_density_ci", (0, 10))),
            stance_ratio_ci=tuple(d.get("stance_ratio_ci", (0.3, 0.8))),
        )


@dataclass
class NormalizedMetrics:
    """
    Normalized metrics for display and aggregation.

    IMPORTANT: Use these for charts and trends, NOT raw counts.
    """

    filler_density: float  # Fillers per 100 words
    filler_certainty_weighted: float  # Weighted by confidence
    filler_by_category: Dict[str, float]
    assertion_density: float
    hesitation_density: float
    stance_ratio: float  # Confidence / (Confidence + Hesitation)
    sentence_completion_ratio: float
    avg_sentence_length: float
    transition_density: float
    word_count: int
    sentence_count: int

    @classmethod
    def from_dict(cls, d: Dict) -> "NormalizedMetrics":
        return cls(
            filler_density=d.get("filler_density", 0),
            filler_certainty_weighted=d.get("filler_certainty_weighted", 0),
            filler_by_category=d.get("filler_by_category", {}),
            assertion_density=d.get("assertion_density", 0),
            hesitation_density=d.get("hesitation_density", 0),
            stance_ratio=d.get("stance_ratio", 0.5),
            sentence_completion_ratio=d.get("sentence_completion_ratio", 0),
            avg_sentence_length=d.get("avg_sentence_length", 0),
            transition_density=d.get("transition_density", 0),
            word_count=d.get("word_count", 0),
            sentence_count=d.get("sentence_count", 0),
        )


@dataclass
class AnalyticsResult:
    """
    CANONICAL ANALYTICS RESULT (v4)

    This is the SINGLE contract for all analytics data.
    All UI components MUST consume this structure as-is.

    DO NOT:
    - Extract partial fields and lose context
    - Recompute scores client-side
    - Use raw counts for scoring logic
    - Ignore reliability
    - Treat low reliability as "neutral 50"

    DO:
    - Pass this entire object to components
    - Display reliability when < 0.7
    - Use baseline_expectation as anchor for "improvement"
    - Weight by reliability in aggregations
    - Respect epistemic uncertainty (low reliability → baseline expectation)

    INVARIANTS GUARANTEED BY ANALYTICS ENGINE:
    - Scores are bounded [0, 100] with soft bounds [15, 95]
    - Monotonicity: more fillers cannot increase confidence
    - Interaction correction: correlated features don't double-penalize
    - Epistemic correctness: uncertainty interpolates to baseline, not 50
    """

    # Core scores (0-100)
    confidence_score: int
    clarity_score: int

    # Epistemic metadata
    analysis_reliability: float
    signal_valid: bool
    signal_reason: str

    # Filler data (for display)
    filler_word_count: int  # Raw count (display only)
    filler_word_frequency: float  # Density (use for scoring)
    filler_word_breakdown: Dict[str, int]

    # Detailed explanations
    confidence_explanation: Optional[ScoreExplanation] = None
    clarity_explanation: Optional[ScoreExplanation] = None

    # Baseline and drift
    baseline: Optional[BaselineInfo] = None
    drift: Optional[DriftInfo] = None

    # Full metrics (optional, for advanced views)
    metrics: Optional[NormalizedMetrics] = None

    # Reliability breakdown
    reliability_info: Optional[ReliabilityInfo] = None

    # Algorithm version (for debugging and compatibility)
    algorithm_version: Optional[str] = None

    @classmethod
    def from_backend_response(cls, data: Dict) -> "AnalyticsResult":
        """
        Convert backend response to canonical AnalyticsResult.

        This is the ONLY way to create an AnalyticsResult from API data.
        """
        signal = data.get("signal_validity", {})
        explanation = data.get("explanation", {})

        return cls(
            confidence_score=data.get("confidence_score", 50),
            clarity_score=data.get("clarity_score", 50),
            analysis_reliability=data.get("analysis_reliability", 0),
            signal_valid=signal.get("is_valid", False),
            signal_reason=signal.get("reason", "unknown"),
            filler_word_count=data.get("filler_word_count", 0),
            filler_word_frequency=data.get("filler_word_frequency", 0),
            filler_word_breakdown=data.get("filler_word_breakdown", {}),
            confidence_explanation=(
                ScoreExplanation.from_dict(explanation.get("confidence", {}))
                if explanation.get("confidence")
                else None
            ),
            clarity_explanation=(
                ScoreExplanation.from_dict(explanation.get("clarity", {}))
                if explanation.get("clarity")
                else None
            ),
            baseline=(
                BaselineInfo.from_dict(data.get("baseline", {}))
                if data.get("baseline")
                else None
            ),
            drift=DriftInfo.from_dict(data.get("drift")) if data.get("drift") else None,
            metrics=(
                NormalizedMetrics.from_dict(data.get("metrics", {}))
                if data.get("metrics")
                else None
            ),
            reliability_info=ReliabilityInfo.from_dict(signal) if signal else None,
            algorithm_version=data.get("algorithm_version"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON serialization."""
        return asdict(self)

    def is_reliable(self) -> bool:
        """Check if analysis is reliable enough to trust."""
        return self.analysis_reliability >= 0.6

    def get_improvement_vs_baseline(self, metric: str) -> float:
        """
        Calculate improvement vs baseline expectation.

        This is the CORRECT way to measure "improvement" -
        deviation from personalized baseline, not arbitrary comparison.
        """
        if not self.baseline:
            return 0.0

        if metric == "confidence":
            return self.confidence_score - self.baseline.confidence_expectation
        elif metric == "clarity":
            return self.clarity_score - self.baseline.clarity_expectation
        else:
            return 0.0


# =============================================================================
# AGGREGATION HELPERS (Reliability-Weighted)
# =============================================================================
#
# IMPORTANT: These utilities implement reliability-aware aggregation.
# They should be used for ALL aggregations across the system.
# Never average raw scores without weighting by reliability.
#
# WHY RELIABILITY WEIGHTING:
# A score with 0.3 reliability should contribute less to averages
# than a score with 0.9 reliability. Without weighting, noise dominates.
#
# WHY SQUARED WEIGHTING (power=2):
# Squaring reliability penalizes low values more aggressively.
# A reliability of 0.5 contributes only 0.25 weight.
# =============================================================================


def aggregate_sessions_reliability_weighted(
    sessions: List[Dict[str, Any]],
    metric_key: str = "confidence_score",
    reliability_key: str = "analysis_reliability",
    power: float = 2.0,
) -> Tuple[float, float]:
    """
    Compute reliability-weighted average of a metric.

    This is the CORRECT way to aggregate scores across sessions.
    Low-reliability sessions contribute less to the average.

    MATHEMATICAL FORM:
    weighted_avg = Σ(value_i * reliability_i^power) / Σ(reliability_i^power)

    Args:
        sessions: List of session dicts with analytics data
        metric_key: Key to aggregate (confidence_score, clarity_score, etc.)
        reliability_key: Key for reliability values
        power: Exponent for reliability weighting (higher = more penalty for low reliability)

    Returns:
        (weighted_average, total_weight)

    INVARIANTS:
    - If all reliabilities are equal, returns simple average
    - If any reliability is 0, that session contributes nothing
    - Higher reliability sessions dominate the average
    """
    total_weight = 0.0
    weighted_sum = 0.0

    for session in sessions:
        reliability = session.get(reliability_key, 0.5)
        value = session.get(metric_key, 0)

        # Weight by reliability raised to power
        weight = reliability**power

        weighted_sum += value * weight
        total_weight += weight

    if total_weight == 0:
        return (0.0, 0.0)

    return (weighted_sum / total_weight, total_weight)


def compute_trend_vs_baseline(
    sessions: List[Dict[str, Any]],
    baseline_expectation: float,
    metric_key: str = "confidence_score",
    recent_window: int = 5,
) -> Dict[str, Any]:
    """
    Compute trend as deviation from baseline expectation.

    This is the CORRECT definition of "improvement":
    Deviation from personalized baseline, NOT arbitrary comparison to 50
    or to previous sessions.

    WHY BASELINE COMPARISON:
    - Users have different natural baselines
    - "Improvement" means exceeding YOUR expected performance
    - Comparing to 50 or previous session is arbitrary

    Args:
        sessions: Sessions sorted by date (newest first)
        baseline_expectation: User's expected baseline for this metric
        metric_key: Metric to analyze
        recent_window: Number of recent sessions to consider

    Returns:
        {
            "current_vs_baseline": float,    # How recent sessions compare to baseline
            "trend_direction": str,          # "improving", "stable", "declining"
            "reliability_weighted_avg": float
        }
    """
    if not sessions:
        return {
            "current_vs_baseline": 0.0,
            "trend_direction": "stable",
            "reliability_weighted_avg": baseline_expectation,
        }

    recent = sessions[:recent_window]
    avg, weight = aggregate_sessions_reliability_weighted(recent, metric_key)

    if weight == 0:
        return {
            "current_vs_baseline": 0.0,
            "trend_direction": "stable",
            "reliability_weighted_avg": baseline_expectation,
        }

    deviation = avg - baseline_expectation

    if deviation > 5:
        direction = "improving"
    elif deviation < -5:
        direction = "declining"
    else:
        direction = "stable"

    return {
        "current_vs_baseline": round(deviation, 1),
        "trend_direction": direction,
        "reliability_weighted_avg": round(avg, 1),
    }


def compute_filler_trend(
    sessions: List[Dict[str, Any]],
    baseline_density: float = 3.5,
    recent_window: int = 5,
) -> Dict[str, Any]:
    """
    Compute filler trend using DENSITY, not raw counts.

    This is the CORRECT way to track filler reduction:
    Normalized density is comparable across different session lengths.

    WHY DENSITY NOT COUNT:
    - A 5-minute session with 10 fillers is different from
      a 30-minute session with 10 fillers
    - Density (fillers per 100 words) normalizes this
    - Always use filler_word_frequency, never filler_word_count for trends
    """
    if not sessions:
        return {
            "current_density": 0.0,
            "baseline_density": baseline_density,
            "reduction_pct": 0.0,
            "trend_direction": "stable",
        }

    recent = sessions[:recent_window]

    # Use filler_word_frequency (density) not filler_word_count
    total_density = 0.0
    total_reliability = 0.0

    for session in recent:
        reliability = session.get("analysis_reliability", 0.5)
        density = session.get("filler_word_frequency", 0)

        total_density += density * reliability
        total_reliability += reliability

    if total_reliability == 0:
        return {
            "current_density": 0.0,
            "baseline_density": baseline_density,
            "reduction_pct": 0.0,
            "trend_direction": "stable",
        }

    avg_density = total_density / total_reliability

    if baseline_density > 0:
        reduction_pct = ((baseline_density - avg_density) / baseline_density) * 100
    else:
        reduction_pct = 0

    if reduction_pct > 10:
        direction = "improving"
    elif reduction_pct < -10:
        direction = "declining"
    else:
        direction = "stable"

    return {
        "current_density": round(avg_density, 2),
        "baseline_density": baseline_density,
        "reduction_pct": round(reduction_pct, 1),
        "trend_direction": direction,
    }


# =============================================================================
# LEGACY FIELD MAPPING
# =============================================================================


def map_legacy_session_to_v4(session: Dict) -> Dict:
    """
    Map legacy session fields to v4 analytics contract.

    Use this to migrate existing session data to the new format.

    FIELD MAPPINGS:
    - confidenceScore → confidence_score
    - clarityScore → clarity_score
    - fillerCount → filler_word_count
    - filler_density → filler_word_frequency
    - wordsCount → word_count
    - wordsPerMinute → words_per_minute
    """
    return {
        # Keep original fields
        **session,
        # Map legacy names to v4 names
        "confidence_score": session.get("confidenceScore")
        or session.get("confidence_score", 50),
        "clarity_score": session.get("clarityScore")
        or session.get("clarity_score", 50),
        "filler_word_count": session.get("fillerCount")
        or session.get("filler_count", 0),
        "filler_word_frequency": session.get("filler_word_frequency")
        or session.get("filler_density", 0),
        "analysis_reliability": session.get("analysis_reliability", 0.5),
        "word_count": session.get("wordsCount") or session.get("word_count", 0),
        "words_per_minute": session.get("wordsPerMinute")
        or session.get("words_per_minute", 0),
    }


# Backwards compatibility alias
map_legacy_session_to_v3 = map_legacy_session_to_v4

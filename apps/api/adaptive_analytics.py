"""
Adaptive Analytics Engine for Voira (v4 - Production-Grade Algorithmic Rigor)

This module implements a mathematically rigorous analytics system following
best-practice algorithmic processes for trustworthy measurement under uncertainty.

============================================================================
ALGORITHMIC LIFECYCLE (Explicit, Separable, Testable)
============================================================================

Each analysis follows this explicit pipeline:

    1. SIGNAL ACQUISITION
       - Raw text ingestion
       - Basic validation
       - Metadata extraction
       
    2. FEATURE EXTRACTION
       - Pattern detection (fillers, stance, structure)
       - Raw counts and positions
       - No normalization yet
       
    3. NORMALIZATION
       - Convert counts to densities
       - Scale to comparable ranges
       - Document scaling assumptions
       
    4. INTERACTION HANDLING
       - Identify correlated features
       - Apply correction factors
       - Prevent double-counting
       
    5. RELIABILITY ESTIMATION
       - Data sufficiency check
       - Feature agreement assessment
       - Variance stability measurement
       
    6. BASELINE COMPARISON
       - Load appropriate baseline (global or user-specific)
       - Compute z-scores
       - Track drift
       
    7. SCORE COMPUTATION
       - Aggregate contributions
       - Apply weighting
       - Enforce bounds
       
    8. UNCERTAINTY ADJUSTMENT
       - Apply epistemic interpolation
       - Propagate confidence intervals
       - Never collapse to neutral
       
    9. EXPLANATION GENERATION
       - Identify top contributors
       - Compute counterfactuals
       - Generate human-readable notes
       
    10. AGGREGATION / TREND HANDLING
        - Reliability-weighted averaging
        - Drift persistence tracking
        - Baseline adaptation

============================================================================
DESIGN PRINCIPLES
============================================================================

1. AUDITABLE BY DESIGN
   - All transformations use named intermediate variables
   - Inline documentation explains WHY each step exists
   - No hidden math in chained expressions

2. INVARIANTS ARE ENFORCED
   - Monotonicity: more hesitation cannot increase confidence
   - Boundedness: scores never exceed logical limits
   - Stability: small inputs cannot cause large swings
   - Assertions fail loudly on violation

3. EPISTEMIC CORRECTNESS
   - Uncertainty ≠ Neutrality
   - Low reliability → baseline expectation, not 50
   - Uncertainty propagates through aggregations

4. INTERACTION AWARENESS
   - Correlated features documented
   - Double-counting prevented
   - Penalties capped

5. BASELINES ARE FIRST-CLASS
   - Explicit objects with inspection
   - Drift-aware adaptation
   - Stable evolution

============================================================================
VERSION CONTRACT
============================================================================

This module follows semantic versioning for algorithmic changes:
- MAJOR: Changes that alter score semantics or break invariants
- MINOR: New features that preserve existing behavior
- PATCH: Bug fixes and documentation

Current Version: 4.0.0

SAFE TO TUNE: Parameters marked with # TUNABLE
FOUNDATIONAL (risky to change): Sections marked with # FOUNDATIONAL

============================================================================
"""

import logging
import re
import math
from typing import Optional, Dict, Any, List, Tuple, NamedTuple
from dataclasses import dataclass, field
from collections import defaultdict
from enum import Enum
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


# =============================================================================
# ALGORITHM VERSION & SAFETY MARKERS
# =============================================================================

ALGORITHM_VERSION = "4.0.0"
ALGORITHM_VERSION_MAJOR = 4
ALGORITHM_VERSION_MINOR = 0
ALGORITHM_VERSION_PATCH = 0

# These constants are FOUNDATIONAL - changing them alters score semantics
# Any change requires invariant re-validation and A/B testing
_FOUNDATIONAL_CONSTANTS = {
    "SCORE_BOUNDS": (15, 95),           # Soft bounds for final scores
    "RELIABILITY_THRESHOLD": 0.4,        # Minimum for valid analysis
    "BASELINE_ALPHA": 0.2,               # Base adaptation rate
}


# =============================================================================
# PHASE 1: LINGUISTIC FEATURE DEFINITIONS
# =============================================================================
# 
# These define WHAT we detect, not HOW we score it.
# Separating definitions from scoring enables independent testing.
# =============================================================================

class FillerCategory(Enum):
    """
    Categorization of filler types by detection certainty.
    
    WHY THIS EXISTS:
    Not all "fillers" are equally certain. "Um" is universally a pause filler,
    but "basically" may be a legitimate discourse marker. Certainty weighting
    prevents over-penalizing ambiguous cases.
    
    WHEN IT DEGRADES:
    - Non-native speakers may use different patterns
    - Formal vs informal contexts differ
    - Transcription errors can create false positives
    """
    UNIVERSAL_PAUSE = "universal_pause"      # Cross-linguistic pause fillers
    ENGLISH_HEDGE = "english_hedge"          # May be meaningful in some dialects
    DISCOURSE_MARKER = "discourse_marker"    # Context-dependent


# TUNABLE: Filler patterns and certainty weights
# These can be adjusted based on corpus analysis without breaking invariants
FILLER_DEFINITIONS = {
    FillerCategory.UNIVERSAL_PAUSE: {
        "patterns": ["um", "uh", "er", "ah", "hmm", "mm"],
        "certainty": 0.95,  # High confidence these are fillers
        "cultural_notes": "Cross-linguistically recognized pause fillers",
    },
    FillerCategory.ENGLISH_HEDGE: {
        "patterns": ["basically", "actually", "literally"],
        "certainty": 0.7,  # May be discourse markers in some dialects
        "cultural_notes": "Context-dependent; may indicate emphasis not hesitation",
    },
    FillerCategory.DISCOURSE_MARKER: {
        "patterns": ["you know", "i mean", "kind of", "sort of"],
        "certainty": 0.5,  # Often serve legitimate discourse functions
        "cultural_notes": "Frequently used for rapport-building, not uncertainty",
    },
}

# Words that should NEVER be counted as fillers regardless of context
# These have clear semantic meaning in most uses
PROTECTED_WORDS = frozenset({"well", "like", "so", "okay", "right", "just", "really"})

# Pre-compute weighted filler list for efficiency
ALL_FILLERS_WEIGHTED: List[Tuple[str, float]] = []
for _category, _data in FILLER_DEFINITIONS.items():
    for _pattern in _data["patterns"]:
        ALL_FILLERS_WEIGHTED.append((_pattern, _data["certainty"]))


# TUNABLE: Stance detection patterns
# Strength values can be adjusted based on linguistic research
STANCE_PATTERNS = {
    "confidence": {
        "strong": {
            "patterns": [
                r"\bi know\b", r"\bi am confident\b", r"\bi'm confident\b",
                r"\bdefinitely\b", r"\bcertainly\b", r"\babsolutely\b",
            ],
            "strength": 1.0,  # Maximum confidence signal
        },
        "achievement": {
            "patterns": [
                r"\bi achieved\b", r"\bi led\b", r"\bi created\b", r"\bi built\b",
                r"\bi delivered\b", r"\bi improved\b",
            ],
            "strength": 0.7,  # Strong but not as explicit
        },
        "moderate": {
            "patterns": [
                r"\bi believe\b", r"\bin my experience\b", r"\bclearly\b",
            ],
            "strength": 0.4,  # Moderate confidence signal
        },
    },
    "hesitation": {
        "strong": {
            "patterns": [
                r"\bi don't know\b", r"\bi'm not sure\b", r"\bno idea\b",
            ],
            "strength": 1.0,  # Maximum hesitation signal
        },
        "moderate": {
            "patterns": [
                r"\bi guess\b", r"\bperhaps\b", r"\bpossibly\b", r"\bmight be\b",
            ],
            "strength": 0.6,
        },
        "mild": {
            "patterns": [
                r"\bmaybe\b", r"\bsomewhat\b",
            ],
            "strength": 0.3,
        },
    },
}

# Clarity patterns for structural analysis
CLARITY_PATTERNS = {
    "complete_sentence": re.compile(r'[A-Z][^.!?]*[.!?]'),
    "transition_word": re.compile(
        r'\b(however|therefore|furthermore|additionally|moreover|'
        r'consequently|nevertheless|meanwhile|subsequently|first|second|'
        r'finally|in addition|on the other hand)\b',
        re.IGNORECASE
    ),
}


# =============================================================================
# PHASE 2: FEATURE CORRELATION MATRIX
# =============================================================================
#
# FOUNDATIONAL: These correlations prevent double-counting.
# Changing them alters how penalties combine.
#
# WHY THIS EXISTS:
# Fillers and hesitation markers often co-occur because both indicate
# cognitive load. Without correction, a nervous speaker gets penalized
# twice for the same underlying cause.
#
# DOCUMENTED CORRELATIONS:
# - filler_density ↔ hesitation_density: ρ = 0.6
#   Both indicate uncertainty/cognitive load
#   Source: Speech disfluency research
#   
# - hesitation_density ↔ stance_ratio: ρ = -0.5
#   More hesitation markers mechanically lower stance ratio
#   This is a mathematical relationship, not independent
#   
# - filler_density ↔ sentence_completion: ρ = -0.3
#   Fillers tend to disrupt sentence structure
#   Weaker correlation; may be spurious in some contexts
# =============================================================================

FEATURE_CORRELATIONS = {
    # (feature1, feature2): correlation coefficient ρ ∈ [-1, 1]
    ("filler_density", "hesitation_density"): 0.6,
    ("hesitation_density", "stance_ratio"): -0.5,
    ("filler_density", "sentence_completion"): -0.3,
}


# =============================================================================
# PHASE 3: RELIABILITY MODELING (Epistemic Layer)
# =============================================================================
#
# Reliability represents our CONFIDENCE IN THE ANALYSIS, not the speaker's quality.
# This is the epistemic layer that modulates how much we trust the computed scores.
# =============================================================================

@dataclass(frozen=True)
class ReliabilityFactors:
    """
    Components of analysis reliability.
    
    INVARIANT: ∂reliability/∂data_sufficiency ≥ 0
    More data cannot decrease our confidence in the analysis.
    
    WHY GEOMETRIC MEAN:
    Any single low factor should pull down overall reliability.
    If we have lots of data but high variance, we shouldn't trust results.
    Geometric mean naturally enforces this.
    """
    data_sufficiency: float    # How much data we have (0-1)
    feature_agreement: float   # How consistent features are (0-1)
    variance_stability: float  # How stable the signal is (0-1)
    
    def __post_init__(self):
        """Validate bounds on construction."""
        # INVARIANT: All factors must be in [0, 1]
        assert 0 <= self.data_sufficiency <= 1, f"data_sufficiency out of bounds: {self.data_sufficiency}"
        assert 0 <= self.feature_agreement <= 1, f"feature_agreement out of bounds: {self.feature_agreement}"
        assert 0 <= self.variance_stability <= 1, f"variance_stability out of bounds: {self.variance_stability}"
    
    def compute_reliability(self) -> float:
        """
        Compute overall reliability as geometric mean of factors.
        
        MATHEMATICAL JUSTIFICATION:
        Geometric mean ensures:
        - If any factor is 0, reliability is 0
        - All factors contribute equally in log-space
        - Result is always ≤ arithmetic mean (conservative)
        
        INVARIANT: Result ∈ [0, 1]
        """
        product = self.data_sufficiency * self.feature_agreement * self.variance_stability
        
        # Geometric mean of 3 factors
        reliability = product ** (1/3)
        
        # ASSERTION: Boundedness invariant
        assert 0 <= reliability <= 1, f"Reliability out of bounds: {reliability}"
        
        return round(reliability, 3)


@dataclass
class SignalAnalysis:
    """
    Complete signal quality analysis with epistemic metadata.
    
    This is the output of Phase 1-2 (signal acquisition + validation).
    """
    is_valid: bool
    reliability: float
    reliability_factors: ReliabilityFactors
    reason: str
    word_count: int
    sentence_count: int
    unique_word_ratio: float
    speech_density: float  # words per sentence


class SignalAnalyzer:
    """
    Phase 1-2: Signal Acquisition and Validation.
    
    Analyzes transcript signal quality BEFORE any scoring.
    This determines whether we have enough data to trust the analysis.
    """
    
    # TUNABLE: Minimum thresholds for pattern detection
    MINIMUM_WORDS_FOR_PATTERNS = 25
    MINIMUM_SENTENCES_FOR_STRUCTURE = 2
    
    def analyze(self, transcript: str, duration_seconds: Optional[float] = None) -> SignalAnalysis:
        """
        Analyze signal quality of a transcript.
        
        PHASE 1: Signal Acquisition
        - Validate input
        - Extract basic statistics
        
        PHASE 2: Reliability Estimation
        - Compute reliability factors
        - Determine validity
        """
        # =====================================================================
        # PHASE 1: SIGNAL ACQUISITION
        # =====================================================================
        
        # Step 1.1: Handle empty input
        if not transcript or not transcript.strip():
            return SignalAnalysis(
                is_valid=False,
                reliability=0.0,
                reliability_factors=ReliabilityFactors(0.0, 0.0, 0.0),
                reason="empty_transcript",
                word_count=0,
                sentence_count=0,
                unique_word_ratio=0.0,
                speech_density=0.0
            )
        
        # Step 1.2: Basic text processing
        text = transcript.strip()
        words = text.split()
        word_count = len(words)
        
        # Step 1.3: Sentence detection
        # WHY: Sentences are structural units for clarity analysis
        sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
        sentence_count = len(sentences)
        
        # Step 1.4: Lexical diversity
        # WHY: Low diversity may indicate repetition or transcription errors
        unique_words = set(w.lower() for w in words if len(w) > 1)
        unique_word_ratio = len(unique_words) / word_count if word_count > 0 else 0
        
        # Step 1.5: Speech density
        # WHY: Extreme density (too high or low) indicates unusual patterns
        speech_density = word_count / max(sentence_count, 1)
        
        # =====================================================================
        # PHASE 2: RELIABILITY ESTIMATION
        # =====================================================================
        
        reliability_factors = self._compute_reliability_factors(
            word_count, sentence_count, unique_word_ratio, speech_density
        )
        
        reliability = reliability_factors.compute_reliability()
        
        # FOUNDATIONAL: Validity threshold
        is_valid = reliability >= _FOUNDATIONAL_CONSTANTS["RELIABILITY_THRESHOLD"]
        
        # Determine reason for invalidity
        if not is_valid:
            if word_count < self.MINIMUM_WORDS_FOR_PATTERNS:
                reason = "insufficient_content"
            elif sentence_count < self.MINIMUM_SENTENCES_FOR_STRUCTURE:
                reason = "insufficient_structure"
            elif unique_word_ratio < 0.2:
                reason = "low_lexical_diversity"
            else:
                reason = "low_overall_reliability"
        else:
            reason = "valid"
        
        return SignalAnalysis(
            is_valid=is_valid,
            reliability=reliability,
            reliability_factors=reliability_factors,
            reason=reason,
            word_count=word_count,
            sentence_count=sentence_count,
            unique_word_ratio=unique_word_ratio,
            speech_density=speech_density
        )
    
    def _compute_reliability_factors(
        self,
        word_count: int,
        sentence_count: int,
        unique_word_ratio: float,
        speech_density: float
    ) -> ReliabilityFactors:
        """
        Compute individual reliability factors.
        
        Each factor measures a different aspect of signal quality:
        
        DATA SUFFICIENCY:
        - Smooth sigmoid around minimum word threshold
        - WHY sigmoid: Gradual transition, not cliff at threshold
        
        FEATURE AGREEMENT:
        - Based on structural consistency
        - WHY: If structure is inconsistent, features may be unreliable
        
        VARIANCE STABILITY:
        - Based on lexical diversity
        - WHY: Extreme diversity (too high or low) indicates instability
        
        INVARIANT: Overall reliability must be monotonically non-decreasing with word_count.
        This is enforced by using data_sufficiency as a floor for final reliability.
        """
        # Factor 1: Data Sufficiency
        # Smooth sigmoid ensures gradual reliability increase
        # This factor is STRICTLY monotonically increasing with word_count
        data_sufficiency = self._smooth_threshold(
            word_count, 
            threshold=self.MINIMUM_WORDS_FOR_PATTERNS,
            steepness=0.08  # TUNABLE: Controls transition sharpness
        )
        
        # Factor 2: Feature Agreement
        # Based on structural consistency
        density_reasonable = 5 <= speech_density <= 35
        has_structure = sentence_count >= self.MINIMUM_SENTENCES_FOR_STRUCTURE
        
        if density_reasonable and has_structure:
            # Good structure → high agreement
            feature_agreement = min(1.0, 0.6 + unique_word_ratio * 0.5)
        elif density_reasonable or has_structure:
            # Partial structure → moderate agreement
            feature_agreement = 0.5 + unique_word_ratio * 0.3
        else:
            # Poor structure → low agreement
            feature_agreement = 0.3 + unique_word_ratio * 0.2
        
        # Factor 3: Variance Stability
        # Based on lexical diversity being in reasonable range
        if word_count < 50:
            # Short texts: check if diversity is reasonable
            if 0.3 <= unique_word_ratio <= 0.8:
                variance_stability = 0.8
            else:
                variance_stability = 0.5
        else:
            # Longer texts: diversity should scale
            variance_stability = min(1.0, 0.4 + unique_word_ratio * 0.8)
        
        # INVARIANT ENFORCEMENT: Reliability monotonicity
        # Ensure feature_agreement and variance_stability are at least proportional
        # to data_sufficiency, so adding more data can never hurt reliability.
        # This creates a floor: agreement and stability cannot fall below 
        # data_sufficiency when we have sufficient data.
        min_factor_floor = data_sufficiency * 0.7 + 0.3  # Ranges from 0.3 to 1.0
        feature_agreement = max(feature_agreement, min_factor_floor)
        variance_stability = max(variance_stability, min_factor_floor)
        
        return ReliabilityFactors(
            data_sufficiency=round(max(0, min(1, data_sufficiency)), 3),
            feature_agreement=round(max(0, min(1, feature_agreement)), 3),
            variance_stability=round(max(0, min(1, variance_stability)), 3)
        )
    
    @staticmethod
    def _smooth_threshold(x: float, threshold: float, steepness: float = 0.1) -> float:
        """
        Smooth sigmoid threshold function.
        
        WHY THIS EXISTS:
        Hard thresholds create discontinuities. A transcript with 24 words
        shouldn't be dramatically different from one with 26 words.
        Sigmoid provides smooth transition.
        
        MATHEMATICAL FORM:
        f(x) = 1 / (1 + exp(-steepness * (x - threshold)))
        
        PROPERTIES:
        - f(threshold) ≈ 0.5
        - f(x) → 1 as x → ∞
        - f(x) → 0 as x → -∞
        """
        try:
            return 1 / (1 + math.exp(-steepness * (x - threshold)))
        except OverflowError:
            # Handle extreme values
            return 0.0 if x < threshold else 1.0


# =============================================================================
# PHASE 4: NORMALIZED METRICS
# =============================================================================
#
# All metrics are normalized to comparable scales.
# Raw counts are preserved for display but NEVER used for scoring.
# =============================================================================

@dataclass
class NormalizedMetrics:
    """
    Normalized metrics after feature extraction and normalization.
    
    IMPORTANT: Scoring uses DENSITIES, not raw counts.
    Raw counts are preserved for display only.
    
    NORMALIZATION RATIONALE:
    - Densities are comparable across different transcript lengths
    - Raw counts favor longer transcripts unfairly
    - Densities enable meaningful baseline comparison
    """
    # Filler metrics (normalized)
    filler_density: float                      # Fillers per 100 words
    filler_certainty_weighted_density: float   # Weighted by detection certainty
    filler_by_category: Dict[str, float]       # Density by category
    
    # Stance metrics (normalized)
    assertion_density: float                   # Assertions per 100 words
    hesitation_density: float                  # Hesitations per 100 words
    stance_ratio: float                        # Assertions / (Assertions + Hesitations)
    
    # Clarity metrics (normalized)
    sentence_completion_ratio: float           # Complete sentences / total
    avg_sentence_length: float                 # Words per sentence
    transition_density: float                  # Transitions per sentence
    
    # Raw data (for display only, NEVER for scoring)
    raw_filler_count: int
    raw_filler_breakdown: Dict[str, int]
    word_count: int
    sentence_count: int


class MetricsCalculator:
    """
    Phase 3: Feature Extraction and Normalization.
    
    Extracts raw features and normalizes them to comparable scales.
    """
    
    def __init__(self):
        self._compile_patterns()
    
    def _compile_patterns(self):
        """Pre-compile regex patterns for efficiency."""
        # Filler patterns with certainty weights
        self._filler_patterns: List[Tuple[re.Pattern, float, str]] = []
        for filler, certainty in ALL_FILLERS_WEIGHTED:
            if " " in filler:
                # Multi-word filler
                pattern = re.compile(re.escape(filler), re.IGNORECASE)
            else:
                # Single-word filler with word boundaries
                pattern = re.compile(r'\b' + re.escape(filler) + r'\b', re.IGNORECASE)
            self._filler_patterns.append((pattern, certainty, filler))
        
        # Stance patterns
        self._stance_patterns = {"confidence": [], "hesitation": []}
        for stance_type in ["confidence", "hesitation"]:
            for strength_level, data in STANCE_PATTERNS[stance_type].items():
                for pattern_str in data["patterns"]:
                    pattern = re.compile(pattern_str, re.IGNORECASE)
                    self._stance_patterns[stance_type].append(
                        (pattern, data["strength"])
                    )
    
    def calculate(self, transcript: str, signal: SignalAnalysis) -> NormalizedMetrics:
        """
        Extract features and normalize metrics.
        
        PHASE 3a: Feature Extraction
        - Detect patterns
        - Count occurrences
        
        PHASE 3b: Normalization
        - Convert to densities
        - Scale appropriately
        """
        text = transcript.lower()
        word_count = signal.word_count
        sentence_count = max(1, signal.sentence_count)
        
        # =====================================================================
        # PHASE 3a: FEATURE EXTRACTION
        # =====================================================================
        
        # Extract filler features
        filler_results = self._detect_fillers(text, word_count)
        
        # Extract stance features
        assertion_score = self._detect_stance(text, "confidence")
        hesitation_score = self._detect_stance(text, "hesitation")
        
        # Extract clarity features
        clarity = self._calculate_clarity(transcript, sentence_count)
        
        # =====================================================================
        # PHASE 3b: NORMALIZATION
        # =====================================================================
        
        # Normalize stance to density (per 100 words)
        # WHY per 100: Human-interpretable scale
        assertion_density = (assertion_score / word_count * 100) if word_count > 0 else 0
        hesitation_density = (hesitation_score / word_count * 100) if word_count > 0 else 0
        
        # Compute stance ratio
        # WHY ratio: Captures balance between confidence and hesitation
        # EDGE CASE: If no stance markers, default to neutral 0.5
        total_stance = assertion_score + hesitation_score
        stance_ratio = assertion_score / total_stance if total_stance > 0 else 0.5
        
        return NormalizedMetrics(
            filler_density=round(filler_results["density"], 2),
            filler_certainty_weighted_density=round(filler_results["weighted_density"], 2),
            filler_by_category=filler_results["by_category"],
            assertion_density=round(assertion_density, 2),
            hesitation_density=round(hesitation_density, 2),
            stance_ratio=round(stance_ratio, 3),
            sentence_completion_ratio=round(clarity["completion_ratio"], 2),
            avg_sentence_length=round(clarity["avg_length"], 1),
            transition_density=round(clarity["transition_density"], 2),
            raw_filler_count=filler_results["raw_count"],
            raw_filler_breakdown=filler_results["breakdown"],
            word_count=word_count,
            sentence_count=sentence_count
        )
    
    def _detect_fillers(self, text: str, word_count: int) -> Dict[str, Any]:
        """
        Detect filler words with certainty weighting.
        
        Returns both raw counts (for display) and weighted densities (for scoring).
        """
        raw_count = 0
        weighted_count = 0.0
        breakdown = {}
        by_category = defaultdict(float)
        
        for pattern, certainty, filler_word in self._filler_patterns:
            count = len(pattern.findall(text))
            if count > 0:
                raw_count += count
                weighted_count += count * certainty
                breakdown[filler_word] = count
                
                # Track by category
                for cat, data in FILLER_DEFINITIONS.items():
                    if filler_word in data["patterns"]:
                        by_category[cat.value] += count * certainty
                        break
        
        # Normalize to per-100-words density
        density = (raw_count / word_count * 100) if word_count > 0 else 0
        weighted_density = (weighted_count / word_count * 100) if word_count > 0 else 0
        
        return {
            "raw_count": raw_count,
            "density": density,
            "weighted_density": weighted_density,
            "breakdown": breakdown,
            "by_category": dict(by_category)
        }
    
    def _detect_stance(self, text: str, stance_type: str) -> float:
        """
        Detect stance markers with strength weighting.
        
        Returns weighted score (not count) based on marker strength.
        """
        weighted_score = 0.0
        for pattern, strength in self._stance_patterns[stance_type]:
            count = len(pattern.findall(text))
            weighted_score += count * strength
        return weighted_score
    
    def _calculate_clarity(self, transcript: str, sentence_count: int) -> Dict[str, float]:
        """
        Calculate clarity metrics from transcript structure.
        
        METRICS:
        - completion_ratio: Fraction of complete sentences
        - avg_length: Average words per sentence
        - transition_density: Transition words per sentence
        """
        # Complete sentence detection
        complete = len(CLARITY_PATTERNS["complete_sentence"].findall(transcript))
        completion_ratio = min(1.0, complete / sentence_count) if sentence_count > 0 else 0
        
        # Average sentence length
        sentences = [s.strip() for s in re.split(r'[.!?]+', transcript) if s.strip()]
        if sentences:
            lengths = [len(s.split()) for s in sentences]
            avg_length = sum(lengths) / len(lengths)
        else:
            avg_length = 0
        
        # Transition word density
        transitions = len(CLARITY_PATTERNS["transition_word"].findall(transcript))
        transition_density = transitions / sentence_count if sentence_count > 0 else 0
        
        return {
            "completion_ratio": completion_ratio,
            "avg_length": avg_length,
            "transition_density": transition_density
        }


# =============================================================================
# PHASE 5: BASELINE MANAGEMENT
# =============================================================================
#
# Baselines are FIRST-CLASS OBJECTS, not side effects.
# They are explicit, inspectable, stable, and drift-aware.
# =============================================================================

@dataclass
class DriftState:
    """
    Continuous drift modeling for baseline adaptation.
    
    WHY THIS EXISTS:
    User behavior changes over time. We need to:
    1. Detect when behavior has shifted
    2. Adapt baselines appropriately
    3. Avoid over-reacting to noise
    
    DRIFT PROPERTIES:
    - magnitude: How much behavior changed (z-score)
    - direction: +1 improving, -1 degrading, 0 stable
    - persistence: How many consecutive sessions show drift
    
    ADAPTATION RULE:
    - Persistent drift → faster adaptation
    - Volatile behavior → slower adaptation
    """
    magnitude: float = 0.0
    direction: int = 0  # -1, 0, +1
    persistence: int = 0
    history: List[float] = field(default_factory=list)
    
    # TUNABLE: How many sessions before we trust drift
    PERSISTENCE_THRESHOLD = 3
    
    def update(self, current_z: float, improving_if_negative: bool = True) -> None:
        """
        Update drift state with new observation.
        
        Args:
            current_z: z-score of current observation vs baseline
            improving_if_negative: True if negative z means improvement
                                   (e.g., fewer fillers is better)
        """
        self.magnitude = abs(current_z)
        
        # Determine direction
        # THRESHOLD: 0.5 std dev to count as meaningful drift
        if current_z > 0.5:
            self.direction = -1 if improving_if_negative else 1
        elif current_z < -0.5:
            self.direction = 1 if improving_if_negative else -1
        else:
            self.direction = 0
        
        # Update history (rolling window)
        self.history.append(current_z)
        if len(self.history) > 10:
            self.history = self.history[-10:]
        
        # Count consecutive same-direction observations
        if len(self.history) >= 2:
            recent_directions = [
                1 if z > 0.5 else (-1 if z < -0.5 else 0)
                for z in self.history[-self.PERSISTENCE_THRESHOLD:]
            ]
            if all(d == self.direction for d in recent_directions):
                self.persistence = len(recent_directions)
            else:
                self.persistence = 1
        else:
            self.persistence = 1
    
    def get_adaptation_rate(self, base_alpha: float) -> float:
        """
        Get baseline adaptation rate based on drift persistence.
        
        ADAPTATION LOGIC:
        - Persistent drift → adapt faster (up to 2x base rate)
        - Stable behavior → normal rate
        - Volatile behavior → slower rate (0.5x base rate)
        
        WHY: Prevents over-reacting to noise while allowing
        genuine behavioral changes to update baseline.
        """
        if self.persistence >= self.PERSISTENCE_THRESHOLD:
            # Persistent drift: adapt faster
            return min(0.4, base_alpha * (1 + self.persistence * 0.1))
        elif self.magnitude < 0.5:
            # Stable behavior: normal rate
            return base_alpha
        else:
            # Recent deviation but not persistent: slower adaptation
            return base_alpha * 0.5


@dataclass
class BaselineStatistics:
    """
    First-class baseline object with full inspection capability.
    
    DESIGN PRINCIPLES:
    1. EXPLICIT: All values visible, no hidden state
    2. INSPECTABLE: Can examine any component
    3. STABLE: Changes only through documented update path
    4. DRIFT-AWARE: Tracks behavioral changes over time
    
    BASELINE EXPECTATIONS:
    These are the "prior" values used when reliability is low.
    They represent what we expect BEFORE seeing data.
    """
    # Statistical baseline for features
    mean_filler_density: float
    mean_stance_ratio: float
    std_filler_density: float
    std_stance_ratio: float
    
    # 95% confidence intervals
    filler_density_ci: Tuple[float, float]
    stance_ratio_ci: Tuple[float, float]
    
    # Metadata
    sample_count: int
    is_user_specific: bool
    
    # Drift tracking
    filler_drift: DriftState = field(default_factory=DriftState)
    stance_drift: DriftState = field(default_factory=DriftState)
    
    # Epistemic priors (what we expect when reliability is low)
    # These are NOT neutral 50 - they reflect population/user history
    baseline_confidence_expectation: float = 55.0
    baseline_clarity_expectation: float = 60.0
    
    @classmethod
    def global_default(cls) -> "BaselineStatistics":
        """
        Global baseline from speech research.
        
        SOURCE: Based on analysis of conversational speech patterns.
        These values represent typical speakers, not ideal speakers.
        
        TUNABLE: These can be updated based on corpus analysis.
        """
        mean_filler = 3.5   # fillers per 100 words
        std_filler = 2.0
        mean_stance = 0.55  # slightly more assertions than hesitations
        std_stance = 0.15
        
        return cls(
            mean_filler_density=mean_filler,
            mean_stance_ratio=mean_stance,
            std_filler_density=std_filler,
            std_stance_ratio=std_stance,
            filler_density_ci=(mean_filler - 1.96*std_filler, mean_filler + 1.96*std_filler),
            stance_ratio_ci=(mean_stance - 1.96*std_stance, mean_stance + 1.96*std_stance),
            sample_count=0,
            is_user_specific=False,
            filler_drift=DriftState(),
            stance_drift=DriftState(),
            baseline_confidence_expectation=55.0,
            baseline_clarity_expectation=60.0
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Export baseline for inspection/debugging."""
        return {
            "mean_filler_density": self.mean_filler_density,
            "mean_stance_ratio": self.mean_stance_ratio,
            "std_filler_density": self.std_filler_density,
            "std_stance_ratio": self.std_stance_ratio,
            "filler_density_ci": self.filler_density_ci,
            "stance_ratio_ci": self.stance_ratio_ci,
            "sample_count": self.sample_count,
            "is_user_specific": self.is_user_specific,
            "baseline_confidence_expectation": self.baseline_confidence_expectation,
            "baseline_clarity_expectation": self.baseline_clarity_expectation,
            "filler_drift": {
                "magnitude": self.filler_drift.magnitude,
                "direction": self.filler_drift.direction,
                "persistence": self.filler_drift.persistence,
            },
            "stance_drift": {
                "magnitude": self.stance_drift.magnitude,
                "direction": self.stance_drift.direction,
                "persistence": self.stance_drift.persistence,
            },
        }


class BaselineManager:
    """
    Manages baselines with continuous drift modeling.
    
    RESPONSIBILITIES:
    1. Retrieve appropriate baseline (global or user-specific)
    2. Track drift over time
    3. Update baselines with adaptive rates
    4. Prevent sudden baseline shifts
    """
    
    # TUNABLE: Minimum sessions before user-specific baseline
    MIN_SESSIONS_FOR_BASELINE = 5
    
    # FOUNDATIONAL: Base adaptation rate
    BASE_EMA_ALPHA = _FOUNDATIONAL_CONSTANTS["BASELINE_ALPHA"]
    
    def __init__(self):
        self._global = BaselineStatistics.global_default()
        self._user_baselines: Dict[str, BaselineStatistics] = {}
        self._recent_observations: Dict[str, List[Tuple[float, float]]] = {}
    
    def get_baseline(
        self,
        user_id: Optional[str] = None,
        historical_sessions: Optional[List[Dict]] = None
    ) -> BaselineStatistics:
        """
        Get appropriate baseline for analysis.
        
        LOGIC:
        1. If no user_id, return global baseline
        2. If user has cached baseline, return it
        3. If enough history, compute user baseline
        4. Otherwise, return global baseline
        """
        if not user_id:
            return self._global
        
        if user_id in self._user_baselines:
            return self._user_baselines[user_id]
        
        if not historical_sessions or len(historical_sessions) < self.MIN_SESSIONS_FOR_BASELINE:
            return self._global
        
        baseline = self._compute_user_baseline(historical_sessions)
        self._user_baselines[user_id] = baseline
        return baseline
    
    def update_with_drift(
        self,
        user_id: str,
        metrics: NormalizedMetrics
    ) -> Dict[str, Any]:
        """
        Update baseline with continuous drift tracking.
        
        ALGORITHM:
        1. Compute z-scores vs current baseline
        2. Update drift state (magnitude, direction, persistence)
        3. Get adaptive update rate based on drift
        4. Update baseline means with EMA
        5. Update epistemic priors slowly
        
        Returns drift analysis for inspection.
        """
        if user_id not in self._user_baselines:
            # Track observations until we have enough for baseline
            if user_id not in self._recent_observations:
                self._recent_observations[user_id] = []
            self._recent_observations[user_id].append(
                (metrics.filler_density, metrics.stance_ratio)
            )
            return {"drift_tracked": False, "reason": "insufficient_history"}
        
        baseline = self._user_baselines[user_id]
        
        # =====================================================================
        # Step 1: Compute z-scores
        # =====================================================================
        
        # Z-score for filler density
        # Named intermediate: filler_deviation
        filler_deviation = metrics.filler_density - baseline.mean_filler_density
        filler_std_safe = max(baseline.std_filler_density, 0.1)  # Prevent div by zero
        filler_z = filler_deviation / filler_std_safe
        
        # Z-score for stance ratio
        stance_deviation = metrics.stance_ratio - baseline.mean_stance_ratio
        stance_std_safe = max(baseline.std_stance_ratio, 0.01)
        stance_z = stance_deviation / stance_std_safe
        
        # =====================================================================
        # Step 2: Update drift states
        # =====================================================================
        
        # For fillers: negative z means improvement (fewer fillers)
        baseline.filler_drift.update(filler_z, improving_if_negative=True)
        
        # For stance: positive z means improvement (more confident)
        baseline.stance_drift.update(stance_z, improving_if_negative=False)
        
        # =====================================================================
        # Step 3: Get adaptive update rates
        # =====================================================================
        
        filler_alpha = baseline.filler_drift.get_adaptation_rate(self.BASE_EMA_ALPHA)
        stance_alpha = baseline.stance_drift.get_adaptation_rate(self.BASE_EMA_ALPHA)
        
        # =====================================================================
        # Step 4: Update baseline means with EMA
        # =====================================================================
        
        # EMA formula: new = α * observation + (1-α) * old
        new_filler_mean = filler_alpha * metrics.filler_density + (1 - filler_alpha) * baseline.mean_filler_density
        new_stance_mean = stance_alpha * metrics.stance_ratio + (1 - stance_alpha) * baseline.mean_stance_ratio
        
        # =====================================================================
        # Step 5: Update epistemic priors slowly
        # =====================================================================
        
        # Priors update much slower than means (0.1 vs adaptive alpha)
        # WHY: Priors represent long-term expectation, not recent performance
        prior_alpha = 0.1
        new_conf_expectation = prior_alpha * (metrics.stance_ratio * 100) + (1 - prior_alpha) * baseline.baseline_confidence_expectation
        new_clarity_expectation = prior_alpha * (metrics.sentence_completion_ratio * 100) + (1 - prior_alpha) * baseline.baseline_clarity_expectation
        
        # =====================================================================
        # Step 6: Create updated baseline
        # =====================================================================
        
        self._user_baselines[user_id] = BaselineStatistics(
            mean_filler_density=new_filler_mean,
            mean_stance_ratio=new_stance_mean,
            std_filler_density=baseline.std_filler_density,
            std_stance_ratio=baseline.std_stance_ratio,
            filler_density_ci=(new_filler_mean - 1.96*baseline.std_filler_density,
                               new_filler_mean + 1.96*baseline.std_filler_density),
            stance_ratio_ci=(new_stance_mean - 1.96*baseline.std_stance_ratio,
                            new_stance_mean + 1.96*baseline.std_stance_ratio),
            sample_count=baseline.sample_count + 1,
            is_user_specific=True,
            filler_drift=baseline.filler_drift,
            stance_drift=baseline.stance_drift,
            baseline_confidence_expectation=new_conf_expectation,
            baseline_clarity_expectation=new_clarity_expectation
        )
        
        return {
            "drift_tracked": True,
            "filler_drift": {
                "magnitude": baseline.filler_drift.magnitude,
                "direction": baseline.filler_drift.direction,
                "persistence": baseline.filler_drift.persistence,
                "adaptation_rate": filler_alpha
            },
            "stance_drift": {
                "magnitude": baseline.stance_drift.magnitude,
                "direction": baseline.stance_drift.direction,
                "persistence": baseline.stance_drift.persistence,
                "adaptation_rate": stance_alpha
            }
        }
    
    def _compute_user_baseline(self, sessions: List[Dict]) -> BaselineStatistics:
        """
        Compute user-specific baseline from historical sessions.
        
        Uses sample statistics with fallback to global for missing data.
        """
        filler_densities = []
        stance_ratios = []
        
        for session in sessions:
            if "filler_density" in session:
                filler_densities.append(session["filler_density"])
            if "stance_ratio" in session:
                stance_ratios.append(session["stance_ratio"])
            elif "confidence_ratio" in session:
                stance_ratios.append(session["confidence_ratio"])
        
        # Compute filler statistics
        if filler_densities:
            mean_filler = sum(filler_densities) / len(filler_densities)
            if len(filler_densities) > 1:
                var = sum((x - mean_filler)**2 for x in filler_densities) / (len(filler_densities) - 1)
                std_filler = math.sqrt(var)
            else:
                std_filler = self._global.std_filler_density
        else:
            mean_filler = self._global.mean_filler_density
            std_filler = self._global.std_filler_density
        
        # Compute stance statistics
        if stance_ratios:
            mean_stance = sum(stance_ratios) / len(stance_ratios)
            if len(stance_ratios) > 1:
                var = sum((x - mean_stance)**2 for x in stance_ratios) / (len(stance_ratios) - 1)
                std_stance = math.sqrt(var)
            else:
                std_stance = self._global.std_stance_ratio
        else:
            mean_stance = self._global.mean_stance_ratio
            std_stance = self._global.std_stance_ratio
        
        # Compute initial baseline expectations from history
        # Maps stance ratio to confidence expectation
        baseline_conf = 55.0 + (mean_stance - 0.5) * 30  # Scale to ~40-70
        baseline_clarity = 60.0
        
        return BaselineStatistics(
            mean_filler_density=mean_filler,
            mean_stance_ratio=mean_stance,
            std_filler_density=std_filler,
            std_stance_ratio=std_stance,
            filler_density_ci=(mean_filler - 1.96*std_filler, mean_filler + 1.96*std_filler),
            stance_ratio_ci=(mean_stance - 1.96*std_stance, mean_stance + 1.96*std_stance),
            sample_count=len(sessions),
            is_user_specific=True,
            filler_drift=DriftState(),
            stance_drift=DriftState(),
            baseline_confidence_expectation=baseline_conf,
            baseline_clarity_expectation=baseline_clarity
        )


# =============================================================================
# PHASE 6: INTERACTION-AWARE CONTRIBUTION FUNCTIONS
# =============================================================================
#
# These functions compute how each feature contributes to scores.
# Interaction correction prevents double-counting correlated features.
# =============================================================================

class InteractionAwareContributions:
    """
    Contribution functions with interaction correction.
    
    PROBLEM: Correlated features cause double-penalization.
    Example: High fillers AND high hesitation both penalize confidence,
             but they share common variance (both indicate uncertainty).
    
    SOLUTION: Bounded interaction terms that cap combined penalty.
    
    MATHEMATICAL JUSTIFICATION:
    For features f1, f2 with correlation ρ:
        naive_penalty = penalty(f1) + penalty(f2)
        corrected_penalty = naive_penalty - ρ * overlap_term
        
    Where overlap_term = min(|penalty(f1)|, |penalty(f2)|)
    
    This ensures we don't count shared variance twice.
    """
    
    # FOUNDATIONAL: Maximum combined penalty from correlated features
    # Prevents adversarial edge cases from producing extreme scores
    MAX_COMBINED_PENALTY = 0.4
    
    @staticmethod
    def positive_contribution(
        value: float,
        baseline_mean: float,
        baseline_std: float,
        max_effect: float = 0.3
    ) -> Tuple[float, str, float]:
        """
        Contribution for features where higher is better.
        
        INVARIANT: ∂contribution/∂value ≥ 0
        Higher value cannot decrease contribution.
        
        MATHEMATICAL FORM:
        1. Compute z-score: z = (value - mean) / std
        2. Apply sigmoid: raw = 1 / (1 + exp(-z * 0.5))
        3. Scale to contribution: 0.5 + (raw - 0.5) * max_effect * 2
        
        WHY SIGMOID:
        - Bounded output prevents extreme contributions
        - Smooth gradient prevents instability
        - Centered at baseline (z=0 → contribution=0.5)
        
        Returns: (contribution, explanation, z_score)
        """
        # Step 1: Compute z-score
        std_safe = max(baseline_std, 0.01)  # Prevent div by zero
        z = (value - baseline_mean) / std_safe
        
        # Step 2: Apply sigmoid
        # WHY 0.5 steepness: Moderate sensitivity, not too sharp
        # INVARIANT: Clamp z to prevent exp overflow (exp(700) overflows float64)
        z_clamped = max(-500, min(500, z))
        raw = 1 / (1 + math.exp(-z_clamped * 0.5))
        
        # Step 3: Scale to contribution range
        # Maps sigmoid [0,1] to [0.5-max_effect, 0.5+max_effect]
        contribution = 0.5 + (raw - 0.5) * max_effect * 2
        
        # INVARIANT: Boundedness
        contribution = max(0, min(1, contribution))
        
        # Generate explanation
        if z > 1:
            explanation = "above_average"
        elif z < -1:
            explanation = "below_average"
        else:
            explanation = "near_average"
        
        return contribution, explanation, z
    
    @staticmethod
    def negative_contribution(
        value: float,
        baseline_mean: float,
        baseline_std: float,
        max_effect: float = 0.3
    ) -> Tuple[float, str, float]:
        """
        Contribution for features where higher is worse.
        
        INVARIANT: ∂contribution/∂value ≤ 0
        Higher value cannot increase contribution.
        
        Same as positive_contribution but with inverted sigmoid.
        
        Returns: (contribution, explanation, z_score)
        """
        # Step 1: Compute z-score
        std_safe = max(baseline_std, 0.01)
        z = (value - baseline_mean) / std_safe
        
        # Step 2: Apply INVERTED sigmoid
        # Note: positive z now DECREASES contribution
        # INVARIANT: Clamp z to prevent exp overflow (exp(700) overflows float64)
        z_clamped = max(-500, min(500, z))
        raw = 1 / (1 + math.exp(z_clamped * 0.5))
        
        # Step 3: Scale to contribution range
        contribution = 0.5 + (raw - 0.5) * max_effect * 2
        
        # INVARIANT: Boundedness
        contribution = max(0, min(1, contribution))
        
        # Generate explanation
        if z > 1:
            explanation = "above_average_negative"
        elif z < -1:
            explanation = "below_average_positive"
        else:
            explanation = "near_average"
        
        return contribution, explanation, z
    
    @staticmethod
    def ratio_contribution(ratio: float, neutral: float = 0.5) -> Tuple[float, str, float]:
        """
        Contribution from a ratio in [0, 1].
        
        For stance ratio: higher means more confident.
        Contribution equals ratio directly (linear mapping).
        
        Returns: (contribution, explanation, z_score)
        """
        contribution = ratio
        z = (ratio - neutral) / 0.2  # Approximate z-score
        
        if ratio > neutral + 0.15:
            explanation = "positive_stance"
        elif ratio < neutral - 0.15:
            explanation = "negative_stance"
        else:
            explanation = "neutral_stance"
        
        return contribution, explanation, z
    
    @staticmethod
    def structure_contribution(
        value: float,
        optimal_low: float,
        optimal_high: float
    ) -> Tuple[float, str, float]:
        """
        Contribution for structural metrics with optimal range.
        
        WHY OPTIMAL RANGE:
        Some metrics have a "sweet spot". Sentences that are too short
        lack detail; too long are hard to follow. Both extremes are bad.
        
        Returns: (contribution, explanation, z_score)
        """
        if optimal_low <= value <= optimal_high:
            return 1.0, "optimal_range", 0.0
        elif value < optimal_low:
            # Below optimal: penalize proportionally
            contribution = max(0.3, value / optimal_low)
            z = (value - optimal_low) / optimal_low
            return contribution, "below_optimal", z
        else:
            # Above optimal: penalize proportionally
            overshoot = value - optimal_high
            contribution = max(0.3, 1.0 - overshoot / (optimal_high * 2))
            z = overshoot / optimal_high
            return contribution, "above_optimal", z
    
    @classmethod
    def apply_interaction_correction(
        cls,
        contributions: Dict[str, Tuple[float, str, float]],
        feature_pairs: List[Tuple[str, str, float]]
    ) -> Dict[str, float]:
        """
        Apply interaction correction to prevent double-penalization.
        
        ALGORITHM:
        1. For each correlated pair where BOTH are penalizing (< 0.5):
           - Compute overlap = ρ * min(penalty1, penalty2)
           - Reduce the smaller penalty by overlap/2
        2. Enforce max combined penalty cap
        
        WHY THIS WORKS:
        Correlated features share variance. If both penalize, we're
        counting that shared variance twice. The overlap term estimates
        how much is shared and removes it from one feature.
        
        Args:
            contributions: {feature_name: (contribution, explanation, z_score)}
            feature_pairs: [(feature1, feature2, correlation), ...]
        
        Returns:
            Corrected contributions (just the float values)
        """
        # Start with raw contributions
        corrected = {name: data[0] for name, data in contributions.items()}
        
        # Apply pairwise corrections
        for f1, f2, rho in feature_pairs:
            if f1 not in contributions or f2 not in contributions:
                continue
            
            c1 = contributions[f1][0]
            c2 = contributions[f2][0]
            
            # Only correct when BOTH are penalizing (below neutral 0.5)
            # If one is rewarding and one penalizing, no double-counting
            if c1 < 0.5 and c2 < 0.5:
                # Compute penalties (distance from neutral)
                penalty1 = 0.5 - c1
                penalty2 = 0.5 - c2
                
                # Overlap term: shared variance we're counting twice
                overlap = abs(rho) * min(penalty1, penalty2)
                
                # Redistribute: reduce the smaller penalty
                # WHY smaller: It's more likely to be "explained by" the larger
                if penalty1 <= penalty2:
                    corrected[f1] = c1 + overlap * 0.5
                else:
                    corrected[f2] = c2 + overlap * 0.5
        
        # Enforce max combined penalty
        # This prevents adversarial inputs from producing extreme scores
        total_penalty = sum(max(0, 0.5 - c) for c in corrected.values())
        if total_penalty > cls.MAX_COMBINED_PENALTY:
            scale = cls.MAX_COMBINED_PENALTY / total_penalty
            for name in corrected:
                if corrected[name] < 0.5:
                    penalty = 0.5 - corrected[name]
                    corrected[name] = 0.5 - penalty * scale
        
        return corrected


# =============================================================================
# PHASE 7: COUNTERFACTUAL EXPLAINABILITY
# =============================================================================
#
# Counterfactuals answer: "If this feature were different, what would happen?"
# This enables sensitivity analysis and identifies fragile vs robust signals.
# =============================================================================

@dataclass
class CounterfactualAnalysis:
    """
    Counterfactual analysis for a feature.
    
    Answers: "If this feature were at baseline, what would the score be?"
    
    WHY THIS EXISTS:
    1. Identifies which features most impact the score
    2. Reveals fragile signals (high sensitivity = fragile)
    3. Enables future explainability UI
    """
    feature_name: str
    actual_value: float
    baseline_value: float
    actual_contribution: float
    counterfactual_contribution: float
    score_delta: float       # score_actual - score_counterfactual
    sensitivity: float       # ∂score/∂feature (approximate)


class CounterfactualEngine:
    """
    Computes counterfactual explanations.
    
    For each feature, simulates:
    1. What if this feature were at baseline?
    2. What's the marginal effect of this feature?
    """
    
    @staticmethod
    def compute_counterfactuals(
        contributions: Dict[str, Tuple[float, str, float]],
        actual_score: float,
        baseline: BaselineStatistics
    ) -> List[CounterfactualAnalysis]:
        """
        Compute counterfactual analysis for all features.
        
        ALGORITHM:
        1. For each feature, assume counterfactual contribution = 0.5 (neutral)
        2. Estimate score delta from contribution delta
        3. Compute sensitivity as delta per unit z-score
        
        Returns list sorted by absolute score_delta (most impactful first).
        """
        analyses = []
        
        # Baseline values for each feature type
        # These are the "neutral" values we compare against
        baseline_values = {
            "filler_density": baseline.mean_filler_density,
            "hesitation_density": 1.0,
            "stance_ratio": baseline.mean_stance_ratio,
            "assertion_density": 1.5,
            "sentence_completion": 0.7,
            "sentence_length": 17,
            "transition_usage": 0.4,
        }
        
        for feature_name, (contribution, _, z) in contributions.items():
            baseline_value = baseline_values.get(feature_name, 0.5)
            
            # Counterfactual: contribution at baseline (z=0) is neutral
            counterfactual_contribution = 0.5
            
            # Approximate score delta
            # Contribution delta * scaling factor
            # TUNABLE: 20 is approximate score points per 0.5 contribution change
            contribution_delta = contribution - counterfactual_contribution
            score_delta = contribution_delta * 20
            
            # Sensitivity: score change per unit z-score
            # High sensitivity = fragile signal
            sensitivity = score_delta / max(abs(z), 0.01) if z != 0 else 0
            
            analyses.append(CounterfactualAnalysis(
                feature_name=feature_name,
                actual_value=z * 0.1 + baseline_value if feature_name in baseline_values else contribution,
                baseline_value=baseline_value,
                actual_contribution=contribution,
                counterfactual_contribution=counterfactual_contribution,
                score_delta=round(score_delta, 1),
                sensitivity=round(sensitivity, 2)
            ))
        
        # Sort by absolute impact
        analyses.sort(key=lambda a: abs(a.score_delta), reverse=True)
        return analyses


# =============================================================================
# PHASE 8: EXPLAINABILITY STRUCTURES
# =============================================================================

@dataclass
class ContributingFactor:
    """A single factor contributing to a score."""
    name: str
    value: float
    contribution: float
    direction: str          # "positive", "negative", "neutral"
    explanation: str
    z_score: float = 0.0


@dataclass
class ScoreExplanation:
    """
    Complete explanation for a score.
    
    This structure enables full auditability of any computed score.
    """
    score: int                                    # Final score after all adjustments
    raw_score: float                              # Score before epistemic adjustment
    reliability: float                            # Analysis reliability
    baseline_expectation: float                   # Prior expectation
    top_positive_factors: List[ContributingFactor]
    top_negative_factors: List[ContributingFactor]
    counterfactuals: List[CounterfactualAnalysis]
    reliability_note: str                         # Human-readable reliability description
    epistemic_adjustment: float                   # How much reliability changed the score


# =============================================================================
# PHASE 9: COMPOSITE SCORING WITH EPISTEMIC CORRECTNESS
# =============================================================================
#
# FOUNDATIONAL PRINCIPLE: Uncertainty ≠ Neutrality
#
# OLD (WRONG): final = reliability * raw + (1 - reliability) * 0.5
# NEW (CORRECT): final = baseline_expectation + reliability * (raw - baseline_expectation)
#
# WHY THIS MATTERS:
# - Low reliability should reflect our PRIOR EXPECTATION, not 50
# - A user with historically high confidence should default to high, not 50
# - 50 is only appropriate if we have NO prior information
# =============================================================================

class ConfidenceScorer:
    """
    Confidence scoring with proper epistemic handling.
    
    LIFECYCLE PHASES IMPLEMENTED:
    - Phase 4: Interaction handling
    - Phase 7: Score computation
    - Phase 8: Uncertainty adjustment
    - Phase 9: Explanation generation
    """
    
    def score(
        self,
        metrics: NormalizedMetrics,
        baseline: BaselineStatistics,
        signal: SignalAnalysis
    ) -> ScoreExplanation:
        """
        Compute confidence score with full explainability.
        
        ALGORITHM:
        1. Compute raw contributions from each feature
        2. Apply interaction correction
        3. Aggregate to raw score
        4. Apply epistemic adjustment
        5. Generate explanation
        """
        # =====================================================================
        # Step 1: Compute raw contributions
        # =====================================================================
        
        contributions_raw = {}
        
        # Stance ratio contribution
        # WHY: Direct measure of confidence vs hesitation balance
        stance_contrib, stance_expl, stance_z = InteractionAwareContributions.ratio_contribution(
            metrics.stance_ratio, neutral=0.5
        )
        contributions_raw["stance_ratio"] = (stance_contrib, stance_expl, stance_z)
        
        # Assertion density contribution
        # WHY: More assertions indicate more confident speech
        assert_contrib, assert_expl, assert_z = InteractionAwareContributions.positive_contribution(
            metrics.assertion_density,
            baseline_mean=1.5,
            baseline_std=1.0,
            max_effect=0.25  # TUNABLE
        )
        contributions_raw["assertion_density"] = (assert_contrib, assert_expl, assert_z)
        
        # Hesitation density contribution (negative)
        # WHY: More hesitation indicates less confident speech
        # INVARIANT: ∂contribution/∂hesitation ≤ 0
        hesit_contrib, hesit_expl, hesit_z = InteractionAwareContributions.negative_contribution(
            metrics.hesitation_density,
            baseline_mean=1.0,
            baseline_std=1.0,
            max_effect=0.25  # TUNABLE
        )
        contributions_raw["hesitation_density"] = (hesit_contrib, hesit_expl, hesit_z)
        
        # Filler density contribution (negative)
        # WHY: Fillers indicate cognitive load, reduce perceived confidence
        # INVARIANT: ∂contribution/∂filler_density ≤ 0
        filler_contrib, filler_expl, filler_z = InteractionAwareContributions.negative_contribution(
            metrics.filler_certainty_weighted_density,
            baseline_mean=baseline.mean_filler_density,
            baseline_std=baseline.std_filler_density,
            max_effect=0.2  # TUNABLE: Slightly lower than hesitation
        )
        contributions_raw["filler_density"] = (filler_contrib, filler_expl, filler_z)
        
        # =====================================================================
        # Step 2: Apply interaction correction
        # =====================================================================
        
        # Define correlated pairs for correction
        interaction_pairs = [
            ("filler_density", "hesitation_density", 
             FEATURE_CORRELATIONS[("filler_density", "hesitation_density")]),
        ]
        
        corrected = InteractionAwareContributions.apply_interaction_correction(
            contributions_raw, interaction_pairs
        )
        
        # =====================================================================
        # Step 3: Aggregate to raw score
        # =====================================================================
        
        # Simple mean of corrected contributions
        # WHY mean: Equal weighting, no feature dominates
        raw_score_0_1 = sum(corrected.values()) / len(corrected)
        
        # Convert to 0-100 scale with soft bounds
        raw_score_100 = self._to_bounded_score(raw_score_0_1)
        
        # =====================================================================
        # Step 4: Apply epistemic adjustment
        # =====================================================================
        
        reliability = signal.reliability
        baseline_expectation = baseline.baseline_confidence_expectation
        
        # FOUNDATIONAL FORMULA:
        # final = expectation + reliability * (raw - expectation)
        #
        # INTERPRETATION:
        # - reliability = 1.0: final = raw (trust the data)
        # - reliability = 0.0: final = expectation (use prior)
        # - reliability = 0.5: final = midpoint
        final_score_continuous = baseline_expectation + reliability * (raw_score_100 - baseline_expectation)
        
        # Round and apply soft bounds
        final_score = int(round(final_score_continuous))
        score_min, score_max = _FOUNDATIONAL_CONSTANTS["SCORE_BOUNDS"]
        final_score = max(score_min, min(score_max, final_score))
        
        # Track epistemic adjustment for explainability
        epistemic_adjustment = final_score - raw_score_100
        
        # =====================================================================
        # Step 5: Generate explanation
        # =====================================================================
        
        # Build contributing factors
        factors = []
        for name, (contrib, expl, z) in contributions_raw.items():
            corrected_contrib = corrected.get(name, contrib)
            direction = "positive" if corrected_contrib > 0.55 else "negative" if corrected_contrib < 0.45 else "neutral"
            factors.append(ContributingFactor(
                name=name,
                value=corrected_contrib,
                contribution=corrected_contrib,
                direction=direction,
                explanation=expl,
                z_score=z
            ))
        
        # Sort factors
        positive_factors = sorted(
            [f for f in factors if f.direction == "positive"],
            key=lambda f: f.contribution, reverse=True
        )[:3]
        negative_factors = sorted(
            [f for f in factors if f.direction == "negative"],
            key=lambda f: f.contribution
        )[:3]
        
        # Compute counterfactuals
        counterfactuals = CounterfactualEngine.compute_counterfactuals(
            contributions_raw, final_score, baseline
        )
        
        # Generate reliability note
        if reliability < 0.4:
            reliability_note = f"Low reliability ({reliability:.2f}): score reflects baseline expectation ({baseline_expectation:.0f})"
        elif reliability < 0.7:
            reliability_note = f"Moderate reliability ({reliability:.2f}): score partially adjusted toward baseline"
        else:
            reliability_note = f"Good reliability ({reliability:.2f}): score reflects observed data"
        
        return ScoreExplanation(
            score=final_score,
            raw_score=raw_score_100,
            reliability=reliability,
            baseline_expectation=baseline_expectation,
            top_positive_factors=positive_factors,
            top_negative_factors=negative_factors,
            counterfactuals=counterfactuals,
            reliability_note=reliability_note,
            epistemic_adjustment=epistemic_adjustment
        )
    
    @staticmethod
    def _to_bounded_score(score_0_1: float) -> float:
        """
        Convert [0,1] contribution to bounded score range.
        
        Maps 0 → 20, 1 → 90 (soft bounds within hard bounds)
        """
        min_score, max_score = 20, 90
        return min_score + (max_score - min_score) * score_0_1


class ClarityScorer:
    """
    Clarity scoring with epistemic correctness.
    
    Focuses on structural features:
    - Sentence completion
    - Sentence length (optimal range)
    - Transition usage
    """
    
    def score(
        self,
        metrics: NormalizedMetrics,
        baseline: BaselineStatistics,
        signal: SignalAnalysis
    ) -> ScoreExplanation:
        """Compute clarity score with full explainability."""
        
        contributions_raw = {}
        
        # Sentence completion contribution
        # INVARIANT: ∂contribution/∂completion ≥ 0
        comp_contrib, comp_expl, comp_z = InteractionAwareContributions.positive_contribution(
            metrics.sentence_completion_ratio,
            baseline_mean=0.7,
            baseline_std=0.2,
            max_effect=0.3
        )
        contributions_raw["sentence_completion"] = (comp_contrib, comp_expl, comp_z)
        
        # Sentence length contribution (optimal range)
        # WHY range: Too short lacks detail, too long is confusing
        length_contrib, length_expl, length_z = InteractionAwareContributions.structure_contribution(
            metrics.avg_sentence_length,
            optimal_low=12,
            optimal_high=25
        )
        contributions_raw["sentence_length"] = (length_contrib, length_expl, length_z)
        
        # Transition usage contribution (optimal range)
        trans_contrib, trans_expl, trans_z = InteractionAwareContributions.structure_contribution(
            metrics.transition_density,
            optimal_low=0.2,
            optimal_high=0.8
        )
        contributions_raw["transition_usage"] = (trans_contrib, trans_expl, trans_z)
        
        # No significant correlations between clarity features
        # So no interaction correction needed
        corrected = {name: data[0] for name, data in contributions_raw.items()}
        
        # Aggregate
        raw_score_0_1 = sum(corrected.values()) / len(corrected)
        raw_score_100 = self._to_bounded_score(raw_score_0_1)
        
        # Epistemic adjustment
        reliability = signal.reliability
        baseline_expectation = baseline.baseline_clarity_expectation
        
        final_score_continuous = baseline_expectation + reliability * (raw_score_100 - baseline_expectation)
        final_score = int(round(final_score_continuous))
        final_score = max(20, min(95, final_score))
        
        epistemic_adjustment = final_score - raw_score_100
        
        # Build factors
        factors = []
        for name, (contrib, expl, z) in contributions_raw.items():
            direction = "positive" if contrib > 0.55 else "negative" if contrib < 0.45 else "neutral"
            factors.append(ContributingFactor(
                name=name,
                value=contrib,
                contribution=contrib,
                direction=direction,
                explanation=expl,
                z_score=z
            ))
        
        positive_factors = sorted(
            [f for f in factors if f.direction == "positive"],
            key=lambda f: f.contribution, reverse=True
        )[:3]
        negative_factors = sorted(
            [f for f in factors if f.direction == "negative"],
            key=lambda f: f.contribution
        )[:3]
        
        counterfactuals = CounterfactualEngine.compute_counterfactuals(
            contributions_raw, final_score, baseline
        )
        
        if reliability < 0.4:
            reliability_note = f"Low reliability ({reliability:.2f}): score reflects baseline expectation ({baseline_expectation:.0f})"
        elif reliability < 0.7:
            reliability_note = f"Moderate reliability ({reliability:.2f}): score partially adjusted toward baseline"
        else:
            reliability_note = f"Good reliability ({reliability:.2f}): score reflects observed data"
        
        return ScoreExplanation(
            score=final_score,
            raw_score=raw_score_100,
            reliability=reliability,
            baseline_expectation=baseline_expectation,
            top_positive_factors=positive_factors,
            top_negative_factors=negative_factors,
            counterfactuals=counterfactuals,
            reliability_note=reliability_note,
            epistemic_adjustment=epistemic_adjustment
        )
    
    @staticmethod
    def _to_bounded_score(score_0_1: float) -> float:
        """Convert [0,1] to bounded score range."""
        min_score, max_score = 25, 90
        return min_score + (max_score - min_score) * score_0_1


# =============================================================================
# PHASE 10: CONTEXT-AWARE FILLER PROCESSING
# =============================================================================

class ContextAwareFillerProcessor:
    """
    Intelligent filler removal with semantic safety.
    
    Only removes high-certainty fillers and verifies
    semantic content is preserved.
    """
    
    def __init__(self):
        # Only remove high-certainty fillers
        self._removal_patterns = []
        for cat, data in FILLER_DEFINITIONS.items():
            if data["certainty"] >= 0.7:
                for filler in data["patterns"]:
                    self._removal_patterns.append(filler)
        
        self._protected = PROTECTED_WORDS
    
    def process(self, text: str) -> Tuple[str, int]:
        """
        Remove fillers while preserving semantic content.
        
        Returns: (processed_text, fillers_removed)
        """
        if not text:
            return text, 0
        
        original_text = text
        fillers_removed = 0
        
        # Remove multi-word fillers first (longer patterns first)
        for filler in sorted(self._removal_patterns, key=len, reverse=True):
            if " " in filler:
                pattern = re.compile(r'(?i)\b' + re.escape(filler) + r'\b[,\s]*')
                matches = len(pattern.findall(text))
                if matches > 0:
                    text = pattern.sub(' ', text)
                    fillers_removed += matches
        
        # Remove single-word fillers (not protected)
        for filler in self._removal_patterns:
            if " " not in filler and filler not in self._protected:
                pattern = re.compile(r'(?i)\s+' + re.escape(filler) + r'[,\s]+')
                matches = len(pattern.findall(text))
                if matches > 0:
                    text = pattern.sub(' ', text)
                    fillers_removed += matches
        
        # Clean up whitespace
        text = self._clean_text(text)
        
        # Verify semantic preservation
        if not self._verify_semantic_preservation(original_text, text):
            logger.warning("[FillerProcessor] Semantic loss detected, reverting")
            return original_text, 0
        
        return text, fillers_removed
    
    def _clean_text(self, text: str) -> str:
        """Clean up whitespace and punctuation."""
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'\s+([,.!?])', r'\1', text)
        text = re.sub(r',\s+(\w)', r' \1', text)
        text = re.sub(r'([.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), text)
        if text and text[0].islower():
            text = text[0].upper() + text[1:]
        return text.strip()
    
    def _verify_semantic_preservation(self, original: str, processed: str) -> bool:
        """Verify that semantic content is preserved."""
        stop_words = {'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be',
                      'have', 'has', 'had', 'do', 'does', 'did', 'to', 'of',
                      'in', 'for', 'on', 'with', 'at', 'by', 'and', 'or', 'but'}
        filler_set = set(f.lower() for f in self._removal_patterns)
        
        def extract_content(text):
            words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
            return set(words) - stop_words - filler_set
        
        original_content = extract_content(original)
        processed_content = extract_content(processed)
        
        return processed_content >= original_content - filler_set


# =============================================================================
# PHASE 11: RELIABILITY-AWARE AGGREGATION UTILITIES
# =============================================================================
#
# These utilities ensure consistent aggregation across the system.
# All aggregations weight by reliability.
# =============================================================================

class ReliabilityAwareAggregation:
    """
    Shared utilities for reliability-weighted aggregation.
    
    PRINCIPLE: Never average raw scores. Always weight by reliability.
    
    WHY: A score with 0.3 reliability should contribute less to averages
    than a score with 0.9 reliability. Without weighting, noise dominates.
    """
    
    @staticmethod
    def weighted_average(
        values: List[float],
        reliabilities: List[float],
        power: float = 2.0
    ) -> Tuple[float, float]:
        """
        Compute reliability-weighted average.
        
        Args:
            values: List of values to average
            reliabilities: Corresponding reliability weights
            power: Exponent for reliability (higher = more penalty for low reliability)
        
        Returns:
            (weighted_average, total_weight)
        
        WHY power=2:
        Squaring reliability penalizes low values more aggressively.
        A reliability of 0.5 contributes only 0.25 weight.
        """
        if len(values) != len(reliabilities):
            raise ValueError("Values and reliabilities must have same length")
        
        if not values:
            return (0.0, 0.0)
        
        total_weight = 0.0
        weighted_sum = 0.0
        
        for value, reliability in zip(values, reliabilities):
            weight = reliability ** power
            weighted_sum += value * weight
            total_weight += weight
        
        if total_weight == 0:
            return (0.0, 0.0)
        
        return (weighted_sum / total_weight, total_weight)
    
    @staticmethod
    def aggregate_sessions(
        sessions: List[Dict[str, Any]],
        metric_key: str,
        reliability_key: str = "analysis_reliability"
    ) -> Tuple[float, float]:
        """
        Aggregate a metric across sessions with reliability weighting.
        
        This is the CORRECT way to compute averages for dashboards.
        """
        values = []
        reliabilities = []
        
        for session in sessions:
            if metric_key in session:
                values.append(session[metric_key])
                reliabilities.append(session.get(reliability_key, 0.5))
        
        return ReliabilityAwareAggregation.weighted_average(values, reliabilities)
    
    @staticmethod
    def compute_trend(
        sessions: List[Dict[str, Any]],
        metric_key: str,
        baseline_expectation: float,
        recent_window: int = 5
    ) -> Dict[str, Any]:
        """
        Compute trend as deviation from baseline expectation.
        
        This is the CORRECT definition of "improvement":
        Deviation from personalized baseline, not arbitrary comparison.
        """
        if not sessions:
            return {
                "current_vs_baseline": 0.0,
                "trend_direction": "stable",
                "reliability_weighted_avg": baseline_expectation,
            }
        
        recent = sessions[:recent_window]
        avg, weight = ReliabilityAwareAggregation.aggregate_sessions(recent, metric_key)
        
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


# =============================================================================
# MAIN ANALYSIS FUNCTION
# =============================================================================

# Module-level instances (lazy initialization pattern)
_signal_analyzer = SignalAnalyzer()
_metrics_calculator = MetricsCalculator()
_confidence_scorer = ConfidenceScorer()
_clarity_scorer = ClarityScorer()
_baseline_manager = BaselineManager()
_filler_processor = ContextAwareFillerProcessor()


def analyze_transcript_adaptive(
    raw_transcript: str,
    duration_seconds: Optional[float] = None,
    user_id: Optional[str] = None,
    historical_sessions: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    """
    Analyze transcript with full algorithmic rigor.
    
    ALGORITHMIC LIFECYCLE:
    1. Signal Acquisition - validate input, extract basic stats
    2. Feature Extraction - detect patterns
    3. Normalization - convert to densities
    4. Interaction Handling - prevent double-counting
    5. Reliability Estimation - compute epistemic confidence
    6. Baseline Comparison - load and compare against baseline
    7. Score Computation - aggregate contributions
    8. Uncertainty Adjustment - apply epistemic interpolation
    9. Explanation Generation - build explainability structures
    10. Aggregation/Trend - update baselines with drift
    
    Returns comprehensive analysis including:
    - Scores with proper uncertainty handling
    - Interaction-corrected contributions
    - Continuous drift analysis
    - Counterfactual explanations
    - Full auditability
    """
    # =========================================================================
    # PHASE 1-2: Signal Acquisition & Reliability Estimation
    # =========================================================================
    
    signal = _signal_analyzer.analyze(raw_transcript, duration_seconds)
    
    logger.info(
        f"[Analysis] Signal: valid={signal.is_valid}, reliability={signal.reliability:.2f}, "
        f"words={signal.word_count}, reason={signal.reason}"
    )
    
    # =========================================================================
    # PHASE 6: Baseline Comparison (load appropriate baseline)
    # =========================================================================
    
    baseline = _baseline_manager.get_baseline(user_id, historical_sessions)
    
    # =========================================================================
    # Handle invalid signal
    # =========================================================================
    
    if not signal.is_valid:
        # Return baseline expectations with full metadata
        return {
            "confidence_score": int(baseline.baseline_confidence_expectation),
            "clarity_score": int(baseline.baseline_clarity_expectation),
            "analysis_reliability": signal.reliability,
            "filler_word_count": 0,
            "filler_word_frequency": 0.0,
            "filler_word_breakdown": {},
            "signal_validity": {
                "is_valid": False,
                "reliability": signal.reliability,
                "reliability_factors": {
                    "data_sufficiency": signal.reliability_factors.data_sufficiency,
                    "feature_agreement": signal.reliability_factors.feature_agreement,
                    "variance_stability": signal.reliability_factors.variance_stability,
                },
                "reason": signal.reason,
            },
            "explanation": {
                "confidence": {
                    "note": f"Insufficient data; returning baseline expectation ({baseline.baseline_confidence_expectation:.0f})"
                },
                "clarity": {
                    "note": f"Insufficient data; returning baseline expectation ({baseline.baseline_clarity_expectation:.0f})"
                },
            },
            "metrics": None,
            "drift": None,
            "algorithm_version": ALGORITHM_VERSION,
        }
    
    # =========================================================================
    # PHASE 3: Feature Extraction & Normalization
    # =========================================================================
    
    metrics = _metrics_calculator.calculate(raw_transcript, signal)
    
    # =========================================================================
    # PHASE 4-9: Score Computation with Interaction Handling & Explanation
    # =========================================================================
    
    confidence_result = _confidence_scorer.score(metrics, baseline, signal)
    clarity_result = _clarity_scorer.score(metrics, baseline, signal)
    
    # =========================================================================
    # PHASE 10: Aggregation & Drift Tracking
    # =========================================================================
    
    drift_info = None
    if user_id and signal.reliability > 0.6:
        drift_info = _baseline_manager.update_with_drift(user_id, metrics)
    
    logger.info(
        f"[Analysis] Scores: confidence={confidence_result.score} (raw={confidence_result.raw_score:.0f}), "
        f"clarity={clarity_result.score} (raw={clarity_result.raw_score:.0f}), "
        f"reliability={signal.reliability:.2f}, epistemic_adj={confidence_result.epistemic_adjustment:.1f}"
    )
    
    # =========================================================================
    # Build complete response
    # =========================================================================
    
    return {
        "confidence_score": confidence_result.score,
        "clarity_score": clarity_result.score,
        "analysis_reliability": signal.reliability,
        "filler_word_count": metrics.raw_filler_count,
        "filler_word_frequency": metrics.filler_density,
        "filler_word_breakdown": metrics.raw_filler_breakdown,
        "signal_validity": {
            "is_valid": True,
            "reliability": signal.reliability,
            "reliability_factors": {
                "data_sufficiency": signal.reliability_factors.data_sufficiency,
                "feature_agreement": signal.reliability_factors.feature_agreement,
                "variance_stability": signal.reliability_factors.variance_stability,
            },
            "reason": signal.reason,
        },
        "explanation": {
            "confidence": {
                "score": confidence_result.score,
                "raw_score": confidence_result.raw_score,
                "reliability": confidence_result.reliability,
                "baseline_expectation": confidence_result.baseline_expectation,
                "epistemic_adjustment": confidence_result.epistemic_adjustment,
                "reliability_note": confidence_result.reliability_note,
                "top_positive": [
                    {"name": f.name, "value": f.value, "contribution": f.contribution, 
                     "explanation": f.explanation, "z_score": f.z_score}
                    for f in confidence_result.top_positive_factors
                ],
                "top_negative": [
                    {"name": f.name, "value": f.value, "contribution": f.contribution,
                     "explanation": f.explanation, "z_score": f.z_score}
                    for f in confidence_result.top_negative_factors
                ],
                "counterfactuals": [
                    {"feature": cf.feature_name, "actual": cf.actual_value, "baseline": cf.baseline_value,
                     "score_delta": cf.score_delta, "sensitivity": cf.sensitivity}
                    for cf in confidence_result.counterfactuals[:5]
                ],
            },
            "clarity": {
                "score": clarity_result.score,
                "raw_score": clarity_result.raw_score,
                "reliability": clarity_result.reliability,
                "baseline_expectation": clarity_result.baseline_expectation,
                "epistemic_adjustment": clarity_result.epistemic_adjustment,
                "reliability_note": clarity_result.reliability_note,
                "top_positive": [
                    {"name": f.name, "value": f.value, "contribution": f.contribution,
                     "explanation": f.explanation, "z_score": f.z_score}
                    for f in clarity_result.top_positive_factors
                ],
                "top_negative": [
                    {"name": f.name, "value": f.value, "contribution": f.contribution,
                     "explanation": f.explanation, "z_score": f.z_score}
                    for f in clarity_result.top_negative_factors
                ],
                "counterfactuals": [
                    {"feature": cf.feature_name, "actual": cf.actual_value, "baseline": cf.baseline_value,
                     "score_delta": cf.score_delta, "sensitivity": cf.sensitivity}
                    for cf in clarity_result.counterfactuals[:5]
                ],
            },
        },
        "baseline": {
            "is_user_specific": baseline.is_user_specific,
            "sample_count": baseline.sample_count,
            "confidence_expectation": baseline.baseline_confidence_expectation,
            "clarity_expectation": baseline.baseline_clarity_expectation,
            "filler_density_ci": baseline.filler_density_ci,
            "stance_ratio_ci": baseline.stance_ratio_ci,
        },
        "drift": drift_info,
        "metrics": {
            "filler_density": metrics.filler_density,
            "filler_certainty_weighted": metrics.filler_certainty_weighted_density,
            "filler_by_category": metrics.filler_by_category,
            "assertion_density": metrics.assertion_density,
            "hesitation_density": metrics.hesitation_density,
            "stance_ratio": metrics.stance_ratio,
            "sentence_completion_ratio": metrics.sentence_completion_ratio,
            "avg_sentence_length": metrics.avg_sentence_length,
            "transition_density": metrics.transition_density,
            "word_count": metrics.word_count,
            "sentence_count": metrics.sentence_count,
        },
        "algorithm_version": ALGORITHM_VERSION,
    }


def remove_fillers_context_aware(text: str) -> Tuple[str, int]:
    """Remove fillers from text while preserving semantic content."""
    return _filler_processor.process(text)


# =============================================================================
# BACKWARDS COMPATIBILITY
# =============================================================================

def analyze_transcript(raw_transcript: str) -> Dict[str, Any]:
    """
    Legacy API for simple transcript analysis.
    
    DEPRECATION NOTICE: Use analyze_transcript_adaptive for full functionality.
    """
    result = analyze_transcript_adaptive(raw_transcript)
    return {
        "confidence_score": result["confidence_score"],
        "clarity_score": result["clarity_score"],
        "filler_word_count": result["filler_word_count"],
        "filler_word_frequency": result["filler_word_frequency"],
        "filler_word_breakdown": result["filler_word_breakdown"],
    }


# =============================================================================
# COMPATIBILITY ALIASES
# =============================================================================

SignalValidity = SignalAnalysis
BaselineData = BaselineStatistics
ContributionFunction = InteractionAwareContributions

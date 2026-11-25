# Voira Analytics: Algorithmic Process Documentation

**Version:** 4.0.0  
**Last Updated:** 2026-01-23

This document describes the best-practice algorithmic processes implemented in Voira's analytics engine. The goal is **trustworthy measurement under uncertainty**, not clever math.

---

## 1. Algorithmic Lifecycle

Every analysis follows an explicit, separable, testable pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SIGNAL ACQUISITION                                          │
│     • Raw text ingestion                                        │
│     • Basic validation                                          │
│     • Metadata extraction                                       │
├─────────────────────────────────────────────────────────────────┤
│  2. FEATURE EXTRACTION                                          │
│     • Pattern detection (fillers, stance, structure)            │
│     • Raw counts and positions                                  │
│     • No normalization yet                                      │
├─────────────────────────────────────────────────────────────────┤
│  3. NORMALIZATION                                               │
│     • Convert counts to densities (per 100 words)               │
│     • Scale to comparable ranges                                │
│     • Document scaling assumptions                              │
├─────────────────────────────────────────────────────────────────┤
│  4. INTERACTION HANDLING                                        │
│     • Identify correlated features                              │
│     • Apply correction factors                                  │
│     • Prevent double-counting                                   │
├─────────────────────────────────────────────────────────────────┤
│  5. RELIABILITY ESTIMATION                                      │
│     • Data sufficiency check                                    │
│     • Feature agreement assessment                              │
│     • Variance stability measurement                            │
├─────────────────────────────────────────────────────────────────┤
│  6. BASELINE COMPARISON                                         │
│     • Load appropriate baseline (global or user-specific)       │
│     • Compute z-scores                                          │
│     • Track drift                                               │
├─────────────────────────────────────────────────────────────────┤
│  7. SCORE COMPUTATION                                           │
│     • Aggregate contributions                                   │
│     • Apply weighting                                           │
│     • Enforce bounds                                            │
├─────────────────────────────────────────────────────────────────┤
│  8. UNCERTAINTY ADJUSTMENT                                      │
│     • Apply epistemic interpolation                             │
│     • Propagate confidence intervals                            │
│     • Never collapse to neutral                                 │
├─────────────────────────────────────────────────────────────────┤
│  9. EXPLANATION GENERATION                                      │
│     • Identify top contributors                                 │
│     • Compute counterfactuals                                   │
│     • Generate human-readable notes                             │
├─────────────────────────────────────────────────────────────────┤
│ 10. AGGREGATION / TREND HANDLING                                │
│     • Reliability-weighted averaging                            │
│     • Drift persistence tracking                                │
│     • Baseline adaptation                                       │
└─────────────────────────────────────────────────────────────────┘
```

Each phase is:
- **Explicit**: Clearly documented with named intermediate variables
- **Separable**: Can be tested in isolation
- **Testable**: Has dedicated invariant tests

---

## 2. Mathematical Invariants

The following invariants are **enforced** (assertions fail loudly on violation):

### Monotonicity Invariants

| Invariant | Description |
|-----------|-------------|
| `∂confidence/∂filler_density ≤ 0` | More fillers cannot increase confidence |
| `∂clarity/∂sentence_completion ≥ 0` | Better completion cannot decrease clarity |
| `∂reliability/∂data_sufficiency ≥ 0` | More data cannot decrease reliability |

### Boundedness Invariants

| Invariant | Description |
|-----------|-------------|
| `scores ∈ [0, 100]` | All scores bounded |
| `contributions ∈ [0, 1]` | All contributions bounded |
| `reliability ∈ [0, 1]` | Reliability bounded |
| `soft_bounds: [15, 95]` | Typical score range |

### Stability Invariants

| Invariant | Description |
|-----------|-------------|
| Small input changes | Cannot cause large output swings |
| Adversarial inputs | Degrade gracefully |
| No numerical errors | No division by zero, overflow, or NaN |

### Epistemic Invariants

| Invariant | Description |
|-----------|-------------|
| Low reliability | → baseline expectation, NOT neutral 50 |
| Uncertainty | Propagates through aggregations |
| Geometric mean | Reliability factors combine conservatively |

---

## 3. Epistemic Correctness

### The Key Insight: Uncertainty ≠ Neutrality

**OLD (WRONG):**
```
final = reliability * raw + (1 - reliability) * 0.5
```

**NEW (CORRECT):**
```
final = baseline_expectation + reliability * (raw - baseline_expectation)
```

### Why This Matters

- **Low reliability** should reflect our **prior expectation**, not 50
- A user with historically high confidence should default to high, not 50
- 50 is only appropriate if we have NO prior information

### Implementation

```python
# In ConfidenceScorer.score():
final_score = baseline_expectation + reliability * (raw_score - baseline_expectation)
```

This means:
- `reliability = 1.0`: final = raw (trust the data)
- `reliability = 0.0`: final = expectation (use prior)
- `reliability = 0.5`: final = midpoint between raw and expectation

---

## 4. Interaction Correction (Double-Counting Prevention)

### Problem

Correlated features cause double-penalization:
- High fillers AND high hesitation both penalize confidence
- But they share common variance (both indicate uncertainty)
- Without correction, nervous speakers are unfairly penalized twice

### Solution

For correlated features with correlation ρ:

```
naive_penalty = penalty(f1) + penalty(f2)
overlap = ρ * min(|penalty(f1)|, |penalty(f2)|)
corrected_penalty = naive_penalty - overlap
```

### Documented Correlations

| Feature Pair | ρ | Rationale |
|--------------|---|-----------|
| filler_density ↔ hesitation_density | 0.6 | Both indicate cognitive load |
| hesitation_density ↔ stance_ratio | -0.5 | Mechanically related |
| filler_density ↔ sentence_completion | -0.3 | Fillers disrupt structure |

### Safety Cap

Combined penalty is capped at `MAX_COMBINED_PENALTY = 0.4` to prevent adversarial inputs from producing extreme scores.

---

## 5. Baseline Management

### Baselines are First-Class Objects

Baselines are:
- **Explicit**: All values visible, no hidden state
- **Inspectable**: Can examine any component via `baseline.to_dict()`
- **Stable**: Changes only through documented update path
- **Drift-aware**: Tracks behavioral changes over time

### Drift Tracking

```python
@dataclass
class DriftState:
    magnitude: float    # How much behavior changed (z-score)
    direction: int      # +1 improving, -1 degrading, 0 stable
    persistence: int    # Consecutive sessions showing drift
```

### Adaptation Rules

| Condition | Adaptation Rate |
|-----------|-----------------|
| Persistent drift (≥3 sessions) | Faster (up to 2x base) |
| Stable behavior | Normal rate |
| Volatile behavior | Slower (0.5x base) |

This prevents:
- Sudden baseline shifts
- Silent baseline resets
- Over-reacting to short-term variance

---

## 6. Reliability-Aware Aggregation

### Rule: Never Average Raw Scores

All aggregations must weight by reliability:

```python
weighted_avg = Σ(value_i * reliability_i²) / Σ(reliability_i²)
```

### Why Squared Weighting

Squaring reliability penalizes low values more aggressively:
- Reliability 0.9 → weight 0.81
- Reliability 0.5 → weight 0.25
- Reliability 0.3 → weight 0.09

### Shared Utilities

All aggregation logic lives in `ReliabilityAwareAggregation` class and `analytics_contract.py` helpers. Never duplicate this logic.

---

## 7. Counterfactual Explainability

### What Counterfactuals Provide

For each feature:
- "If this feature were at baseline, what would the score be?"
- Marginal sensitivity: ∂score/∂feature

### Use Cases

1. **Identify most impactful features**: Sorted by absolute score_delta
2. **Detect fragile signals**: High sensitivity = fragile
3. **Enable future explainability UI**

---

## 8. Algorithm Evolution Safety

### Version Contract

```python
ALGORITHM_VERSION = "4.0.0"
# MAJOR: Changes that alter score semantics or break invariants
# MINOR: New features that preserve existing behavior
# PATCH: Bug fixes and documentation
```

### Safety Markers

Code is annotated with:
- `# TUNABLE`: Safe to adjust based on data/research
- `# FOUNDATIONAL`: Risky to change, requires re-validation

### Foundational Constants

```python
_FOUNDATIONAL_CONSTANTS = {
    "SCORE_BOUNDS": (15, 95),
    "RELIABILITY_THRESHOLD": 0.4,
    "BASELINE_ALPHA": 0.2,
}
```

Changing these requires:
- Invariant re-validation
- A/B testing capability
- Documentation update

---

## 9. Testing Strategy

### Test Categories

1. **Monotonicity Tests**: Verify ∂score/∂feature relationships
2. **Boundedness Tests**: Verify all outputs in valid ranges
3. **Stability Tests**: Verify graceful degradation
4. **Epistemic Tests**: Verify uncertainty handling
5. **Interaction Tests**: Verify double-counting prevention
6. **Adversarial Tests**: Verify edge case handling

### Key Test Files

- `tests/test_analytics_invariants.py`: Comprehensive invariant tests
- `tests/test_filler_detection.py`: Feature extraction tests

---

## 10. Summary of Process Improvements (v4)

| Area | Improvement |
|------|-------------|
| **Lifecycle** | Explicit 10-phase pipeline, each separable and testable |
| **Auditability** | Named intermediates, inline docs, no hidden math |
| **Invariants** | Formal definitions with assertions that fail loudly |
| **Epistemic** | Uncertainty ≠ neutrality, proper baseline interpolation |
| **Interactions** | Documented correlations, capped penalties |
| **Baselines** | First-class objects with drift awareness |
| **Aggregation** | Reliability-weighted everywhere, shared utilities |
| **Counterfactuals** | Sensitivity analysis for all features |
| **Evolution** | Version contract, safety markers, tunable vs foundational |
| **Testing** | Property-based invariant tests, adversarial cases |

---

## Appendix: Quick Reference

### Key Functions

| Function | Purpose |
|----------|---------|
| `analyze_transcript_adaptive()` | Main analysis entry point |
| `SignalAnalyzer.analyze()` | Phase 1-2: Signal validation |
| `MetricsCalculator.calculate()` | Phase 3: Feature extraction |
| `InteractionAwareContributions.apply_interaction_correction()` | Phase 4: Double-counting prevention |
| `ConfidenceScorer.score()` | Phase 7-9: Score computation |
| `BaselineManager.update_with_drift()` | Phase 10: Baseline adaptation |

### Key Classes

| Class | Purpose |
|-------|---------|
| `ReliabilityFactors` | Epistemic confidence components |
| `BaselineStatistics` | First-class baseline object |
| `DriftState` | Continuous drift tracking |
| `CounterfactualAnalysis` | Sensitivity analysis |
| `ScoreExplanation` | Full score auditability |

### Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `ALGORITHM_VERSION` | "4.0.0" | Version tracking |
| `SCORE_BOUNDS` | (15, 95) | Soft score limits |
| `RELIABILITY_THRESHOLD` | 0.4 | Minimum for valid analysis |
| `MAX_COMBINED_PENALTY` | 0.4 | Interaction correction cap |
| `BASELINE_ALPHA` | 0.2 | Base adaptation rate |

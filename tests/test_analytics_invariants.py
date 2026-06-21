"""
Tests for Mathematical Invariants in Adaptive Analytics (v4)

These tests prove that the analytics system satisfies formal mathematical
invariants that ensure correctness and predictability.

============================================================================
INVARIANT CATEGORIES
============================================================================

1. MONOTONICITY INVARIANTS
   - ∂confidence/∂filler_density ≤ 0 (more fillers → lower confidence)
   - ∂clarity/∂sentence_completion ≥ 0 (more completion → higher clarity)
   - ∂reliability/∂data_sufficiency ≥ 0 (more data → higher reliability)

2. BOUNDEDNESS INVARIANTS
   - All scores ∈ [0, 100]
   - All contributions ∈ [0, 1]
   - All reliability ∈ [0, 1]
   - Soft bounds enforced: scores typically ∈ [15, 95]

3. STABILITY INVARIANTS
   - Small input changes cannot cause large output swings
   - Adversarial inputs degrade gracefully
   - No division by zero, overflow, or NaN

4. EPISTEMIC INVARIANTS
   - Low reliability → baseline expectation, NOT neutral 50
   - Uncertainty propagates through aggregations
   - Reliability factors combine via geometric mean

5. INTERACTION INVARIANTS
   - Correlated features don't double-penalize
   - Combined penalty capped at MAX_COMBINED_PENALTY
   - Interaction correction only applies when both features penalize

6. CONSISTENCY INVARIANTS
   - Same input → same output (deterministic)
   - Aggregations weight by reliability
   - Baselines evolve slowly and predictably

============================================================================
TEST METHODOLOGY
============================================================================

Tests use three approaches:

1. UNIT TESTS: Specific scenarios with known expected behavior
2. PROPERTY TESTS: Invariants that must hold for ANY valid input
3. ADVERSARIAL TESTS: Edge cases designed to break the system

============================================================================
"""

import pytest
import sys
import os
import math
from typing import List, Tuple

# Add apps/api to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "api"))


# =============================================================================
# MONOTONICITY INVARIANTS
# =============================================================================


class TestFillerDensityMonotonicity:
    """
    INVARIANT: ∂confidence/∂filler_density ≤ 0

    Increasing filler density cannot increase confidence score.
    This is a fundamental correctness property.
    """

    def test_higher_filler_density_does_not_increase_confidence(self):
        """More fillers should result in same or lower confidence."""
        from adaptive_analytics import analyze_transcript_adaptive

        # Transcript with few fillers
        low_filler = """
        I believe that my experience has prepared me well for this role.
        I led a team of engineers and delivered results on time.
        The key to success was clear communication.
        """

        # Same content with more fillers
        high_filler = """
        I um believe that um my experience has um prepared me well for this role.
        I uh led a team of engineers and uh delivered results on time.
        The um key to success was um clear communication.
        """

        result_low = analyze_transcript_adaptive(low_filler)
        result_high = analyze_transcript_adaptive(high_filler)

        # INVARIANT CHECK: Higher filler count should not increase confidence
        assert (
            result_high["filler_word_count"] >= result_low["filler_word_count"]
        ), "Test setup error: high_filler should have more fillers"

        assert result_high["confidence_score"] <= result_low["confidence_score"], (
            f"MONOTONICITY VIOLATION: Confidence increased with more fillers "
            f"({result_low['confidence_score']} → {result_high['confidence_score']})"
        )

    def test_filler_contribution_is_monotonically_decreasing(self):
        """Filler contribution function should be strictly non-increasing."""
        from adaptive_analytics import InteractionAwareContributions, BaselineStatistics

        baseline = BaselineStatistics.global_default()

        # Test at many filler densities
        densities = [0.0, 0.5, 1.0, 2.0, 3.5, 5.0, 7.5, 10.0, 15.0, 20.0, 50.0]
        contributions = []

        for density in densities:
            contrib, _, _ = InteractionAwareContributions.negative_contribution(
                density, baseline.mean_filler_density, baseline.std_filler_density
            )
            contributions.append(contrib)

        # INVARIANT: Contributions must be monotonically non-increasing
        for i in range(len(contributions) - 1):
            assert contributions[i] >= contributions[i + 1] - 0.001, (
                f"MONOTONICITY VIOLATION: Contribution increased at density {densities[i+1]}: "
                f"{contributions[i]:.4f} → {contributions[i+1]:.4f}"
            )

    def test_progressive_filler_addition_monotonic(self):
        """Progressively adding fillers should monotonically decrease raw confidence."""
        from adaptive_analytics import analyze_transcript_adaptive

        base = "I believe that my experience has prepared me well. " * 3

        # Add fillers progressively
        filler_levels = ["", "um ", "um um ", "um um um ", "um um um um "]
        raw_scores = []

        for fillers in filler_levels:
            transcript = fillers + base
            result = analyze_transcript_adaptive(transcript)
            if result["signal_validity"]["is_valid"]:
                raw_scores.append(result["explanation"]["confidence"]["raw_score"])

        # INVARIANT: Raw scores should be strictly non-increasing
        for i in range(len(raw_scores) - 1):
            # Allow tiny tolerance for floating point
            assert (
                raw_scores[i] >= raw_scores[i + 1] - 0.5
            ), f"MONOTONICITY VIOLATION: Raw confidence increased with fillers: {raw_scores}"


class TestSentenceCompletionMonotonicity:
    """
    INVARIANT: ∂clarity/∂sentence_completion ≥ 0

    Increasing sentence completion cannot reduce clarity score.
    """

    def test_higher_completion_does_not_reduce_clarity(self):
        """More complete sentences should result in same or higher clarity."""
        from adaptive_analytics import analyze_transcript_adaptive

        # Transcript with incomplete sentences
        incomplete = """
        The project was. Because we. Important results.
        Team worked. Goals achieved. Success.
        """

        # Same ideas with complete sentences
        complete = """
        The project was a success. We achieved this because we worked hard.
        Important results were delivered. The team worked effectively.
        Goals were achieved on time. This demonstrates our success.
        """

        result_incomplete = analyze_transcript_adaptive(incomplete)
        result_complete = analyze_transcript_adaptive(complete)

        # Primary: check RAW scores (before epistemic adjustment)
        if (
            result_incomplete["signal_validity"]["is_valid"]
            and result_complete["signal_validity"]["is_valid"]
        ):
            raw_incomplete = result_incomplete["explanation"]["clarity"]["raw_score"]
            raw_complete = result_complete["explanation"]["clarity"]["raw_score"]

            assert raw_complete >= raw_incomplete - 1, (
                f"MONOTONICITY VIOLATION: Raw clarity decreased "
                f"({raw_incomplete:.1f} → {raw_complete:.1f})"
            )

    def test_completion_contribution_is_monotonically_increasing(self):
        """Sentence completion contribution should be strictly non-decreasing."""
        from adaptive_analytics import InteractionAwareContributions

        # Test at various completion ratios
        ratios = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
        contributions = []

        for ratio in ratios:
            contrib, _, _ = InteractionAwareContributions.positive_contribution(
                ratio, baseline_mean=0.7, baseline_std=0.2
            )
            contributions.append(contrib)

        # INVARIANT: Contributions must be monotonically non-decreasing
        for i in range(len(contributions) - 1):
            assert contributions[i] <= contributions[i + 1] + 0.001, (
                f"MONOTONICITY VIOLATION: Contribution decreased at ratio {ratios[i+1]}: "
                f"{contributions[i]:.4f} → {contributions[i+1]:.4f}"
            )


class TestReliabilityMonotonicity:
    """
    INVARIANT: ∂reliability/∂data_sufficiency ≥ 0

    More data cannot reduce our confidence in the analysis.
    """

    def test_more_data_does_not_reduce_reliability(self):
        """More words should result in same or higher reliability."""
        from adaptive_analytics import SignalAnalyzer

        analyzer = SignalAnalyzer()

        # Test with increasing amounts of content
        base_sentence = "I believe this project demonstrates my skills effectively. "

        reliabilities = []
        for num_repeats in [1, 2, 3, 5, 7, 10, 15, 20]:
            transcript = base_sentence * num_repeats
            signal = analyzer.analyze(transcript)
            reliabilities.append((num_repeats, signal.reliability))

        # INVARIANT: Reliability should be monotonically non-decreasing
        for i in range(len(reliabilities) - 1):
            assert reliabilities[i][1] <= reliabilities[i + 1][1] + 0.01, (
                f"MONOTONICITY VIOLATION: Reliability decreased with more data "
                f"({reliabilities[i]} → {reliabilities[i+1]})"
            )


# =============================================================================
# BOUNDEDNESS INVARIANTS
# =============================================================================


class TestBoundednessInvariants:
    """
    INVARIANTS:
    - All scores ∈ [0, 100]
    - All contributions ∈ [0, 1]
    - All reliability ∈ [0, 1]
    """

    def test_scores_bounded_0_100(self):
        """All scores must be in [0, 100] for any input."""
        from adaptive_analytics import analyze_transcript_adaptive

        test_cases = [
            "",  # Empty
            "Hi",  # Very short
            "I um uh er ah basically um actually um um um um",  # Many fillers
            "I believe I achieved I led I created I built I delivered I improved I increased",  # Many assertions
            "I don't know I'm not sure perhaps maybe possibly might be I guess",  # Many hesitations
            "This is a normal transcript with reasonable content. " * 10,  # Long
            "a " * 1000,  # Very repetitive
            "Word. " * 100,  # Many short sentences
            "This is a very long sentence that goes on and on "
            * 20,  # One long sentence
        ]

        for transcript in test_cases:
            result = analyze_transcript_adaptive(transcript)

            assert (
                0 <= result["confidence_score"] <= 100
            ), f"BOUNDEDNESS VIOLATION: Confidence score {result['confidence_score']} out of [0, 100]"
            assert (
                0 <= result["clarity_score"] <= 100
            ), f"BOUNDEDNESS VIOLATION: Clarity score {result['clarity_score']} out of [0, 100]"

    def test_reliability_bounded_0_1(self):
        """Reliability must be in [0, 1] for any input."""
        from adaptive_analytics import SignalAnalyzer

        analyzer = SignalAnalyzer()

        test_cases = [
            "",
            "Hi",
            "Word " * 1000,
            "I believe. " * 50,
            "a b c d e f g h i j k l m n o p q r s t u v w x y z",
            "!@#$%^&*()_+-=[]{}|;':\",./<>?",
        ]

        for transcript in test_cases:
            signal = analyzer.analyze(transcript)

            assert (
                0 <= signal.reliability <= 1
            ), f"BOUNDEDNESS VIOLATION: Reliability {signal.reliability} out of [0, 1]"

    def test_contributions_bounded_0_1(self):
        """All contribution functions must return values in [0, 1]."""
        from adaptive_analytics import InteractionAwareContributions

        # Test positive contribution with extreme values
        extreme_values = [-1000, -10, -1, 0, 0.5, 1, 5, 10, 100, 1000]

        for value in extreme_values:
            contrib, _, _ = InteractionAwareContributions.positive_contribution(
                value, baseline_mean=0.5, baseline_std=0.2
            )
            assert (
                0 <= contrib <= 1
            ), f"BOUNDEDNESS VIOLATION: Positive contribution {contrib} out of [0, 1]"

            contrib, _, _ = InteractionAwareContributions.negative_contribution(
                value, baseline_mean=0.5, baseline_std=0.2
            )
            assert (
                0 <= contrib <= 1
            ), f"BOUNDEDNESS VIOLATION: Negative contribution {contrib} out of [0, 1]"

        # Test ratio contribution
        for ratio in [0, 0.25, 0.5, 0.75, 1]:
            contrib, _, _ = InteractionAwareContributions.ratio_contribution(ratio)
            assert (
                0 <= contrib <= 1
            ), f"BOUNDEDNESS VIOLATION: Ratio contribution {contrib} out of [0, 1]"

    def test_reliability_factors_bounded(self):
        """Reliability factors must be in [0, 1]."""
        from adaptive_analytics import ReliabilityFactors

        # Valid factors should work
        factors = ReliabilityFactors(0.5, 0.6, 0.7)
        reliability = factors.compute_reliability()
        assert 0 <= reliability <= 1

        # Edge cases
        factors_low = ReliabilityFactors(0.0, 0.0, 0.0)
        assert factors_low.compute_reliability() == 0.0

        factors_high = ReliabilityFactors(1.0, 1.0, 1.0)
        assert factors_high.compute_reliability() == 1.0


# =============================================================================
# STABILITY INVARIANTS
# =============================================================================


class TestStabilityInvariants:
    """
    INVARIANTS:
    - Small input changes cannot cause large output swings
    - Adversarial inputs degrade gracefully
    """

    def test_single_word_change_limited_impact(self):
        """Adding a single word should not drastically change the score."""
        from adaptive_analytics import analyze_transcript_adaptive

        base = """
        I believe that my experience has prepared me well for this role.
        I led a team of engineers and delivered results on time.
        The key to success was clear communication and planning.
        """

        # Add a single filler
        with_filler = """
        I believe that um my experience has prepared me well for this role.
        I led a team of engineers and delivered results on time.
        The key to success was clear communication and planning.
        """

        result_base = analyze_transcript_adaptive(base)
        result_with_filler = analyze_transcript_adaptive(with_filler)

        if (
            result_base["signal_validity"]["is_valid"]
            and result_with_filler["signal_validity"]["is_valid"]
        ):
            # STABILITY: Single word should not change score by more than 10 points
            confidence_diff = abs(
                result_base["confidence_score"] - result_with_filler["confidence_score"]
            )
            assert (
                confidence_diff <= 10
            ), f"STABILITY VIOLATION: Single filler changed score by {confidence_diff} points"

    def test_no_division_by_zero(self):
        """System should handle edge cases without division by zero."""
        from adaptive_analytics import analyze_transcript_adaptive

        edge_cases = [
            "",  # Empty
            " ",  # Whitespace only
            ".",  # Just punctuation
            "a",  # Single character
        ]

        for transcript in edge_cases:
            # Should not raise any exceptions
            result = analyze_transcript_adaptive(transcript)

            # All numeric fields should be valid numbers
            assert not math.isnan(result["confidence_score"])
            assert not math.isnan(result["clarity_score"])
            assert not math.isnan(result["analysis_reliability"])
            assert not math.isinf(result["confidence_score"])
            assert not math.isinf(result["clarity_score"])

    def test_unicode_and_special_characters_stable(self):
        """Unicode and special characters should not crash or produce extreme values."""
        from adaptive_analytics import analyze_transcript_adaptive

        unicode_texts = [
            "I believe that my experience—including international work—has been valuable.",
            "I led teams in São Paulo and München.",
            "My résumé demonstrates 日本語 skills.",
            "Emoji test 😀 🎉 ✅ should not crash.",
            "Math symbols: ∫∑∏√∞ should be handled.",
            "Arabic: مرحبا بالعالم",
            "Chinese: 你好世界",
        ]

        for text in unicode_texts:
            result = analyze_transcript_adaptive(text)

            # Should produce bounded scores
            assert 0 <= result["confidence_score"] <= 100
            assert 0 <= result["clarity_score"] <= 100


# =============================================================================
# EPISTEMIC INVARIANTS
# =============================================================================


class TestEpistemicInvariants:
    """
    INVARIANTS:
    - Low reliability → baseline expectation, NOT neutral 50
    - Uncertainty propagates correctly
    """

    def test_low_reliability_returns_baseline_not_neutral(self):
        """Low reliability should interpolate toward baseline, not 50."""
        from adaptive_analytics import analyze_transcript_adaptive, BaselineStatistics

        # Very short transcript (low reliability)
        result = analyze_transcript_adaptive("Hi there")

        baseline = BaselineStatistics.global_default()

        # EPISTEMIC INVARIANT: Score should be close to baseline expectation
        confidence_diff = abs(
            result["confidence_score"] - baseline.baseline_confidence_expectation
        )

        # With low reliability, should be within 10 points of baseline
        assert confidence_diff < 10, (
            f"EPISTEMIC VIOLATION: Low reliability returned {result['confidence_score']}, "
            f"expected near baseline {baseline.baseline_confidence_expectation}"
        )

    def test_high_reliability_reflects_data(self):
        """High reliability should let data dominate over baseline."""
        from adaptive_analytics import analyze_transcript_adaptive

        # Long confident transcript
        confident = """
        I am absolutely confident that my extensive experience has prepared me well.
        I definitely know that I led multiple successful projects.
        I certainly achieved significant results in my previous role.
        I built innovative solutions that improved efficiency by 40 percent.
        I delivered all projects ahead of schedule without any issues.
        """

        # Long hesitant transcript
        hesitant = """
        I guess maybe perhaps I might have some experience.
        I'm not sure but possibly I could have contributed somewhat.
        I don't know if this is relevant but maybe I did something.
        Perhaps there were results but I'm not certain about the numbers.
        I might have possibly completed some tasks but I'm not sure.
        """

        result_confident = analyze_transcript_adaptive(confident)
        result_hesitant = analyze_transcript_adaptive(hesitant)

        # With high reliability, scores should differ significantly
        score_diff = (
            result_confident["confidence_score"] - result_hesitant["confidence_score"]
        )

        assert score_diff > 10, (
            f"EPISTEMIC VIOLATION: High reliability should show score difference: "
            f"confident={result_confident['confidence_score']}, hesitant={result_hesitant['confidence_score']}"
        )

    def test_epistemic_adjustment_tracked(self):
        """Epistemic adjustment should be tracked in explanation."""
        from adaptive_analytics import analyze_transcript_adaptive

        transcript = "I believe this project demonstrates my skills. " * 3
        result = analyze_transcript_adaptive(transcript)

        if result["signal_validity"]["is_valid"]:
            assert (
                "epistemic_adjustment" in result["explanation"]["confidence"]
            ), "EPISTEMIC VIOLATION: epistemic_adjustment not tracked"

            # Adjustment should be the difference between final and raw
            expected_adj = (
                result["explanation"]["confidence"]["score"]
                - result["explanation"]["confidence"]["raw_score"]
            )
            actual_adj = result["explanation"]["confidence"]["epistemic_adjustment"]

            assert (
                abs(expected_adj - actual_adj) < 1
            ), f"EPISTEMIC VIOLATION: Adjustment mismatch: expected {expected_adj}, got {actual_adj}"

    def test_reliability_factors_geometric_mean(self):
        """Reliability is geometric mean of factors."""
        from adaptive_analytics import ReliabilityFactors

        factors = ReliabilityFactors(
            data_sufficiency=0.8, feature_agreement=0.7, variance_stability=0.9
        )

        expected = (0.8 * 0.7 * 0.9) ** (1 / 3)
        actual = factors.compute_reliability()

        assert (
            abs(actual - expected) < 0.01
        ), f"EPISTEMIC VIOLATION: Geometric mean incorrect: expected {expected}, got {actual}"

    def test_low_factor_pulls_down_reliability(self):
        """If any factor is very low, reliability should be low."""
        from adaptive_analytics import ReliabilityFactors

        # One very low factor
        factors = ReliabilityFactors(
            data_sufficiency=0.1, feature_agreement=0.9, variance_stability=0.9
        )

        reliability = factors.compute_reliability()

        # Geometric mean property: should be < arithmetic mean
        arithmetic_mean = (0.1 + 0.9 + 0.9) / 3
        assert (
            reliability < arithmetic_mean
        ), f"EPISTEMIC VIOLATION: Geometric mean not pulling down: {reliability} >= {arithmetic_mean}"

        # Should be significantly below 0.5
        assert (
            reliability < 0.5
        ), f"EPISTEMIC VIOLATION: Reliability not pulled down by low factor: {reliability}"


# =============================================================================
# INTERACTION INVARIANTS
# =============================================================================


class TestInteractionInvariants:
    """
    INVARIANTS:
    - Correlated features don't double-penalize
    - Combined penalty capped at MAX_COMBINED_PENALTY
    """

    def test_double_penalty_prevented(self):
        """High fillers AND high hesitation shouldn't compound unfairly."""
        from adaptive_analytics import (
            InteractionAwareContributions,
            FEATURE_CORRELATIONS,
        )

        # Both features penalizing (contributions < 0.5)
        contributions = {
            "filler_density": (0.3, "above_average_negative", 2.0),
            "hesitation_density": (0.35, "above_average_negative", 1.5),
            "stance_ratio": (0.5, "neutral", 0.0),
        }

        interaction_pairs = [
            (
                "filler_density",
                "hesitation_density",
                FEATURE_CORRELATIONS[("filler_density", "hesitation_density")],
            ),
        ]

        corrected = InteractionAwareContributions.apply_interaction_correction(
            contributions, interaction_pairs
        )

        # After correction, penalties should be reduced
        original_penalty = (0.5 - 0.3) + (0.5 - 0.35)
        corrected_penalty = (0.5 - corrected["filler_density"]) + (
            0.5 - corrected["hesitation_density"]
        )

        assert (
            corrected_penalty < original_penalty
        ), f"INTERACTION VIOLATION: Correction should reduce penalty: {original_penalty} → {corrected_penalty}"

    def test_max_combined_penalty_enforced(self):
        """Combined penalty from correlated features should be capped."""
        from adaptive_analytics import InteractionAwareContributions

        # Extreme penalties
        contributions = {
            "filler_density": (0.1, "above_average_negative", 4.0),
            "hesitation_density": (0.1, "above_average_negative", 4.0),
        }

        corrected = InteractionAwareContributions.apply_interaction_correction(
            contributions, [("filler_density", "hesitation_density", 0.6)]
        )

        total_penalty = (0.5 - corrected["filler_density"]) + (
            0.5 - corrected["hesitation_density"]
        )

        assert (
            total_penalty <= InteractionAwareContributions.MAX_COMBINED_PENALTY + 0.01
        ), f"INTERACTION VIOLATION: Combined penalty {total_penalty} exceeds cap {InteractionAwareContributions.MAX_COMBINED_PENALTY}"

    def test_no_correction_when_one_positive(self):
        """Interaction correction should not apply when one feature is positive."""
        from adaptive_analytics import InteractionAwareContributions

        # One penalizing, one rewarding
        contributions = {
            "filler_density": (0.3, "above_average_negative", 2.0),  # Penalizing
            "hesitation_density": (0.7, "below_average_positive", -1.0),  # Rewarding
        }

        corrected = InteractionAwareContributions.apply_interaction_correction(
            contributions, [("filler_density", "hesitation_density", 0.6)]
        )

        # Contributions should be unchanged (no double-counting when one is positive)
        assert (
            corrected["filler_density"] == 0.3
        ), "INTERACTION VIOLATION: Correction applied when one feature is positive"
        assert (
            corrected["hesitation_density"] == 0.7
        ), "INTERACTION VIOLATION: Correction applied when one feature is positive"


# =============================================================================
# COUNTERFACTUAL INVARIANTS
# =============================================================================


class TestCounterfactualInvariants:
    """
    INVARIANTS:
    - Counterfactuals are computed for all features
    - Sensitivity values are bounded
    """

    def test_counterfactuals_computed(self):
        """Counterfactual analysis should be present in results."""
        from adaptive_analytics import analyze_transcript_adaptive

        transcript = """
        I believe that my experience has prepared me well for this role.
        I led a team of engineers and delivered results on time.
        The key to success was clear communication and planning.
        """

        result = analyze_transcript_adaptive(transcript)

        if result["signal_validity"]["is_valid"]:
            assert (
                "counterfactuals" in result["explanation"]["confidence"]
            ), "COUNTERFACTUAL VIOLATION: Counterfactuals not computed"

            counterfactuals = result["explanation"]["confidence"]["counterfactuals"]
            assert (
                len(counterfactuals) > 0
            ), "COUNTERFACTUAL VIOLATION: No counterfactuals returned"

            # Each should have required fields
            for cf in counterfactuals:
                assert "feature" in cf
                assert "score_delta" in cf
                assert "sensitivity" in cf

    def test_counterfactual_sensitivity_bounded(self):
        """Sensitivity values should be bounded and reasonable."""
        from adaptive_analytics import analyze_transcript_adaptive

        transcript = """
        I definitely know that I am confident in my abilities.
        I achieved significant results and led successful projects.
        """ * 3

        result = analyze_transcript_adaptive(transcript)

        if result["signal_validity"]["is_valid"]:
            for cf in result["explanation"]["confidence"]["counterfactuals"]:
                # Sensitivity should be bounded
                assert (
                    abs(cf["sensitivity"]) < 100
                ), f"COUNTERFACTUAL VIOLATION: Sensitivity too extreme: {cf['sensitivity']} for {cf['feature']}"


# =============================================================================
# EDGE CASES AND ADVERSARIAL TESTS
# =============================================================================


class TestEdgeCasesAndAdversarial:
    """
    Tests for extreme but valid inputs and adversarial patterns.

    These tests verify graceful degradation under stress.
    """

    def test_all_fillers_transcript(self):
        """Transcript of only fillers should not crash and give bounded scores."""
        from adaptive_analytics import analyze_transcript_adaptive

        all_fillers = "um uh er ah um uh um uh um uh " * 5
        result = analyze_transcript_adaptive(all_fillers)

        # Should not crash
        assert "confidence_score" in result
        assert "clarity_score" in result

        # Scores should be bounded
        assert 0 <= result["confidence_score"] <= 100
        assert 0 <= result["clarity_score"] <= 100

    def test_all_hesitation_transcript(self):
        """Transcript of only hesitation markers."""
        from adaptive_analytics import analyze_transcript_adaptive

        all_hesitation = """
        I don't know. I'm not sure. I guess maybe.
        Perhaps possibly might be. No idea.
        """ * 3

        result = analyze_transcript_adaptive(all_hesitation)

        assert "confidence_score" in result
        if result["signal_validity"]["is_valid"]:
            # Confidence should be relatively low
            assert (
                result["confidence_score"] < 60
            ), f"All hesitation should give low confidence: {result['confidence_score']}"

    def test_all_confidence_markers(self):
        """Transcript of only confidence markers."""
        from adaptive_analytics import analyze_transcript_adaptive

        all_confidence = """
        I definitely know that I am absolutely confident.
        I certainly achieved and I built and I delivered.
        I am sure and I know and I believe strongly.
        """ * 2

        result = analyze_transcript_adaptive(all_confidence)

        if result["signal_validity"]["is_valid"]:
            # Confidence should be relatively high
            assert (
                result["confidence_score"] > 60
            ), f"All confidence markers should give high confidence: {result['confidence_score']}"

    def test_extreme_sentence_length(self):
        """Very long or very short sentences should not crash."""
        from adaptive_analytics import analyze_transcript_adaptive

        # Very long sentence
        long_sentence = "I believe that " + "and " * 100 + "this is true."
        result_long = analyze_transcript_adaptive(long_sentence)
        assert "clarity_score" in result_long
        assert 0 <= result_long["clarity_score"] <= 100

        # Many very short sentences
        short_sentences = "Yes. No. Ok. Fine. Good. Yes. No. Ok. " * 5
        result_short = analyze_transcript_adaptive(short_sentences)
        assert "clarity_score" in result_short
        assert 0 <= result_short["clarity_score"] <= 100

    def test_mixed_extreme_signals(self):
        """Mixed extreme signals should not produce extreme scores."""
        from adaptive_analytics import analyze_transcript_adaptive

        # High confidence + high fillers
        mixed = """
        Um I definitely um know that uh I am absolutely uh confident.
        Er I certainly um achieved and uh I built and um I delivered.
        Ah I am um sure and uh I know that uh this is uh true.
        """

        result = analyze_transcript_adaptive(mixed)

        # Interaction correction should prevent extreme penalty
        if result["signal_validity"]["is_valid"]:
            # Score should be moderate, not extreme in either direction
            assert (
                30 <= result["confidence_score"] <= 80
            ), f"Mixed signals should give moderate score: {result['confidence_score']}"

    def test_empty_and_whitespace(self):
        """Empty and whitespace-only inputs should not crash."""
        from adaptive_analytics import analyze_transcript_adaptive

        result_empty = analyze_transcript_adaptive("")
        assert result_empty["signal_validity"]["is_valid"] == False

        result_whitespace = analyze_transcript_adaptive("   \n\t   ")
        assert result_whitespace["signal_validity"]["is_valid"] == False

    def test_very_long_transcript(self):
        """Very long transcripts should not cause performance issues."""
        from adaptive_analytics import analyze_transcript_adaptive

        # 10,000 words
        long_transcript = "I believe that my experience has prepared me well. " * 500
        result = analyze_transcript_adaptive(long_transcript)

        assert "confidence_score" in result
        assert 0 <= result["confidence_score"] <= 100

    def test_numeric_only_transcript(self):
        """Transcript with only numbers should handle gracefully."""
        from adaptive_analytics import analyze_transcript_adaptive

        numeric = "1 2 3 4 5 6 7 8 9 10 " * 10
        result = analyze_transcript_adaptive(numeric)

        # Should not crash
        assert "confidence_score" in result


# =============================================================================
# CONSISTENCY INVARIANTS
# =============================================================================


class TestConsistencyInvariants:
    """
    INVARIANTS:
    - Same input → same output (deterministic)
    - Algorithm version is tracked
    """

    def test_deterministic_output(self):
        """Same input should produce same output."""
        from adaptive_analytics import analyze_transcript_adaptive

        transcript = """
        I believe that my experience has prepared me well for this role.
        I led a team of engineers and delivered results on time.
        """

        result1 = analyze_transcript_adaptive(transcript)
        result2 = analyze_transcript_adaptive(transcript)

        assert (
            result1["confidence_score"] == result2["confidence_score"]
        ), "CONSISTENCY VIOLATION: Non-deterministic confidence score"
        assert (
            result1["clarity_score"] == result2["clarity_score"]
        ), "CONSISTENCY VIOLATION: Non-deterministic clarity score"
        assert (
            result1["filler_word_count"] == result2["filler_word_count"]
        ), "CONSISTENCY VIOLATION: Non-deterministic filler count"

    def test_algorithm_version_tracked(self):
        """Algorithm version should be included in output."""
        from adaptive_analytics import analyze_transcript_adaptive, ALGORITHM_VERSION

        transcript = "I believe this demonstrates my skills. " * 3
        result = analyze_transcript_adaptive(transcript)

        assert (
            "algorithm_version" in result
        ), "CONSISTENCY VIOLATION: Algorithm version not tracked"
        assert (
            result["algorithm_version"] == ALGORITHM_VERSION
        ), f"CONSISTENCY VIOLATION: Version mismatch: {result['algorithm_version']} != {ALGORITHM_VERSION}"


# =============================================================================
# BASELINE INVARIANTS
# =============================================================================


class TestBaselineInvariants:
    """
    INVARIANTS:
    - Baselines are explicit objects
    - Drift is tracked with magnitude/direction/persistence
    - Baselines evolve slowly
    """

    def test_baseline_is_explicit_object(self):
        """Baseline should be an explicit, inspectable object."""
        from adaptive_analytics import BaselineStatistics

        baseline = BaselineStatistics.global_default()

        # Should have all required fields
        assert hasattr(baseline, "mean_filler_density")
        assert hasattr(baseline, "mean_stance_ratio")
        assert hasattr(baseline, "std_filler_density")
        assert hasattr(baseline, "std_stance_ratio")
        assert hasattr(baseline, "baseline_confidence_expectation")
        assert hasattr(baseline, "baseline_clarity_expectation")
        assert hasattr(baseline, "filler_drift")
        assert hasattr(baseline, "stance_drift")

        # Should be convertible to dict
        baseline_dict = baseline.to_dict()
        assert isinstance(baseline_dict, dict)

    def test_drift_tracking_returns_required_fields(self):
        """Drift should include magnitude, direction, and persistence."""
        from adaptive_analytics import BaselineManager, NormalizedMetrics

        manager = BaselineManager()

        historical = [
            {"filler_density": 2.0, "stance_ratio": 0.6},
            {"filler_density": 2.5, "stance_ratio": 0.55},
            {"filler_density": 2.2, "stance_ratio": 0.58},
            {"filler_density": 2.8, "stance_ratio": 0.57},
            {"filler_density": 2.3, "stance_ratio": 0.59},
        ]

        baseline = manager.get_baseline("test_user", historical)

        anomalous = NormalizedMetrics(
            filler_density=15.0,
            filler_certainty_weighted_density=12.0,
            filler_by_category={},
            assertion_density=1.0,
            hesitation_density=1.0,
            stance_ratio=0.5,
            sentence_completion_ratio=0.8,
            avg_sentence_length=15.0,
            transition_density=0.3,
            raw_filler_count=10,
            raw_filler_breakdown={},
            word_count=100,
            sentence_count=5,
        )

        drift_result = manager.update_with_drift("test_user", anomalous)

        assert drift_result["drift_tracked"] == True
        assert "filler_drift" in drift_result
        assert "magnitude" in drift_result["filler_drift"]
        assert "direction" in drift_result["filler_drift"]
        assert "persistence" in drift_result["filler_drift"]

        # High deviation should show high magnitude
        assert drift_result["filler_drift"]["magnitude"] > 1.0


# =============================================================================
# RELIABILITY-AWARE AGGREGATION TESTS
# =============================================================================


class TestReliabilityAwareAggregation:
    """
    INVARIANTS:
    - Aggregations always weight by reliability
    - Low reliability contributes less to averages
    """

    def test_weighted_average_respects_reliability(self):
        """Higher reliability should have more weight in averages."""
        from adaptive_analytics import ReliabilityAwareAggregation

        values = [80, 40]  # High score, low score
        reliabilities = [0.9, 0.1]  # High reliability for high score

        avg, _ = ReliabilityAwareAggregation.weighted_average(values, reliabilities)

        # Average should be closer to 80 (high reliability) than 40 (low reliability)
        assert (
            avg > 60
        ), f"AGGREGATION VIOLATION: Weighted average {avg} should favor high-reliability value"

    def test_equal_reliability_gives_simple_average(self):
        """Equal reliability should give simple average."""
        from adaptive_analytics import ReliabilityAwareAggregation

        values = [80, 40]
        reliabilities = [0.8, 0.8]

        avg, _ = ReliabilityAwareAggregation.weighted_average(values, reliabilities)

        # Should be close to simple average
        assert (
            abs(avg - 60) < 1
        ), f"AGGREGATION VIOLATION: Equal reliability should give simple average, got {avg}"

    def test_zero_reliability_excluded(self):
        """Zero reliability should contribute nothing."""
        from adaptive_analytics import ReliabilityAwareAggregation

        values = [80, 40]
        reliabilities = [0.8, 0.0]  # Second value has zero reliability

        avg, _ = ReliabilityAwareAggregation.weighted_average(values, reliabilities)

        # Should be exactly the first value (second contributes nothing)
        assert (
            abs(avg - 80) < 0.01
        ), f"AGGREGATION VIOLATION: Zero reliability should be excluded, got {avg}"


# =============================================================================
# CULTURAL ROBUSTNESS TESTS
# =============================================================================


class TestCulturalRobustness:
    """
    Tests for cultural and linguistic robustness.
    """

    def test_protected_words_not_penalized(self):
        """Words like 'well', 'like', 'so' should not be penalized."""
        from adaptive_analytics import analyze_transcript_adaptive

        # Uses protected words meaningfully
        transcript = """
        The project went well and we delivered on time.
        I like this approach because it's effective.
        So in conclusion, the results were positive.
        """

        result = analyze_transcript_adaptive(transcript)

        # These should not show up as fillers
        filler_words = result["filler_word_breakdown"].keys()
        protected = {"well", "like", "so"}

        detected_protected = set(filler_words) & protected
        assert (
            len(detected_protected) == 0
        ), f"CULTURAL VIOLATION: Protected words incorrectly detected as fillers: {detected_protected}"

    def test_certainty_weighting_reduces_ambiguous_filler_impact(self):
        """Ambiguous fillers should have reduced impact due to certainty weighting."""
        from adaptive_analytics import analyze_transcript_adaptive

        # Mix of high-certainty (um, uh) and lower-certainty fillers
        transcript = """
        Um, I think that um this project basically demonstrates my skills.
        You know, I uh delivered results that were uh impressive.
        """

        result = analyze_transcript_adaptive(transcript)

        # Certainty-weighted density should be less than raw density
        if result["metrics"]:
            raw = result["filler_word_frequency"]
            weighted = result["metrics"]["filler_certainty_weighted"]
            assert (
                weighted <= raw
            ), f"CULTURAL VIOLATION: Weighted density should be ≤ raw density: {weighted} > {raw}"


# =============================================================================
# EXPLAINABILITY TESTS
# =============================================================================


class TestExplainability:
    """
    Tests that explainability features are present and consistent.
    """

    def test_explanation_structure_present(self):
        """Analysis should include explanation structure."""
        from adaptive_analytics import analyze_transcript_adaptive

        transcript = (
            "I believe that my experience demonstrates strong leadership skills. " * 3
        )
        result = analyze_transcript_adaptive(transcript)

        # Explanation should be present for valid analysis
        assert "explanation" in result
        assert "confidence" in result["explanation"]
        assert "clarity" in result["explanation"]

        # Each explanation should have the required fields
        for key in ["confidence", "clarity"]:
            expl = result["explanation"][key]
            if "score" in expl:  # Valid analysis
                assert "reliability" in expl
                assert "reliability_note" in expl
                assert "top_positive" in expl
                assert "top_negative" in expl

    def test_factors_have_required_fields(self):
        """Contributing factors should have all required fields."""
        from adaptive_analytics import analyze_transcript_adaptive

        transcript = """
        I definitely believe that my extensive experience has prepared me well.
        I led multiple teams and achieved significant results.
        However, I'm not sure about some aspects perhaps.
        """ * 2

        result = analyze_transcript_adaptive(transcript)

        if result["explanation"]["confidence"].get("top_positive"):
            for factor in result["explanation"]["confidence"]["top_positive"]:
                assert "name" in factor
                assert "value" in factor
                assert "contribution" in factor
                assert "explanation" in factor

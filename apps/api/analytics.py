"""
User Analytics Tracking

Provides:
- Event tracking for user actions
- Usage metrics collection
- Session analytics
- Performance metrics
- Transcript analysis (filler words, confidence, clarity)

Events are stored in Supabase and can be queried for dashboards.
In production, consider using a dedicated analytics service like
Mixpanel, Amplitude, or PostHog.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from db import supabase
from config import settings

# Import adaptive analytics engine
from adaptive_analytics import (
    analyze_transcript_adaptive,
    analyze_transcript as _analyze_transcript_adaptive,
    remove_fillers_context_aware,
    SignalAnalyzer,
    MetricsCalculator,
    BaselineManager,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Transcript Analysis
# =============================================================================


def analyze_transcript(
    raw_transcript: str,
    duration_seconds: Optional[float] = None,
    user_id: Optional[str] = None,
    historical_sessions: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Analyze a transcript for quality metrics using adaptive algorithms.

    This function uses the adaptive analytics engine which:
    - Validates signal quality before computing metrics
    - Uses normalized densities instead of raw counts for scoring
    - Applies composite multi-feature models for confidence and clarity
    - Supports user-specific baselines for personalized scoring

    Args:
        raw_transcript: Raw transcript text
        duration_seconds: Optional recording duration for WPM calculation
        user_id: Optional user ID for personalized baselines
        historical_sessions: Optional past sessions for baseline computation

    Returns:
        Dict containing:
        - confidence_score: 0-100 composite score (multi-feature)
        - clarity_score: 0-100 composite score (structure-focused)
        - filler_word_count: total number of filler words detected
        - filler_word_frequency: fillers per 100 words (normalized)
        - filler_word_breakdown: count of each filler word type
        - signal_validity: (optional) signal quality analysis
        - metrics: (optional) detailed normalized metrics
    """
    result = analyze_transcript_adaptive(
        raw_transcript=raw_transcript,
        duration_seconds=duration_seconds,
        user_id=user_id,
        historical_sessions=historical_sessions,
    )

    logger.info(
        f"[Analytics] Transcript analyzed: "
        f"confidence={result['confidence_score']}, "
        f"clarity={result['clarity_score']}, "
        f"filler_count={result['filler_word_count']}, "
        f"signal_valid={result['signal_validity']['is_valid']}"
    )

    return result


# =============================================================================
# Event Types
# =============================================================================


class EventType:
    """Standard event types for analytics."""

    # User events
    USER_SIGNUP = "user.signup"
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"

    # Recording events
    RECORDING_STARTED = "recording.started"
    RECORDING_COMPLETED = "recording.completed"
    RECORDING_CANCELLED = "recording.cancelled"

    # Transcription events
    TRANSCRIPTION_STARTED = "transcription.started"
    TRANSCRIPTION_COMPLETED = "transcription.completed"
    TRANSCRIPTION_FAILED = "transcription.failed"

    # Refinement events
    REFINEMENT_REQUESTED = "refinement.requested"
    REFINEMENT_COMPLETED = "refinement.completed"
    REFINEMENT_REGENERATED = "refinement.regenerated"

    # Session events
    SESSION_SAVED = "session.saved"
    SESSION_DELETED = "session.deleted"
    SESSION_EXPORTED = "session.exported"

    # Feature usage
    FEATURE_USED = "feature.used"
    VOICE_PROFILE_UPDATED = "voice_profile.updated"

    # Errors
    ERROR_OCCURRED = "error.occurred"


# =============================================================================
# Analytics Service
# =============================================================================


class AnalyticsService:
    """
    Service for tracking and querying analytics events.
    """

    # Table name for analytics events
    TABLE_NAME = "analytics_events"

    @staticmethod
    async def track(
        event_type: str,
        user_id: Optional[str] = None,
        properties: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> bool:
        """
        Track an analytics event.

        Args:
            event_type: Type of event (use EventType constants)
            user_id: User who triggered the event
            properties: Additional event properties
            session_id: Associated session ID

        Returns:
            True if event was tracked successfully
        """
        try:
            event_data = {
                "event_type": event_type,
                "user_id": user_id,
                "session_id": session_id,
                "properties": properties or {},
                "environment": settings.env,
                "timestamp": datetime.utcnow().isoformat(),
            }

            # In development, just log
            if settings.is_development:
                logger.debug(
                    f"Analytics event: {event_type}", extra={"event": event_data}
                )
                return True

            # In production, store in database
            try:
                supabase.table(AnalyticsService.TABLE_NAME).insert(event_data).execute()
            except Exception as db_error:
                # Don't fail if analytics table doesn't exist
                logger.warning(
                    f"Analytics tracking failed (table may not exist): {db_error}"
                )

            return True

        except Exception as e:
            logger.error(f"Failed to track analytics event: {e}")
            return False

    @staticmethod
    async def track_recording(
        user_id: str,
        session_id: str,
        duration_seconds: float,
        transcript_length: int,
        mode: str = "free_form",
    ):
        """Track a completed recording with metrics."""
        await AnalyticsService.track(
            EventType.RECORDING_COMPLETED,
            user_id=user_id,
            session_id=session_id,
            properties={
                "duration_seconds": duration_seconds,
                "transcript_length": transcript_length,
                "mode": mode,
            },
        )

    @staticmethod
    async def track_refinement(
        user_id: str,
        session_id: str,
        original_length: int,
        refined_length: int,
        model: str = "gpt-4o-mini",
    ):
        """Track a completed refinement with metrics."""
        await AnalyticsService.track(
            EventType.REFINEMENT_COMPLETED,
            user_id=user_id,
            session_id=session_id,
            properties={
                "original_length": original_length,
                "refined_length": refined_length,
                "model": model,
                "compression_ratio": (
                    refined_length / original_length if original_length > 0 else 0
                ),
            },
        )

    @staticmethod
    async def track_error(
        error_type: str,
        error_message: str,
        user_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        """Track an error event."""
        await AnalyticsService.track(
            EventType.ERROR_OCCURRED,
            user_id=user_id,
            properties={
                "error_type": error_type,
                "error_message": error_message,
                **(context or {}),
            },
        )

    @staticmethod
    async def track_feature(
        feature_name: str, user_id: str, properties: Optional[Dict[str, Any]] = None
    ):
        """Track feature usage."""
        await AnalyticsService.track(
            EventType.FEATURE_USED,
            user_id=user_id,
            properties={
                "feature": feature_name,
                **(properties or {}),
            },
        )

    # =========================================================================
    # Query Methods (for dashboards)
    # =========================================================================

    @staticmethod
    async def get_user_stats(user_id: str) -> Dict[str, Any]:
        """
        Get aggregated stats for a user.

        Returns:
            Dict with user statistics
        """
        try:
            # Count recordings
            recordings = (
                supabase.table("sessions")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .execute()
            )

            total_recordings = recordings.count if recordings else 0

            # Get total duration (if stored)
            # This would need duration field in sessions table

            return {
                "total_recordings": total_recordings,
                "member_since": None,  # Would need to query user profile
            }
        except Exception as e:
            logger.error(f"Failed to get user stats: {e}")
            return {"error": str(e)}

    @staticmethod
    async def get_daily_active_users(days: int = 7) -> List[Dict[str, Any]]:
        """
        Get daily active user counts.

        Args:
            days: Number of days to look back

        Returns:
            List of {date, count} dicts
        """
        # This would query the analytics_events table
        # Placeholder implementation
        return []

    @staticmethod
    async def get_feature_usage(days: int = 30) -> Dict[str, int]:
        """
        Get feature usage counts.

        Args:
            days: Number of days to look back

        Returns:
            Dict of feature name to usage count
        """
        # This would query the analytics_events table
        # Placeholder implementation
        return {}


# Export singleton
analytics = AnalyticsService()

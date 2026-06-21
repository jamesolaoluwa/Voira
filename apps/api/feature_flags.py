"""
Feature Flags System

Provides:
- Simple feature flag management
- Environment-based defaults
- User-level overrides
- Percentage rollouts
- A/B testing support

Usage:
    from feature_flags import is_enabled, get_variant

    if is_enabled("new_transcription_model", user_id=user["id"]):
        # Use new model

    variant = get_variant("onboarding_flow", user_id=user["id"])
    if variant == "simplified":
        # Show simplified onboarding
"""

import logging
import hashlib
from typing import Optional, Dict, Any, List, Union
from datetime import datetime
from config import settings

logger = logging.getLogger(__name__)

# =============================================================================
# Feature Flag Definitions
# =============================================================================

# Flag configuration
# Each flag can have:
# - enabled: bool (default state)
# - environments: list of environments where enabled (development, staging, production)
# - rollout_percentage: 0-100 for gradual rollout
# - user_ids: list of specific user IDs to enable for
# - variants: dict of variant names to percentages for A/B tests

FEATURE_FLAGS: Dict[str, Dict[str, Any]] = {
    # ==========================================================================
    # Transcription Features
    # ==========================================================================
    "live_transcription": {
        "description": "Enable live transcription via WebSocket",
        "enabled": True,
        "environments": ["development", "staging", "production"],
    },
    "nova_2_model": {
        "description": "Use Deepgram Nova-2 model for transcription",
        "enabled": True,
        "environments": ["development", "staging", "production"],
    },
    # ==========================================================================
    # LLM Features
    # ==========================================================================
    "gpt4_refinement": {
        "description": "Use GPT-4 instead of GPT-3.5 for refinement",
        "enabled": False,  # Disabled by default (more expensive)
        "environments": ["production"],
        "rollout_percentage": 0,  # Gradual rollout
    },
    "streaming_refinement": {
        "description": "Stream LLM responses for refinement",
        "enabled": False,
        "environments": ["development", "staging"],
    },
    # ==========================================================================
    # UI Features
    # ==========================================================================
    "new_dashboard": {
        "description": "New dashboard design",
        "enabled": False,
        "environments": ["development"],
        "variants": {
            "control": 50,  # Original dashboard
            "variant_a": 25,  # New layout
            "variant_b": 25,  # New layout + stats
        },
    },
    "dark_mode": {
        "description": "Dark mode support",
        "enabled": True,
        "environments": ["development", "staging", "production"],
    },
    # ==========================================================================
    # Backend Features
    # ==========================================================================
    "redis_caching": {
        "description": "Use Redis for API response caching",
        "enabled": True,
        "environments": ["development", "staging", "production"],
    },
    "enhanced_analytics": {
        "description": "Enhanced speaking analytics with more metrics",
        "enabled": False,
        "environments": ["development", "staging"],
        "rollout_percentage": 10,
    },
    # ==========================================================================
    # Beta Features
    # ==========================================================================
    "voice_cloning": {
        "description": "Voice cloning for practice",
        "enabled": False,
        "environments": [],  # Not enabled anywhere yet
        "user_ids": [],  # Specific beta testers
    },
    "team_workspaces": {
        "description": "Team/organization workspaces",
        "enabled": False,
        "environments": [],
        "user_ids": [],
    },
}


# =============================================================================
# Feature Flag Functions
# =============================================================================


def get_flag_config(flag_name: str) -> Optional[Dict[str, Any]]:
    """Get configuration for a feature flag."""
    return FEATURE_FLAGS.get(flag_name)


def is_enabled(
    flag_name: str, user_id: Optional[str] = None, default: bool = False
) -> bool:
    """
    Check if a feature flag is enabled.

    Args:
        flag_name: Name of the feature flag
        user_id: Optional user ID for user-specific checks
        default: Default value if flag not found

    Returns:
        True if feature is enabled
    """
    flag = FEATURE_FLAGS.get(flag_name)

    if not flag:
        logger.warning(f"Unknown feature flag: {flag_name}")
        return default

    # Check if globally disabled
    if not flag.get("enabled", False):
        # Check user-specific override
        if user_id and user_id in flag.get("user_ids", []):
            return True
        return False

    # Check environment
    environments = flag.get("environments", [])
    if environments and settings.env not in environments:
        return False

    # Check rollout percentage
    rollout = flag.get("rollout_percentage")
    if rollout is not None and rollout < 100:
        if not user_id:
            return False
        return _is_in_rollout(flag_name, user_id, rollout)

    # Check user-specific enable/disable
    if user_id:
        enabled_users = flag.get("user_ids", [])
        if enabled_users and user_id not in enabled_users:
            return False

    return True


def get_variant(flag_name: str, user_id: str, default: str = "control") -> str:
    """
    Get variant for A/B test.

    Args:
        flag_name: Name of the feature flag with variants
        user_id: User ID for consistent assignment
        default: Default variant if flag not found

    Returns:
        Variant name
    """
    flag = FEATURE_FLAGS.get(flag_name)

    if not flag:
        logger.warning(f"Unknown feature flag: {flag_name}")
        return default

    # Check if flag is enabled first
    if not is_enabled(flag_name, user_id):
        return default

    variants = flag.get("variants", {})
    if not variants:
        return default

    # Get deterministic bucket for user
    bucket = _get_user_bucket(flag_name, user_id)

    # Find variant based on bucket
    cumulative = 0
    for variant_name, percentage in variants.items():
        cumulative += percentage
        if bucket < cumulative:
            return variant_name

    return default


def _get_user_bucket(flag_name: str, user_id: str) -> int:
    """
    Get a deterministic bucket (0-99) for a user/flag combination.

    This ensures the same user always gets the same bucket for a given flag,
    but different buckets for different flags.
    """
    hash_input = f"{flag_name}:{user_id}"
    hash_value = hashlib.md5(hash_input.encode()).hexdigest()
    return int(hash_value[:8], 16) % 100


def _is_in_rollout(flag_name: str, user_id: str, percentage: int) -> bool:
    """Check if user is in rollout percentage."""
    bucket = _get_user_bucket(flag_name, user_id)
    return bucket < percentage


# =============================================================================
# Admin Functions
# =============================================================================


def get_all_flags() -> Dict[str, Dict[str, Any]]:
    """Get all feature flags with their configuration."""
    return {
        name: {
            **config,
            "current_environment": settings.env,
            "is_enabled_here": is_enabled(name),
        }
        for name, config in FEATURE_FLAGS.items()
    }


def get_user_flags(user_id: str) -> Dict[str, bool]:
    """Get all feature flag states for a specific user."""
    return {name: is_enabled(name, user_id) for name in FEATURE_FLAGS.keys()}


def get_user_variants(user_id: str) -> Dict[str, str]:
    """Get all variant assignments for a specific user."""
    variants = {}
    for name, config in FEATURE_FLAGS.items():
        if config.get("variants"):
            variants[name] = get_variant(name, user_id)
    return variants


# =============================================================================
# Runtime Flag Updates (In-Memory Only)
# =============================================================================


def enable_flag(flag_name: str) -> bool:
    """Enable a flag at runtime (in-memory only)."""
    if flag_name in FEATURE_FLAGS:
        FEATURE_FLAGS[flag_name]["enabled"] = True
        logger.info(f"Feature flag '{flag_name}' enabled")
        return True
    return False


def disable_flag(flag_name: str) -> bool:
    """Disable a flag at runtime (in-memory only)."""
    if flag_name in FEATURE_FLAGS:
        FEATURE_FLAGS[flag_name]["enabled"] = False
        logger.info(f"Feature flag '{flag_name}' disabled")
        return True
    return False


def set_rollout_percentage(flag_name: str, percentage: int) -> bool:
    """Update rollout percentage at runtime (in-memory only)."""
    if flag_name in FEATURE_FLAGS and 0 <= percentage <= 100:
        FEATURE_FLAGS[flag_name]["rollout_percentage"] = percentage
        logger.info(f"Feature flag '{flag_name}' rollout set to {percentage}%")
        return True
    return False


def add_user_to_flag(flag_name: str, user_id: str) -> bool:
    """Add a user to a flag's enabled users (in-memory only)."""
    if flag_name in FEATURE_FLAGS:
        if "user_ids" not in FEATURE_FLAGS[flag_name]:
            FEATURE_FLAGS[flag_name]["user_ids"] = []
        if user_id not in FEATURE_FLAGS[flag_name]["user_ids"]:
            FEATURE_FLAGS[flag_name]["user_ids"].append(user_id)
            logger.info(f"User '{user_id}' added to feature flag '{flag_name}'")
        return True
    return False

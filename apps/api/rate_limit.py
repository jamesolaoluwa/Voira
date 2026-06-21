"""
Production-ready rate limiter with Redis support.

ENVIRONMENT BEHAVIOR:
- Production: Redis is REQUIRED. App fails at startup if Redis is not configured or unreachable.
- Development/Test: In-memory fallback is allowed with a warning.

Features:
- Redis-backed for production (distributed rate limiting)
- In-memory fallback for development ONLY
- Sliding window algorithm
- Per-endpoint rate limits
- Eager validation at startup
- No silent fallbacks in production
"""

import logging
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional, Dict, Tuple
from fastapi import HTTPException
from config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# Rate Limiter Backend Types
# =============================================================================


class RateLimiterBackend:
    """Enum-like class for rate limiter backend types."""

    REDIS = "redis"
    MEMORY = "memory"
    NONE = "none"  # Rate limiting disabled


# =============================================================================
# Module State
# =============================================================================

# In-memory store (for development only)
_rate_limit_store: Dict[str, list] = defaultdict(list)

# Redis client (initialized at startup in production)
_redis_client = None

# Current backend type
_active_backend: str = RateLimiterBackend.NONE

# Whether initialization has been completed
_initialized: bool = False


# =============================================================================
# Exceptions
# =============================================================================


class RateLimiterConfigurationError(Exception):
    """Raised when rate limiter is misconfigured for the environment."""

    pass


class RateLimiterUnavailableError(Exception):
    """Raised when rate limiter backend becomes unavailable at runtime."""

    pass


# =============================================================================
# Initialization & Validation
# =============================================================================


async def initialize_rate_limiter() -> str:
    """
    Initialize the rate limiter backend based on environment.

    MUST be called at application startup.

    Production behavior:
    - Redis URL must be configured
    - Redis must be reachable
    - Raises RateLimiterConfigurationError if not

    Development behavior:
    - Uses Redis if available
    - Falls back to in-memory with warning if not

    Returns:
        The active backend type ("redis" or "memory")

    Raises:
        RateLimiterConfigurationError: If production requirements not met
    """
    global _redis_client, _active_backend, _initialized

    # If rate limiting is disabled, log and return
    if not settings.rate_limit_enabled:
        _active_backend = RateLimiterBackend.NONE
        _initialized = True
        logger.info(
            "[RateLimiter:Init] rate_limit_enabled=false backend=none "
            "env=%s - Rate limiting is disabled",
            settings.env,
        )
        return _active_backend

    is_production = settings.is_production
    redis_url = settings.redis_url

    # ==========================================================================
    # PRODUCTION: Redis is REQUIRED
    # ==========================================================================
    if is_production:
        if not redis_url:
            error_msg = (
                "[RateLimiter:Init] FATAL: Redis URL not configured in production. "
                "Rate limiting requires Redis for distributed persistence. "
                "Set REDIS_URL environment variable."
            )
            logger.error(error_msg)
            raise RateLimiterConfigurationError(error_msg)

        # Attempt Redis connection
        try:
            import redis.asyncio as redis

            _redis_client = redis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            # Eagerly validate connection
            await _redis_client.ping()

            _active_backend = RateLimiterBackend.REDIS
            _initialized = True

            # Extract host for logging (mask password)
            redis_host = _mask_redis_url(redis_url)
            logger.info(
                "[RateLimiter:Init] backend=redis status=connected "
                "env=production redis_host=%s",
                redis_host,
            )
            return _active_backend

        except ImportError as e:
            error_msg = (
                "[RateLimiter:Init] FATAL: redis package not installed. "
                "Install with: pip install redis"
            )
            logger.error(error_msg)
            raise RateLimiterConfigurationError(error_msg) from e

        except Exception as e:
            error_msg = (
                f"[RateLimiter:Init] FATAL: Redis connection failed in production. "
                f"Redis URL: {_mask_redis_url(redis_url)}. Error: {e}"
            )
            logger.error(error_msg)
            raise RateLimiterConfigurationError(error_msg) from e

    # ==========================================================================
    # DEVELOPMENT/TEST: Redis preferred, in-memory fallback allowed
    # ==========================================================================
    else:
        if redis_url:
            try:
                import redis.asyncio as redis

                _redis_client = redis.from_url(
                    redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                )
                await _redis_client.ping()

                _active_backend = RateLimiterBackend.REDIS
                _initialized = True

                logger.info(
                    "[RateLimiter:Init] backend=redis status=connected "
                    "env=%s redis_host=%s",
                    settings.env,
                    _mask_redis_url(redis_url),
                )
                return _active_backend

            except Exception as e:
                logger.warning(
                    "[RateLimiter:Init] backend=memory reason=redis_failed "
                    "env=%s error=%s - Redis connection failed, using in-memory fallback. "
                    "Rate limits will NOT persist across restarts.",
                    settings.env,
                    str(e),
                )
        else:
            logger.warning(
                "[RateLimiter:Init] backend=memory reason=no_redis_url "
                "env=%s - REDIS_URL not configured. Using in-memory rate limiting. "
                "Rate limits will NOT persist across restarts.",
                settings.env,
            )

        _active_backend = RateLimiterBackend.MEMORY
        _initialized = True
        return _active_backend


def _mask_redis_url(url: str) -> str:
    """Mask password in Redis URL for safe logging."""
    if url is None:
        return "None"
    if url == "":
        return ""
    try:
        # Handle redis://user:password@host:port/db format
        if "@" in url:
            parts = url.split("@")
            return f"***@{parts[-1]}"
        return url
    except Exception:
        return "***"


async def get_rate_limiter_status() -> Dict:
    """
    Get current rate limiter status for health checks and debugging.

    Returns:
        Dict with backend, initialized, healthy, env, and latency_ms (if Redis)
    """
    base_status = {
        "backend": _active_backend if _initialized else "uninitialized",
        "initialized": _initialized,
        "env": settings.env,
        "rate_limit_enabled": settings.rate_limit_enabled,
        "redis_configured": bool(settings.redis_url),
        "redis_connected": _redis_client is not None,
    }

    # Determine health status based on backend
    if not _initialized:
        base_status["healthy"] = False
        base_status["reason"] = "Rate limiter not initialized"
        return base_status

    if _active_backend == RateLimiterBackend.NONE:
        base_status["healthy"] = True
        base_status["reason"] = "Rate limiting disabled"
        return base_status

    if _active_backend == RateLimiterBackend.MEMORY:
        base_status["healthy"] = True
        base_status["reason"] = "Using in-memory rate limiting (non-persistent)"
        return base_status

    if _active_backend == RateLimiterBackend.REDIS:
        # Actually ping Redis to verify it's still healthy
        try:
            start_time = datetime.now()
            await _redis_client.ping()
            latency_ms = (datetime.now() - start_time).total_seconds() * 1000

            base_status["healthy"] = True
            base_status["latency_ms"] = round(latency_ms, 2)
            return base_status
        except Exception as e:
            base_status["healthy"] = False
            base_status["error"] = str(e)
            return base_status

    # Unknown backend
    base_status["healthy"] = False
    base_status["error"] = f"Unknown backend: {_active_backend}"
    return base_status


def _ensure_initialized():
    """
    Ensure rate limiter has been initialized.

    Raises:
        RateLimiterConfigurationError: If not initialized
    """
    if not _initialized:
        raise RateLimiterConfigurationError(
            "[RateLimiter] Rate limiter not initialized. "
            "Call initialize_rate_limiter() at application startup."
        )


# =============================================================================
# Rate limit configuration per endpoint
# =============================================================================

ENDPOINT_LIMITS = {
    # Transcription endpoints (expensive)
    "/transcribe": {"limit": 10, "window": 60},
    "/ws/listen": {"limit": 5, "window": 60},
    "/ws/live-transcribe": {"limit": 5, "window": 60},
    # Analysis endpoints (LLM calls)
    "/analyze": {"limit": 15, "window": 60},
    "/refine": {"limit": 15, "window": 60},
    # Session endpoints
    "/sessions": {"limit": 30, "window": 60},
    # Auth endpoints (prevent brute force)
    "/auth": {"limit": 20, "window": 60},
    # Webhook endpoints (higher limit — Stripe retries on failure, and we
    # don't want legitimate retries to be throttled, but still cap to
    # prevent abuse if the URL is discovered by a bad actor)
    "/webhooks/": {"limit": 200, "window": 60},
    "/billing/webhook": {"limit": 200, "window": 60},
    # Default for all other endpoints
    "default": {"limit": 60, "window": 60},
}


def get_limit_for_endpoint(path: str) -> Tuple[int, int]:
    """
    Get rate limit configuration for an endpoint.

    Returns:
        Tuple of (limit, window_seconds)
    """
    # Check for exact match
    if path in ENDPOINT_LIMITS:
        config = ENDPOINT_LIMITS[path]
        return config["limit"], config["window"]

    # Check for prefix match
    for endpoint, config in ENDPOINT_LIMITS.items():
        if endpoint != "default" and path.startswith(endpoint):
            return config["limit"], config["window"]

    # Default
    config = ENDPOINT_LIMITS["default"]
    return config["limit"], config["window"]


# =============================================================================
# Rate limiting implementation
# =============================================================================


async def check_rate_limit_redis(
    identifier: str, limit: int, window: int
) -> Tuple[bool, int, int]:
    """
    Check rate limit using Redis sliding window.

    Returns:
        Tuple of (allowed, remaining, reset_after_seconds)

    Raises:
        RateLimiterUnavailableError: If Redis becomes unavailable in production
    """
    global _redis_client

    if not _redis_client:
        # This shouldn't happen if initialized correctly
        raise RateLimiterUnavailableError(
            "[RateLimiter] Redis client not available. "
            "Rate limiter may not have been initialized."
        )

    try:
        key = f"rate_limit:{identifier}"
        now = datetime.now().timestamp()
        window_start = now - window

        # Use Redis pipeline for atomic operations
        pipe = _redis_client.pipeline()

        # Remove old entries
        pipe.zremrangebyscore(key, 0, window_start)

        # Count current entries
        pipe.zcard(key)

        # Add current request
        pipe.zadd(key, {str(now): now})

        # Set expiry
        pipe.expire(key, window)

        results = await pipe.execute()
        current_count = results[1]

        if current_count >= limit:
            # Remove the entry we just added
            await _redis_client.zrem(key, str(now))
            remaining = 0
            reset_after = int(window - (now - window_start))
            return False, remaining, reset_after

        remaining = max(0, limit - current_count - 1)
        reset_after = window
        return True, remaining, reset_after

    except Exception as e:
        # In production, Redis failure is a hard error
        if settings.is_production:
            logger.error(
                "[RateLimiter:Redis] FATAL: Redis operation failed in production. "
                "error=%s - Refusing to disable rate limiting.",
                str(e),
            )
            raise RateLimiterUnavailableError(
                f"[RateLimiter] Redis unavailable in production: {e}"
            ) from e
        else:
            # In development, log warning and fail the check (safe default)
            logger.warning(
                "[RateLimiter:Redis] Redis operation failed in development. "
                "error=%s - Denying request as safe default.",
                str(e),
            )
            # Return rate limited to be safe
            return False, 0, window


async def check_rate_limit_memory(
    identifier: str, limit: int, window: int
) -> Tuple[bool, int, int]:
    """
    Check rate limit using in-memory store (development only).

    Returns:
        Tuple of (allowed, remaining, reset_after_seconds)
    """
    now = datetime.now()
    cutoff = now - timedelta(seconds=window)

    # Clean old entries
    _rate_limit_store[identifier] = [
        ts for ts in _rate_limit_store[identifier] if ts > cutoff
    ]

    current_count = len(_rate_limit_store[identifier])

    if current_count >= limit:
        # Find oldest entry to calculate reset time
        if _rate_limit_store[identifier]:
            oldest = min(_rate_limit_store[identifier])
            reset_after = int(
                (oldest + timedelta(seconds=window) - now).total_seconds()
            )
        else:
            reset_after = window
        return False, 0, max(1, reset_after)

    # Record this request
    _rate_limit_store[identifier].append(now)
    remaining = limit - current_count - 1
    return True, remaining, window


async def _check_rate_limit(
    identifier: str, limit: int, window: int
) -> Tuple[bool, int, int]:
    """
    Internal rate limit check that routes to appropriate backend.
    """
    _ensure_initialized()

    if _active_backend == RateLimiterBackend.NONE:
        # Rate limiting disabled
        return True, limit, window
    elif _active_backend == RateLimiterBackend.REDIS:
        return await check_rate_limit_redis(identifier, limit, window)
    elif _active_backend == RateLimiterBackend.MEMORY:
        return await check_rate_limit_memory(identifier, limit, window)
    else:
        raise RateLimiterConfigurationError(
            f"[RateLimiter] Unknown backend: {_active_backend}"
        )


def check_rate_limit(identifier: str, limit_per_minute: int = None) -> bool:
    """
    Synchronous rate limit check (for backward compatibility).
    Returns True if allowed, False if rate limited.

    NOTE: This uses in-memory storage only for synchronous access.
    For production, use the async rate_limit_check() instead.
    """
    _ensure_initialized()

    if _active_backend == RateLimiterBackend.NONE:
        return True

    limit = limit_per_minute or settings.rate_limit_per_minute
    now = datetime.now()
    cutoff = now - timedelta(minutes=1)

    # Clean old entries
    _rate_limit_store[identifier] = [
        ts for ts in _rate_limit_store[identifier] if ts > cutoff
    ]

    # Check limit
    if len(_rate_limit_store[identifier]) >= limit:
        return False

    # Record this request
    _rate_limit_store[identifier].append(now)
    return True


async def rate_limit_check(
    identifier: str,
    path: str = "/",
) -> Tuple[bool, Dict[str, str]]:
    """
    Async rate limit check with headers.

    Returns:
        Tuple of (allowed, rate_limit_headers)

    Raises:
        RateLimiterUnavailableError: If backend unavailable in production
        RateLimiterConfigurationError: If not initialized
    """
    _ensure_initialized()

    if _active_backend == RateLimiterBackend.NONE:
        return True, {}

    limit, window = get_limit_for_endpoint(path)
    allowed, remaining, reset_after = await _check_rate_limit(identifier, limit, window)

    headers = {
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": str(remaining),
        "X-RateLimit-Reset": str(reset_after),
    }

    if not allowed:
        headers["Retry-After"] = str(reset_after)

    return allowed, headers


def rate_limit_middleware(identifier: str):
    """
    Middleware to enforce rate limiting (synchronous, for backward compatibility).

    Raises:
        HTTPException: 429 if rate limited
        HTTPException: 503 if rate limiter unavailable in production
    """
    _ensure_initialized()

    if _active_backend == RateLimiterBackend.NONE:
        return

    try:
        if not check_rate_limit(identifier):
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please try again later.",
                headers={"Retry-After": "60"},
            )
    except RateLimiterUnavailableError as e:
        logger.error(f"[RateLimiter:Middleware] Backend unavailable: {e}")
        raise HTTPException(
            status_code=503,
            detail="Rate limiter temporarily unavailable. Please try again.",
        )


async def close_redis():
    """Close Redis connection on shutdown."""
    global _redis_client, _active_backend, _initialized
    if _redis_client:
        logger.info("[RateLimiter:Shutdown] Closing Redis connection")
        await _redis_client.aclose()
        _redis_client = None
    _active_backend = RateLimiterBackend.NONE
    _initialized = False
    logger.info("[RateLimiter:Shutdown] Rate limiter shut down")


# =============================================================================
# Testing Utilities
# =============================================================================


def reset_for_testing():
    """
    Reset rate limiter state for testing.

    WARNING: Only use in tests!
    """
    global _redis_client, _active_backend, _initialized, _rate_limit_store
    _redis_client = None
    _active_backend = RateLimiterBackend.NONE
    _initialized = False
    _rate_limit_store.clear()

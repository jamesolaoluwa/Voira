"""
Production-ready rate limiter with Redis support.

Features:
- Redis-backed for production (distributed rate limiting)
- In-memory fallback for development
- Sliding window algorithm
- Per-endpoint rate limits
"""

import logging
import asyncio
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional, Dict, Tuple
from fastapi import HTTPException, Request
from config import settings

logger = logging.getLogger(__name__)

# =============================================================================
# In-memory store (fallback for development or when Redis is unavailable)
# =============================================================================
_rate_limit_store: Dict[str, list] = defaultdict(list)

# =============================================================================
# Redis client (initialized lazily)
# =============================================================================
_redis_client = None
_redis_available = None  # None = not checked, True/False = checked


async def _get_redis_client():
    """Get or create Redis client."""
    global _redis_client, _redis_available
    
    if _redis_available is False:
        return None
    
    if _redis_client is not None:
        return _redis_client
    
    if not settings.redis_url:
        _redis_available = False
        logger.info("Redis URL not configured - using in-memory rate limiting")
        return None
    
    try:
        import redis.asyncio as redis
        _redis_client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        # Test connection
        await _redis_client.ping()
        _redis_available = True
        logger.info("Redis connected for rate limiting")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis connection failed, falling back to in-memory: {e}")
        _redis_available = False
        return None


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
    identifier: str,
    limit: int,
    window: int
) -> Tuple[bool, int, int]:
    """
    Check rate limit using Redis sliding window.
    
    Returns:
        Tuple of (allowed, remaining, reset_after_seconds)
    """
    client = await _get_redis_client()
    if not client:
        return await check_rate_limit_memory(identifier, limit, window)
    
    try:
        key = f"rate_limit:{identifier}"
        now = datetime.now().timestamp()
        window_start = now - window
        
        # Use Redis pipeline for atomic operations
        pipe = client.pipeline()
        
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
            await client.zrem(key, str(now))
            remaining = 0
            reset_after = int(window - (now - window_start))
            return False, remaining, reset_after
        
        remaining = max(0, limit - current_count - 1)
        reset_after = window
        return True, remaining, reset_after
        
    except Exception as e:
        logger.warning(f"Redis rate limit error, falling back to memory: {e}")
        return await check_rate_limit_memory(identifier, limit, window)


async def check_rate_limit_memory(
    identifier: str,
    limit: int,
    window: int
) -> Tuple[bool, int, int]:
    """
    Check rate limit using in-memory store (fallback).
    
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
            reset_after = int((oldest + timedelta(seconds=window) - now).total_seconds())
        else:
            reset_after = window
        return False, 0, max(1, reset_after)
    
    # Record this request
    _rate_limit_store[identifier].append(now)
    remaining = limit - current_count - 1
    return True, remaining, window


def check_rate_limit(identifier: str, limit_per_minute: int = None) -> bool:
    """
    Synchronous rate limit check (for backward compatibility).
    Returns True if allowed, False if rate limited.
    """
    if not settings.rate_limit_enabled:
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
    """
    if not settings.rate_limit_enabled:
        return True, {}
    
    limit, window = get_limit_for_endpoint(path)
    allowed, remaining, reset_after = await check_rate_limit_redis(
        identifier, limit, window
    )
    
    headers = {
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": str(remaining),
        "X-RateLimit-Reset": str(reset_after),
    }
    
    if not allowed:
        headers["Retry-After"] = str(reset_after)
    
    return allowed, headers


def rate_limit_middleware(identifier: str):
    """Middleware to enforce rate limiting (synchronous, for backward compatibility)."""
    if not check_rate_limit(identifier):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please try again later.",
            headers={"Retry-After": "60"},
        )


async def close_redis():
    """Close Redis connection on shutdown."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None



"""
Redis Cache Service

Provides centralized caching for:
- API responses
- User session data
- Rate limiting data
- Temporary computation results

Features:
- Automatic JSON serialization
- TTL management
- Cache invalidation patterns
- Fallback to in-memory cache
"""

import json
import logging
import hashlib
from typing import Optional, Any, Dict, Callable, TypeVar
from datetime import timedelta
from functools import wraps
from config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

# =============================================================================
# Cache Configuration
# =============================================================================

# Default TTLs for different cache types
CACHE_TTLS = {
    "user_profile": 300,  # 5 minutes
    "session_list": 60,  # 1 minute
    "session_detail": 300,  # 5 minutes
    "analysis_result": 3600,  # 1 hour
    "voice_profile": 600,  # 10 minutes
    "default": 300,  # 5 minutes
}

# In-memory fallback cache
_memory_cache: Dict[str, Dict[str, Any]] = {}

# Redis client (lazy initialization)
_redis_client = None
_redis_available = None


# =============================================================================
# Redis Connection
# =============================================================================


async def _get_redis():
    """Get or create Redis client."""
    global _redis_client, _redis_available

    if _redis_available is False:
        return None

    if _redis_client is not None:
        return _redis_client

    if not settings.redis_url:
        _redis_available = False
        logger.info("Redis URL not configured - using in-memory cache")
        return None

    try:
        import redis.asyncio as redis

        _redis_client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        await _redis_client.ping()
        _redis_available = True
        logger.info("Redis connected for caching")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis connection failed, using in-memory cache: {e}")
        _redis_available = False
        return None


async def close_cache():
    """Close Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None


# =============================================================================
# Cache Key Generation
# =============================================================================


def make_cache_key(prefix: str, *args, **kwargs) -> str:
    """
    Generate a cache key from prefix and arguments.

    Args:
        prefix: Key prefix (e.g., "user_profile")
        *args: Positional arguments to include in key
        **kwargs: Keyword arguments to include in key

    Returns:
        Cache key string
    """
    parts = [prefix]

    for arg in args:
        if arg is not None:
            parts.append(str(arg))

    for key, value in sorted(kwargs.items()):
        if value is not None:
            parts.append(f"{key}:{value}")

    key = ":".join(parts)

    # Hash long keys
    if len(key) > 200:
        hash_part = hashlib.md5(key.encode()).hexdigest()[:16]
        key = f"{prefix}:{hash_part}"

    return f"voira:{key}"


# =============================================================================
# Core Cache Operations
# =============================================================================


async def cache_get(key: str) -> Optional[Any]:
    """
    Get a value from cache.

    Args:
        key: Cache key

    Returns:
        Cached value or None
    """
    redis = await _get_redis()

    if redis:
        try:
            value = await redis.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.warning(f"Redis get error: {e}")

    # Fallback to memory cache
    if key in _memory_cache:
        entry = _memory_cache[key]
        # Check if expired (simple TTL check)
        import time

        if entry.get("expires_at", 0) > time.time():
            return entry.get("value")
        else:
            del _memory_cache[key]

    return None


async def cache_set(
    key: str, value: Any, ttl: Optional[int] = None, cache_type: str = "default"
) -> bool:
    """
    Set a value in cache.

    Args:
        key: Cache key
        value: Value to cache (must be JSON serializable)
        ttl: Time to live in seconds (optional)
        cache_type: Type of cache for default TTL lookup

    Returns:
        True if cached successfully
    """
    if ttl is None:
        ttl = CACHE_TTLS.get(cache_type, CACHE_TTLS["default"])

    redis = await _get_redis()

    if redis:
        try:
            serialized = json.dumps(value)
            await redis.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.warning(f"Redis set error: {e}")

    # Fallback to memory cache
    import time

    _memory_cache[key] = {
        "value": value,
        "expires_at": time.time() + ttl,
    }

    # Limit memory cache size
    if len(_memory_cache) > 1000:
        # Remove oldest entries
        sorted_keys = sorted(
            _memory_cache.keys(), key=lambda k: _memory_cache[k].get("expires_at", 0)
        )
        for old_key in sorted_keys[:100]:
            del _memory_cache[old_key]

    return True


async def cache_delete(key: str) -> bool:
    """
    Delete a value from cache.

    Args:
        key: Cache key

    Returns:
        True if deleted
    """
    redis = await _get_redis()

    if redis:
        try:
            await redis.delete(key)
        except Exception as e:
            logger.warning(f"Redis delete error: {e}")

    # Also delete from memory cache
    _memory_cache.pop(key, None)
    return True


async def cache_delete_pattern(pattern: str) -> int:
    """
    Delete all keys matching a pattern.

    Args:
        pattern: Key pattern (e.g., "voira:user_profile:*")

    Returns:
        Number of keys deleted
    """
    count = 0
    redis = await _get_redis()

    if redis:
        try:
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                if keys:
                    await redis.delete(*keys)
                    count += len(keys)
                if cursor == 0:
                    break
        except Exception as e:
            logger.warning(f"Redis pattern delete error: {e}")

    # Also clean memory cache
    keys_to_delete = [
        k for k in _memory_cache.keys() if k.startswith(pattern.replace("*", ""))
    ]
    for k in keys_to_delete:
        del _memory_cache[k]
        count += 1

    return count


# =============================================================================
# Cache Decorator
# =============================================================================


def cached(
    prefix: str,
    ttl: Optional[int] = None,
    cache_type: str = "default",
    key_builder: Optional[Callable[..., str]] = None,
):
    """
    Decorator to cache function results.

    Args:
        prefix: Cache key prefix
        ttl: Time to live in seconds
        cache_type: Type for default TTL
        key_builder: Optional function to build cache key from args

    Usage:
        @cached("user_profile", ttl=300)
        async def get_user_profile(user_id: str):
            ...
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                cache_key = make_cache_key(prefix, *args, **kwargs)

            # Try to get from cache
            cached_value = await cache_get(cache_key)
            if cached_value is not None:
                logger.debug(f"Cache hit: {cache_key}")
                return cached_value

            # Call function
            result = await func(*args, **kwargs)

            # Cache result
            if result is not None:
                await cache_set(cache_key, result, ttl=ttl, cache_type=cache_type)
                logger.debug(f"Cache set: {cache_key}")

            return result

        return wrapper

    return decorator


# =============================================================================
# User-specific Cache Helpers
# =============================================================================


async def invalidate_user_cache(user_id: str):
    """Invalidate all cache entries for a user."""
    await cache_delete_pattern(f"voira:*:{user_id}:*")
    await cache_delete_pattern(f"voira:*:{user_id}")
    logger.info(f"Invalidated cache for user {user_id}")


async def invalidate_session_cache(session_id: str):
    """Invalidate cache for a specific session."""
    await cache_delete_pattern(f"voira:session*:{session_id}*")
    logger.info(f"Invalidated cache for session {session_id}")

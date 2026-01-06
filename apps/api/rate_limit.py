"""Simple in-memory rate limiter (dev-safe, prod TODO: Redis/Upstash)."""
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import HTTPException
from config import settings

# In-memory store (dev only)
# TODO: Replace with Redis/Upstash for production
_rate_limit_store: dict[str, list[datetime]] = defaultdict(list)


def check_rate_limit(identifier: str, limit_per_minute: int = None) -> bool:
    """
    Check if identifier has exceeded rate limit.
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


def rate_limit_middleware(identifier: str):
    """Middleware to enforce rate limiting."""
    if not check_rate_limit(identifier):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please try again later."
        )


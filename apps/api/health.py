"""
Health check endpoints for production monitoring.

Provides:
- /health - Basic liveness check
- /health/ready - Readiness check with dependency verification
- /health/dependencies - Detailed dependency status
"""

import logging
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime
from config import settings

logger = logging.getLogger(__name__)


async def check_supabase() -> Dict[str, Any]:
    """Check Supabase database connectivity."""
    try:
        from db import supabase
        
        # Simple query to verify connection - use user_profiles table
        start = datetime.now()
        result = supabase.table("user_profiles").select("user_id").limit(1).execute()
        latency_ms = (datetime.now() - start).total_seconds() * 1000
        
        return {
            "status": "healthy",
            "latency_ms": round(latency_ms, 2),
        }
    except Exception as e:
        logger.error(f"Supabase health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
        }


async def check_redis() -> Dict[str, Any]:
    """Check Redis connectivity (if configured)."""
    if not settings.redis_url:
        return {
            "status": "not_configured",
            "message": "Redis URL not set - using in-memory rate limiting",
        }
    
    try:
        import redis.asyncio as redis
        
        start = datetime.now()
        client = redis.from_url(settings.redis_url)
        await client.ping()
        latency_ms = (datetime.now() - start).total_seconds() * 1000
        await client.close()
        
        return {
            "status": "healthy",
            "latency_ms": round(latency_ms, 2),
        }
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
        }


async def check_deepgram() -> Dict[str, Any]:
    """Check Deepgram API key configuration."""
    if not settings.deepgram_api_key:
        return {
            "status": "not_configured",
            "message": "Deepgram API key not set - transcription will not work",
        }
    
    # We don't make actual API calls for health checks to avoid costs
    # Just verify the key is present and looks valid
    key = settings.deepgram_api_key
    if len(key) < 20:
        return {
            "status": "unhealthy",
            "error": "Deepgram API key appears invalid (too short)",
        }
    
    return {
        "status": "healthy",
        "message": "API key configured",
    }


async def check_openai() -> Dict[str, Any]:
    """Check OpenAI API key configuration."""
    if not settings.openai_api_key:
        return {
            "status": "not_configured",
            "message": "OpenAI API key not set - LLM refinement will not work",
        }
    
    key = settings.openai_api_key
    if not key.startswith('sk-'):
        return {
            "status": "unhealthy",
            "error": "OpenAI API key appears invalid (should start with 'sk-')",
        }
    
    return {
        "status": "healthy",
        "message": "API key configured",
    }


async def check_sentry() -> Dict[str, Any]:
    """Check Sentry configuration."""
    if not settings.sentry_dsn:
        return {
            "status": "not_configured",
            "message": "Sentry DSN not set - error tracking disabled",
        }
    
    return {
        "status": "healthy",
        "message": "Error tracking enabled",
    }


async def get_all_health_checks() -> Dict[str, Any]:
    """
    Run all health checks in parallel.
    
    Returns:
        Dictionary with status of all dependencies
    """
    checks = await asyncio.gather(
        check_supabase(),
        check_redis(),
        check_deepgram(),
        check_openai(),
        check_sentry(),
        return_exceptions=True,
    )
    
    check_names = ["supabase", "redis", "deepgram", "openai", "sentry"]
    
    results = {}
    for name, result in zip(check_names, checks):
        if isinstance(result, Exception):
            results[name] = {
                "status": "error",
                "error": str(result),
            }
        else:
            results[name] = result
    
    return results


def is_ready(checks: Dict[str, Any]) -> bool:
    """
    Determine if the application is ready to serve traffic.
    
    Critical dependencies (must be healthy):
    - Supabase (database)
    
    Non-critical (can be degraded):
    - Redis (falls back to in-memory)
    - Deepgram (transcription unavailable)
    - OpenAI (refinement unavailable)
    - Sentry (error tracking disabled)
    """
    # Check critical dependencies
    supabase_status = checks.get("supabase", {}).get("status")
    if supabase_status not in ("healthy",):
        return False
    
    return True


def get_overall_status(checks: Dict[str, Any]) -> str:
    """
    Get overall application health status.
    
    Returns:
        "healthy" - All dependencies operational
        "degraded" - Non-critical dependencies unavailable
        "unhealthy" - Critical dependencies unavailable
    """
    if not is_ready(checks):
        return "unhealthy"
    
    # Check for degraded status
    for name, check in checks.items():
        if check.get("status") == "unhealthy":
            return "degraded"
    
    return "healthy"

"""
Custom Middleware for Production

Provides:
- Request timeout handling
- Request ID injection
- Performance logging
- Error standardization
"""

import asyncio
import time
import logging
from typing import Callable
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from config import settings
from logging_config import set_request_id, get_request_id

logger = logging.getLogger(__name__)

# =============================================================================
# Request Timeout Configuration
# =============================================================================

# Timeouts in seconds for different endpoint types
ENDPOINT_TIMEOUTS = {
    # Transcription endpoints (can be slow)
    "/transcribe": 120,
    "/ws/listen": 600,  # WebSocket - long timeout
    "/ws/live-transcribe": 600,
    
    # Analysis endpoints (LLM calls)
    "/analyze": 60,
    "/refine": 60,
    
    # File uploads
    "/upload-audio": 60,
    "/upload-reference": 60,
    
    # Standard API calls
    "default": 30,
}


def get_timeout_for_path(path: str) -> int:
    """Get appropriate timeout for an endpoint."""
    for endpoint, timeout in ENDPOINT_TIMEOUTS.items():
        if endpoint != "default" and path.startswith(endpoint):
            return timeout
    return ENDPOINT_TIMEOUTS["default"]


# =============================================================================
# Timeout Middleware
# =============================================================================

class TimeoutMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce request timeouts.
    
    Prevents requests from hanging indefinitely and provides
    a standardized timeout response.
    """
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Skip timeout for WebSocket upgrades
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)
        
        # Skip timeout for health checks
        if request.url.path.startswith("/health"):
            return await call_next(request)
        
        timeout = get_timeout_for_path(request.url.path)
        
        try:
            return await asyncio.wait_for(
                call_next(request),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            request_id = get_request_id() or "unknown"
            logger.error(
                f"Request timeout after {timeout}s",
                extra={
                    "path": request.url.path,
                    "method": request.method,
                    "request_id": request_id,
                }
            )
            return JSONResponse(
                status_code=504,
                content={
                    "detail": "Request timed out. Please try again.",
                    "request_id": request_id,
                },
                headers={"X-Request-ID": request_id}
            )


# =============================================================================
# Performance Logging Middleware
# =============================================================================

class PerformanceLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to log request performance metrics.
    
    Logs response time and status for monitoring.
    """
    
    # Paths to skip detailed logging
    SKIP_PATHS = {"/health", "/health/ready", "/health/dependencies"}
    
    async def dispatch(self, request: Request, call_next: Callable):
        # Skip logging for health checks (too noisy)
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)
        
        start_time = time.perf_counter()
        
        response = await call_next(request)
        
        # Calculate duration
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        # Log slow requests
        if duration_ms > 1000:  # > 1 second
            logger.warning(
                f"Slow request: {request.method} {request.url.path} "
                f"took {duration_ms:.0f}ms (status: {response.status_code})"
            )
        elif settings.is_development:
            # In development, log all requests
            logger.debug(
                f"{request.method} {request.url.path} "
                f"completed in {duration_ms:.0f}ms (status: {response.status_code})"
            )
        
        # Add timing header
        response.headers["X-Response-Time"] = f"{duration_ms:.0f}ms"
        
        return response


# =============================================================================
# Error Handling Middleware
# =============================================================================

class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to standardize error responses.
    
    Ensures all errors have consistent format with request ID.
    """
    
    async def dispatch(self, request: Request, call_next: Callable):
        try:
            return await call_next(request)
        except HTTPException:
            # Let FastAPI handle HTTP exceptions
            raise
        except Exception as e:
            request_id = get_request_id() or "unknown"
            
            # Log the error
            logger.exception(
                f"Unhandled exception: {e}",
                extra={"request_id": request_id}
            )
            
            # Capture in Sentry
            try:
                from sentry_config import capture_exception
                capture_exception(e, extra={
                    "request_id": request_id,
                    "path": request.url.path,
                    "method": request.method,
                })
            except ImportError:
                pass
            
            # Return standardized error response
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "request_id": request_id,
                },
                headers={"X-Request-ID": request_id}
            )

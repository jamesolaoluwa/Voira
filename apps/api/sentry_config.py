"""
Sentry error tracking configuration.

Provides:
- Automatic error capture and reporting
- Performance monitoring
- Request context enrichment
- Sensitive data scrubbing
"""

import logging
from typing import Optional, Dict, Any
from config import settings

logger = logging.getLogger(__name__)

# Flag to track if Sentry is initialized
_sentry_initialized = False


def init_sentry() -> bool:
    """
    Initialize Sentry error tracking.

    Returns:
        True if Sentry was initialized successfully, False otherwise.
    """
    global _sentry_initialized

    if _sentry_initialized:
        return True

    if not settings.sentry_dsn:
        if settings.is_production:
            logger.warning(
                "SENTRY_DSN not configured. Error tracking is disabled. "
                "Set SENTRY_DSN environment variable for production error tracking."
            )
        else:
            logger.info(
                "Sentry not configured (development mode). Error tracking disabled."
            )
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.env,
            # Performance monitoring
            traces_sample_rate=settings.sentry_traces_sample_rate,
            profiles_sample_rate=settings.sentry_profiles_sample_rate,
            # Integrations
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                StarletteIntegration(transaction_style="endpoint"),
                LoggingIntegration(
                    level=logging.INFO,  # Capture INFO and above as breadcrumbs
                    event_level=logging.ERROR,  # Only send ERROR and above as events
                ),
            ],
            # Data scrubbing - remove sensitive data
            send_default_pii=False,  # Don't send personally identifiable information
            # Before send hook for additional filtering
            before_send=_before_send,
            # Before breadcrumb hook
            before_breadcrumb=_before_breadcrumb,
        )

        _sentry_initialized = True
        logger.info(f"Sentry initialized for {settings.env} environment")
        return True

    except ImportError:
        logger.warning("sentry-sdk not installed. Error tracking disabled.")
        return False
    except Exception as e:
        logger.error(f"Failed to initialize Sentry: {e}")
        return False


def _before_send(
    event: Dict[str, Any], hint: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Process event before sending to Sentry.
    Used for filtering or modifying events.
    """
    # Filter out expected exceptions that don't need tracking
    if "exc_info" in hint:
        exc_type, exc_value, _ = hint["exc_info"]

        # Don't send 401/403 errors (expected auth failures)
        from fastapi import HTTPException

        if isinstance(exc_value, HTTPException):
            if exc_value.status_code in (401, 403, 404):
                return None

    # Scrub sensitive data from request headers
    if "request" in event:
        request = event["request"]
        if "headers" in request:
            headers = request["headers"]
            sensitive_headers = ["authorization", "cookie", "x-api-key"]
            for header in sensitive_headers:
                if header in headers:
                    headers[header] = "[REDACTED]"

    return event


def _before_breadcrumb(
    crumb: Dict[str, Any], hint: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Process breadcrumb before adding to event.
    Used for filtering or modifying breadcrumbs.
    """
    # Filter out noisy breadcrumbs
    if crumb.get("category") == "httpx":
        # Don't track internal HTTP calls in detail
        return None

    return crumb


def capture_exception(error: Exception, extra: Optional[Dict[str, Any]] = None):
    """
    Capture an exception and send to Sentry.

    Args:
        error: The exception to capture
        extra: Additional context to include
    """
    if not _sentry_initialized:
        logger.error(f"Exception (Sentry disabled): {error}", exc_info=error)
        return

    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            if extra:
                for key, value in extra.items():
                    scope.set_extra(key, value)
            sentry_sdk.capture_exception(error)
    except Exception as e:
        logger.error(f"Failed to capture exception in Sentry: {e}")


def capture_message(
    message: str, level: str = "info", extra: Optional[Dict[str, Any]] = None
):
    """
    Capture a message and send to Sentry.

    Args:
        message: The message to capture
        level: Log level (debug, info, warning, error, fatal)
        extra: Additional context to include
    """
    if not _sentry_initialized:
        logger.log(getattr(logging, level.upper(), logging.INFO), message)
        return

    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            if extra:
                for key, value in extra.items():
                    scope.set_extra(key, value)
            sentry_sdk.capture_message(message, level=level)
    except Exception as e:
        logger.error(f"Failed to capture message in Sentry: {e}")


def set_user_context(user_id: str, email: Optional[str] = None):
    """
    Set user context for Sentry events.

    Args:
        user_id: The user's ID
        email: The user's email (optional)
    """
    if not _sentry_initialized:
        return

    try:
        import sentry_sdk

        sentry_sdk.set_user(
            {
                "id": user_id,
                "email": email,
            }
        )
    except Exception:
        pass


def clear_user_context():
    """Clear the current user context."""
    if not _sentry_initialized:
        return

    try:
        import sentry_sdk

        sentry_sdk.set_user(None)
    except Exception:
        pass

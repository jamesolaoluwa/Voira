"""
Structured logging configuration for production.

Provides:
- JSON structured logging for production (easy to parse in log aggregators)
- Human-readable logging for development
- Request correlation IDs for tracing
- Automatic sensitive data redaction
"""

import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Optional
from pythonjsonlogger import jsonlogger
from config import settings

# Context variable for request correlation ID
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def get_request_id() -> Optional[str]:
    """Get the current request's correlation ID."""
    return request_id_var.get()


def set_request_id(request_id: Optional[str] = None) -> str:
    """Set a correlation ID for the current request."""
    rid = request_id or str(uuid.uuid4())[:8]
    request_id_var.set(rid)
    return rid


class RequestIdFilter(logging.Filter):
    """Add request_id to all log records."""

    def filter(self, record):
        record.request_id = get_request_id() or "no-request"
        return True


class SensitiveDataFilter(logging.Filter):
    """
    Filter to redact sensitive data from logs.
    Redacts API keys, tokens, and other secrets.
    """

    SENSITIVE_PATTERNS = [
        "api_key",
        "apikey",
        "api-key",
        "secret",
        "password",
        "passwd",
        "token",
        "jwt",
        "bearer",
        "authorization",
        "auth",
        "credential",
        "private_key",
        "service_role",
        "anon_key",
    ]

    def filter(self, record):
        if hasattr(record, "msg") and isinstance(record.msg, str):
            msg_lower = record.msg.lower()
            for pattern in self.SENSITIVE_PATTERNS:
                if pattern in msg_lower:
                    # Check if this looks like it contains a secret value
                    # Don't redact messages that just mention these terms
                    if "=" in record.msg or ":" in record.msg:
                        record.msg = self._redact_message(record.msg)
                        break
        return True

    def _redact_message(self, msg: str) -> str:
        """Redact potential secrets from message."""
        # Simple redaction - replace long alphanumeric strings that look like keys
        import re

        # Redact strings that look like API keys (long alphanumeric with dashes/underscores)
        pattern = r"([a-zA-Z0-9_-]{20,})"
        return re.sub(pattern, "[REDACTED]", msg)


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter with additional fields."""

    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)

        # Add standard fields
        log_record["timestamp"] = self.formatTime(record)
        log_record["level"] = record.levelname
        log_record["logger"] = record.name
        log_record["environment"] = settings.env

        # Add request context if available
        request_id = get_request_id()
        if request_id:
            log_record["request_id"] = request_id

        # Add exception info if present
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)


def setup_logging():
    """
    Configure logging based on environment.

    - Development: Human-readable colored output
    - Production: JSON structured logging
    """
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    # Add filters
    handler.addFilter(RequestIdFilter())
    handler.addFilter(SensitiveDataFilter())

    if settings.log_json or settings.is_production:
        # JSON format for production
        formatter = CustomJsonFormatter("%(timestamp)s %(level)s %(name)s %(message)s")
    else:
        # Human-readable format for development
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | [%(request_id)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Set levels for noisy libraries (suppress in production)
    noisy_loggers = [
        "httpx",
        "httpcore",
        "websockets",
        "uvicorn.access",
        "supabase",
        "urllib3",
        "asyncio",
    ]

    for logger_name in noisy_loggers:
        # In production, suppress debug and info logs
        # In dev/staging, allow info level
        level = logging.WARNING if settings.is_production else logging.INFO
        logging.getLogger(logger_name).setLevel(level)

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Get a logger with the given name."""
    return logging.getLogger(name)

"""Short-lived WebSocket authentication tickets (avoids JWT in query strings)."""

import hashlib
import hmac
import secrets
import time
from typing import Optional

from config import settings

WS_INSUFFICIENT_CREDITS_CODE = 4401  # app-specific; distinct from 1008 auth failures
_TICKET_PREFIX = "v1"

# Sourced from settings so it can be tuned per environment.
WS_TICKET_TTL_SECONDS = settings.ws_ticket_ttl_seconds


def create_ws_ticket(user_id: str) -> tuple[str, int]:
    """Return (ticket, expires_in_seconds) for an authenticated user."""
    expiry = int(time.time()) + WS_TICKET_TTL_SECONDS
    nonce = secrets.token_hex(8)
    payload = f"{_TICKET_PREFIX}:{user_id}:{expiry}:{nonce}"
    sig = hmac.new(
        settings.supabase_service_role_key.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}:{sig}", WS_TICKET_TTL_SECONDS


def verify_ws_ticket(ticket: str) -> Optional[str]:
    """Validate ticket and return user_id, or None if invalid/expired."""
    if not ticket or not ticket.strip():
        return None
    try:
        body, sig = ticket.rsplit(":", 1)
        parts = body.split(":")
        if len(parts) != 4 or parts[0] != _TICKET_PREFIX:
            return None
        _, user_id, expiry_str, nonce = parts
        expiry = int(expiry_str)
        if time.time() > expiry:
            return None
        payload = f"{_TICKET_PREFIX}:{user_id}:{expiry}:{nonce}"
        expected = hmac.new(
            settings.supabase_service_role_key.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        return user_id
    except (ValueError, TypeError):
        return None


def extract_ws_credential(
    websocket,
    query_token: Optional[str] = None,
    query_ticket: Optional[str] = None,
) -> tuple[Optional[str], str]:
    """
    Extract WebSocket credential from query params or Sec-WebSocket-Protocol.

    Returns (credential, kind) where kind is 'ticket' or 'jwt'.
    Legacy JWT query-param auth is still accepted for compatibility.
    """
    if query_ticket:
        return query_ticket, "ticket"
    if query_token:
        return query_token, "jwt"

    proto_header = websocket.headers.get("sec-websocket-protocol", "")
    parts = [p.strip() for p in proto_header.split(",") if p.strip()]
    for part in parts:
        if part.startswith(f"{_TICKET_PREFIX}:"):
            return part, "ticket"
        if part.startswith("eyJ") and len(part) > 100:
            return part, "jwt"
    return None, ""

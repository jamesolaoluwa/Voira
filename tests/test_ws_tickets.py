"""Tests for short-lived WebSocket authentication tickets.

Regression coverage for the `WS_TICKET_TTL_SECONDS` NameError that broke
`POST /ws/ticket` (the preferred, non-query-string WS auth path).
"""

import time

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock

import ws_tickets
from ws_tickets import create_ws_ticket, verify_ws_ticket, WS_TICKET_TTL_SECONDS
from main import app


class TestTicketLifecycle:
    def test_create_ws_ticket_round_trips(self):
        """create_ws_ticket must not raise and must produce a verifiable ticket."""
        ticket, expires_in = create_ws_ticket("user-123")
        assert isinstance(ticket, str) and ticket
        assert expires_in == WS_TICKET_TTL_SECONDS
        assert verify_ws_ticket(ticket) == "user-123"

    def test_ttl_constant_is_positive_int(self):
        assert isinstance(WS_TICKET_TTL_SECONDS, int)
        assert WS_TICKET_TTL_SECONDS > 0

    def test_verify_rejects_tampered_ticket(self):
        ticket, _ = create_ws_ticket("user-123")
        tampered = ticket[:-1] + ("0" if ticket[-1] != "0" else "1")
        assert verify_ws_ticket(tampered) is None

    def test_verify_rejects_user_swap(self):
        ticket, _ = create_ws_ticket("user-123")
        body, sig = ticket.rsplit(":", 1)
        parts = body.split(":")
        parts[1] = "attacker"
        forged = ":".join(parts) + ":" + sig
        assert verify_ws_ticket(forged) is None

    def test_verify_rejects_expired_ticket(self):
        # Freeze issuance 2*TTL in the past so the ticket is expired now.
        past = int(time.time()) - (WS_TICKET_TTL_SECONDS * 2)
        with patch.object(ws_tickets.time, "time", return_value=past):
            ticket, _ = create_ws_ticket("user-123")
        assert verify_ws_ticket(ticket) is None

    def test_verify_rejects_empty(self):
        assert verify_ws_ticket("") is None
        assert verify_ws_ticket("   ") is None
        assert verify_ws_ticket("garbage") is None


class TestWsTicketEndpoint:
    def test_endpoint_issues_ticket(self):
        from auth import get_active_user

        app.dependency_overrides[get_active_user] = lambda: {
            "id": "test-user-id",
            "email": "test@example.com",
            "role": "free_user",
        }

        async def _no_rate_limit(identifier, path="/"):
            return None

        try:
            with patch("main.enforce_rate_limit", _no_rate_limit):
                with TestClient(app, raise_server_exceptions=False) as c:
                    resp = c.post("/ws/ticket")
            assert resp.status_code == 200
            body = resp.json()
            assert "ticket" in body and body["ticket"]
            assert body["expires_in"] == WS_TICKET_TTL_SECONDS
            # Issued ticket must verify back to the authenticated user.
            assert verify_ws_ticket(body["ticket"]) == "test-user-id"
        finally:
            app.dependency_overrides.clear()

    def test_endpoint_requires_auth(self):
        with TestClient(app, raise_server_exceptions=False) as c:
            resp = c.post("/ws/ticket")
        assert resp.status_code in (401, 403)

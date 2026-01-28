"""Tests for /auth/me endpoint."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock, AsyncMock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))

# Mock rate limiter before importing app
async def _mock_rate_limit_check(identifier, path):
    return True, {'X-RateLimit-Limit': '60', 'X-RateLimit-Remaining': '59', 'X-RateLimit-Reset': '60'}

_rate_limit_patcher = patch('rate_limit.rate_limit_check', _mock_rate_limit_check)
_rate_limit_patcher.start()

# Patch main module's rate_limit_check
_main_rate_limit_patcher = patch('main.rate_limit_check', _mock_rate_limit_check)
_main_rate_limit_patcher.start()

from main import app
from auth import get_current_user, security

client = TestClient(app, raise_server_exceptions=False)


def test_auth_me_requires_auth():
    """Test that /auth/me requires authentication."""
    app.dependency_overrides.clear()
    response = client.get("/auth/me")
    assert response.status_code == 403  # FastAPI returns 403 for missing auth


def test_auth_me_returns_user_info():
    """Test that /auth/me returns user info when authenticated."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "full_name": "Test User",
        "role": "free_user",
        "credits_remaining": 10,
        "credits_reset_at": None,
    }
    
    # Mock credentials to bypass HTTPBearer check
    mock_credentials = Mock()
    mock_credentials.credentials = "fake-token"
    
    # Mock both get_current_user AND security (HTTPBearer)
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[security] = lambda: mock_credentials
    
    response = client.get("/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test-user-id"
    assert data["email"] == "test@example.com"
    assert data["role"] == "free_user"
    assert data["credits_remaining"] == 10
    
    app.dependency_overrides.clear()



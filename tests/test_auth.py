"""Tests for /auth/me endpoint."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))
from main import app

client = TestClient(app)


def test_auth_me_requires_auth():
    """Test that /auth/me requires authentication."""
    response = client.get("/auth/me")
    assert response.status_code == 403  # FastAPI returns 403 for missing auth


@patch('auth.get_current_user')
def test_auth_me_returns_user_info(mock_get_user):
    """Test that /auth/me returns user info when authenticated."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "full_name": "Test User",
        "role": "free_user",
        "credits_remaining": 10,
        "credits_reset_at": None,
    }
    mock_get_user.return_value = mock_user
    
    # Mock the dependency
    app.dependency_overrides = {}
    from auth import get_current_user
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    response = client.get("/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test-user-id"
    assert data["email"] == "test@example.com"
    assert data["role"] == "free_user"
    assert data["credits_remaining"] == 10
    
    app.dependency_overrides.clear()


"""Tests for /admin/is-admin endpoint."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))
from main import app
from auth import get_current_user, check_is_admin

client = TestClient(app)


def test_admin_check_requires_auth():
    """Test that /admin/is-admin requires authentication."""
    response = client.get("/admin/is-admin")
    assert response.status_code == 403  # FastAPI returns 403 for missing auth


def test_admin_check_returns_boolean():
    """Test that /admin/is-admin returns { isAdmin: boolean } only."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "full_name": "Test User",
        "role": "free_user",
        "credits_remaining": 10,
    }
    
    # Mock get_current_user
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    # Mock check_is_admin to return False
    with patch('auth.check_is_admin', return_value=False):
        response = client.get("/admin/is-admin")
        assert response.status_code == 200
        data = response.json()
        assert "isAdmin" in data
        assert data["isAdmin"] is False
        # Ensure no other sensitive data is returned
        assert "email" not in data
        assert "id" not in data
    
    # Mock check_is_admin to return True
    with patch('auth.check_is_admin', return_value=True):
        response = client.get("/admin/is-admin")
        assert response.status_code == 200
        data = response.json()
        assert data["isAdmin"] is True
    
    app.dependency_overrides.clear()


def test_admin_check_denies_unauthenticated():
    """Test that unauthenticated requests are denied."""
    app.dependency_overrides.clear()
    response = client.get("/admin/is-admin")
    assert response.status_code == 403


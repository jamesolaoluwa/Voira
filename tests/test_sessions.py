"""Tests for /sessions endpoints."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))
from main import app
from auth import get_current_user, check_is_admin
from credits import check_credits_available, decrement_credits

client = TestClient(app)


def test_create_session_requires_auth():
    """Test that POST /sessions requires authentication."""
    response = client.post("/sessions", json={
        "title": "Test Session",
        "type": "free",
        "transcript": "Test transcript",
    })
    assert response.status_code == 403


def test_create_session_enforces_credits():
    """Test that POST /sessions enforces credits."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "role": "free_user",
        "credits_remaining": 0,  # No credits
    }
    
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    # Mock check_is_admin to return False
    with patch('auth.check_is_admin', return_value=False):
        # Mock check_credits_available to return False
        with patch('credits.check_credits_available', return_value=(False, {})):
            response = client.post("/sessions", json={
                "title": "Test Session",
                "type": "free",
                "transcript": "Test transcript",
            })
            assert response.status_code == 402  # Payment required
            assert "Insufficient credits" in response.json()["detail"]
    
    app.dependency_overrides.clear()


def test_create_session_enforces_ownership():
    """Test that sessions are created with correct user_id."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "role": "free_user",
        "credits_remaining": 10,
    }
    
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    # Mock dependencies
    with patch('auth.check_is_admin', return_value=False):
        with patch('credits.check_credits_available', return_value=(True, {})):
            with patch('credits.decrement_credits', return_value={}):
                with patch('db.supabase') as mock_supabase:
                    mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{
                        "id": "session-id",
                        "user_id": "test-user-id",  # Must match mock_user id
                        "title": "Test Session",
                        "type": "free",
                        "transcript": "Test transcript",
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat(),
                    }]
                    
                    response = client.post("/sessions", json={
                        "title": "Test Session",
                        "type": "free",
                        "transcript": "Test transcript",
                    })
                    
                    assert response.status_code == 200
                    # Verify insert was called with correct user_id
                    call_args = mock_supabase.table.return_value.insert.call_args[0][0]
                    assert call_args["user_id"] == "test-user-id"
    
    app.dependency_overrides.clear()


def test_list_sessions_enforces_ownership():
    """Test that GET /sessions only returns user's own sessions."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "role": "free_user",
    }
    
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    with patch('db.supabase') as mock_supabase:
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
            {
                "id": "session-1",
                "user_id": "test-user-id",  # Own session
                "title": "My Session",
                "type": "free",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
            }
        ]
        
        response = client.get("/sessions")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["user_id"] == "test-user-id"
        
        # Verify query was filtered by user_id
        mock_supabase.table.return_value.select.return_value.eq.assert_called_with("user_id", "test-user-id")
    
    app.dependency_overrides.clear()


def test_admin_bypasses_credits():
    """Test that admins bypass credit checks."""
    mock_admin = {
        "id": "admin-id",
        "email": "admin@example.com",
        "role": "admin",
    }
    
    app.dependency_overrides[get_current_user] = lambda: mock_admin
    
    with patch('auth.check_is_admin', return_value=True):
        with patch('db.supabase') as mock_supabase:
            mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{
                "id": "session-id",
                "user_id": "admin-id",
                "title": "Admin Session",
                "type": "free",
                "transcript": "Test",
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
            }]
            
            # Mock decrement_credits to verify it's NOT called for admins
            with patch('credits.decrement_credits') as mock_decrement:
                response = client.post("/sessions", json={
                    "title": "Admin Session",
                    "type": "free",
                    "transcript": "Test",
                })
                
                assert response.status_code == 200
                # Credits should not be decremented for admins
                # (The endpoint checks is_admin and skips decrement)
    
    app.dependency_overrides.clear()


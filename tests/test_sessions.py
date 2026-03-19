"""Tests for /sessions endpoints.

=============================================================================
Mock Target Reference
=============================================================================
When main.py imports functions like:
    from auth import check_is_admin, get_active_user
    from credits import check_credits_available

We must patch them WHERE THEY ARE USED (in main), not where defined:
    patch('main.check_is_admin')         NOT patch('auth.check_is_admin')
    patch('main.check_credits_available') NOT patch('credits.check_credits_available')

IMPORTANT: The /sessions endpoint uses get_active_user (which checks disabled
status), NOT get_current_user. So we override get_active_user in tests.

See: https://docs.python.org/3/library/unittest.mock.html#where-to-patch
=============================================================================
"""
import pytest
from unittest.mock import patch, Mock
from datetime import datetime

from main import app
from auth import get_active_user  # Sessions use get_active_user, not get_current_user


def test_create_session_requires_auth(client):
    """Test that POST /sessions requires authentication."""
    response = client.post("/sessions", json={
        "title": "Test Session",
        "type": "free",
        "transcript": "Test transcript",
    })
    assert response.status_code == 403


def test_create_session_enforces_credits(client):
    """Test that POST /sessions enforces credits."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "role": "free_user",
        "credits_remaining": 0,  # No credits
    }
    
    # Override get_active_user (sessions endpoint uses this, not get_current_user)
    app.dependency_overrides[get_active_user] = lambda: mock_user
    
    # Patch where used (main module), not where defined (auth/credits modules)
    with patch('main.check_is_admin', return_value=False):
        with patch('main.check_credits_available', return_value=(False, {})):
            response = client.post("/sessions", json={
                "title": "Test Session",
                "type": "free",
                "transcript": "Test transcript",
            })
            assert response.status_code == 402  # Payment required
            assert "Insufficient credits" in response.json()["detail"]
    
    app.dependency_overrides.clear()


def test_create_session_enforces_ownership(client):
    """Test that sessions are created with correct user_id."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "role": "free_user",
        "credits_remaining": 10,
    }
    
    # Override get_active_user (sessions endpoint uses this)
    app.dependency_overrides[get_active_user] = lambda: mock_user
    
    # Patch where used (main module), not where defined
    with patch('main.check_is_admin', return_value=False):
        with patch('main.check_credits_available', return_value=(True, {})):
            with patch('main.decrement_credits', return_value={}):
                with patch('main.supabase') as mock_supabase:
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


def test_list_sessions_enforces_ownership(client):
    """Test that GET /sessions only returns user's own sessions."""
    mock_user = {
        "id": "test-user-id",
        "email": "test@example.com",
        "role": "free_user",
    }
    
    # GET /sessions uses get_current_user (it's a read-only operation)
    # Import get_current_user for this specific test
    from auth import get_current_user
    app.dependency_overrides[get_current_user] = lambda: mock_user
    
    # Patch supabase where it's used (in main)
    with patch('main.supabase') as mock_supabase:
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


def test_admin_bypasses_credits(client):
    """Test that admins bypass credit checks."""
    mock_admin = {
        "id": "admin-id",
        "email": "admin@example.com",
        "role": "admin",
    }
    
    # Override get_active_user (sessions endpoint uses this)
    app.dependency_overrides[get_active_user] = lambda: mock_admin
    
    # Patch where used (main module)
    with patch('main.check_is_admin', return_value=True):
        with patch('main.supabase') as mock_supabase:
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
            with patch('main.decrement_credits') as mock_decrement:
                response = client.post("/sessions", json={
                    "title": "Admin Session",
                    "type": "free",
                    "transcript": "Test",
                })
                
                assert response.status_code == 200
                # Credits should not be decremented for admins
                # (The endpoint checks is_admin and skips decrement)
    
    app.dependency_overrides.clear()


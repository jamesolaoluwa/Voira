"""Pytest configuration and fixtures."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import sys
import os

# Add apps/api to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))

from main import app


@pytest.fixture
def client():
    """Test client for FastAPI app."""
    return TestClient(app)


@pytest.fixture
def mock_user():
    """Mock authenticated user."""
    return {
        "id": "test-user-id",
        "email": "test@example.com",
        "full_name": "Test User",
        "role": "free_user",
        "credits_remaining": 10,
        "credits_reset_at": None,
    }


@pytest.fixture
def mock_admin_user():
    """Mock admin user."""
    return {
        "id": "admin-user-id",
        "email": "admin@example.com",
        "full_name": "Admin User",
        "role": "admin",
        "credits_remaining": 999,
        "credits_reset_at": None,
    }


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    with patch('db.supabase') as mock:
        yield mock


"""
Pytest configuration and fixtures.

=============================================================================
RATE LIMITER TEST ISOLATION STRATEGY
=============================================================================

GAP-002 hardened the rate limiter to:
- REQUIRE Redis in production
- Fail eagerly at startup if misconfigured
- Never fall back silently to in-memory

This is CORRECT behavior for production. However, most tests are NOT testing
rate limiting - they're testing business logic (sessions, credits, auth, etc.).

SOLUTION: Globally mock rate limiting for ALL tests EXCEPT test_rate_limit.py.

WHY THIS APPROACH:
1. No magic markers needed - tests don't need to opt-in/out
2. Centralized - all mocking logic is here in conftest.py
3. Explicit - test_rate_limit.py is clearly excluded
4. No production code changes - pure test isolation

HOW IT WORKS:
1. pytest_configure() runs BEFORE any imports
2. We check if test_rate_limit.py is being run
3. If NOT, we patch rate_limit functions globally
4. If YES, we skip patching so real behavior is tested

=============================================================================
"""
import sys
import os
from unittest.mock import patch, AsyncMock, MagicMock

# Add apps/api to path FIRST (before any other imports)
api_path = os.path.join(os.path.dirname(__file__), '..', 'apps', 'api')
sys.path.insert(0, api_path)

# Load environment variables from apps/api/.env BEFORE importing app
from dotenv import load_dotenv
env_path = os.path.join(api_path, '.env')
load_dotenv(env_path)


# =============================================================================
# GLOBAL RATE LIMITER MOCKS
# =============================================================================
# These mocks neutralize rate limiting for tests that don't need it.
# test_rate_limit.py explicitly opts out by being detected in pytest_configure.

async def _mock_rate_limit_check(identifier: str, path: str):
    """Mock rate limit check that always allows requests."""
    return True, {
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "59",
        "X-RateLimit-Reset": "60",
    }

def _mock_rate_limit_middleware(key: str):
    """Mock rate limit middleware that does nothing."""
    pass

# Track whether we should mock rate limiting
_should_mock_rate_limit = True
_patches = []


def pytest_configure(config):
    """
    Called before test collection.
    
    Determines if we should mock rate limiting based on which tests are running.
    If test_rate_limit.py is being run, we SKIP mocking so it can test real behavior.
    """
    global _should_mock_rate_limit, _patches
    
    # Check if test_rate_limit.py is in the test selection
    # This handles: pytest test_rate_limit.py, pytest tests/, pytest -k rate_limit, etc.
    args = config.args or []
    invocation = ' '.join(args)
    
    # Also check for -k expressions that might select rate limit tests
    keyword_expr = config.getoption('-k', default='')
    
    is_rate_limit_test = (
        'test_rate_limit' in invocation or
        'rate_limit' in keyword_expr
    )
    
    if is_rate_limit_test:
        # Don't mock - let test_rate_limit.py test real behavior
        _should_mock_rate_limit = False
        return
    
    # Mock rate limiting for all other tests
    _should_mock_rate_limit = True
    
    # Apply patches BEFORE any imports of main/rate_limit
    # These patches target the rate_limit module directly
    _patches = [
        patch('rate_limit.rate_limit_check', _mock_rate_limit_check),
        patch('rate_limit.initialize_rate_limiter', AsyncMock(return_value='memory')),
        patch('rate_limit.close_redis', AsyncMock()),
        patch('rate_limit.rate_limit_middleware', _mock_rate_limit_middleware),
        # Also set the module state to "initialized" to prevent errors
        patch('rate_limit._initialized', True),
        patch('rate_limit._active_backend', 'memory'),
    ]
    
    for p in _patches:
        p.start()


def pytest_unconfigure(config):
    """Clean up patches when pytest finishes."""
    global _patches
    for p in _patches:
        try:
            p.stop()
        except RuntimeError:
            pass  # Patch wasn't started
    _patches = []


# =============================================================================
# IMPORTS AFTER PATCHING DECISION
# =============================================================================
# Now we can safely import pytest and other modules
# The patches (if applied) are already active

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock

# Import app - patches are already active if needed
from main import app


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def client():
    """
    Test client for FastAPI app with rate limiting properly handled.
    
    For non-rate-limit tests: rate limiting is already mocked globally.
    For rate limit tests: this fixture still works, real behavior is used.
    """
    global _should_mock_rate_limit
    
    if _should_mock_rate_limit:
        # Also patch at main module level for middleware (belt and suspenders)
        with patch('main.rate_limit_check', _mock_rate_limit_check):
            with patch('main.rate_limit_middleware', _mock_rate_limit_middleware):
                with TestClient(app, raise_server_exceptions=False) as c:
                    yield c
    else:
        # For rate limit tests, use real behavior
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c


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


# =============================================================================
# ADDITIONAL FIXTURES FOR COMMON TEST PATTERNS
# =============================================================================

@pytest.fixture
def authenticated_client(mock_user):
    """
    Test client with authentication already set up.
    Useful for tests that need an authenticated user.
    """
    from auth import get_current_user, security
    
    mock_credentials = Mock()
    mock_credentials.credentials = "fake-token"
    
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[security] = lambda: mock_credentials
    
    if _should_mock_rate_limit:
        with patch('main.rate_limit_check', _mock_rate_limit_check):
            with patch('main.rate_limit_middleware', _mock_rate_limit_middleware):
                with TestClient(app, raise_server_exceptions=False) as c:
                    yield c
    else:
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(mock_admin_user):
    """
    Test client with admin authentication set up.
    """
    from auth import get_current_user, security
    
    mock_credentials = Mock()
    mock_credentials.credentials = "fake-admin-token"
    
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    app.dependency_overrides[security] = lambda: mock_credentials
    
    if _should_mock_rate_limit:
        with patch('main.rate_limit_check', _mock_rate_limit_check):
            with patch('main.rate_limit_middleware', _mock_rate_limit_middleware):
                with TestClient(app, raise_server_exceptions=False) as c:
                    yield c
    else:
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    
    app.dependency_overrides.clear()

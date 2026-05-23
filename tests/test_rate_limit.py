"""
Tests for rate_limit.py - Environment-aware rate limiting.

=============================================================================
IMPORTANT: This test file is SPECIAL
=============================================================================

This file tests the REAL rate limiter behavior, including:
- Production Redis requirement
- Fail-fast initialization
- No silent fallbacks

conftest.py EXCLUDES this file from global rate limiter mocking.
When running: pytest test_rate_limit.py
The rate limiter mocks in conftest.py are NOT applied.

This ensures we can verify GAP-002 requirements:
✅ Production + no Redis → startup fails
✅ Production + Redis unavailable → startup fails  
✅ Development + no Redis → memory fallback (with warning)
✅ No silent fallbacks in production

=============================================================================

Test scenarios:
1. Production + no Redis → startup fails with RateLimiterConfigurationError
2. Production + Redis available → Redis backend used
3. Development + no Redis → in-memory fallback with warning
4. Development + Redis available → Redis backend used
5. Rate limiting disabled → no-op behavior
6. Redis connection failure → surfaced clearly (not swallowed)
7. Uninitialized rate limiter → clear error
"""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
import sys
import os

# Add the api directory to the path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))

# =============================================================================
# FIXTURE: Reset rate limiter state before each test
# =============================================================================
# Each test in this file needs a clean slate to test initialization behavior.
# We import rate_limit directly (not through main) to test the module in isolation.

@pytest.fixture(autouse=True, scope='function')
def reset_rate_limiter_state():
    """
    Reset rate limiter state before AND after each test.
    
    Reloads the module to undo conftest's global patches (which mock
    initialize_rate_limiter, _initialized, etc. for non-rate-limit tests).
    Each test re-imports from rate_limit inside the function body, so they
    get the real (reloaded) module.
    """
    import importlib
    import rate_limit
    importlib.reload(rate_limit)
    rate_limit.reset_for_testing()
    yield
    rate_limit.reset_for_testing()


class TestRateLimiterInitialization:
    """Test rate limiter initialization in different environments."""
    
    @pytest.mark.asyncio
    async def test_production_no_redis_fails_at_startup(self):
        """
        Production + no Redis → startup fails with RateLimiterConfigurationError.
        
        This ensures misconfiguration is caught at deployment time,
        not at runtime when a user hits a rate limit.
        """
        from rate_limit import (
            initialize_rate_limiter, 
            RateLimiterConfigurationError,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        # Mock production environment with no Redis URL
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.redis_url = None
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "production"
            
            with pytest.raises(RateLimiterConfigurationError) as exc_info:
                await initialize_rate_limiter()
            
            # Check error message mentions Redis and production
            error_msg = str(exc_info.value).lower()
            assert "redis" in error_msg, f"Expected 'redis' in error: {exc_info.value}"
            assert "production" in error_msg, f"Expected 'production' in error: {exc_info.value}"
    
    @pytest.mark.asyncio
    async def test_production_redis_unavailable_fails_at_startup(self):
        """
        Production + Redis configured but unavailable → startup fails.
        
        Even if REDIS_URL is set, if we can't connect, we fail fast.
        """
        from rate_limit import (
            initialize_rate_limiter, 
            RateLimiterConfigurationError,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        # Mock production with Redis URL but connection fails
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.redis_url = "redis://localhost:6379"
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "production"
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping.side_effect = ConnectionError("Connection refused")
                mock_client.close = AsyncMock()
                mock_redis.return_value = mock_client
                
                with pytest.raises(RateLimiterConfigurationError) as exc_info:
                    await initialize_rate_limiter()
                
                error_msg = str(exc_info.value)
                assert "Connection refused" in error_msg or "Failed to connect" in error_msg
    
    @pytest.mark.asyncio
    async def test_production_redis_available_uses_redis(self):
        """
        Production + Redis available → Redis backend used.
        """
        from rate_limit import (
            initialize_rate_limiter,
            get_rate_limiter_status,
            RateLimiterBackend,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.redis_url = "redis://localhost:6379"
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "production"
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping = AsyncMock(return_value=True)
                mock_client.close = AsyncMock()
                mock_redis.return_value = mock_client
                
                await initialize_rate_limiter()
                
                status = await get_rate_limiter_status()
                assert status["backend"] == "redis"
                assert status["healthy"] is True
    
    @pytest.mark.asyncio
    async def test_development_no_redis_uses_memory_with_warning(self):
        """
        Development + no Redis → in-memory fallback with warning.
        
        This allows local development without Redis installed.
        """
        from rate_limit import (
            initialize_rate_limiter,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = False
            mock_settings.is_development = True
            mock_settings.redis_url = None
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "development"
            
            # Should not raise, just warn
            with patch('rate_limit.logger') as mock_logger:
                await initialize_rate_limiter()
                
                # Verify warning was logged
                warning_calls = [
                    call for call in mock_logger.warning.call_args_list
                    if "in-memory" in str(call).lower() or "memory" in str(call).lower()
                ]
                assert len(warning_calls) > 0, "Expected warning about in-memory fallback"
            
            status = await get_rate_limiter_status()
            assert status["backend"] == "memory"
    
    @pytest.mark.asyncio
    async def test_development_redis_available_uses_redis(self):
        """
        Development + Redis available → Redis backend used.
        
        If Redis is available in dev, we use it for consistency.
        """
        from rate_limit import (
            initialize_rate_limiter,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = False
            mock_settings.is_development = True
            mock_settings.redis_url = "redis://localhost:6379"
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "development"
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping = AsyncMock(return_value=True)
                mock_client.close = AsyncMock()
                mock_redis.return_value = mock_client
                
                await initialize_rate_limiter()
                
                status = await get_rate_limiter_status()
                assert status["backend"] == "redis"
    
    @pytest.mark.asyncio
    async def test_rate_limit_disabled_uses_none_backend(self):
        """
        Rate limiting disabled → no-op behavior.
        """
        from rate_limit import (
            initialize_rate_limiter,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.redis_url = "redis://localhost:6379"
            mock_settings.rate_limit_enabled = False
            mock_settings.env = "production"
            
            await initialize_rate_limiter()
            
            status = await get_rate_limiter_status()
            assert status["backend"] == "none"


class TestNoSilentFallback:
    """
    Critical tests ensuring Redis is NEVER silently replaced by in-memory in production.
    
    These tests verify the core safety guarantee: if you configure Redis in production
    and it becomes unavailable, the app MUST fail loudly rather than silently degrading
    to in-memory (which would reset rate limits on every restart).
    """
    
    @pytest.fixture(autouse=True)
    def reset_rate_limiter(self):
        """Reset rate limiter state before each test."""
        from rate_limit import reset_for_testing
        reset_for_testing()
        yield
        reset_for_testing()
    
    @pytest.mark.asyncio
    async def test_production_redis_configured_but_unreachable_never_falls_back_to_memory(self):
        """
        CRITICAL: Production + Redis configured + Redis unreachable → MUST FAIL, NOT fallback.
        
        This is the most important test in this file. It ensures that:
        1. When Redis is configured (REDIS_URL is set)
        2. But Redis is unreachable (connection fails)
        3. In production environment
        
        The system MUST:
        - Raise RateLimiterConfigurationError at startup
        - NOT silently fall back to in-memory rate limiting
        - NOT start the application in a degraded state
        
        Why this matters:
        - In-memory rate limiting resets on every server restart
        - Silent fallback would make rate limits ineffective in production
        - Attackers could exploit by triggering restarts
        - This would violate the "fail fast" principle for critical infrastructure
        """
        from rate_limit import (
            initialize_rate_limiter, 
            RateLimiterConfigurationError,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            # Production environment
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.env = "production"
            
            # Redis IS configured
            mock_settings.redis_url = "redis://redis.example.com:6379"
            mock_settings.rate_limit_enabled = True
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping.side_effect = ConnectionError("Connection refused")
                mock_client.close = AsyncMock()
                mock_redis.return_value = mock_client
                
                with pytest.raises(RateLimiterConfigurationError) as exc_info:
                    await initialize_rate_limiter()
                
                # Verify the error message is clear about what happened
                error_message = str(exc_info.value)
                assert "production" in error_message.lower() or "redis" in error_message.lower()
                
                # Verify we did NOT initialize with a memory backend
                status = await get_rate_limiter_status()
                assert status["backend"] != "memory", \
                    "CRITICAL: System fell back to in-memory rate limiting in production!"
                assert status["backend"] == "uninitialized", \
                    "Rate limiter should remain uninitialized after failed startup"
    
    @pytest.mark.asyncio
    async def test_production_redis_timeout_never_falls_back_to_memory(self):
        """
        Production + Redis configured + Redis times out → MUST FAIL, NOT fallback.
        
        Tests the timeout scenario (different from connection refused).
        """
        import asyncio
        from rate_limit import (
            initialize_rate_limiter, 
            RateLimiterConfigurationError,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.env = "production"
            mock_settings.redis_url = "redis://redis.example.com:6379"
            mock_settings.rate_limit_enabled = True
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping.side_effect = asyncio.TimeoutError("Connection timed out")
                mock_client.close = AsyncMock()
                mock_redis.return_value = mock_client
                
                with pytest.raises(RateLimiterConfigurationError):
                    await initialize_rate_limiter()
                
                # Verify no silent fallback
                status = await get_rate_limiter_status()
                assert status["backend"] != "memory", \
                    "CRITICAL: System fell back to in-memory on timeout!"
    
    @pytest.mark.asyncio
    async def test_production_redis_auth_failure_never_falls_back_to_memory(self):
        """
        Production + Redis configured + Redis auth fails → MUST FAIL, NOT fallback.
        
        Tests the authentication failure scenario.
        """
        from rate_limit import (
            initialize_rate_limiter, 
            RateLimiterConfigurationError,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.env = "production"
            mock_settings.redis_url = "redis://:wrongpassword@redis.example.com:6379"
            mock_settings.rate_limit_enabled = True
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping.side_effect = Exception("NOAUTH Authentication required")
                mock_client.close = AsyncMock()
                mock_redis.return_value = mock_client
                
                with pytest.raises(RateLimiterConfigurationError):
                    await initialize_rate_limiter()
                
                # Verify no silent fallback
                status = await get_rate_limiter_status()
                assert status["backend"] != "memory", \
                    "CRITICAL: System fell back to in-memory on auth failure!"


class TestRateLimiterOperations:
    """Test rate limiter operations after initialization."""
    
    @pytest.fixture(autouse=True)
    def reset_rate_limiter(self):
        """Reset rate limiter state before each test."""
        from rate_limit import reset_for_testing
        reset_for_testing()
        yield
        reset_for_testing()
    
    @pytest.mark.asyncio
    async def test_uninitialized_rate_limiter_raises_error(self):
        """
        Calling rate limit check before initialization raises clear error.
        """
        from rate_limit import (
            check_rate_limit_redis,
            RateLimiterUnavailableError,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with pytest.raises(RateLimiterUnavailableError) as exc_info:
            await check_rate_limit_redis("test_key", 10, 60)
        
        error_msg = str(exc_info.value).lower()
        assert "not available" in error_msg or "not initialized" in error_msg
    
    @pytest.mark.asyncio
    async def test_redis_connection_failure_during_operation_raises_in_production(self):
        """
        Redis connection failure during operation is surfaced clearly in production.
        """
        from rate_limit import (
            initialize_rate_limiter,
            check_rate_limit_redis,
            RateLimiterUnavailableError,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = True
            mock_settings.is_development = False
            mock_settings.redis_url = "redis://localhost:6379"
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "production"
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping = AsyncMock(return_value=True)
                mock_client.close = AsyncMock()
                mock_client.pipeline = MagicMock(side_effect=ConnectionError("Redis disconnected"))
                mock_redis.return_value = mock_client
                
                await initialize_rate_limiter()
                
                with pytest.raises((RateLimiterUnavailableError, ConnectionError)):
                    await check_rate_limit_redis("test_key", 10, 60)
    
    @pytest.mark.asyncio
    async def test_memory_rate_limiter_basic_operation(self):
        """
        In-memory rate limiter correctly tracks and enforces limits.
        """
        from rate_limit import (
            initialize_rate_limiter,
            check_rate_limit_memory,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = False
            mock_settings.is_development = True
            mock_settings.redis_url = None
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "development"
            
            await initialize_rate_limiter()
            
            for i in range(5):
                allowed, remaining, reset_at = await check_rate_limit_memory(
                    "test_user:endpoint",
                    limit=5,
                    window=60,
                )
                assert allowed is True, f"Request {i+1} should be allowed"
                assert remaining == 5 - (i + 1)
            
            allowed, remaining, reset_at = await check_rate_limit_memory(
                "test_user:endpoint",
                limit=5,
                window=60,
            )
            assert allowed is False
            assert remaining == 0


class TestRateLimiterStatus:
    """Test rate limiter status reporting for health checks."""
    
    @pytest.fixture(autouse=True)
    def reset_rate_limiter(self):
        """Reset rate limiter state before each test."""
        from rate_limit import reset_for_testing
        reset_for_testing()
        yield
        reset_for_testing()
    
    @pytest.mark.asyncio
    async def test_status_uninitialized(self):
        """
        Status correctly reports uninitialized state.
        """
        from rate_limit import get_rate_limiter_status, reset_for_testing
        
        reset_for_testing()
        
        status = await get_rate_limiter_status()
        assert status["backend"] == "uninitialized"
        assert status["healthy"] is False
    
    @pytest.mark.asyncio
    async def test_status_redis_healthy(self):
        """
        Status correctly reports healthy Redis backend.
        """
        from rate_limit import (
            initialize_rate_limiter,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = False
            mock_settings.is_development = True
            mock_settings.redis_url = "redis://localhost:6379"
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "development"
            
            with patch('redis.asyncio.from_url') as mock_redis:
                mock_client = AsyncMock()
                mock_client.ping = AsyncMock(return_value=True)
                mock_client.close = AsyncMock()
                mock_redis.return_value = mock_client
                
                await initialize_rate_limiter()
                
                status = await get_rate_limiter_status()
                assert status["backend"] == "redis"
                assert status["healthy"] is True
                assert "latency_ms" in status
    
    @pytest.mark.asyncio
    async def test_status_memory_backend(self):
        """
        Status correctly reports memory backend.
        """
        from rate_limit import (
            initialize_rate_limiter,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = False
            mock_settings.is_development = True
            mock_settings.redis_url = None
            mock_settings.rate_limit_enabled = True
            mock_settings.env = "development"
            
            await initialize_rate_limiter()
            
            status = await get_rate_limiter_status()
            assert status["backend"] == "memory"
            assert status["healthy"] is True
    
    @pytest.mark.asyncio
    async def test_status_disabled(self):
        """
        Status correctly reports disabled rate limiting.
        """
        from rate_limit import (
            initialize_rate_limiter,
            get_rate_limiter_status,
            reset_for_testing,
        )
        
        reset_for_testing()
        
        with patch('rate_limit.settings') as mock_settings:
            mock_settings.is_production = False
            mock_settings.is_development = True
            mock_settings.redis_url = None
            mock_settings.rate_limit_enabled = False
            mock_settings.env = "development"
            
            await initialize_rate_limiter()
            
            status = await get_rate_limiter_status()
            assert status["backend"] == "none"


class TestPrivacySafeLogging:
    """Test that sensitive data is not logged."""
    
    def test_redis_url_is_masked_in_logs(self):
        """
        Redis URLs with passwords are masked before logging.
        """
        from rate_limit import _mask_redis_url
        
        # URL with password
        url = "redis://:secretpassword@redis.example.com:6379/0"
        masked = _mask_redis_url(url)
        
        assert "secretpassword" not in masked
        assert "***" in masked or "****" in masked
        assert "redis.example.com" in masked
        
        # URL without password (should not be modified much)
        url_no_pass = "redis://localhost:6379"
        masked_no_pass = _mask_redis_url(url_no_pass)
        assert "localhost" in masked_no_pass
    
    def test_none_url_handled_gracefully(self):
        """
        None Redis URL doesn't cause errors.
        """
        from rate_limit import _mask_redis_url
        
        assert _mask_redis_url(None) == "None"
        assert _mask_redis_url("") == ""

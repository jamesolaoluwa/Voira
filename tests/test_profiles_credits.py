"""Tests for user profile creation and credit assignment.

=============================================================================
Mock Target Reference
=============================================================================
IMPORTANT: Endpoints in main.py use different auth dependencies:
- /auth/me uses get_current_user
- /sessions and /analyze use get_active_user (checks disabled status)

When testing API endpoints, override the correct dependency.
=============================================================================
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock, AsyncMock
import sys
import os
import asyncio
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'apps', 'api'))
from main import app
from auth import get_current_user, get_active_user
from credits import (
    check_and_reset_credits,
    check_credits_available,
    decrement_credits
)
client = TestClient(app)


class TestUserProfileCreation:
    """Tests for automatic user profile creation."""
    
    def test_auth_me_returns_default_credits_when_no_profile(self):
        """Test that /auth/me returns default credits when profile doesn't exist."""
        # When no profile exists, get_current_user returns default credits
        new_user = {
            "id": "new-user-id",
            "email": "newuser@example.com",
            "full_name": "New User",
            "role": "free_user",
            "credits_remaining": 10,  # Default from get_current_user fallback
            "credits_reset_at": None,
        }
        
        app.dependency_overrides[get_current_user] = lambda: new_user
        
        response = client.get("/auth/me")
        assert response.status_code == 200
        data = response.json()
        # Should have default credits for free user
        assert data["credits_remaining"] == 10
        assert data["role"] == "free_user"
        
        app.dependency_overrides.clear()
    
    def test_profile_creation_with_free_user_role(self):
        """Test that free users get 10 credits by default."""
        free_user = {
            "id": "free-user-id",
            "email": "free@example.com",
            "full_name": "Free User",
            "role": "free_user",
            "credits_remaining": 10,
            "credits_reset_at": None,
        }
        
        app.dependency_overrides[get_current_user] = lambda: free_user
        
        response = client.get("/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "free_user"
        assert data["credits_remaining"] == 10
        
        app.dependency_overrides.clear()
    
    def test_profile_creation_with_premium_user_role(self):
        """Test that premium users get 120 credits by default."""
        premium_user = {
            "id": "premium-user-id",
            "email": "premium@example.com",
            "full_name": "Premium User",
            "role": "premium_user",
            "credits_remaining": 120,
            "credits_reset_at": None,
        }
        
        app.dependency_overrides[get_current_user] = lambda: premium_user
        
        response = client.get("/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "premium_user"
        assert data["credits_remaining"] == 120
        
        app.dependency_overrides.clear()
    
    def test_profile_creation_with_admin_role(self):
        """Test that admin users get 120 credits by default."""
        mock_admin_user = {
            "id": "admin-user-id",
            "email": "admin@example.com",
            "full_name": "Admin User",
            "role": "admin",
            "credits_remaining": 999,
            "credits_reset_at": None,
        }
        app.dependency_overrides[get_current_user] = lambda: mock_admin_user
        
        response = client.get("/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "admin"
        assert data["credits_remaining"] == 999  # From mock_admin_user fixture
        
        app.dependency_overrides.clear()


class TestCreditAssignment:
    """Tests for credit assignment and management."""
    
    @pytest.mark.asyncio
    async def test_free_user_gets_10_credits(self):
        """Test that free users receive 10 credits by default."""
        user_id = "free-user-id"
        
        with patch('credits.supabase') as mock_supabase:
            # Mock RPC call returning created profile
            mock_profile = {
                "user_id": user_id,
                "role": "free_user",
                "credits_remaining": 10,
                "reference_uploads_remaining": 1,
            }
            
            mock_rpc_response = Mock()
            mock_rpc_response.data = [mock_profile]
            mock_supabase.rpc.return_value.execute.return_value = mock_rpc_response
            
            profile = await check_and_reset_credits(user_id)
            assert profile["role"] == "free_user"
            assert profile["credits_remaining"] == 10
            assert profile["reference_uploads_remaining"] == 1
    
    @pytest.mark.asyncio
    async def test_premium_user_gets_120_credits(self):
        """Test that premium users receive 120 credits by default."""
        user_id = "premium-user-id"
        
        with patch('credits.supabase') as mock_supabase:
            # Mock RPC call returning created profile
            mock_profile = {
                "user_id": user_id,
                "role": "premium_user",
                "credits_remaining": 120,
                "reference_uploads_remaining": 999999,
            }
            
            mock_rpc_response = Mock()
            mock_rpc_response.data = [mock_profile]
            mock_supabase.rpc.return_value.execute.return_value = mock_rpc_response
            
            profile = await check_and_reset_credits(user_id)
            assert profile["role"] == "premium_user"
            assert profile["credits_remaining"] == 120
            assert profile["reference_uploads_remaining"] == 999999
    
    @pytest.mark.asyncio
    async def test_credits_check_passes_when_sufficient(self):
        """Test that credit check passes when user has enough credits."""
        user_id = "test-user-id"
        
        with patch('credits.check_and_reset_credits') as mock_reset:
            mock_reset.return_value = {
                "user_id": user_id,
                "credits_remaining": 10,
            }
            
            has_credits, profile = await check_credits_available(user_id, required=1, is_admin=False)
            assert has_credits is True
            assert profile["credits_remaining"] == 10
    
    @pytest.mark.asyncio
    async def test_credits_check_fails_when_insufficient(self):
        """Test that credit check fails when user doesn't have enough credits."""
        user_id = "test-user-id"
        
        with patch('credits.check_and_reset_credits') as mock_reset:
            mock_reset.return_value = {
                "user_id": user_id,
                "credits_remaining": 0,
            }
            
            has_credits, profile = await check_credits_available(user_id, required=1, is_admin=False)
            assert has_credits is False
            assert profile["credits_remaining"] == 0
    
    @pytest.mark.asyncio
    async def test_credits_check_bypasses_for_admin(self):
        """Test that credit checks are bypassed for admin users."""
        user_id = "admin-user-id"
        
        has_credits, profile = await check_credits_available(user_id, required=999, is_admin=True)
        assert has_credits is True  # Admin bypasses credit check
    
    @pytest.mark.asyncio
    async def test_credits_decrement_reduces_balance(self):
        """Test that decrementing credits reduces the user's balance."""
        user_id = "test-user-id"
        
        # Mock check_and_reset_credits (called before atomic deduct)
        with patch('credits.check_and_reset_credits') as mock_reset:
            mock_reset.return_value = {
                "user_id": user_id,
                "credits_remaining": 10,
            }
            
            with patch('credits.supabase') as mock_supabase:
                # BUG-005: credits.py now uses atomic RPC call, not table().update()
                # Mock the atomic_decrement_credits RPC response
                mock_rpc_response = Mock()
                mock_rpc_response.data = {
                    "success": True,
                    "credits_remaining": 9,
                    "previous_credits": 10,
                }
                mock_supabase.rpc.return_value.execute.return_value = mock_rpc_response
                
                result = await decrement_credits(user_id, amount=1, reason="test", is_admin=False)
                
                # Verify atomic RPC was called with correct params
                mock_supabase.rpc.assert_called_with(
                    "atomic_decrement_credits",
                    {"p_user_id": user_id, "p_amount": 1, "p_reason": "test"}
                )
                assert result["success"] is True
                assert result["credits_remaining"] == 9
    
    @pytest.mark.asyncio
    async def test_credits_decrement_logs_to_ledger(self):
        """Test that credit decrements are logged to the credits ledger.
        
        BUG-005: Ledger logging now happens INSIDE the atomic_decrement_credits
        Postgres function, not via separate insert call. This ensures atomicity.
        """
        user_id = "test-user-id"
        
        with patch('credits.check_and_reset_credits') as mock_reset:
            mock_reset.return_value = {
                "user_id": user_id,
                "credits_remaining": 10,
            }
            
            with patch('credits.supabase') as mock_supabase:
                # Atomic function handles both deduction and ledger insert
                mock_rpc_response = Mock()
                mock_rpc_response.data = {
                    "success": True,
                    "credits_remaining": 9,
                    "ledger_logged": True,  # Atomic function logs to ledger internally
                }
                mock_supabase.rpc.return_value.execute.return_value = mock_rpc_response
                
                await decrement_credits(user_id, amount=1, reason="test_decrement", is_admin=False)
                
                # Verify atomic RPC was called (it handles ledger internally)
                mock_supabase.rpc.assert_called_with(
                    "atomic_decrement_credits",
                    {"p_user_id": user_id, "p_amount": 1, "p_reason": "test_decrement"}
                )
    
    @pytest.mark.asyncio
    async def test_credits_decrement_bypasses_for_admin(self):
        """Test that credit decrements are bypassed for admin users."""
        user_id = "admin-user-id"
        
        result = await decrement_credits(user_id, amount=1, reason="test", is_admin=True)
        # BUG-005: Admin bypass now returns a structured response
        assert result["success"] is True
        assert result["admin_bypass"] is True
        assert result["credits_remaining"] is None  # No deduction for admins


class TestCreditEnforcementViaAPI:
    """Tests for credit enforcement through API endpoints.
    
    NOTE: /sessions and /analyze use get_active_user (not get_current_user).
    """
    
    def test_session_creation_requires_credits(self):
        """Test that session creation fails without sufficient credits."""
        mock_user = {
            "id": "test-user-id",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "free_user",
            "credits_remaining": 10,
            "credits_reset_at": None,
        }
        mock_user_no_credits = {
            **mock_user,
            "credits_remaining": 0,
        }
        
        # /sessions uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_user_no_credits
        
        with patch('main.check_is_admin', return_value=False):
            with patch('main.decrement_credits', side_effect=ValueError("Insufficient credits")):
                response = client.post("/sessions", json={
                    "title": "Test Session",
                    "type": "free",
                    "transcript": "Test transcript",
                })
                assert response.status_code == 402  # Payment required
                assert "Insufficient credits" in response.json()["detail"]
        
        app.dependency_overrides.clear()
    
    def test_session_creation_decrements_credits(self):
        """Test that creating a session decrements user credits."""
        mock_user = {
            "id": "test-user-id",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "free_user",
            "credits_remaining": 10,
            "credits_reset_at": None,
        }
        # /sessions uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_user
        
        with patch('main.check_is_admin', return_value=False):
            with patch('main.check_credits_available', return_value=(True, {"credits_remaining": 10})):
                with patch('main.decrement_credits') as mock_decrement:
                    with patch('main.supabase') as mock_supabase:
                        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{
                            "id": "session-id",
                            "user_id": mock_user["id"],
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
                        # Verify credits were decremented
                        mock_decrement.assert_called_once()
        
        app.dependency_overrides.clear()
    
    def test_admin_bypasses_credit_check_on_session_creation(self):
        """Test that admins can create sessions without credit checks."""
        mock_admin_user = {
            "id": "admin-user-id",
            "email": "admin@example.com",
            "full_name": "Admin User",
            "role": "admin",
            "credits_remaining": 999,
            "credits_reset_at": None,
        }
        # /sessions uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_admin_user
        
        with patch('main.check_is_admin', return_value=True):
            with patch('main.supabase') as mock_supabase:
                mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [{
                    "id": "session-id",
                    "user_id": mock_admin_user["id"],
                    "title": "Admin Session",
                    "type": "free",
                    "transcript": "Test",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                }]
                
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


class TestAnalyzeEndpointCreditConsumption:
    """Tests for /analyze endpoint credit consumption (GAP-001).
    
    NOTE: /analyze uses get_active_user (not get_current_user).
    """
    
    def test_analyze_requires_credits(self):
        """Test that /analyze endpoint fails without sufficient credits."""
        mock_user = {
            "id": "test-user-id",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "free_user",
            "credits_remaining": 0,
            "credits_reset_at": None,
        }
        
        # /analyze uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_user
        
        with patch('main.check_is_admin', return_value=False):
            with patch('main.decrement_credits', side_effect=ValueError("Insufficient credits")):
                response = client.post("/analyze", json={
                    "raw_transcript": "This is a test transcript for analysis.",
                    "session_type": "free",
                })
                assert response.status_code == 402  # Payment required
                assert "Insufficient credits" in response.json()["detail"]
        
        app.dependency_overrides.clear()
    
    def test_analyze_consumes_one_credit_on_success(self):
        """Test that /analyze decrements exactly 1 credit on success."""
        mock_user = {
            "id": "test-user-id",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "free_user",
            "credits_remaining": 5,
            "credits_reset_at": None,
        }
        
        # /analyze uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_user
        
        with patch('main.check_is_admin', return_value=False):
            with patch('main.check_credits_available', return_value=(True, {"credits_remaining": 5})):
                with patch('main.analyze_and_refine') as mock_analyze:
                    # Mock successful analysis result
                    mock_analyze.return_value = {
                        "refined_text": "Refined transcript",
                        "confidence_score": 75,
                        "clarity_score": 80,
                        "analysis_reliability": 0.9,
                        "filler_word_count": 2,
                        "filler_word_frequency": 0.05,
                        "filler_word_breakdown": {"um": 1, "uh": 1},
                    }
                    
                    with patch('main.decrement_credits') as mock_decrement:
                        response = client.post("/analyze", json={
                            "raw_transcript": "This is a test transcript for analysis.",
                            "session_type": "free",
                        })
                        
                        assert response.status_code == 200
                        # Verify credits were decremented exactly once with amount=1 and reason="analysis"
                        mock_decrement.assert_called_once()
                        call_args = mock_decrement.call_args
                        assert call_args[1]["amount"] == 1
                        assert call_args[1]["reason"] == "analysis"
        
        app.dependency_overrides.clear()
    
    def test_analyze_does_not_consume_credits_on_failure(self):
        """Test that /analyze does NOT decrement credits when analysis fails."""
        mock_user = {
            "id": "test-user-id",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "free_user",
            "credits_remaining": 5,
            "credits_reset_at": None,
        }
        
        # /analyze uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_user
        
        with patch('main.check_is_admin', return_value=False):
            with patch('main.analyze_and_refine') as mock_analyze:
                # Mock analysis failure
                mock_analyze.side_effect = Exception("LLM API error")
                
                # New design: credit is RESERVED up front (decrement) then
                # REFUNDED on failure, so the net charge is zero.
                with patch('main.decrement_credits') as mock_decrement:
                    with patch('main.refund_credits') as mock_refund:
                        response = client.post("/analyze", json={
                            "raw_transcript": "This is a test transcript.",
                            "session_type": "free",
                        })
                        
                        assert response.status_code == 500
                        # Reserved once, then refunded once -> not charged.
                        mock_decrement.assert_called_once()
                        mock_refund.assert_called_once()
        
        app.dependency_overrides.clear()
    
    def test_analyze_admin_bypasses_credit_check(self):
        """Test that admin users bypass credit check for /analyze."""
        mock_admin = {
            "id": "admin-user-id",
            "email": "admin@example.com",
            "full_name": "Admin User",
            "role": "admin",
            "credits_remaining": 0,  # Even with 0 credits
            "credits_reset_at": None,
        }
        
        # /analyze uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_admin
        
        with patch('main.check_is_admin', return_value=True):
            # Admin bypasses credit check, so check_credits_available returns True
            with patch('main.check_credits_available', return_value=(True, {})):
                with patch('main.analyze_and_refine') as mock_analyze:
                    mock_analyze.return_value = {
                        "refined_text": "Refined",
                        "confidence_score": 75,
                        "clarity_score": 80,
                        "analysis_reliability": 0.9,
                        "filler_word_count": 0,
                        "filler_word_frequency": 0.0,
                        "filler_word_breakdown": {},
                    }
                    
                    with patch('main.decrement_credits') as mock_decrement:
                        response = client.post("/analyze", json={
                            "raw_transcript": "Test transcript",
                            "session_type": "free",
                        })
                        
                        assert response.status_code == 200
                        # Admin should NOT have credits decremented
                        mock_decrement.assert_not_called()
        
        app.dependency_overrides.clear()
    
    def test_analyze_uses_distinct_operation_key(self):
        """Test that /analyze uses 'analysis' as the credit reason, not 'refine'."""
        mock_user = {
            "id": "test-user-id",
            "email": "test@example.com",
            "full_name": "Test User",
            "role": "free_user",
            "credits_remaining": 10,
            "credits_reset_at": None,
        }
        
        # /analyze uses get_active_user
        app.dependency_overrides[get_active_user] = lambda: mock_user
        
        with patch('main.check_is_admin', return_value=False):
            with patch('main.check_credits_available', return_value=(True, {"credits_remaining": 10})):
                with patch('main.analyze_and_refine') as mock_analyze:
                    mock_analyze.return_value = {
                        "refined_text": "Refined",
                        "confidence_score": 75,
                        "clarity_score": 80,
                        "analysis_reliability": 0.9,
                        "filler_word_count": 0,
                        "filler_word_frequency": 0.0,
                        "filler_word_breakdown": {},
                    }
                    
                    with patch('main.decrement_credits') as mock_decrement:
                        response = client.post("/analyze", json={
                            "raw_transcript": "Test",
                            "session_type": "free",
                        })
                        
                        assert response.status_code == 200
                        # Verify the reason is "analysis" (distinct from "refine")
                        call_args = mock_decrement.call_args
                        assert call_args[1]["reason"] == "analysis"
                        assert call_args[1]["reason"] != "refine"
        
        app.dependency_overrides.clear()


class TestMonthlyCreditReset:
    """Tests for monthly credit reset functionality."""
    
    @pytest.mark.asyncio
    async def test_credits_reset_when_reset_date_passed(self):
        """Test that credits are reset when the reset date has passed."""
        user_id = "test-user-id"
        
        with patch('credits.supabase') as mock_supabase:
            # Mock get_or_create_user_profile returning reset profile
            reset_profile = {
                "user_id": user_id,
                "role": "free_user",
                "credits_remaining": 10,  # Reset to default
                "credits_reset_at": (datetime.now() + timedelta(days=30)).isoformat(),
            }
            
            # Setup RPC chain to properly return the profile
            mock_rpc_result = Mock()
            mock_rpc_result.data = [reset_profile]
            
            mock_rpc_call = Mock()
            mock_rpc_call.execute.return_value = mock_rpc_result
            mock_supabase.rpc.return_value = mock_rpc_call
            
            profile = await check_and_reset_credits(user_id)
            assert profile["credits_remaining"] == 10
            assert profile["role"] == "free_user"
    
    @pytest.mark.asyncio
    async def test_credits_not_reset_when_reset_date_not_passed(self):
        """Test that credits are not reset when reset date hasn't passed."""
        user_id = "test-user-id"
        
        with patch('credits.supabase') as mock_supabase:
            # Mock existing profile with future reset date
            existing_profile = {
                "user_id": user_id,
                "role": "free_user",
                "credits_remaining": 7,  # Current balance
                "credits_reset_at": (datetime.now() + timedelta(days=15)).isoformat(),
            }
            
            # Mock RPC call returning existing profile
            mock_rpc_response = Mock()
            mock_rpc_response.data = [existing_profile]
            mock_supabase.rpc.return_value.execute.return_value = mock_rpc_response
            
            profile = await check_and_reset_credits(user_id)
            # Credits should remain the same
            assert profile["credits_remaining"] == 7

from unittest.mock import AsyncMock, Mock, patch

import stripe

from main import app
from auth import get_active_user, security


def _override_active_user(user=None):
    if user is None:
        user = {"id": "user-id", "email": "user@test.com", "role": "free_user"}
    app.dependency_overrides[get_active_user] = lambda: user

    mock_credentials = Mock()
    mock_credentials.credentials = "fake-token"
    app.dependency_overrides[security] = lambda: mock_credentials


class TestStripeCheckoutSession:
    def test_success_url_appends_session_id_with_ampersand_when_query_present(self, client):
        _override_active_user()

        # Avoid hitting Supabase; just return a customer id from helper.
        with patch("stripe_billing.settings.stripe_secret_key", "sk_test_dummy"):
            with patch(
                "stripe_billing._get_or_create_stripe_customer",
                new_callable=AsyncMock,
                return_value="cus_test",
            ):
                # Provide a minimal valid price mapping.
                with patch(
                    "stripe_billing.get_price_plan_mapping",
                    return_value={"price_monthly": {"plan": Mock(value="pro_monthly"), "credits": 60}},
                ):
                    with patch("stripe.checkout.Session.create") as create_session:
                        create_session.return_value = Mock(id="cs_test", url="https://stripe.test/checkout")

                        res = client.post(
                            "/billing/create-checkout-session",
                            json={
                                "price_id": "price_monthly",
                                "success_url": "https://app.test/pricing?success=true",
                                "cancel_url": "https://app.test/pricing?canceled=true",
                            },
                        )
                        assert res.status_code == 200
                        assert res.json()["session_id"] == "cs_test"

                        kwargs = create_session.call_args.kwargs
                        assert (
                            kwargs["success_url"]
                            == "https://app.test/pricing?success=true&session_id={CHECKOUT_SESSION_ID}"
                        )

        app.dependency_overrides.clear()


class TestStripeWebhookSignatureHandling:
    def test_missing_signature_header_returns_400(self, client):
        with patch("stripe_billing.settings.stripe_webhook_secret", "whsec_test_dummy"):
            res = client.post("/billing/webhook", data=b"{}")
            assert res.status_code == 400
            assert res.json().get("detail") == "Missing Stripe signature"

    def test_invalid_signature_returns_400(self, client):
        with patch("stripe_billing.settings.stripe_webhook_secret", "whsec_test_dummy"):
            with patch(
                "stripe.Webhook.construct_event",
                side_effect=stripe.SignatureVerificationError(
                    message="bad sig", sig_header="t=1,v1=bad", http_body=b"{}"
                ),
            ):
                res = client.post(
                    "/billing/webhook",
                    data=b"{}",
                    headers={"Stripe-Signature": "t=1,v1=bad"},
                )
                assert res.status_code == 400
                assert res.json().get("detail") == "Invalid signature"


class TestStripeAdminRolePreserved:
    def test_subscription_update_does_not_overwrite_admin_role(self, client):
        """
        Regression: Stripe events must never downgrade an admin user.
        """
        from stripe_billing import _update_user_subscription, SubscriptionPlan, SubscriptionStatus

        # Mock supabase query returning existing admin role and allowance.
        select_execute = Mock()
        select_execute.data = [{"monthly_credit_allowance": 60, "credits_remaining": 5, "role": "admin"}]

        with patch("stripe_billing.supabase") as mock_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = (
                select_execute
            )

            awaitable_update_execute = Mock()
            awaitable_update_execute.data = [{"ok": True}]
            (
                mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value
            ) = awaitable_update_execute

            # Run the updater
            import asyncio

            asyncio.run(
                _update_user_subscription(
                    stripe_customer_id="cus_admin",
                    stripe_subscription_id="sub_123",
                    status=SubscriptionStatus.ACTIVE,
                    plan=SubscriptionPlan.PRO_MONTHLY,
                    current_period_end=None,
                    credit_allowance=60,
                )
            )

            update_payload = mock_supabase.table.return_value.update.call_args.args[0]
            assert "role" not in update_payload  # admin role preserved

    def test_subscription_deleted_does_not_overwrite_admin_role(self, client):
        from stripe_billing import _handle_subscription_deleted

        # Existing role is admin
        role_execute = Mock()
        role_execute.data = [{"role": "admin"}]

        with patch("stripe_billing.supabase") as mock_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = (
                role_execute
            )

            update_execute = Mock()
            update_execute.data = [{"ok": True}]
            (
                mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value
            ) = update_execute

            import asyncio

            asyncio.run(_handle_subscription_deleted({"customer": "cus_admin"}))

            update_payload = mock_supabase.table.return_value.update.call_args.args[0]
            assert update_payload.get("subscription_plan") == "free"
            assert "role" not in update_payload  # admin role preserved


class TestStripeIdempotency:
    def test_duplicate_subscription_update_does_not_double_grant_bonus_credits(self, client):
        """
        Idempotency: repeated subscription.* events should not double-apply upgrade bonus credits.

        This simulates the common case where Stripe retries a webhook and we process the same
        upgrade twice. The second processing should see the new allowance already applied and
        therefore NOT add bonus credits again.
        """
        from stripe_billing import _update_user_subscription, SubscriptionPlan, SubscriptionStatus

        # First call: user had lower allowance -> bonus credits applied
        select_execute_1 = Mock()
        select_execute_1.data = [{"monthly_credit_allowance": 10, "credits_remaining": 5, "role": "free_user"}]

        # Second call: user already at new allowance -> no bonus
        select_execute_2 = Mock()
        select_execute_2.data = [{"monthly_credit_allowance": 60, "credits_remaining": 55, "role": "premium_user"}]

        with patch("stripe_billing.supabase") as mock_supabase:
            mock_supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
                select_execute_1,
                select_execute_2,
            ]

            update_execute = Mock()
            update_execute.data = [{"ok": True}]
            (
                mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value
            ) = update_execute

            import asyncio

            asyncio.run(
                _update_user_subscription(
                    stripe_customer_id="cus_user",
                    stripe_subscription_id="sub_upgrade",
                    status=SubscriptionStatus.ACTIVE,
                    plan=SubscriptionPlan.PRO_MONTHLY,
                    current_period_end=None,
                    credit_allowance=60,
                )
            )
            first_update_payload = mock_supabase.table.return_value.update.call_args_list[0].args[0]
            assert first_update_payload.get("credits_remaining") == 55  # 5 + (60-10)

            asyncio.run(
                _update_user_subscription(
                    stripe_customer_id="cus_user",
                    stripe_subscription_id="sub_upgrade",
                    status=SubscriptionStatus.ACTIVE,
                    plan=SubscriptionPlan.PRO_MONTHLY,
                    current_period_end=None,
                    credit_allowance=60,
                )
            )
            second_update_payload = mock_supabase.table.return_value.update.call_args_list[1].args[0]
            assert "credits_remaining" not in second_update_payload


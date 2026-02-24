"""
Stripe billing integration module.

Handles:
- Checkout session creation for subscriptions
- Webhook processing for subscription lifecycle events
- Customer portal session creation
- Credit management tied to subscription status

Security considerations:
- Webhook signature verification is REQUIRED
- All subscription changes happen server-side via webhooks only
- Frontend never directly modifies subscription state
- Price IDs are validated against configured allowlist
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Literal
from enum import Enum

import stripe
from fastapi import APIRouter, Request, HTTPException, Depends, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import settings
from db import supabase
from auth import get_current_user, get_active_user

logger = logging.getLogger(__name__)

# Initialize Stripe with secret key
if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key
else:
    logger.warning("[Stripe] STRIPE_SECRET_KEY not configured - billing features disabled")

router = APIRouter(prefix="/billing", tags=["billing"])


# =============================================================================
# Constants & Enums
# =============================================================================

class SubscriptionPlan(str, Enum):
    """Valid subscription plans."""
    FREE = "free"
    PRO_MONTHLY = "pro_monthly"
    PRO_YEARLY = "pro_yearly"
    PRO_PLUS_MONTHLY = "pro_plus_monthly"  # Future
    PRO_PLUS_YEARLY = "pro_plus_yearly"    # Future


class SubscriptionStatus(str, Enum):
    """Valid subscription statuses (mirrors Stripe statuses)."""
    INACTIVE = "inactive"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    TRIALING = "trialing"


# Map price IDs to plans and credits
def get_price_plan_mapping() -> Dict[str, Dict[str, Any]]:
    """
    Returns mapping of Stripe price IDs to plan details.
    Built dynamically from environment variables.
    """
    mapping = {}
    
    if settings.stripe_price_id_monthly:
        mapping[settings.stripe_price_id_monthly] = {
            "plan": SubscriptionPlan.PRO_MONTHLY,
            "credits": settings.stripe_credits_pro,
            "interval": "month",
        }
    
    if settings.stripe_price_id_yearly:
        mapping[settings.stripe_price_id_yearly] = {
            "plan": SubscriptionPlan.PRO_YEARLY,
            "credits": settings.stripe_credits_pro,
            "interval": "year",
        }
    
    return mapping


# =============================================================================
# Request/Response Models
# =============================================================================

class CreateCheckoutRequest(BaseModel):
    """Request to create a checkout session."""
    price_id: str = Field(..., description="Stripe Price ID for the subscription")
    success_url: str = Field(..., description="URL to redirect after successful payment")
    cancel_url: str = Field(..., description="URL to redirect if user cancels")


class CreateCheckoutResponse(BaseModel):
    """Response with checkout session URL."""
    checkout_url: str
    session_id: str


class CreatePortalRequest(BaseModel):
    """Request to create a customer portal session."""
    return_url: str = Field(..., description="URL to redirect after portal session")


class CreatePortalResponse(BaseModel):
    """Response with portal session URL."""
    portal_url: str


class SubscriptionStatusResponse(BaseModel):
    """Current subscription status for a user."""
    plan: str
    status: str
    credits_remaining: int
    credits_total: int
    current_period_end: Optional[str] = None
    cancel_at_period_end: bool = False


# =============================================================================
# Helper Functions
# =============================================================================

def _ensure_stripe_configured():
    """Raise error if Stripe is not configured."""
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=503,
            detail="Billing is not configured. Please contact support."
        )


def _validate_price_id(price_id: str) -> Dict[str, Any]:
    """
    Validate that price_id is in our allowed list.
    Returns plan details if valid, raises HTTPException if not.
    """
    mapping = get_price_plan_mapping()
    
    if price_id not in mapping:
        logger.warning(f"[Stripe] Invalid price_id attempted: {price_id}")
        raise HTTPException(
            status_code=400,
            detail="Invalid price selected. Please choose a valid plan."
        )
    
    return mapping[price_id]


async def _get_or_create_stripe_customer(user_id: str, email: str) -> str:
    """
    Get existing Stripe customer ID or create a new customer.
    Returns the stripe_customer_id.
    """
    # Check if user already has a Stripe customer ID
    result = supabase.table("user_profiles").select("stripe_customer_id").eq("user_id", user_id).execute()
    
    if result.data and result.data[0].get("stripe_customer_id"):
        return result.data[0]["stripe_customer_id"]
    
    # Create new Stripe customer
    try:
        customer = stripe.Customer.create(
            email=email,
            metadata={
                "user_id": user_id,
                "source": "voira_app"
            }
        )
        
        # Store customer ID in user profile
        supabase.table("user_profiles").update({
            "stripe_customer_id": customer.id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).execute()
        
        logger.info(f"[Stripe] Created customer {customer.id} for user {user_id}")
        return customer.id
        
    except stripe.StripeError as e:
        logger.error(f"[Stripe] Failed to create customer for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize billing. Please try again.")


async def _update_user_subscription(
    stripe_customer_id: str,
    stripe_subscription_id: str,
    status: SubscriptionStatus,
    plan: SubscriptionPlan,
    current_period_end: Optional[datetime],
    credit_allowance: int
):
    """
    Update user's subscription status in database.
    Called by webhook handlers.
    """
    logger.info(f"[Stripe] _update_user_subscription called for customer {stripe_customer_id}")
    try:
        # Determine role for non-admin users (admin role is preserved)
        computed_role = "free_user"
        if plan in [SubscriptionPlan.PRO_MONTHLY, SubscriptionPlan.PRO_YEARLY]:
            computed_role = "premium_user"
        elif plan in [SubscriptionPlan.PRO_PLUS_MONTHLY, SubscriptionPlan.PRO_PLUS_YEARLY]:
            computed_role = "premium_plus_user"
        
        update_data = {
            "stripe_subscription_id": stripe_subscription_id,
            "subscription_status": status.value,
            "subscription_plan": plan.value,
            "subscription_current_period_end": current_period_end.isoformat() if current_period_end else None,
            "monthly_credit_allowance": credit_allowance,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # If upgrading, also update credits_remaining and, for non-admins, role
        result = supabase.table("user_profiles").select(
            "monthly_credit_allowance, credits_remaining, role"
        ).eq(
            "stripe_customer_id", stripe_customer_id
        ).execute()
        
        logger.info(f"[Stripe] Query result for customer {stripe_customer_id}: {result.data}")
        
        existing_role = None
        if result.data:
            existing_role = result.data[0].get("role")
            old_allowance = result.data[0].get("monthly_credit_allowance", 10)
            old_remaining = result.data[0].get("credits_remaining", 0)
            
            # If upgrading, give user the additional credits immediately
            if credit_allowance > old_allowance:
                bonus_credits = credit_allowance - old_allowance
                update_data["credits_remaining"] = old_remaining + bonus_credits
                logger.info(f"[Stripe] Upgrading user: adding {bonus_credits} bonus credits")
        else:
            logger.warning(f"[Stripe] No user found with stripe_customer_id={stripe_customer_id}")
        
        # Preserve admin role; only overwrite role for non-admins or when no existing record
        if existing_role != "admin":
            update_data["role"] = computed_role
        
        logger.info(f"[Stripe] Update data: {update_data}")
        
        update_result = supabase.table("user_profiles").update(update_data).eq(
            "stripe_customer_id", stripe_customer_id
        ).execute()
        
        logger.info(f"[Stripe] Update result: {update_result.data}")
        logger.info(f"[Stripe] Updated subscription for customer {stripe_customer_id}: plan={plan.value}, status={status.value}")
        
    except Exception as e:
        logger.error(f"[Stripe] Failed to update subscription for customer {stripe_customer_id}: {e}")
        raise


async def _handle_subscription_created_or_updated(subscription: dict):
    """Handle subscription creation or update from webhook."""
    customer_id = subscription["customer"]
    subscription_id = subscription["id"]
    
    logger.info(f"[Stripe] Processing subscription {subscription_id} for customer {customer_id}")
    
    # Get price and plan details - handle nested dict structure
    items_data = subscription.get("items", {}).get("data", [])
    if not items_data:
        logger.error(f"[Stripe] Subscription {subscription_id} has no items")
        return
    
    price_id = items_data[0]["price"]["id"]
    mapping = get_price_plan_mapping()
    
    logger.info(f"[Stripe] Price ID: {price_id}, Available mappings: {list(mapping.keys())}")
    
    if price_id not in mapping:
        logger.error(f"[Stripe] Unknown price_id in subscription: {price_id}")
        return
    
    plan_info = mapping[price_id]
    
    # Map Stripe status to our status
    status_map = {
        "active": SubscriptionStatus.ACTIVE,
        "past_due": SubscriptionStatus.PAST_DUE,
        "canceled": SubscriptionStatus.CANCELED,
        "trialing": SubscriptionStatus.TRIALING,
        "incomplete": SubscriptionStatus.INACTIVE,
        "incomplete_expired": SubscriptionStatus.INACTIVE,
        "unpaid": SubscriptionStatus.PAST_DUE,
    }
    status = status_map.get(subscription["status"], SubscriptionStatus.INACTIVE)
    
    # Get period end
    period_end = None
    current_period_end = subscription.get("current_period_end")
    if current_period_end:
        period_end = datetime.fromtimestamp(current_period_end, tz=timezone.utc)
    
    await _update_user_subscription(
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription_id,
        status=status,
        plan=plan_info["plan"],
        current_period_end=period_end,
        credit_allowance=plan_info["credits"]
    )


async def _handle_subscription_deleted(subscription: dict):
    """Handle subscription cancellation/deletion from webhook."""
    customer_id = subscription["customer"]
    
    try:
        # Look up existing role so we don't overwrite admin users
        result = supabase.table("user_profiles").select("role").eq(
            "stripe_customer_id", customer_id
        ).execute()
        existing_role = result.data[0].get("role") if result.data else None
        
        # Downgrade to free plan; preserve admin role
        update_data = {
            "subscription_status": SubscriptionStatus.CANCELED.value,
            "subscription_plan": SubscriptionPlan.FREE.value,
            "monthly_credit_allowance": settings.stripe_credits_free,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if existing_role != "admin":
            update_data["role"] = "free_user"
        
        supabase.table("user_profiles").update(update_data).eq(
            "stripe_customer_id", customer_id
        ).execute()
        
        logger.info(f"[Stripe] Subscription canceled for customer {customer_id}, downgraded to free")
        
    except Exception as e:
        logger.error(f"[Stripe] Failed to handle subscription deletion for customer {customer_id}: {e}")
        raise


async def _handle_invoice_payment_failed(invoice: dict):
    """Handle failed payment - mark subscription as past_due."""
    customer_id = invoice["customer"]
    
    try:
        supabase.table("user_profiles").update({
            "subscription_status": SubscriptionStatus.PAST_DUE.value,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("stripe_customer_id", customer_id).execute()
        
        logger.warning(f"[Stripe] Payment failed for customer {customer_id}, marked as past_due")
        
    except Exception as e:
        logger.error(f"[Stripe] Failed to handle payment failure for customer {customer_id}: {e}")


async def _handle_checkout_session_completed(session: dict):
    """
    Handle successful checkout completion.
    This fires when user completes payment, before subscription is fully active.
    We use this to ensure the stripe_customer_id is linked if it wasn't already.
    """
    customer_id = session["customer"]
    metadata = session.get("metadata", {})
    user_id = metadata.get("user_id") if metadata else None
    
    if not user_id:
        logger.error(f"[Stripe] Checkout session {session['id']} missing user_id in metadata")
        return
    
    try:
        # Ensure customer ID is stored (might already be from create-checkout)
        supabase.table("user_profiles").update({
            "stripe_customer_id": customer_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).execute()
        
        logger.info(f"[Stripe] Checkout completed for user {user_id}, customer {customer_id}")
        
    except Exception as e:
        logger.error(f"[Stripe] Failed to handle checkout completion: {e}")


# =============================================================================
# API Endpoints
# =============================================================================

@router.post("/create-checkout-session", response_model=CreateCheckoutResponse)
async def create_checkout_session(
    request: CreateCheckoutRequest,
    user: dict = Depends(get_active_user)
):
    """
    Create a Stripe Checkout session for subscription purchase.
    
    The user will be redirected to Stripe's hosted checkout page.
    After payment, they'll be redirected to success_url or cancel_url.
    """
    _ensure_stripe_configured()
    
    # Validate price ID
    plan_info = _validate_price_id(request.price_id)
    
    # Get or create Stripe customer
    customer_id = await _get_or_create_stripe_customer(user["id"], user["email"])
    
    try:
        # Create checkout session
        checkout_session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{
                "price": request.price_id,
                "quantity": 1,
            }],
            success_url=request.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=request.cancel_url,
            metadata={
                "user_id": user["id"],
                "plan": plan_info["plan"].value,
            },
            subscription_data={
                "metadata": {
                    "user_id": user["id"],
                }
            },
            # Allow promotion codes
            allow_promotion_codes=True,
        )
        
        logger.info(f"[Stripe] Created checkout session {checkout_session.id} for user {user['id']}")
        
        return CreateCheckoutResponse(
            checkout_url=checkout_session.url,
            session_id=checkout_session.id
        )
        
    except stripe.StripeError as e:
        logger.error(f"[Stripe] Failed to create checkout session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session. Please try again.")


@router.post("/create-portal-session", response_model=CreatePortalResponse)
async def create_portal_session(
    request: CreatePortalRequest,
    user: dict = Depends(get_active_user)
):
    """
    Create a Stripe Customer Portal session.
    
    The portal allows users to:
    - Update payment methods
    - View invoices
    - Cancel subscription
    - Update billing info
    """
    _ensure_stripe_configured()
    
    # Get user's Stripe customer ID
    result = supabase.table("user_profiles").select("stripe_customer_id").eq("user_id", user["id"]).execute()
    
    if not result.data or not result.data[0].get("stripe_customer_id"):
        raise HTTPException(
            status_code=400,
            detail="No billing account found. Please subscribe to a plan first."
        )
    
    customer_id = result.data[0]["stripe_customer_id"]
    
    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=request.return_url
        )
        
        logger.info(f"[Stripe] Created portal session for user {user['id']}")
        
        return CreatePortalResponse(portal_url=portal_session.url)
        
    except stripe.StripeError as e:
        logger.error(f"[Stripe] Failed to create portal session: {e}")
        raise HTTPException(status_code=500, detail="Failed to open billing portal. Please try again.")


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(user: dict = Depends(get_current_user)):
    """
    Get current subscription status for the authenticated user.
    """
    result = supabase.table("user_profiles").select(
        "subscription_plan",
        "subscription_status", 
        "credits_remaining",
        "monthly_credit_allowance",
        "subscription_current_period_end",
        "stripe_subscription_id"
    ).eq("user_id", user["id"]).execute()
    
    if not result.data:
        return SubscriptionStatusResponse(
            plan="free",
            status="inactive",
            credits_remaining=settings.stripe_credits_free,
            credits_total=settings.stripe_credits_free,
            current_period_end=None,
            cancel_at_period_end=False
        )
    
    profile = result.data[0]
    
    # Check if subscription is set to cancel at period end
    cancel_at_period_end = False
    if profile.get("stripe_subscription_id") and settings.stripe_secret_key:
        try:
            sub = stripe.Subscription.retrieve(profile["stripe_subscription_id"])
            cancel_at_period_end = sub.cancel_at_period_end
        except stripe.StripeError:
            pass  # Non-critical, just use default
    
    return SubscriptionStatusResponse(
        plan=profile.get("subscription_plan", "free"),
        status=profile.get("subscription_status", "inactive"),
        credits_remaining=profile.get("credits_remaining", settings.stripe_credits_free),
        credits_total=profile.get("monthly_credit_allowance", settings.stripe_credits_free),
        current_period_end=profile.get("subscription_current_period_end"),
        cancel_at_period_end=cancel_at_period_end
    )


# =============================================================================
# Webhook Endpoint (No Auth - Verified by Stripe Signature)
# =============================================================================

@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Handle Stripe webhook events.
    
    SECURITY: This endpoint verifies the webhook signature to ensure
    the request came from Stripe. Never trust webhook data without verification.
    """
    if not settings.stripe_webhook_secret:
        logger.error("[Stripe] Webhook received but STRIPE_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=500, detail="Webhook not configured")
    
    if not stripe_signature:
        logger.warning("[Stripe] Webhook received without signature header")
        raise HTTPException(status_code=400, detail="Missing Stripe signature")
    
    # Get raw body for signature verification
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=settings.stripe_webhook_secret
        )
    except ValueError as e:
        logger.error(f"[Stripe] Invalid webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError as e:
        logger.error(f"[Stripe] Invalid webhook signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Log the event type
    event_type = event["type"]
    logger.info(f"[Stripe] Received webhook: {event_type}")
    
    try:
        # Handle different event types
        if event_type == "checkout.session.completed":
            session = event["data"]["object"]
            await _handle_checkout_session_completed(session)
            
        elif event_type == "customer.subscription.created":
            subscription = event["data"]["object"]
            await _handle_subscription_created_or_updated(subscription)
            
        elif event_type == "customer.subscription.updated":
            subscription = event["data"]["object"]
            await _handle_subscription_created_or_updated(subscription)
            
        elif event_type == "customer.subscription.deleted":
            subscription = event["data"]["object"]
            await _handle_subscription_deleted(subscription)
            
        elif event_type == "invoice.payment_succeeded":
            # Payment succeeded - subscription should already be updated
            # Could use this for sending receipts/emails
            invoice = event["data"]["object"]
            logger.info(f"[Stripe] Payment succeeded for invoice {invoice['id']}")
            
        elif event_type == "invoice.payment_failed":
            invoice = event["data"]["object"]
            await _handle_invoice_payment_failed(invoice)
            
        else:
            logger.debug(f"[Stripe] Unhandled webhook event type: {event_type}")
    
    except Exception as e:
        import traceback
        logger.error(f"[Stripe] Error processing webhook {event_type}: {e}")
        logger.error(f"[Stripe] Traceback: {traceback.format_exc()}")
        # Return 200 anyway to prevent Stripe from retrying
        # We've logged the error for manual investigation
    
    # Always return 200 to acknowledge receipt
    return JSONResponse(content={"status": "received"}, status_code=200)


# =============================================================================
# Credit Check Function (For Use in Other Modules)
# =============================================================================

async def check_user_credits(user_id: str, required_credits: int = 1) -> bool:
    """
    Check if user has enough credits.
    
    Args:
        user_id: The user's ID
        required_credits: Number of credits needed (default 1)
    
    Returns:
        True if user has enough credits, False otherwise
    """
    result = supabase.table("user_profiles").select(
        "credits_remaining",
        "subscription_status"
    ).eq("user_id", user_id).execute()
    
    if not result.data:
        return False
    
    profile = result.data[0]
    credits = profile.get("credits_remaining", 0)
    
    return credits >= required_credits


async def deduct_user_credits(user_id: str, amount: int = 1) -> bool:
    """
    Deduct credits from user's account.
    
    Args:
        user_id: The user's ID
        amount: Number of credits to deduct (default 1)
    
    Returns:
        True if deduction successful, False if insufficient credits
    """
    # Use the atomic deduction function from the database
    try:
        result = supabase.rpc("deduct_credit", {
            "p_user_id": user_id,
            "p_amount": amount
        }).execute()
        
        # The function returns JSON: {"success": bool, "remaining": int|null, "error": string|null}
        if result.data and isinstance(result.data, dict):
            if result.data.get("success"):
                remaining = result.data.get("remaining", "?")
                logger.info(f"[Billing] Deducted {amount} credit(s) from user {user_id}, remaining: {remaining}")
                return True
            else:
                error = result.data.get("error", "unknown error")
                logger.warning(f"[Billing] Credit deduction failed for user {user_id}: {error}")
                return False
        
        # Fallback for unexpected response
        logger.warning(f"[Billing] Unexpected response from deduct_credit: {result.data}")
        return False
        
    except Exception as e:
        logger.error(f"[Billing] Failed to deduct credits for user {user_id}: {e}")
        return False


# =============================================================================
# Webhook Router (Separate prefix for /webhooks/stripe compatibility)
# =============================================================================
# This allows the webhook to be mounted at /webhooks/stripe in main.py
# while keeping /billing/webhook as an alias

webhook_router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@webhook_router.post("/stripe")
async def stripe_webhook_alias(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Alias for Stripe webhook at /webhooks/stripe.
    Delegates to the main webhook handler.
    """
    return await stripe_webhook(request, stripe_signature)

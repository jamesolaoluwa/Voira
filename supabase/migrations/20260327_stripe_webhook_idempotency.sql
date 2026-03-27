-- Create table to track processed Stripe webhook events
-- This prevents duplicate processing of retried webhooks
-- Reference: Claude.md - Item #1: Stripe Webhook Idempotency

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups during webhook processing
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id 
    ON stripe_webhook_events(event_id);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at 
    ON stripe_webhook_events(processed_at DESC);

-- Enable RLS (optional but recommended for security)
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can read/write webhook events
-- (These are internal system records, not user data)
CREATE POLICY "Webhook events are internal only" 
    ON stripe_webhook_events 
    USING (FALSE);  -- Deny all direct access; allow only via API

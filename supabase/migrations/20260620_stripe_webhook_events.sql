-- Phase 1 — Stripe webhook idempotency table
--
-- Confirmed against the LIVE Supabase schema: the stripe_webhook_events table
-- referenced by the webhook handler did NOT exist, so idempotency always failed
-- open. This creates an append-style claim table that supports an atomic
-- "insert-as-claim" pattern:
--   * INSERT (event_id) acts as the claim (PK uniqueness).
--   * status flips to 'completed' only after successful processing.
--   * a failed attempt deletes its claim so Stripe retries can re-process.
--
-- Idempotent and safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  status       text NOT NULL DEFAULT 'processing',
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON public.stripe_webhook_events (processed_at);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Deny all access to client roles; only the service-role key (which bypasses
-- RLS) may read/write this table.
DROP POLICY IF EXISTS stripe_webhook_events_no_select ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_no_select ON public.stripe_webhook_events
  FOR SELECT TO anon, authenticated USING (false);

DROP POLICY IF EXISTS stripe_webhook_events_no_insert ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_no_insert ON public.stripe_webhook_events
  FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS stripe_webhook_events_no_update ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_no_update ON public.stripe_webhook_events
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS stripe_webhook_events_no_delete ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_no_delete ON public.stripe_webhook_events
  FOR DELETE TO anon, authenticated USING (false);

COMMIT;

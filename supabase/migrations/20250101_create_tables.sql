-- Migration: Create core tables for Voira
-- Run in Supabase SQL editor as project admin
-- This migration creates: recordings, user_profiles, admin_emails (if not exists), and credits_ledger

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. RECORDINGS (Sessions)
-- ============================================
CREATE TABLE IF NOT EXISTS public.recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'free', -- 'free', 'application', 'interview', 'practice', 'refine'
  question text,
  goal text,
  reference_text text,
  audio_url text,
  audio_mime text DEFAULT '',
  audio_size_bytes bigint DEFAULT 0,
  duration_seconds integer DEFAULT 0,
  transcript text DEFAULT '',
  refined_draft text DEFAULT '',
  clarity_score integer DEFAULT 0,
  confidence_score integer DEFAULT 0,
  filler_count integer DEFAULT 0,
  words_per_minute integer DEFAULT 0,
  highlights jsonb DEFAULT '[]'::jsonb,
  tags text[] DEFAULT array[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON public.recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON public.recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_type ON public.recordings(type);

-- ============================================
-- 2. USER_PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'free_user', -- 'free_user', 'premium_user', 'admin'
  credits_remaining integer NOT NULL DEFAULT 10, -- Basic: 10/month, Premium: 120/month
  credits_reset_at timestamptz, -- When credits reset (monthly)
  reference_uploads_remaining integer NOT NULL DEFAULT 1, -- Basic: 1/month, Premium: unlimited
  reference_uploads_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);

-- ============================================
-- 3. ADMIN_EMAILS (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_emails_email ON public.admin_emails(email);

-- ============================================
-- 4. CREDITS_LEDGER (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS public.credits_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL, -- positive for grants, negative for usage
  reason text NOT NULL, -- 'monthly_reset', 'recording_saved', 'admin_grant', etc.
  balance_after integer NOT NULL, -- credits remaining after this transaction
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credits_ledger_user_id ON public.credits_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credits_ledger_created_at ON public.credits_ledger(created_at DESC);

COMMIT;


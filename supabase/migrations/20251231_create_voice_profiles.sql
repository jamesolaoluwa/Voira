-- Migration: create voice_profiles table for durable voice profile persistence
-- Run in Supabase SQL editor as project admin

BEGIN;

CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tone text NOT NULL DEFAULT 'professional',
  confidence_level int NOT NULL DEFAULT 65,
  emotional_depth int NOT NULL DEFAULT 50,
  sentence_length text NOT NULL DEFAULT 'medium',
  preferred_words text[] DEFAULT array[]::text[],
  avoided_words text[] DEFAULT array[]::text[],
  example_responses text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient per-user lookups
CREATE INDEX IF NOT EXISTS idx_voice_profiles_user_id
  ON public.voice_profiles(user_id);

COMMIT;

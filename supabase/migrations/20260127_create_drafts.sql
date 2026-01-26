-- Migration: Create drafts table for Partial Save / Draft Naming feature
-- Drafts represent intentionally unfinished work, separate from completed sessions
--
-- Key differences from recordings (sessions):
-- - Text-only (no audio blobs)
-- - No LLM refinement or analytics
-- - User-named drafts
-- - Supports resume, edit, and offline-safe flows

BEGIN;

-- ============================================
-- DRAFTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Draft identification
  name text NOT NULL DEFAULT 'Untitled Draft',

  -- Session context (mirrors Speak page state)
  type text NOT NULL DEFAULT 'free',
  question text,
  desired_style text,
  word_limit integer,
  company_name text,
  company_context text,

  -- Content
  transcript_text text DEFAULT '',
  is_user_edited boolean NOT NULL DEFAULT false,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- ============================================
  -- CONSTRAINTS
  -- ============================================

  -- Allowed draft types only
  CONSTRAINT drafts_type_valid
    CHECK (type IN ('free', 'application', 'interview')),

  -- Word limit must align with backend/UI enforcement
  CONSTRAINT drafts_word_limit_valid
    CHECK (word_limit IS NULL OR (word_limit >= 20 AND word_limit <= 1000))
);

-- ============================================
-- INDEXES
-- ============================================

-- Primary access pattern: user's drafts ordered by recency
CREATE INDEX IF NOT EXISTS idx_drafts_user_updated
  ON public.drafts(user_id, updated_at DESC);

-- Secondary ordering/indexes (optional but useful)
CREATE INDEX IF NOT EXISTS idx_drafts_created_at
  ON public.drafts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drafts_updated_at
  ON public.drafts(updated_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own drafts"
  ON public.drafts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drafts"
  ON public.drafts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
  ON public.drafts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts"
  ON public.drafts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.update_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_drafts_updated_at ON public.drafts;

CREATE TRIGGER trigger_drafts_updated_at
  BEFORE UPDATE ON public.drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_drafts_updated_at();

COMMIT;

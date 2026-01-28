-- Migration: User Settings (Phase 1)
-- Purpose: Store user preference for filler word detection
-- 
-- SCOPE (Phase 1 only):
-- - filler_word_detection: Enable filler tracking during transcription
--
-- MODE BEHAVIOR (hardcoded in application logic, NOT in this table):
-- - Practice: Always detect, never remove
-- - Application: Detect per setting, always remove at refinement
-- - Interview: Detect per setting, default no removal
-- - Free Speak: Detect per setting, default no removal

BEGIN;

-- ============================================
-- 1. USER_SETTINGS TABLE (Lean - Phase 1)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Filler word detection: enables counting/analytics during transcription
  -- When true: Deepgram uses filler_words=true to tag fillers
  -- When false: No filler detection, no filler analytics
  -- Note: This does NOT control removal - that's mode-specific in app logic
  filler_word_detection boolean NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- ============================================
-- 2. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Users can only read their own settings
DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings;
CREATE POLICY user_settings_select_own
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own settings
DROP POLICY IF EXISTS user_settings_insert_own ON public.user_settings;
CREATE POLICY user_settings_insert_own
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own settings
DROP POLICY IF EXISTS user_settings_update_own ON public.user_settings;
CREATE POLICY user_settings_update_own
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own settings
DROP POLICY IF EXISTS user_settings_delete_own ON public.user_settings;
CREATE POLICY user_settings_delete_own
  ON public.user_settings FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. HELPER FUNCTION: Get or Create Settings
-- ============================================
CREATE OR REPLACE FUNCTION public.get_or_create_user_settings(p_user_id uuid)
RETURNS public.user_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.user_settings;
BEGIN
  -- Try to get existing settings
  SELECT * INTO v_settings
  FROM public.user_settings
  WHERE user_id = p_user_id;
  
  -- If not found, create with defaults
  IF NOT FOUND THEN
    INSERT INTO public.user_settings (user_id, filler_word_detection)
    VALUES (p_user_id, false)
    RETURNING * INTO v_settings;
  END IF;
  
  RETURN v_settings;
END;
$$;

-- ============================================
-- 4. TRIGGER: Auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_user_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trigger_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_settings_updated_at();

COMMIT;

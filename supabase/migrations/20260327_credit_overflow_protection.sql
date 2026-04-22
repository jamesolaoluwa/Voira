-- Add database constraints to prevent credit overflow
-- Reference: Claude.md - Item #2: Credit Overflow Protection

-- Step 1: Add CHECK constraint to user_profiles
ALTER TABLE user_profiles
ADD CONSTRAINT chk_credits_not_exceed_allowance 
    CHECK (credits_remaining <= monthly_credit_allowance);

-- Step 2: Create trigger function to enforce credit limits on update
-- This ensures that even if constraint is bypassed, credits are capped
CREATE OR REPLACE FUNCTION enforce_credit_limits()
RETURNS TRIGGER AS $$
BEGIN
  -- Cap credits at monthly allowance
  IF NEW.credits_remaining > NEW.monthly_credit_allowance THEN
    NEW.credits_remaining := NEW.monthly_credit_allowance;
    RAISE WARNING 'Credits capped at allowance for user %', NEW.user_id;
  END IF;
  
  -- Never allow negative credits
  IF NEW.credits_remaining < 0 THEN
    NEW.credits_remaining := 0;
    RAISE WARNING 'Credits reset to 0 (was negative) for user %', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger on user_profiles
DROP TRIGGER IF EXISTS credit_limit_trigger ON user_profiles;
CREATE TRIGGER credit_limit_trigger
BEFORE INSERT OR UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION enforce_credit_limits();

-- Step 4: Verify existing data (find any violations)
-- Run this query to check for existing violations:
-- SELECT user_id, credits_remaining, monthly_credit_allowance 
-- FROM user_profiles 
-- WHERE credits_remaining > monthly_credit_allowance;

-- If violations exist, fix them:
UPDATE user_profiles
SET credits_remaining = monthly_credit_allowance
WHERE credits_remaining > monthly_credit_allowance;

-- Fix negative credits
UPDATE user_profiles
SET credits_remaining = 0
WHERE credits_remaining < 0;

# Supabase Database Migrations

This directory contains SQL migrations for the Voira database schema, RLS policies, and helper functions.

## IMPORTANT SECURITY NOTES

- **NEVER** run `SELECT`, `INSERT`, `UPDATE`, or `DELETE` on sensitive tables (like `admin_emails`) from client-side/browser code.
- **NEVER** commit your Supabase `service_role` key to source control or expose it to the browser.
- Apply RLS (row-level security) statements only via Supabase SQL editor or a protected CI pipeline with the service_role key.
- The backend API uses the `service_role` key server-side to enforce security and manage credits.

## Manual Migration Steps

Run these migrations **in order** in the Supabase SQL Editor:

### Step 1: Create Tables
Copy and paste the contents of `migrations/20250101_create_tables.sql` into the Supabase SQL Editor and execute.

This creates:
- `recordings` - User session recordings
- `user_profiles` - User profile with credits/subscription info
- `admin_emails` - Admin email list (if not exists)
- `credits_ledger` - Audit trail for credit transactions

### Step 2: Enable RLS and Create Policies
Copy and paste the contents of `migrations/20250101_enable_rls.sql` into the Supabase SQL Editor and execute.

This enables RLS on all tables and creates policies that:
- Allow users to access only their own data
- Lock down `admin_emails` (no client access)
- Lock down `credits_ledger` inserts (backend-only)

### Step 3: Create Helper Functions
Copy and paste the contents of `migrations/20250101_credits_functions.sql` into the Supabase SQL Editor and execute.

This creates helper functions for:
- `get_or_create_user_profile()` - Auto-create profiles with default credits
- `check_and_reset_credits()` - Monthly credit reset logic

### Step 4: Voice Profiles (if not already applied)
If you haven't already run the voice_profiles migrations, run:
- `migrations/20251231_create_voice_profiles.sql`
- `migrations/20251231_voice_profiles_rls.sql`

## Verification Checklist

After running migrations, verify:

1. **RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   ```
   All tables should show `rowsecurity = true`.

2. **Policies exist:**
   ```sql
   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
   ```
   You should see policies for each table.

3. **Test as a regular user:**
   - Try to SELECT from `admin_emails` → should return 0 rows (even if data exists)
   - Try to SELECT your own recordings → should work
   - Try to SELECT another user's recordings → should return 0 rows

4. **Test admin check via backend:**
   - Call `GET /admin/is-admin` with a valid JWT
   - Backend uses service_role to check `admin_emails` table
   - Returns `{ isAdmin: boolean }` only (never returns email list)

## Credits & Subscription Rules

**Basic (free_user):**
- 10 credits/month
- 1 reference upload/month
- Credits reset on the 1st of each month

**Premium (premium_user):**
- 120 credits/month
- Unlimited reference uploads
- Credits reset on the 1st of each month

**Admin:**
- Bypass all limits (backend enforces this)
- Can access admin-only endpoints

## Backend Integration

The FastAPI backend (`/apps/api`) uses the `service_role` key to:
- Check admin status (queries `admin_emails` table)
- Enforce credits (decrements `user_profiles.credits_remaining`)
- Log transactions (inserts into `credits_ledger`)
- Reset monthly credits (calls `check_and_reset_credits()`)

**Never expose `service_role` to the frontend.**

## Troubleshooting

**If you lock yourself out:**
- Use the Supabase SQL Editor (project owner access) to temporarily disable RLS:
  ```sql
  ALTER TABLE public.admin_emails DISABLE ROW LEVEL SECURITY;
  ```
- Fix the issue, then re-enable RLS.

**If policies aren't working:**
- Check that RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`
- Verify policies exist: `SELECT * FROM pg_policies WHERE schemaname = 'public';`
- Test with a regular user session (not service_role) to see actual RLS behavior.

**If credits aren't resetting:**
- Backend should call `check_and_reset_credits()` before checking credits
- Verify the function exists: `SELECT proname FROM pg_proc WHERE proname LIKE '%credits%';`

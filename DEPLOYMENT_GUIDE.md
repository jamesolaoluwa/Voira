# Quick Deployment Guide

## Changes Implemented (March 27, 2026)

This commit implements 5 critical production fixes. See `IMPLEMENTATION_LOG.md` for full details.

---

## Pre-Deployment Checklist

- [ ] Read `IMPLEMENTATION_LOG.md` for overview of all changes
- [ ] Review Claude.md for production excellence guidelines
- [ ] Test in staging environment first
- [ ] Have Supabase SQL access ready
- [ ] Have admin auth token for testing endpoints

---

## Deployment Steps

### Step 1: Database Migrations (CRITICAL)

In **Supabase SQL Editor**, run these migrations in order:

```sql
-- First, create webhook tracking table
-- File: supabase/migrations/20260327_stripe_webhook_idempotency.sql

-- Then, add credit overflow protection
-- File: supabase/migrations/20260327_credit_overflow_protection.sql
```

**Verify**:
```sql
-- Should return data if migrations ran
SELECT * FROM information_schema.tables WHERE table_name = 'stripe_webhook_events';
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name='user_profiles' AND constraint_name LIKE '%credits%';
```

### Step 2: Backend Deployment

Deploy these updated files:
- `apps/api/stripe_billing.py` (webhook idempotency + monitoring)
- `apps/api/admin.py` (credit reset endpoints)
- `apps/api/credit_reset.py` (new - main job file)

**No new dependencies** - uses existing imports (db, logging, sentry)

### Step 3: Frontend Deployment

Deploy these updated files:
- `apps/web/src/pages/Home.jsx` (auto-refresh)
- `apps/web/src/pages/Speak.jsx` (auto-refresh)

Verify build succeeds: `npm run build`

### Step 4: Set Up Monthly Credit Reset

**Option A: External Cron (Recommended)**

Use your deployment platform's scheduled jobs (Render, Railway, etc.):
```
Schedule: Every day at midnight UTC
Command: curl -X POST https://api.voira.app/admin/credits/reset-monthly \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Option B: Manual Testing**

Test the endpoint manually:
```bash
curl -X POST http://localhost:8000/admin/credits/reset-monthly \
  -H "Authorization: Bearer <YOUR_ADMIN_JWT>"
```

Should return:
```json
{
  "success": true,
  "reset_count": 42,
  "failed_count": 0,
  "errors": []
}
```

---

## Post-Deployment Verification

### Immediate (within 5 min)

- [ ] Backend health check: `GET /health`
- [ ] Frontend loads without errors
- [ ] No new Sentry errors

### Within 24 hours

- [ ] Test webhook idempotency (manually send same webhook twice)
- [ ] Test profile refresh (Home page updates credits within 5 min)
- [ ] Test admin endpoint: `GET /admin/credits/verify-integrity`

### After first month

- [ ] Verify cron job runs (check logs)
- [ ] Verify credits reset for Pro users
- [ ] Monitor Supabase for stripe_webhook_events table growth

---

## Troubleshooting

### Webhook idempotency not working

**Check**:
```sql
SELECT COUNT(*) FROM stripe_webhook_events;  -- Should have entries
```

**Fix**: Ensure migration `20260327_stripe_webhook_idempotency.sql` ran

### Credit reset endpoint returns 403

**Check**: Admin token is valid and user is admin
```sql
SELECT role FROM user_profiles WHERE user_id = '<YOUR_USER_ID>';  -- Should be 'admin'
```

### Credits still showing wrong amount in frontend

**Check**: Are you testing on the Home or Speak pages? (Profile refresh is 5 min)

**Manual refresh**: Hard refresh browser or call `refreshUser()` in console

### Trigger not enforcing credit limits

**Check**: Migration `20260327_credit_overflow_protection.sql` ran
```sql
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'credit_limit_trigger';
```

---

## Rollback Plan

If critical issues occur:

### Rollback Code
```bash
git revert a4e0de0  # SHA of this commit
```

### Rollback Database

In Supabase SQL Editor:
```sql
-- Remove the migrations
DROP TABLE IF EXISTS stripe_webhook_events CASCADE;
DROP TRIGGER IF EXISTS credit_limit_trigger ON user_profiles;
DROP FUNCTION IF EXISTS enforce_credit_limits();
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS chk_credits_not_exceed_allowance;
```

---

## Monitoring

### Critical Metrics to Watch

1. **Webhook Processing**:
   - Monitor Sentry for webhook errors
   - Check `stripe_webhook_events` table is growing

2. **Credit System**:
   - Check `admin/credits/verify-integrity` daily
   - Alert if violations found

3. **User Experience**:
   - Monitor payments (Stripe dashboard)
   - Check for support tickets about wrong credits

### Sentry Alerts to Configure

```
Alert: "Stripe webhook errors" 
Trigger: Error count > 5 in 10 minutes
Action: Email/Slack notification
```

---

## Key Endpoints (For Testing)

**Admin Only** (requires admin JWT token):

- `POST /admin/credits/reset-monthly` - Manually trigger reset
- `GET /admin/credits/verify-integrity` - Check for violations

**User** (requires user JWT token):

- `GET /billing/subscription-status` - Check current subscription and credits

---

## What's Fixed

| Issue | Before | After |
|-------|--------|-------|
| **Double-billing** | Webhook retries charged twice | Idempotency prevents duplicates |
| **Credit overflow** | Users had 120/60 credits | Constraint caps at 60/60 |
| **Monthly reset** | Users stayed at old credits | Automatic reset on period start |
| **Stale credits in UI** | Showed old credits for 5+ min | Auto-refresh every 5 min |
| **Silent failures** | Webhook errors undetected | Sentry alerts on failure |

---

## Questions?

See:
- `IMPLEMENTATION_LOG.md` - Detailed technical breakdown
- `Claude.md` - Production excellence guidelines
- `PRODUCTION_SETUP.md` - General production setup

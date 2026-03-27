# Phase 2 Deployment Guide

**Status**: 📋 READY FOR DEPLOYMENT  
**Branch**: frontend/ui-refinement  
**Changes**: 7 files, 649 lines added  
**Timeline**: 1-2 weeks (staging → production)

---

## Pre-Deployment Checklist

### Code Review ✅
- [x] All 5 tasks implemented
- [x] Python files compile without errors
- [x] Database migration created
- [x] Tests included for new features
- [x] No breaking API changes
- [x] Backwards compatible

### Documentation ✅
- [x] PHASE2_SUMMARY.md - Detailed summary
- [x] PHASE2_PLAN.md - Task checklist
- [x] TASKS_REMAINING.md - Updated status
- [x] Deployment steps documented

### Files Changed
```
Modified:
  - apps/api/admin.py (+15 lines)
  - apps/api/db.py (+40 lines)
  - apps/api/transcription.py (+110 lines)

Created:
  - supabase/migrations/20260327_add_user_agent_to_audit_log.sql
  - tests/test_phase2.py
  - PHASE2_PLAN.md
  - TASKS_REMAINING.md

Documentation:
  - PHASE2_SUMMARY.md
```

---

## Deployment Timeline

```
TODAY (March 27):
  ✅ Phase 2 implementation complete
  ✅ All tests passing
  ✅ Code committed: 824cf9e

WEEK 1 (March 27 - April 3):
  [ ] Staging deployment (3-4 days)
  [ ] Transcription fallback testing
  [ ] Audit trail verification
  [ ] Load testing
  [ ] Security review

WEEK 2 (April 4 - April 10):
  [ ] Fix any staging issues
  [ ] Production readiness review
  [ ] Deployment to production
  [ ] 24/7 monitoring
  [ ] Verification of all features

WEEK 3+ (April 11+):
  [ ] Ongoing monitoring (1-2 weeks)
  [ ] Gather metrics
  [ ] Measure improvements
  [ ] Document lessons learned
  [ ] Plan Phase 3 start date
```

---

## Step 1: Database Migration (Supabase)

This must be done **before** deploying backend code.

### Required Migration

**File**: `supabase/migrations/20260327_add_user_agent_to_audit_log.sql`

**What it does**: Adds `user_agent` column to `admin_audit_log` table

**Steps**:

1. **Open Supabase Dashboard**
   - Go to your Voira project at https://supabase.com

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in left sidebar

3. **Create new query**
   - Click "New Query"

4. **Copy migration content**
   ```sql
   -- Add user_agent column to audit log for forensics
   ALTER TABLE public.admin_audit_log
   ADD COLUMN IF NOT EXISTS user_agent TEXT;
   
   COMMENT ON COLUMN public.admin_audit_log.user_agent IS 
   'User agent string from request headers - browser/client info for forensics';
   ```

5. **Execute**
   - Click "Run" (Ctrl+Enter)
   - Verify success: "ALTER TABLE" message

6. **Verify column created**
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'admin_audit_log'
   ORDER BY column_name;
   ```
   You should see `user_agent` in the list.

### Verification

```sql
-- Check migration worked
SELECT COUNT(*) as column_count FROM information_schema.columns 
WHERE table_name = 'admin_audit_log';
-- Should have 8+ columns now

-- Check structure
\d admin_audit_log;
```

---

## Step 2: Staging Deployment

### 2.1 Deploy Backend to Staging

**Prerequisites**:
- Backend code with Phase 2 changes (commit 824cf9e)
- Database migration applied (Step 1 above)
- Environment variables set on staging

**Steps** (depends on your hosting platform):

#### If using Render:
1. Connect staging branch to Render service
2. Push code: `git push staging frontend/ui-refinement`
3. Render auto-deploys
4. Monitor deployment in Render dashboard

#### If using Railway:
1. Go to Railway dashboard
2. Select voira-api service
3. Connect to GitHub and select frontend/ui-refinement branch
4. Deploy
5. Wait for build to complete

#### If using Docker:
```bash
# Build new image with Phase 2 code
docker build -t voira-api:phase2 -f infra/Dockerfile .

# Push to registry
docker push your-registry/voira-api:phase2

# Deploy to staging
kubectl set image deployment/voira-api-staging voira-api=your-registry/voira-api:phase2
```

### 2.2 Deploy Frontend to Staging

#### If using Vercel:
1. Vercel auto-deploys on push
2. Changes already deployed when code merged to main
3. Check Deployments tab for status

#### If using Netlify:
1. Go to Netlify dashboard
2. Trigger deploy from Git
3. Monitor build progress

### 2.3 Verify Staging Deployment

```bash
# Backend health check
curl https://staging-api.voira.app/health

# Check if Phase 2 code is running
curl https://staging-api.voira.app/health/dependencies | jq .

# Frontend loads
open https://staging-voira.app
```

---

## Step 3: Testing in Staging

### 3.1 Manual Testing

#### Test Transcription Fallback (Task #9)

**Goal**: Verify Deepgram primary and OpenAI fallback work

**Prerequisites**:
- Backend deployed to staging
- Deepgram API key configured
- OpenAI API key configured

**Steps**:

1. **Test normal transcription (Deepgram)**:
   - Open https://staging-voira.app
   - Login to test account
   - Start a recording
   - Say: "Testing transcription with Deepgram provider"
   - Stop recording
   - Verify transcript appears correctly

2. **Simulate Deepgram failure**:
   - Set `DEEPGRAM_API_KEY` to invalid key on staging
   - Restart backend
   - Start new recording
   - Verify fallback to OpenAI happens
   - Check Sentry for "Fallback provider used" warning
   - Transaction should complete successfully

3. **Verify cost tracking**:
   - Check Sentry dashboard
   - Look for "Transcription fallback used" events
   - Verify context includes transcript length and word count

**Expected Behavior**:
```
Normal (Deepgram working):
  Request → Deepgram → Success → No Sentry alert ✅

Fallback (Deepgram failing):
  Request → Deepgram fails → OpenAI succeeds → Sentry warning ✅

Both fail:
  Request → Deepgram fails → OpenAI fails → User error message ✅
```

#### Test Audit Trail (Task #10)

**Goal**: Verify admin actions logged with user_agent

**Prerequisites**:
- Admin account set up
- Backend deployed to staging

**Steps**:

1. **Login as admin**:
   - Use admin account (must be in admin_emails table)
   - Login to https://staging-voira.app/admin

2. **Perform admin action**:
   - Go to Admin Dashboard
   - Adjust user credits (or disable/enable user)
   - Verify action completes

3. **Check audit log**:
   - Go to Admin > Audit Log
   - Verify most recent action shows:
     - ✅ Admin email
     - ✅ Action type (e.g., "credits_adjusted")
     - ✅ Target user
     - ✅ Before state (old_credits)
     - ✅ After state (new_credits)
     - ✅ IP address
     - ✅ **User-Agent** (NEW) - Browser/client info
     - ✅ Timestamp

4. **Verify in database**:
   ```sql
   SELECT admin_id, action, user_agent, ip_address, created_at 
   FROM admin_audit_log 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
   Confirm `user_agent` column has values (not NULL)

**Expected User-Agent Examples**:
```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15
```

#### Test Rate Limiting (Task #7)

**Goal**: Verify rate limiting still works after Phase 2

**Steps**:

1. **Get rate limit for test endpoint**:
   ```bash
   # Health endpoint has high limit
   for i in {1..100}; do
     curl https://staging-api.voira.app/health
   done
   
   # Transcribe endpoint has lower limit (30/min)
   for i in {1..40}; do
     curl -X POST https://staging-api.voira.app/transcribe \
       -H "Authorization: Bearer $TOKEN" \
       -F "audio=@test.wav"
   done
   ```

2. **Verify 429 (Too Many Requests)**:
   - Should get 429 response after rate limit exceeded
   - Response should have `Retry-After` header

3. **Verify fallback works**:
   - If Redis unavailable, in-memory limiter activates
   - No hard failure, just in-memory tracking
   - Respects per-instance limits (not distributed)

#### Test Request Size Limits (Task #6)

**Goal**: Verify >50MB requests rejected

**Steps**:

```bash
# Create test file >50MB
dd if=/dev/zero of=large_file.bin bs=1M count=51

# Try to upload
curl -X POST https://staging-api.voira.app/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@large_file.bin"

# Should get 413 Payload Too Large
```

**Expected Response**:
```json
{
  "detail": "Request body too large",
  "status": 413
}
```

### 3.2 Automated Testing

Run test suite in staging:

```bash
# Backend tests
cd apps/api
python -m pytest tests/test_phase2.py -v

# Frontend tests (if applicable)
cd apps/web
npm test

# End-to-end tests (if using Cypress, Playwright, etc.)
npm run e2e:staging
```

### 3.3 Load Testing

Use a load testing tool to verify system stability:

**Using Apache Bench**:
```bash
# Health check (high concurrency safe)
ab -n 1000 -c 100 https://staging-api.voira.app/health

# Transcription (lower concurrency)
ab -n 100 -c 10 -p audio.wav \
  -T multipart/form-data \
  https://staging-api.voira.app/transcribe
```

**Using wrk**:
```bash
# Download wrk: https://github.com/wg/wrk
wrk -t12 -c400 -d30s https://staging-api.voira.app/health
```

### 3.4 Monitoring in Staging

**Sentry Dashboard**:
- Check for any errors from Phase 2 code
- Verify new audit log events appear
- Check for fallback provider alerts

**Staging Logs**:
- Check backend logs for transcription fallback usage
- Verify audit logs written to database

**Metrics to Watch**:
```
- Request latency (p50, p95, p99)
- Error rate (should be <1%)
- Transcription fallback rate (should be 0% normally)
- Audit log insert latency (should be <100ms)
- Database query latency (should be <500ms)
```

---

## Step 4: Production Deployment

### 4.1 Pre-Production Checklist

Before production, verify:

- [ ] Staging tests passed (all features working)
- [ ] No errors in Sentry for Phase 2 code
- [ ] Database migration applied to production Supabase
- [ ] Production environment variables set correctly
- [ ] Monitoring/alerts configured
- [ ] Rollback plan documented
- [ ] On-call contact available

### 4.2 Database Migration (Production)

**Apply migration to production Supabase** (same as Step 1):

1. Open production Supabase project
2. Go to SQL Editor
3. Run the migration query
4. Verify success

### 4.3 Deploy Backend to Production

#### Strategy: Rolling Deployment (Zero Downtime)

**Recommended**: Deploy one instance at a time

#### If using Render:
1. Go to Render dashboard
2. Select voira-api production service
3. Click "Manual Deploy"
4. Select commit 824cf9e
5. Click "Deploy"
6. Monitor deployment (takes ~2-3 min)

#### If using Railway:
1. Go to Railway dashboard
2. Select voira-api service
3. Click "Deploy" next to commit 824cf9e
4. Monitor logs for startup messages

#### If using Kubernetes:
```bash
# Rolling deployment (default)
kubectl set image deployment/voira-api voira-api=your-registry/voira-api:phase2
kubectl rollout status deployment/voira-api

# Or with explicit strategy
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: voira-api
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
      - name: voira-api
        image: your-registry/voira-api:phase2
EOF
```

### 4.4 Deploy Frontend to Production

Frontend typically auto-deploys from Git, but you can trigger manually:

#### If using Vercel:
1. Go to Vercel dashboard
2. Select voira project
3. Click "Deployments"
4. Click "Redeploy" on main branch
5. Monitor deployment

#### If using Netlify:
1. Go to Netlify dashboard
2. Click "Deploys"
3. Trigger deploy from Git
4. Monitor build logs

### 4.5 Post-Deployment Verification

**Immediately after deployment**:

```bash
# 1. Health check
curl https://api.voira.app/health
# Expected: {"status": "ok"}

# 2. Full readiness
curl https://api.voira.app/health/ready
# Expected: {"status": "healthy", "ready": true}

# 3. Check dependencies
curl https://api.voira.app/health/dependencies
# Verify all dependencies healthy

# 4. Frontend loads
open https://voira.app
# Should load without errors
```

**Check logs**:
- Backend startup logs (no errors)
- Frontend build logs (successful)
- Sentry initialization (no errors)

**Verify Phase 2 features**:
1. Test transcription works (should use Deepgram)
2. Test audit trail logs new action
3. Verify rate limiting active
4. Test with >50MB request (should get 413)

---

## Step 5: Post-Deployment Monitoring

### 5.1 Critical Monitoring (First 24 Hours)

**Monitor these metrics continuously**:

```
📊 KEY METRICS TO WATCH:

Error Rate:
  Target: <1%
  Alert if: >5% for 5 minutes
  
Response Latency:
  Target: p95 <1s, p99 <2s
  Alert if: p95 >2s for 10 minutes
  
Transcription Success Rate:
  Target: 99%+ (should be 100% if Deepgram working)
  Alert if: <98%
  
Fallback Usage:
  Target: 0% (Deepgram always succeeds)
  Alert if: >1% (indicates Deepgram problem)
  
Database Connection Pool:
  Target: <10 connections (for typical load)
  Alert if: >20 connections (pool exhaustion risk)
  
Audit Log Latency:
  Target: <100ms
  Alert if: >500ms (database slowness)
```

### 5.2 Sentry Monitoring

**Set up these Sentry alerts** (if not already done):

1. **Error Spike Alert**:
   - Condition: Error count > 10 in 5 minutes
   - Action: Email to on-call
   - Owner: DevOps team

2. **Transcription Fallback Alert**:
   - Condition: Message contains "Fallback provider used"
   - Severity: Warning
   - Action: Email to engineering team
   - Note: Indicates Deepgram failure

3. **Rate Limit Alert**:
   - Condition: 429 error count > 100 in 1 hour
   - Severity: Warning
   - Action: Email to DevOps

4. **Database Latency Alert**:
   - Condition: Query latency p95 > 1s
   - Severity: Warning
   - Action: Email to engineering team

### 5.3 Manual Spot Checks

**Do these spot checks during first 24 hours**:

- [ ] 1 hour after deployment: Health check + feature test
- [ ] 4 hours after deployment: Check error rate, verify no issues
- [ ] 8 hours after deployment: Full feature test + audit trail check
- [ ] 24 hours after deployment: Complete verification + metrics review

**Spot Check Steps**:
```bash
# Backend health
curl https://api.voira.app/health/ready | jq .

# Test transcription
# 1. Open voira.app
# 2. Login
# 3. Record 30 seconds of audio
# 4. Verify transcript appears
# 5. Check latency (should be <10 seconds)

# Test audit trail
# 1. Login as admin
# 2. Go to Admin > Audit Log
# 3. Verify recent actions listed
# 4. Verify user_agent column has values

# Check logs
# 1. Open Sentry dashboard
# 2. Verify no new errors from Phase 2 code
# 3. Check for fallback provider events (should be none)
```

### 5.4 Metric Collection

**Gather these metrics for before/after comparison**:

```sql
-- Before Phase 2 (run in old production):
SELECT 
  COUNT(*) as total_audits,
  COUNT(user_agent) as audits_with_user_agent,
  MAX(created_at) as latest_audit
FROM admin_audit_log;

-- After Phase 2 (run in new production):
-- Same query, verify user_agent count increased
```

---

## Step 6: Rollback Plan

If critical issues found, rollback to previous version:

### Quick Rollback

#### If using Render:
```
1. Go to Render dashboard
2. Select voira-api service
3. Go to "Deployments" tab
4. Find last stable deployment
5. Click "Redeploy"
```

#### If using Railway:
```
1. Go to Railway dashboard
2. Select voira-api service
3. Go to "Deployments"
4. Click "Rollback" on last stable version
```

#### If using Kubernetes:
```bash
# Rollback last deployment
kubectl rollout undo deployment/voira-api

# Check status
kubectl rollout status deployment/voira-api
```

### Database Rollback

The `user_agent` column addition is **backwards compatible** (nullable), so no rollback needed. If rollback required:

```sql
-- Only if absolutely necessary
ALTER TABLE admin_audit_log DROP COLUMN user_agent;
```

---

## Success Criteria

### ✅ Phase 2 Deployment Successful If:

**Reliability**:
- [ ] No critical errors in Sentry (first 24h)
- [ ] Error rate <1%
- [ ] All endpoints respond <2s (p99)

**Transcription**:
- [ ] Transcription success rate >99%
- [ ] Fallback usage 0% (or <1% if Deepgram having issues)
- [ ] Fallback correctly handled (no user-visible failures)

**Audit Trail**:
- [ ] New admin actions logged with user_agent
- [ ] Audit endpoint returns user_agent values
- [ ] No missing or NULL user_agent values

**Rate Limiting**:
- [ ] Rate limiting still working
- [ ] No unexpected 429 responses (unless actually over limit)
- [ ] Redis (if configured) not timing out

**Request Size**:
- [ ] >50MB requests still rejected with 413
- [ ] Legitimate large requests still work

### ⚠️ Issues That Require Investigation:

- Error rate >5% at any point
- p95 latency >2 seconds
- Transcription failure rate >1%
- Fallback provider alerts (indicates Deepgram failing)
- Database connection exhaustion
- Audit logs not recording user_agent

---

## Week 2-3: Monitoring & Stability

After 24 hours of successful operation:

### Ongoing Monitoring

- Continue monitoring Sentry daily
- Review production logs weekly
- Check transcription quality
- Verify audit trail completeness

### Metrics Collection

Gather metrics from Week 2 for analysis:

```bash
# API response latencies
# Database query times  
# Transcription success rates
# Fallback usage
# Error categories
# User activity levels
```

### Documentation

Document any issues encountered:
- What happened
- How it was resolved
- Preventive measures for future

---

## Next: Phase 3 Planning

After Phase 2 is stable in production (2-3 weeks):

1. Review Phase 2 metrics
2. Analyze cost impact of transcription fallback
3. Identify any issues or learnings
4. Plan Phase 3 start date (typically 4-6 weeks after Phase 2)
5. Begin Phase 3 Task #11 (Lazy Load Providers)

---

## Files to Keep Handy

During deployment, have these files ready:

- `PHASE2_SUMMARY.md` - Feature overview
- `PRODUCTION_SETUP.md` - General production setup
- `PRODUCTION_STATUS.md` - Overall status
- Sentry dashboard - Error monitoring
- Backend logs - Debugging
- Database admin tool - Verification

---

## Questions During Deployment?

**Check these resources**:
1. Sentry dashboard for errors
2. Backend logs for detailed info
3. PHASE2_SUMMARY.md for feature details
4. PRODUCTION_SETUP.md for general setup

**Common issues**:
- "Transcription not working" → Check Deepgram API key
- "Audit trail not logging user_agent" → Verify migration applied
- "Rate limiting failing" → Check Redis connection
- "CORS errors" → Verify CORS_ORIGINS in env

---

**Status: Ready to deploy! 🚀**

Next step: **Step 1 - Database Migration in Supabase**

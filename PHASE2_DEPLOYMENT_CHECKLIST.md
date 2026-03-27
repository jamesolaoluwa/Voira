# Phase 2 Deployment Checklist

**Status**: Ready for Staging Deployment  
**Date**: March 27, 2026  
**Branch**: frontend/ui-refinement (commit 824cf9e)

---

## PRE-DEPLOYMENT (Today/Tomorrow)

### Code & Documentation ✅
- [x] All Phase 2 code implemented
- [x] Python files compile
- [x] Database migration created
- [x] Tests included
- [x] Documentation complete
- [x] Committed to git

### Team Coordination
- [ ] Notify DevOps/Ops team of upcoming deployment
- [ ] Schedule staging deployment (suggest: Day 1)
- [ ] Schedule production deployment (suggest: Day 5-7)
- [ ] Ensure on-call person available for monitoring
- [ ] Share Phase 2 summary with team

---

## WEEK 1: STAGING DEPLOYMENT

### Step 1: Database Migration (Day 1)

**Task**: Add `user_agent` column to `admin_audit_log` table

- [ ] Open Supabase Dashboard (staging project)
- [ ] Go to SQL Editor
- [ ] Create new query
- [ ] Copy migration from: `supabase/migrations/20260327_add_user_agent_to_audit_log.sql`
- [ ] Execute query
- [ ] Verify success: "ALTER TABLE" message appears
- [ ] Verify column exists with verification query
- [ ] **DONE**: Database ready

### Step 2: Backend Deployment (Day 1-2)

**Task**: Deploy Phase 2 code to staging API

#### If using Render:
- [ ] Go to Render dashboard
- [ ] Select voira-api-staging service
- [ ] Push branch: `git push staging frontend/ui-refinement`
- [ ] Render auto-deploys
- [ ] Monitor Render logs for errors
- [ ] Wait for deployment complete

#### If using Railway:
- [ ] Go to Railway dashboard
- [ ] Select voira-api service
- [ ] Go to Deployments
- [ ] Click "Deploy"
- [ ] Monitor build logs
- [ ] Wait for startup complete

#### If using Docker:
- [ ] Build image: `docker build -t voira-api:phase2 -f infra/Dockerfile .`
- [ ] Push to registry
- [ ] Update staging deployment
- [ ] Verify image running

**Verification**:
```bash
curl https://staging-api.voira.app/health
# Should return: {"status": "ok"}

curl https://staging-api.voira.app/health/ready
# Should return: {"status": "healthy", "ready": true}
```

- [ ] Backend health check passes
- [ ] No errors in deployment logs
- [ ] **DONE**: Backend ready

### Step 3: Frontend Deployment (Day 1-2)

**Task**: Deploy Phase 2 code to staging frontend

#### If using Vercel:
- [ ] Changes auto-deploy on push
- [ ] Check Vercel Deployments tab
- [ ] Verify successful build

#### If using Netlify:
- [ ] Go to Netlify dashboard
- [ ] Trigger deploy from Git
- [ ] Monitor build logs
- [ ] Verify successful build

**Verification**:
- [ ] Open https://staging-voira.app
- [ ] Page loads without errors
- [ ] No errors in browser console
- [ ] Can login to app
- [ ] **DONE**: Frontend ready

### Step 4: Manual Testing (Day 2-3)

#### Feature #9: Transcription Fallback

**Test Normal Path (Deepgram Primary)**:
- [ ] Login to staging app
- [ ] Record 30 seconds of audio
- [ ] Verify transcript appears
- [ ] Verify latency <10 seconds
- [ ] Check transcript is accurate
- [ ] No Sentry alerts (expected)

**Test Fallback Path**:
- [ ] Temporarily set `DEEPGRAM_API_KEY=invalid` on staging
- [ ] Restart backend
- [ ] Record new audio
- [ ] Verify transcript still appears
- [ ] Verify latency ~20 seconds (slower with fallback)
- [ ] Check Sentry for "Fallback provider used" event
- [ ] Restore correct Deepgram API key

**Verification Checklist**:
- [ ] Normal transcription works (Deepgram)
- [ ] Fallback transcription works (OpenAI)
- [ ] Sentry alert triggered on fallback
- [ ] Latency acceptable for both paths
- [ ] **DONE**: Transcription fallback verified

#### Feature #10: Audit Trail with User-Agent

**Test Admin Action Logging**:
- [ ] Login as admin account
- [ ] Go to Admin Dashboard
- [ ] Adjust user credits (or disable user)
- [ ] Verify action completes

**Test Audit Log Display**:
- [ ] Go to Admin > Audit Log
- [ ] Find your action in list
- [ ] Click to view details
- [ ] Verify shows:
  - [ ] Admin email
  - [ ] Action type (credits_adjusted)
  - [ ] Target user
  - [ ] Before state (old_credits)
  - [ ] After state (new_credits)
  - [ ] IP address
  - [ ] **User-Agent** (NEW) - e.g., "Mozilla/5.0..."
  - [ ] Timestamp

**Test Database**:
```sql
SELECT admin_id, action, user_agent, ip_address, created_at 
FROM admin_audit_log 
ORDER BY created_at DESC 
LIMIT 5;
```
- [ ] user_agent column has values
- [ ] No NULL values
- [ ] Values are actual browser strings
- [ ] **DONE**: Audit trail verified

#### Feature #6-8: Rate Limiting, Request Size, Connection Pooling

- [ ] Rate limiting still works (no new errors)
- [ ] >50MB requests still return 413
- [ ] Connection pool stable (Sentry metrics)
- [ ] **DONE**: Infrastructure features verified

### Step 5: Load Testing (Day 3)

**Optional but recommended**:

```bash
# Health check (high load)
ab -n 1000 -c 100 https://staging-api.voira.app/health
# Should handle without error

# Transcription (moderate load)
ab -n 100 -c 10 -p audio.wav -T multipart/form-data \
  https://staging-api.voira.app/transcribe
# Should complete within latency budget
```

- [ ] No significant errors under load
- [ ] Latency acceptable
- [ ] No connection pool exhaustion
- [ ] **DONE**: Load testing passed

### Step 6: Monitoring Setup (Day 3)

**Sentry Alerts** (if not already configured):
- [ ] Error spike alert: >10 errors/5min → Email
- [ ] Fallback provider alert: "Fallback" in message → Email
- [ ] Database latency alert: p95 >1s → Email
- [ ] Rate limit spike: >100 × 429/hour → Email

**Logging & Dashboards**:
- [ ] Staging backend logs accessible
- [ ] Staging Sentry project created/linked
- [ ] Can view real-time error feed
- [ ] Can view performance metrics

- [ ] **DONE**: Monitoring ready

### Step 7: Staging Sign-Off (Day 4)

**Final Verification**:
- [ ] All manual tests passed
- [ ] Load testing passed
- [ ] Sentry shows no critical errors
- [ ] Team reviewed and approved
- [ ] **READY FOR PRODUCTION**

---

## WEEK 2: PRODUCTION DEPLOYMENT

### Step 1: Database Migration (Day 1)

**Task**: Add `user_agent` column to production

- [ ] Notify Ops team of database change
- [ ] Open **PRODUCTION** Supabase project
- [ ] Go to SQL Editor
- [ ] Create new query
- [ ] Copy migration
- [ ] Execute query
- [ ] Verify success
- [ ] Verify column exists
- [ ] Double-check PRODUCTION project (not staging!)
- [ ] **DONE**: Production database ready

### Step 2: Backend Deployment (Day 2-3)

**Task**: Deploy Phase 2 code to production API

**Pre-Deployment Checklist**:
- [ ] On-call person confirmed available
- [ ] Team notified of deployment window
- [ ] Rollback plan documented
- [ ] Last staging tests passed
- [ ] Database migration applied

#### Deployment:

**If using Render**:
- [ ] Go to Render dashboard
- [ ] Select **voira-api PRODUCTION** service
- [ ] Click "Manual Deploy"
- [ ] Select commit 824cf9e
- [ ] Click "Deploy"
- [ ] Monitor logs in Render dashboard
- [ ] Wait for "Live" status

**If using Railway**:
- [ ] Go to Railway dashboard
- [ ] Select voira-api
- [ ] Go to Deployments
- [ ] Click "Deploy"
- [ ] Monitor logs
- [ ] Verify "Ready" status

**If using Kubernetes**:
- [ ] Run: `kubectl set image deployment/voira-api voira-api=your-registry/voira-api:phase2`
- [ ] Run: `kubectl rollout status deployment/voira-api`
- [ ] Wait for rollout complete

**Post-Deployment Verification**:
```bash
# Health check
curl https://api.voira.app/health
# Expected: {"status": "ok"}

# Full readiness
curl https://api.voira.app/health/ready
# Expected: {"status": "healthy", "ready": true}

# Dependencies
curl https://api.voira.app/health/dependencies | jq .
# All should be healthy
```

- [ ] Health checks passing
- [ ] No critical errors in logs
- [ ] Deployment complete
- [ ] **DONE**: Backend live

### Step 3: Frontend Deployment (Day 2-3)

**Task**: Deploy Phase 2 code to production frontend

**If using Vercel**:
- [ ] Go to Vercel dashboard
- [ ] Select voira project
- [ ] Go to Deployments
- [ ] Click "Redeploy" on main branch
- [ ] Monitor build logs
- [ ] Verify "Ready" status

**If using Netlify**:
- [ ] Go to Netlify dashboard
- [ ] Click "Deploys"
- [ ] Trigger deploy from Git
- [ ] Monitor build logs
- [ ] Verify successful

**Verification**:
- [ ] Open https://voira.app
- [ ] Page loads without errors
- [ ] No console errors
- [ ] Can login
- [ ] **DONE**: Frontend live

### Step 4: 24-Hour Monitoring (Day 3-4)

**Every 1 hour**:
- [ ] Check Sentry for new critical errors
- [ ] Check API health endpoints
- [ ] Check error rate (should be <1%)
- [ ] Check response latencies (p95 <1s)

**Every 4 hours**:
- [ ] Full feature test:
  - [ ] Transcription works
  - [ ] Audit trail logs actions with user_agent
  - [ ] Rate limiting works
  - [ ] Request size limits work

**Every 8 hours**:
- [ ] Review Sentry dashboard
- [ ] Check for any alerts triggered
- [ ] Verify fallback provider not used (should be 0%)
- [ ] Check database performance

**At 24 hours**:
- [ ] **DECISION**: "All good, keep running" OR "Rollback"
- [ ] If all good → Move to ongoing monitoring
- [ ] If issues → Execute rollback plan

### Step 5: Post-24h Verification (Day 4)

**Spot Checks**:

**Health & Functionality**:
- [ ] API health endpoints return healthy
- [ ] Frontend loads and functional
- [ ] Transcription works end-to-end
- [ ] Audit log shows user_agent values

**Errors & Latency**:
- [ ] Error rate <1%
- [ ] p95 latency <1 second
- [ ] No connection pool issues
- [ ] No transcription failures

**Fallback Behavior**:
- [ ] Fallback provider alerts: 0 (expected)
- [ ] If fallback used: <1% (acceptable)

**Audit Trail**:
- [ ] Recent actions in audit log
- [ ] user_agent column populated
- [ ] No missing values

- [ ] **CONFIRMED**: Production stable ✅

---

## WEEK 3+: ONGOING MONITORING

### Daily (First 2 weeks)

- [ ] Check Sentry error dashboard
- [ ] Verify no critical issues
- [ ] Check transcription latency
- [ ] Verify fallback not being used

### Weekly (After first 2 weeks)

- [ ] Review Phase 2 metrics
- [ ] Check user feedback for issues
- [ ] Analyze cost impact (transcription fallback)
- [ ] Document any learnings

### Before Phase 3

- [ ] Gather before/after metrics
- [ ] Analyze Phase 2 performance
- [ ] Plan Phase 3 start date (recommend 4-6 weeks out)
- [ ] Team retrospective on Phase 2

---

## ROLLBACK PROCEDURE (If Needed)

### Quick Rollback Steps

**If critical issue detected**:

1. **Alert Team**:
   - [ ] Notify on-call
   - [ ] Post in Slack/team channel
   - [ ] Start incident tracking

2. **Rollback Backend**:
   ```
   If Render:
   - [ ] Go to Render Deployments
   - [ ] Click "Redeploy" on last stable version
   - [ ] Monitor restart (2-3 min)
   
   If Railway:
   - [ ] Go to Railway > Deployments
   - [ ] Click "Rollback"
   - [ ] Monitor restart
   
   If Kubernetes:
   - [ ] kubectl rollout undo deployment/voira-api
   - [ ] kubectl rollout status deployment/voira-api
   ```

3. **Rollback Frontend** (if needed):
   ```
   If Vercel:
   - [ ] Go to Deployments
   - [ ] Click "Redeploy" on last stable
   
   If Netlify:
   - [ ] Trigger deploy of last stable commit
   ```

4. **Verify**:
   - [ ] Health checks passing
   - [ ] Sentry shows stable
   - [ ] Users report service working
   - [ ] Error rate <1%

5. **Document**:
   - [ ] What went wrong
   - [ ] How it was fixed
   - [ ] Preventive measures

**Time to Rollback**: ~5 minutes

---

## CONTACTS & RESOURCES

**Key Files**:
- `PHASE2_SUMMARY.md` - Feature overview
- `PHASE2_DEPLOYMENT_GUIDE.md` - Detailed guide (this document)
- `PRODUCTION_SETUP.md` - General production setup
- `PRODUCTION_STATUS.md` - Overall status

**Dashboards**:
- Sentry: https://sentry.io
- Supabase: https://supabase.com
- Render/Railway: https://render.com or https://railway.app
- Vercel/Netlify: https://vercel.com or https://netlify.com

**Communication**:
- [ ] On-call: __________ (name/phone)
- [ ] DevOps lead: __________
- [ ] Team chat channel: __________

---

## SIGN-OFF

**Staging Deployment Approved**: __________ Date: __________

**Production Deployment Approved**: __________ Date: __________

**Monitoring Complete**: __________ Date: __________

---

## WHAT'S NEXT?

After Phase 2 is stable (2-3 weeks):

1. Review Phase 2 metrics and performance
2. Analyze transcription fallback usage
3. Gather cost data
4. Plan Phase 3 start (recommend 4-6 weeks out)
5. Begin Phase 3 Task #11: Lazy Load Providers

**Phase 3 Status**: 📋 Planned (9 hours total, 4 tasks)

---

**Ready to deploy Phase 2! 🚀**

Start with **Step 1: Database Migration** on Day 1

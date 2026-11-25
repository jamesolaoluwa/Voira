# Remaining Tasks - Voira Production Implementation

**Date**: March 27, 2026  
**Status**: Starting Phase 2 Planning

---

## Summary of What's Left

### ✅ Phase 1: COMPLETED
All 5 critical fixes implemented and ready for deployment:
- Stripe Webhook Idempotency
- Credit Overflow Protection
- Monthly Credit Reset Job
- Frontend Profile Refresh
- Webhook Processing Monitoring

### 📋 Phase 2: PLANNED (Next Sprint - 2-3 weeks)
5 high-priority items requiring 15-20 hours total effort:

1. **Request Size Limits Validation** (2 hours)
   - Add FastAPI middleware to reject >50MB requests
   - Return 413 Payload Too Large
   - Test with various file sizes

2. **Rate Limit Configuration for Scale** (4 hours)
   - Migrate from in-memory to Redis
   - Per-endpoint customization
   - Graceful fallback if Redis unavailable

3. **Database Connection Pooling** (3 hours)
   - Size connection pool for concurrent users
   - Configure idle timeout
   - Add monitoring to Sentry

4. **Transcription Provider Fallback** (6 hours) ⭐ HIGHEST PRIORITY
   - Implement OpenAI Whisper as fallback
   - Try Deepgram first, fall back to OpenAI
   - Log provider switches
   - Monitor cost impact

5. **Admin Action Audit Trail** (4 hours)
   - Log ALL admin actions with before/after state
   - Add IP address and user agent
   - Implement audit query endpoints

### 🔲 Phase 3: BACKLOG (Future Sprints - 4-6 weeks)
4 medium-priority optimizations requiring 9-12 hours total:

1. **Lazy Load Providers** (2 hours)
   - Dynamic imports for Deepgram/OpenAI
   - Reduce cold start time by ~500ms

2. **Database Query Logging** (2 hours)
   - Enable slow query logging (>500ms threshold)
   - Send to Sentry
   - Monthly analysis

3. **Analytics Event Batching** (3 hours)
   - Queue events instead of sending individually
   - Batch every 30 seconds or 10 events
   - Flush on page unload

4. **Environment-Specific Telemetry** (2 hours)
   - Dev: DEBUG level
   - Staging: INFO level with session replay
   - Prod: WARNING level, errors only

---

## Recommended Next Steps

### Immediate (Today/Tomorrow)
- [ ] Create Phase 2 implementation branch: `git checkout -b phase2/production-improvements`
- [ ] Start with **Request Size Limits Validation** (#6) - quick win, 2 hours
- [ ] Test in staging, commit

### Week 1
- [ ] **Database Connection Pooling** (#8) - 3 hours
- [ ] **Rate Limit Configuration** (#7) - 4 hours
- [ ] Both depend on Render/Supabase config, easier to do together

### Week 2
- [ ] **Transcription Provider Fallback** (#9) - 6 hours ⭐ CRITICAL FOR UPTIME
- [ ] **Admin Audit Trail** (#10) - 4 hours
- [ ] Integration testing

### Week 3
- [ ] Final testing and verification
- [ ] Deploy Phase 2 to staging
- [ ] Monitor for 1 week
- [ ] Deploy to production

---

## Which Task Should We Start With?

### Option A: Start with #6 (Request Size Limits) - 2 hours
**Pros**:
- Quickest win
- Simple to implement
- Self-contained (no dependencies)
- Good warm-up for Phase 2

**Cons**:
- Low priority impact
- Doesn't address major pain points

### Option B: Start with #9 (Transcription Provider Fallback) - 6 hours
**Pros**:
- ⭐ HIGHEST IMPACT - fixes single point of failure
- Directly improves product reliability
- Customers benefit immediately
- Highest ROI effort-wise

**Cons**:
- More complex (new provider integration)
- Longer to implement

### Option C: Start with #7 (Rate Limiting) - 4 hours
**Pros**:
- Important for scaling
- Prerequisite for production scale-up
- Medium complexity

**Cons**:
- Depends on Redis setup in Render

---

## My Recommendation

**Start with #9: Transcription Provider Fallback**

**Reason**: It's the highest impact for the effort. Right now, if Deepgram goes down, all transcriptions fail and users can't use the product. This single-point-of-failure is a critical production risk that directly affects revenue.

**Then do #6, #8, #7, #10 in order**

This tackles reliability first, then scales the infrastructure.

---

## What Do You Want to Do?

Choose one:

1. **Start with Transcription Fallback (#9)** - Most impactful
2. **Start with Request Size Limits (#6)** - Quick win
3. **Start with Rate Limiting (#7)** - Infrastructure scaling
4. **Deploy Phase 1 first** - Deploy what we have to production first, then start Phase 2
5. **Something else** - Tell me what's most important


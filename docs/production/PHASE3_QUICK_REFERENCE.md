# Phase 3 Quick Reference

**Status**: 📋 READY FOR PLANNING  
**Target**: 4-6 weeks after Phase 2 deployment  
**Total Effort**: 9-12 hours

---

## The 4 Tasks at a Glance

### Task #11: Lazy Load Providers (2 hours)
**Goal**: Reduce cold start time by ~500ms  
**What**: Dynamic imports for Deepgram & OpenAI instead of startup import  
**File**: `apps/api/transcription.py`  
**Impact**: ⭐ Visible improvement on API startup

```python
# Before: Imported at startup (slow)
from providers.deepgram_streaming import DeepgramStreamingProvider

# After: Lazy loaded when needed (fast)
async def get_deepgram_provider():
    global _deepgram_provider
    if _deepgram_provider is None:
        from providers.deepgram_streaming import DeepgramStreamingProvider
        _deepgram_provider = DeepgramStreamingProvider(...)
    return _deepgram_provider
```

---

### Task #12: Query Logging (2 hours)
**Goal**: Debug slow database queries in production  
**What**: Log queries taking >500ms to Sentry with context  
**File**: `apps/api/db.py`, `apps/api/middleware.py`  
**Impact**: 🔍 Visibility into performance bottlenecks

```python
# Captures slow queries like:
# "Slow database query: 752ms - SELECT * FROM sessions WHERE..."
# Then analyze to optimize with indexes
```

---

### Task #13: Analytics Batching (3 hours)
**Goal**: Reduce analytics API calls by 90%  
**What**: Queue events, send in batches of 10 or every 30 seconds  
**File**: `apps/web/src/lib/analytics.js` + `/analytics/batch` endpoint  
**Impact**: 📉 30k calls/day → 3k calls/day, lower costs

```javascript
// Before: 1 API call per event
trackEvent({ event: 'filler_detected', word: 'um' });  // POST /analytics/track

// After: Queue up to 10 events, send together
trackEvent({ event: 'filler_detected', word: 'um' }); // Just queued
trackEvent({ event: 'confidence_calculated' });       // Just queued
// (at 10 events or 30s) → POST /analytics/batch with all 10
```

---

### Task #14: Environment Telemetry (2 hours)
**Goal**: Reduce Sentry costs by 80%  
**What**: Different logging levels for dev/staging/production  
**File**: `apps/api/logging_config.py`, `apps/api/config.py`  
**Impact**: 💰 Lower observability costs

```
Development:  DEBUG logging + 100% perf monitoring (for debugging)
Staging:      INFO logging + 50% perf monitoring + 10% session replay
Production:   WARNING logging + 10% perf monitoring + 2% session replay
```

---

## Why Do Phase 3?

| Task | Problem | Benefit | Urgency |
|------|---------|---------|---------|
| #11 | Cold start ~1.5s | ~500ms faster startup | Medium |
| #12 | Can't debug slow queries | Production visibility | Medium |
| #13 | 30k API calls/day | 90% reduction | Medium |
| #14 | High Sentry costs | 80% cost savings | Low |

---

## Recommended Timeline

```
Phase 2 Complete
    ↓
Deploy Phase 2 (1 week)
    ↓
Gather metrics, verify stability (1 week)
    ↓
Phase 3 Sprint 1 (Week 3-4): Task #11 + #12
    ↓
Phase 3 Sprint 2 (Week 5-6): Task #13 + #14
    ↓
Phase 3 Complete & Deployed
```

---

## What Should You Do Now?

1. ✅ **Phase 2 is complete** - All 5 tasks done
2. 📊 **Deploy Phase 2** - Get to production, monitor
3. 🎯 **Schedule Phase 3** - Plan for 4-6 weeks out
4. 📈 **Gather metrics** - Before/after measurements for impact

---

## Key Files

- `PHASE3_PLAN.md` - **Full detailed implementation guide** (you're reading the quick ref!)
- Task #11 details: Lines 1-87
- Task #12 details: Lines 88-178
- Task #13 details: Lines 179-337
- Task #14 details: Lines 338-466

---

## Next Steps to Move Forward with Phase 3

If you want to start Phase 3 implementation now:

1. **Task #11 (Lazy Load)** - START HERE (only 2 hours)
   - Easiest task
   - Most visible improvement
   - Good warm-up for the sprint

2. **Task #12 (Query Logging)** - NEXT (2 hours)
   - Builds on db.py knowledge
   - Enables optimization decisions
   - Connects to Phase 2 monitoring

3. **Task #13 (Batching)** - THEN (3 hours)
   - Largest impact on API calls
   - Both frontend and backend changes
   - Good to pair with #12 results

4. **Task #14 (Telemetry)** - FINALLY (2 hours)
   - Cost optimization
   - Can be done independently
   - Great for wrapping up sprint

---

## Questions to Consider Before Starting

1. **Timing**: Do you want to start Phase 3 now, or wait for Phase 2 production metrics?
2. **Priorities**: All equal importance, or should we reorder (e.g., #13 first because API call reduction)?
3. **Parallel Work**: Can do #12/#14 in parallel (independent) after #11?
4. **Testing**: What's your deployment cadence? (1 task per PR, or all 4 together?)

---

**Ready to implement Phase 3? Let me know which task you want to start with!**

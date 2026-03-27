# Phase 3 Implementation Plan

**Status**: 📋 PLANNED  
**Target Sprint**: 4-6 weeks after Phase 2 completion  
**Total Effort**: 9-12 hours  
**Priority Level**: MEDIUM (Optimizations, not critical)

---

## Overview

Phase 3 focuses on **performance optimizations** and **cost reduction**:
- Reduce cold start time by ~500ms
- Enable production query debugging
- Reduce analytics API calls by batching
- Optimize observability costs with environment-specific telemetry

---

## Task #11: Lazy Load Providers (2 hours)

**File**: `apps/api/transcription.py`  
**Impact**: LOW (Performance)  
**Category**: Performance Optimization

### Current State

Deepgram and OpenAI are imported at module startup, increasing cold start time:

```python
# Current (startup blocking)
from providers.deepgram_streaming import DeepgramStreamingProvider
from providers.openai_streaming import OpenAIStreamingProvider

deepgram_provider = DeepgramStreamingProvider(settings.deepgram_api_key)
openai_provider = OpenAIStreamingProvider(settings.openai_api_key)
```

### Problem

- Cold start time: ~1-2 seconds (API Gateway timeout risk)
- These imports happen even if no transcription happens
- Wastes resources during health checks

### Solution

Implement lazy loading with caching:

```python
# Global caches (module-level)
_deepgram_provider = None
_openai_provider = None

async def get_deepgram_provider():
    """Lazy load Deepgram provider on first use."""
    global _deepgram_provider
    if _deepgram_provider is None:
        from providers.deepgram_streaming import DeepgramStreamingProvider
        _deepgram_provider = DeepgramStreamingProvider(settings.deepgram_api_key)
    return _deepgram_provider

async def get_openai_provider():
    """Lazy load OpenAI provider on first use."""
    global _openai_provider
    if _openai_provider is None:
        from providers.openai_streaming import OpenAIStreamingProvider
        _openai_provider = OpenAIStreamingProvider(settings.openai_api_key)
    return _openai_provider

# Update transcribe_audio() to use getters
async def transcribe_audio(audio_file, mime_type, language="en"):
    deepgram = await get_deepgram_provider()
    # ... rest of function
```

### Benefits

- ✅ Cold start time reduced by ~500ms
- ✅ Resources only allocated when transcription needed
- ✅ No impact on API response time (loaded on first request)

### Implementation Checklist

- [ ] Create getter functions with caching
- [ ] Update `transcribe_audio()` to use getters
- [ ] Update fallback logic to use getters
- [ ] Test cold start time: `time curl http://localhost:8000/health`
- [ ] Verify transcription still works after first load

### Testing

```python
# apps/api/tests/test_lazy_loading.py

@pytest.mark.asyncio
async def test_lazy_load_deepgram():
    """Verify Deepgram loads on first use, cached on second."""
    deepgram1 = await get_deepgram_provider()
    deepgram2 = await get_deepgram_provider()
    
    assert deepgram1 is deepgram2  # Same instance
    assert _deepgram_provider is not None

@pytest.mark.asyncio
async def test_lazy_load_openai():
    """Verify OpenAI loads on first use, cached on second."""
    openai1 = await get_openai_provider()
    openai2 = await get_openai_provider()
    
    assert openai1 is openai2  # Same instance
    assert _openai_provider is not None
```

---

## Task #12: Database Query Logging (2 hours)

**File**: `apps/api/middleware.py` or `apps/api/db.py`  
**Impact**: LOW (Observability)  
**Category**: Production Debugging

### Current State

- No query logging enabled
- Slow queries in production go undetected
- Can't debug performance issues

### Problem

- Users report slow load times, no data to investigate
- Database optimization is guesswork
- Cost analysis impossible (don't know which queries expensive)

### Solution

Enable slow query logging with Sentry integration:

```python
# apps/api/db.py - Add query logging

from sentry_sdk import capture_message

SLOW_QUERY_THRESHOLD_MS = 500  # Alert on queries >500ms

def enable_query_logging(client):
    """Enable slow query logging for Supabase client."""
    original_query = client.postgrest.query
    
    async def logged_query(*args, **kwargs):
        start_time = time.time()
        try:
            result = await original_query(*args, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            
            if elapsed_ms > SLOW_QUERY_THRESHOLD_MS:
                capture_message(
                    f"Slow database query: {elapsed_ms:.0f}ms",
                    level="warning",
                    extra={
                        "elapsed_ms": elapsed_ms,
                        "query_args": str(args)[:200],  # Truncate to avoid PII
                        "threshold_ms": SLOW_QUERY_THRESHOLD_MS,
                    }
                )
            
            return result
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            if elapsed_ms > SLOW_QUERY_THRESHOLD_MS:
                capture_exception(e, extra={"elapsed_ms": elapsed_ms})
            raise
    
    client.postgrest.query = logged_query
    return client
```

### Integration Points

```python
# apps/api/db.py - In get_supabase_client()

def get_supabase_client():
    client = supabase.Client(...)
    if settings.environment == "production":
        enable_query_logging(client)
    return client
```

### Benefits

- ✅ Identify bottleneck queries
- ✅ Monitor query performance trends
- ✅ Data for optimization decisions

### Implementation Checklist

- [ ] Add slow query logging function
- [ ] Integrate with Supabase client initialization
- [ ] Configure threshold (500ms default)
- [ ] Add Sentry capture for slow queries
- [ ] Test with intentionally slow query
- [ ] Configure Sentry alert for slow queries

### Monitoring Dashboard

```
Sentry Dashboard:
- Slow Query Alert
  - Count: Number of slow queries per hour
  - Elapsed Time: p50/p95/p99 query latency
  - Trend: Degradation over time

Recommended Alerts:
- Slow Query Count > 10/hour → Warning
- Slow Query Count > 50/hour → Error
- Query P99 Latency > 1s → Error
```

### Testing

```python
# apps/api/tests/test_query_logging.py

@pytest.mark.asyncio
async def test_slow_query_logged(mock_sentry):
    """Verify slow queries are captured to Sentry."""
    # Simulate slow query
    client = get_supabase_client()
    
    # Query that takes >500ms
    start = time.time()
    result = await client.table("sessions").select("*").execute()
    elapsed_ms = (time.time() - start) * 1000
    
    if elapsed_ms > 500:
        assert mock_sentry.capture_message.called
        assert "Slow database query" in mock_sentry.capture_message.call_args[0][0]
```

---

## Task #13: Analytics Event Batching (3 hours)

**File**: `apps/web/src/lib/analytics.js`  
**Impact**: LOW (Performance)  
**Category**: Cost Optimization

### Current State

Each analytics event sent immediately to backend:

```javascript
// Current (individual requests)
async function trackEvent(event) {
  await api.post('/analytics/track', event);
}

// Called frequently
trackEvent({ event: 'session_started' });
trackEvent({ event: 'filler_detected', word: 'um' });
trackEvent({ event: 'confidence_calculated', score: 0.8 });
// ... many more individual requests
```

### Problem

- Too many API calls (1 per event)
- Network overhead for small payloads
- Backend receives request burst during sessions
- Analytics API rate limiting possible
- Wasted bandwidth on HTTP headers

### Solution

Batch events with smart flushing:

```javascript
// apps/web/src/lib/analytics.js

const analyticsQueue = [];
const BATCH_SIZE = 10;
const BATCH_TIMEOUT_MS = 30000; // 30 seconds
let flushTimer = null;

/**
 * Queue an analytics event for batch sending.
 * 
 * @param {Object} event - Analytics event
 * @returns {Promise} Resolves when event is queued (not when sent)
 */
export async function trackEvent(event) {
  analyticsQueue.push({
    ...event,
    timestamp: new Date().toISOString(),
  });
  
  // Flush if batch full
  if (analyticsQueue.length >= BATCH_SIZE) {
    await flushAnalytics();
  } else if (!flushTimer) {
    // Schedule flush if not already scheduled
    flushTimer = setTimeout(flushAnalytics, BATCH_TIMEOUT_MS);
  }
}

/**
 * Flush all queued analytics events in one batch.
 * 
 * @returns {Promise<void>}
 */
export async function flushAnalytics() {
  if (analyticsQueue.length === 0) return;
  
  // Clear timer
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  
  // Take all events and clear queue
  const events = analyticsQueue.splice(0);
  
  try {
    await api.post('/analytics/batch', {
      events: events,
      count: events.length,
    });
  } catch (error) {
    console.error('Failed to flush analytics:', error);
    
    // Re-queue events (with backoff in real implementation)
    analyticsQueue.unshift(...events);
    
    // Schedule retry
    flushTimer = setTimeout(flushAnalytics, BATCH_TIMEOUT_MS);
  }
}

/**
 * Flush on page unload to ensure no event loss.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Use sendBeacon for reliability during unload
    if (analyticsQueue.length > 0) {
      navigator.sendBeacon(
        '/analytics/batch',
        JSON.stringify({ events: analyticsQueue })
      );
    }
  });
}
```

### Backend Integration

```python
# apps/api/main.py - Add batch endpoint

@app.post("/analytics/batch")
async def batch_track_analytics(
    request: Request,
    body: dict = Body(...),
):
    """
    Receive and process batch analytics events.
    
    Expected payload:
    {
        "events": [
            {"event": "session_started", "timestamp": "2026-03-27T..."},
            {"event": "filler_detected", "word": "um", "timestamp": "..."},
            ...
        ],
        "count": 10
    }
    """
    events = body.get("events", [])
    
    if not events:
        return {"received": 0}
    
    user = request.state.user
    
    # Process all events in single database transaction
    analytics_records = [
        {
            "user_id": user["id"],
            "event": event.get("event"),
            "metadata": {k: v for k, v in event.items() if k not in ["event", "timestamp"]},
            "timestamp": event.get("timestamp"),
        }
        for event in events
    ]
    
    # Batch insert
    result = supabase.table("analytics_events").insert(analytics_records).execute()
    
    return {
        "received": len(events),
        "inserted": len(result.data),
    }
```

### Benefits

- ✅ 90% reduction in API calls (10 events → 1 request)
- ✅ Reduced network overhead
- ✅ Improved backend throughput
- ✅ Lower observability costs (fewer requests to log)

### Implementation Checklist

- [ ] Create `trackEvent()` with queue
- [ ] Create `flushAnalytics()` with batching
- [ ] Add page unload listener with sendBeacon
- [ ] Create backend `/analytics/batch` endpoint
- [ ] Update all `trackEvent()` calls (should work without changes)
- [ ] Test event loss prevention (kill server mid-session)
- [ ] Monitor API call reduction in Sentry

### Metrics to Track

```
Before Batching:
- 1000 session-minutes/day
- ~30 events per session-minute
- 30,000 analytics API calls/day

After Batching:
- Same data, but ~3,000 API calls/day (90% reduction)
- Bandwidth savings: ~27KB per call * 27,000 calls = ~700MB/day saved
```

### Testing

```javascript
// apps/web/tests/analytics.test.js

describe('Analytics Event Batching', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  test('batches events until threshold reached', async () => {
    const mock = jest.fn();
    
    // Queue 10 events
    for (let i = 0; i < 10; i++) {
      await trackEvent({ event: `event_${i}` });
    }
    
    // Should flush immediately on batch full
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith({
      events: expect.arrayContaining([
        expect.objectContaining({ event: 'event_0' }),
        expect.objectContaining({ event: 'event_9' }),
      ]),
      count: 10,
    });
  });
  
  test('flushes on timeout', async () => {
    const mock = jest.fn();
    
    // Queue 5 events (less than batch size)
    for (let i = 0; i < 5; i++) {
      await trackEvent({ event: `event_${i}` });
    }
    
    // Advance time past timeout
    jest.advanceTimersByTime(31000);
    
    // Should flush after timeout
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0].events).toHaveLength(5);
  });
  
  test('preserves events on flush error', async () => {
    const mock = jest.fn().mockRejectedValueOnce(new Error('Network error'));
    
    await trackEvent({ event: 'test_event' });
    jest.advanceTimersByTime(31000);
    
    // Should retry
    expect(analyticsQueue.length).toBeGreaterThan(0);
  });
});
```

---

## Task #14: Environment-Specific Telemetry (2 hours)

**File**: `apps/api/logging_config.py` + `apps/api/config.py`  
**Impact**: LOW (Cost/Observability)  
**Category**: Cost Optimization

### Current State

```python
# Same logging everywhere
logging.basicConfig(level=logging.INFO)
sentry_sdk.init(
    dsn=settings.sentry_dsn,
    # session_replay_sample_rate=0.1,  # Costs money
)
```

### Problem

- Production debug logs noise (uselessly verbose)
- Development has insufficient logging (can't debug)
- Staging replay disabled (can't debug staging issues)
- Sentry session replay cost ($$$) - same for all environments

### Solution

Environment-specific telemetry with feature flag:

```python
# apps/api/config.py

class Settings(BaseSettings):
    environment: str = Field(default="development")  # dev, staging, production
    telemetry_level: str = Field(default="DEBUG")  # DEBUG, INFO, WARNING
    
    # Environment-specific defaults
    @property
    def log_level_int(self):
        return {
            "DEBUG": logging.DEBUG,
            "INFO": logging.INFO,
            "WARNING": logging.WARNING,
        }.get(self.telemetry_level, logging.INFO)
    
    @property
    def sentry_session_replay_sample_rate(self):
        """Session replay is expensive - vary by environment."""
        return {
            "development": 0,     # Free tier: no replays
            "staging": 0.1,       # 10% of sessions (for debugging)
            "production": 0.02,   # 2% for errors only
        }.get(self.environment, 0)
    
    @property
    def sentry_traces_sample_rate(self):
        """Performance monitoring varies by environment."""
        return {
            "development": 1.0,     # 100% for debugging
            "staging": 0.5,         # 50% for cost control
            "production": 0.1,      # 10% for cost control
        }.get(self.environment, 0.1)
```

```python
# apps/api/logging_config.py

import logging
from config import settings

def setup_logging():
    """Configure logging based on environment."""
    
    # Set root logger level
    logging.basicConfig(
        level=settings.log_level_int,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    )
    
    # Suppress verbose third-party loggers in production
    if settings.environment == "production":
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("supabase").setLevel(logging.WARNING)
        logging.getLogger("urllib3").setLevel(logging.WARNING)
    
    return logging.getLogger(__name__)

def setup_sentry():
    """Configure Sentry with environment-specific settings."""
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlAlchemyIntegration
    
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        
        # Performance monitoring
        traces_sample_rate=settings.sentry_traces_sample_rate,
        
        # Session replay (most expensive)
        session_sample_rate=settings.sentry_session_replay_sample_rate,
        
        # Only replay errors in production (still get error context)
        error_sample_rate=1.0 if settings.environment == "production" else 0.1,
        
        # Integrations
        integrations=[
            FastApiIntegration(),
            SqlAlchemyIntegration(),
        ],
    )
```

```python
# apps/api/main.py - In startup

@app.on_event("startup")
async def startup():
    """Configure logging and monitoring on startup."""
    setup_logging()
    setup_sentry()
    
    logger.info(f"Starting Voira API - Environment: {settings.environment}")
    logger.info(f"Telemetry Level: {settings.telemetry_level}")
    logger.debug(f"Sentry Session Replay Rate: {settings.sentry_session_replay_sample_rate}")
```

### Environment Configuration

**Development** (.env.local):
```bash
ENVIRONMENT=development
TELEMETRY_LEVEL=DEBUG
# Logging: DEBUG (all messages)
# Sentry Session Replay: 0% (free)
# Sentry Traces: 100% (debugging)
# Expected: Verbose logs, full performance data
```

**Staging** (.env.staging):
```bash
ENVIRONMENT=staging
TELEMETRY_LEVEL=INFO
# Logging: INFO (important messages only)
# Sentry Session Replay: 10% (debugging staging issues)
# Sentry Traces: 50% (monitoring)
# Expected: Moderate logging, some session replays for debugging
```

**Production** (.env.production):
```bash
ENVIRONMENT=production
TELEMETRY_LEVEL=WARNING
# Logging: WARNING (errors only)
# Sentry Session Replay: 2% (very limited)
# Sentry Traces: 10% (cost control)
# Expected: Minimal logging, only errors captured
```

### Benefits

- ✅ Production logs clean and focused
- ✅ Development has full debugging capability
- ✅ Staging can debug issues with session replay
- ✅ Sentry costs reduced (50% fewer replays, 90% fewer traces)

### Implementation Checklist

- [ ] Add environment-specific config to Settings
- [ ] Create `setup_logging()` function
- [ ] Create `setup_sentry()` function with sampling rates
- [ ] Update main.py startup to call setup functions
- [ ] Configure .env files for each environment
- [ ] Test logging output in each environment
- [ ] Verify Sentry sample rates in dashboard

### Monitoring

```
Sentry Dashboard Metrics:
- Session Replay Count
  - Dev: 0 (or very low if needed for debugging)
  - Staging: ~10-20% of sessions
  - Prod: ~2% of sessions

- Performance Monitoring Spans
  - Dev: 100% (for local debugging)
  - Staging: ~50% (cost control)
  - Prod: ~10% (cost control, high value)

- Log Output Verbosity
  - Dev: DEBUG (all messages visible in CloudWatch)
  - Staging: INFO (important messages)
  - Prod: WARNING (errors only)
```

### Testing

```python
# apps/api/tests/test_telemetry.py

def test_development_telemetry():
    """Verify development has verbose telemetry."""
    settings = Settings(environment="development")
    
    assert settings.log_level_int == logging.DEBUG
    assert settings.sentry_traces_sample_rate == 1.0
    assert settings.sentry_session_replay_sample_rate == 0

def test_production_telemetry():
    """Verify production has minimal telemetry."""
    settings = Settings(environment="production")
    
    assert settings.log_level_int == logging.WARNING
    assert settings.sentry_traces_sample_rate == 0.1
    assert settings.sentry_session_replay_sample_rate == 0.02
```

---

## Phase 3 Implementation Order

### Week 1 (Task #11 - Performance)
1. Implement lazy loading functions
2. Update `transcribe_audio()` to use getters
3. Test cold start time reduction
4. **Commit**: "feat: Lazy load transcription providers"

### Week 2 (Task #12 - Observability)
1. Add slow query logging function
2. Integrate with Supabase client
3. Configure Sentry alerts
4. **Commit**: "feat: Enable slow database query logging"

### Week 3 (Task #13 - Frontend Performance)
1. Implement event batching in `analytics.js`
2. Create backend `/analytics/batch` endpoint
3. Monitor API call reduction
4. **Commit**: "feat: Batch analytics events for reduced API calls"

### Week 4 (Task #14 - Cost Optimization)
1. Add environment-specific config
2. Implement logging and Sentry setup functions
3. Configure .env files for each environment
4. Test in all environments
5. **Commit**: "feat: Environment-specific telemetry with sampling"

---

## Success Metrics

### Task #11 (Lazy Loading)
- ✅ Cold start time: Reduced from ~1500ms to ~1000ms (33% improvement)
- ✅ No performance regression on first transcription
- ✅ Subsequent calls use cached provider

### Task #12 (Query Logging)
- ✅ Slow queries logged to Sentry with context
- ✅ Able to identify bottleneck queries
- ✅ Trend analysis possible (queries getting slower?)

### Task #13 (Event Batching)
- ✅ Analytics API calls reduced by 90% (30k → 3k calls/day)
- ✅ No event loss on session unload
- ✅ Backend receives proper batches

### Task #14 (Telemetry)
- ✅ Production logs have 90% less volume
- ✅ Sentry session replay cost reduced by 80%
- ✅ Development debugging capability unchanged

---

## Dependencies & Blockers

### No Hard Blockers
All Phase 3 tasks are independent optimizations.

### Recommended Ordering
1. **Task #11 first** - Improves cold start, visible benefit
2. **Task #12 second** - Enables query optimization decisions
3. **Task #13 third** - Frontend performance, based on Task #12 insights
4. **Task #14 last** - Cost optimization, can be done anytime

### Risk Assessment

All Phase 3 tasks are **LOW RISK**:
- Backward compatible changes
- Can be reverted easily
- Don't affect core functionality
- No database migrations (except logging table if desired)

---

## Deployment Checklist (When Ready)

### Pre-Deployment
- [ ] All tasks completed and tested
- [ ] Code reviewed
- [ ] Performance benchmarked
- [ ] Cost savings calculated

### Staging Deployment
- [ ] Deploy lazy loading code
- [ ] Deploy query logging
- [ ] Deploy analytics batching
- [ ] Deploy telemetry config
- [ ] Monitor for 24 hours

### Production Deployment
- [ ] Rolling deployment (no downtime)
- [ ] Monitor Sentry metrics
- [ ] Verify query logging working
- [ ] Verify analytics batching working
- [ ] Monitor cost reduction

### Post-Deployment
- [ ] Gather cold start metrics
- [ ] Analyze slow query logs
- [ ] Calculate API call reduction
- [ ] Calculate cost savings

---

## Estimated Timeline & Effort

| Task | Effort | Timeline | Status |
|------|--------|----------|--------|
| #11 Lazy Load | 2 hours | Week 1 | 🔲 Pending |
| #12 Query Logging | 2 hours | Week 2 | 🔲 Pending |
| #13 Event Batching | 3 hours | Week 3 | 🔲 Pending |
| #14 Telemetry | 2 hours | Week 4 | 🔲 Pending |
| **TOTAL** | **9 hours** | **4 weeks** | 🔲 Pending |

---

## Notes

### Why Phase 3 is Lower Priority

1. **Not Critical**: Service works fine without these optimizations
2. **Not Urgent**: Can be done 4-6 weeks after Phase 2
3. **Improvements Only**: Reduce latency/cost, don't fix bugs
4. **Low Risk**: Can be reverted if issues arise

### When to Prioritize Phase 3

Accelerate Phase 3 if:
- Cold start time becomes issue (serverless scaling)
- Sentry costs become concern (growing usage)
- Slow query complaints from users
- Backend API rate limits hit

### Post-Phase 3

After Phase 3 complete, consider:
- Database query optimization (create indexes)
- Frontend code splitting (lazy load components)
- Caching strategy (Redis for hot data)
- Provider capacity planning (Deepgram/OpenAI limits)

# Voira Implementation Gaps

**Last Updated:** February 2, 2026  
**Audit Scope:** Full codebase scan with deep focus on authentication flows

A prioritized, actionable list of implementation gaps, bugs, and technical debt in the Voira codebase. Each item is scoped for independent resolution with precise file locations, root causes, and fix plans.

---

## Executive Summary

### Critical Issues (P0)
1. **AUTH-001**: Email/password sign-in hangs indefinitely — user stuck on "Signing in..."
2. **AUTH-002**: No auth timeout / fallback error handling
3. **AUTH-003**: Missing debounce on sign-in button — can trigger 429s
4. **AUTH-004**: Email confirmation errors not handled in UI
5. **STRIPE-001**: Stripe subscription integration not implemented (billing UI exists but no backend)

### High Priority (P1)
- WebSocket reconnection logic missing
- Session save race condition
- Fake `useLiveTranscription` hook (unused but misleading)

---

## P0 - Critical Authentication Issues

### AUTH-001: Email/Password Sign-In Hangs Indefinitely

**Symptom:** User clicks "Sign In", sees spinner with "Signing in..." forever, page never redirects.

**Root Cause:** Race condition between `signInWithPassword` completion and `onAuthStateChange` firing. After successful auth, `setIsLoading(false)` is never called because code assumes redirect will happen via `useEffect`.

**Evidence:**
- File: `apps/web/src/pages/Auth.jsx` (lines 43-69)
- File: `apps/web/src/contexts/AuthContext.jsx` (lines 64-145)

**Flow Analysis:**
1. User submits form → `setIsLoading(true)`
2. `auth.signIn()` calls `supabase.auth.signInWithPassword()` → SUCCEEDS
3. Expected: `onAuthStateChange` fires → `session` state updates → `useEffect` redirects
4. **ACTUAL**: If `onAuthStateChange` doesn't fire OR fires before Auth component mounts, session state never updates in Auth.jsx
5. Result: `isLoading` stays `true` forever, no redirect, no error shown

**Why `onAuthStateChange` may not fire:**
- Supabase client already processed the session before component mounted
- Race condition between `getSession()` and `signInWithPassword()` completion
- Session already set in AuthContext before Auth.jsx's useEffect runs

**Fix Plan:** Add explicit session check after sign-in with timeout fallback.

---

### AUTH-002: No Auth Timeout / Fallback Error Handling

**Symptom:** If backend `/auth/me` is slow or unreachable, auth loading state hangs.

**Root Cause:** `fetchUserProfile` in AuthContext has no timeout, and errors are caught but don't prevent infinite loading.

**Evidence:**
- File: `apps/web/src/contexts/AuthContext.jsx` (lines 36-58)
- `apiAuth.getMe()` can hang indefinitely

**Fix Plan:** Add 5-second timeout wrapper to profile fetch, use session fallback on failure.

---

### AUTH-003: No Debounce on Sign-In Button

**Symptom:** User can spam-click sign-in button, triggering multiple auth attempts → 429 rate limit.

**Root Cause:** No guard against double-submission. Window exists between click and `setIsLoading(true)`.

**Evidence:**
- File: `apps/web/src/pages/Auth.jsx` (lines 260-269)
- Button only disabled when `isLoading` is true, but there's a race window

**Fix Plan:** Add ref to track in-flight requests, check before submitting.

---

### AUTH-004: Email Confirmation Not Handled in UI

**Symptom:** User signs up, tries to sign in, gets cryptic error or silent failure.

**Root Cause:** Supabase `signInWithPassword` returns specific error for unconfirmed emails ("Email not confirmed"), but UI displays raw error message.

**Evidence:**
- File: `apps/web/src/components/services/api.jsx` (lines 31-37)
- Raw Supabase error re-thrown without user-friendly transformation

**Fix Plan:** Map common Supabase auth errors to user-friendly messages.

---

### STRIPE-001: Stripe Subscription Integration Not Implemented

**Symptom:** Pricing page exists with billing UI, but no actual payment processing.

**Root Cause:** No Stripe integration in backend or frontend.

**Evidence:**
- File: `apps/web/src/pages/Pricing.jsx` — Has billing toggle (monthly/yearly), pricing tiers, but buttons don't trigger payment
- File: `apps/web/src/components/services/api.jsx` (lines 560-592) — `billing` object only reads from profile
- No `stripe` imports anywhere in codebase
- No Stripe webhook handler in `apps/api/main.py`

**Impact:** Users cannot upgrade to premium plans.

**Fix Plan:** Full Stripe integration (2-3 day effort, separate milestone).

---

## P1 - High Priority Issues

### PARTIAL-001: Live Transcription WebSocket Reconnection

**Location:** `apps/web/src/components/recording/AudioRecorder.jsx` (lines 268-305)

**Current State:** WebSocket errors are caught but no automatic reconnection. If connection drops mid-recording, user sees stale transcript with no indication of failure.

**Fix Plan:**
- Implement exponential backoff reconnection (max 3 retries)
- Show "Reconnecting..." indicator
- Queue audio chunks during reconnection
- Fall back to offline mode if reconnection fails

**Effort:** 4 hours

---

### BUG-001: Fake useLiveTranscription Hook

**Location:** `apps/web/src/hooks/useLiveTranscription.ts`

**Issue:** Returns hardcoded demo phrases on a timer, never connects to WebSocket. File is unused but misleading.

**Fix:** Delete file entirely.

**Effort:** 5 minutes

---

### BUG-002: confidenceLevel State Never Updates

**Location:** `apps/web/src/pages/Speak.jsx` (line 215)

**Issue:** `const [confidenceLevel, setConfidenceLevel] = useState(0)` declared but `setConfidenceLevel` only called to reset to 0. UI shows "Confidence: 0%" always.

**Fix:** Either compute confidence from analytics and update state, or remove the UI element.

**Effort:** 30 minutes

---

### PARTIAL-002: Session Save Race Condition

**Location:** `apps/web/src/pages/Speak.jsx` `handleFinish()` (lines ~900-1000)

**Current State:** `stopRecording()` is async, but navigation can happen before blob is ready.

**Fix:** Await `stopRecording()` fully, validate blob exists before constructing session.

**Effort:** 2 hours

---

### DATA-003: Audio Blob Size Unbounded

**Location:** `apps/api/main.py` `/upload-audio` endpoint

**Issue:** Config has `max_audio_file_size: int = 15 * 1024 * 1024` but not enforced in upload handler.

**Fix:** Add size check before processing.

**Effort:** 1 hour

---

## P2 - Medium Priority Issues

### HARDCODE-001: Default Credit Amount
- Location: `apps/api/credits.py`
- Fix: Move to environment variable

### HARDCODE-002: LLM Model Selection
- Location: `apps/api/llm_refinement.py` line ~1575
- Value: `model="gpt-4o-mini"` hardcoded
- Fix: Move to config

### BUG-006: Filler Detection Double-Counting
- Location: `apps/api/adaptive_analytics.py` FILLER_PATTERNS
- Fix: Track matched positions, skip overlapping matches

### BUG-007: Dark Mode Toggle Doesn't Persist
- Fix: Store in localStorage, read on mount

### LLM-003: No Retry Logic on LLM Failure
- Location: `apps/api/llm_refinement.py`
- Fix: Implement retry with exponential backoff (max 3 attempts)

### GAP-004: Email Notifications for Credit Depletion
- Location: `apps/api/notifications.py` (stub file)
- Status: No email integration exists
- Fix: Integrate email service (SendGrid, SES)

### GAP-005: Batch Export of Sessions
- Location: `apps/api/main.py` `/export-data` endpoint
- Status: GDPR export exists but no UI-driven batch export
- Fix: Add multi-select in Library, endpoint for batch export as ZIP

### GAP-006: Search/Filter in Library
- Location: `apps/web/src/pages/Library.jsx`
- Status: Sessions listed but not searchable
- Fix: Add client-side search by title/transcript keywords

---

## Recently Completed (Verified Working)

### ✅ GAP-003A: Admin Dashboard V1
- **Completed:** 2026-01-28
- **Location:** `apps/api/admin.py`, `apps/web/src/pages/admin/*`
- **Features:** User management, session overview, analytics, audit log
- **Tests:** 200/200 passing

### ✅ Rate Limit Persistence
- **Completed:** 2026-01-27
- **Location:** `apps/api/rate_limit.py`
- **Feature:** Redis-backed rate limiting in production, in-memory fallback for dev

### ✅ Word Limit Enforcement
- **Completed:** 2026-01-26
- **Location:** `apps/api/llm_refinement.py`
- **Feature:** Deterministic word counting and truncation

### ✅ Atomic Credit Deduction
- **Completed:** 2026-01-26
- **Location:** `apps/api/credits.py`, migration `20260126_atomic_credit_deduction.sql`
- **Feature:** Race-condition-safe credit deduction

### ✅ Interview Response Refinement
- **Completed:** 2026-01-26
- **Location:** `apps/api/llm_refinement.py`, `/refine-interview` endpoint

### ✅ Partial Save / Draft System
- **Completed:** 2026-01-27
- **Location:** `apps/api/main.py` draft endpoints, `apps/web/src/pages/Draft.jsx`

---

## Admin Dashboard Security (Verified)
  - All `/admin/*` routes require admin via `require_admin()` dependency
  - DTOs use explicit allow-lists (never expose transcript/audio)
  - Audit log entries cannot be deleted or modified
- Hardening Completed:
  - ✅ Secure admin-only routes with explicit DTO allow-lists
  - ✅ Immutable audit logging for all admin actions
  - ✅ Disabled-user enforcement across HTTP and WebSocket paths
  - ✅ Safe handling of empty datasets and nullable fields
  - ✅ Numerically stable analytics (bounded, monotonic invariants)
  - ✅ Deterministic LLM prompt structure and feedback guarantees
- Tests: `tests/test_admin.py`, `tests/test_analytics_invariants.py`, `tests/test_interview_refinement.py`
- Test Status: **200/200 passing**
- **Migration required:** Run both admin migrations before deploying

**Rate Limit Persistence (GAP-002)** - ✅ COMPLETED
- Implemented: 2026-01-27
- Location: `apps/api/rate_limit.py`, `apps/api/health.py`, `apps/api/main.py`
- Design Decisions:
  - **Startup Fail vs Runtime Fail**: Chose STARTUP FAIL for production (catches misconfiguration at deployment)
  - **Eager vs Lazy Validation**: Chose EAGER validation (immediate feedback)
- Environment-Aware Behavior:
  - **Production (ENV=production)**: Redis REQUIRED. App fails at startup if REDIS_URL not configured or Redis unreachable
  - **Development (ENV=development)**: In-memory fallback allowed with clear warning. Non-persistent but functional for local dev
  - **Rate limiting disabled**: No-op behavior when `RATE_LIMIT_ENABLED=false`
- Changes Made:
  - Complete rewrite of `rate_limit.py` (~480 lines):
    - `RateLimiterBackend` enum: REDIS, MEMORY, NONE
    - `RateLimiterConfigurationError` for startup failures in production
    - `RateLimiterUnavailableError` for runtime failures
    - `initialize_rate_limiter()` - MUST be called at startup, performs eager validation
    - `_ensure_initialized()` - Guards all rate limit operations
    - `get_rate_limiter_status()` - Health check integration
    - `_mask_redis_url()` - Privacy-safe logging (passwords masked)
    - `reset_for_testing()` - Test utility for state reset
  - Updated `main.py`:
    - Added `initialize_rate_limiter` to imports
    - Calls `await initialize_rate_limiter()` in startup hook
    - Removed stale warning about Redis (now handled by rate limiter)
  - Updated `health.py`:
    - `check_redis()` now uses `get_rate_limiter_status()` for accurate reporting
    - `is_ready()` now requires healthy Redis in production
- Observability:
  - All logs use structured format with `[RateLimiter:*]` prefix
  - Startup logs: backend chosen, environment, initialization status
  - Runtime logs: rate limit checks, exceeded limits (keyed by user_id, not IP)
  - Error logs: connection failures with masked credentials
- Tests: `tests/test_rate_limit.py`
  - Production + no Redis → error at startup
  - Production + Redis unavailable → error at startup
  - Production + Redis → Redis backend used
  - Development + no Redis → in-memory with warning
  - Development + Redis → Redis backend used
  - Rate limiting disabled → no-op behavior
  - Uninitialized rate limiter → clear error
  - Privacy-safe URL masking

**Word Limit Enforcement on LLM Output (GAP-001)** - ✅ COMPLETED
- Implemented: 2026-01-26
- Location: `apps/api/llm_refinement.py`
- Changes:
  - Added `count_words(text)` - deterministic word counting (whitespace split)
  - Added `truncate_to_word_limit(text, limit)` - deterministic truncation
  - Modified `refine_transcript()` to enforce word limits:
    - If output exceeds limit: retry ONCE with stricter instruction
    - If retry fails: truncate deterministically
    - Logging for: original count, limit, retry attempted, truncation applied
  - Edge cases handled: no limit, limit < 20 (clamped to MIN_REASONABLE_WORD_LIMIT)
- Tests: `tests/test_word_limit.py`

**Atomic Credit Deduction (BUG-005 Fix)** - ✅ COMPLETED
- Implemented: 2026-01-26
- Location: `apps/api/credits.py`, `supabase/migrations/20260126_atomic_credit_deduction.sql`
- Changes:
  - New Postgres function `atomic_decrement_credits()` performs check-and-decrement atomically
  - Single UPDATE with WHERE clause prevents race conditions
  - CHECK constraint `credits_remaining >= 0` prevents negative balances
  - Python code updated to use atomic function with legacy fallback
  - All credit-consuming endpoints now race-condition safe
- **Migration required:** Run `supabase/migrations/20260126_atomic_credit_deduction.sql`

**Credit Consumption for Analysis Endpoint** - ✅ COMPLETED
- Implemented: 2026-01-26
- Location: `apps/api/main.py` `/analyze` endpoint
- Changes:
  - `/analyze` now consumes 1 credit per request (same as other LLM endpoints)
  - Credit check performed BEFORE any LLM calls
  - Credit deducted AFTER successful analysis (users not charged for failures)
  - Distinct operation key `"analysis"` for billing clarity (not reusing `"refine"`)
  - Admin bypass preserved
  - Observability logging for credit consumption success/failure
- Tradeoffs documented in endpoint docstring

**Interview Response Refinement Pipeline (GAP-011)** - ✅ COMPLETED
- Implemented: 2026-01-26
- Location: `apps/api/llm_refinement.py`, `apps/api/main.py`, `apps/api/models.py`
- Features:
  - `POST /refine-interview` endpoint for turn-based interview response refinement
  - `InterviewRefinementRequest` and `InterviewRefinementResponse` Pydantic schemas
  - Company context resolution (user_provided > company_inferred > generic)
  - Transcript delimiter safety for prompt injection prevention
  - Voice profile integration preserved
  - Token usage logging for observability
  - Frontend wiring with required field indicators and validation

**Session Resume / Continue Recording (GAP-002)** - ✅ COMPLETED
- Implemented: 2026-01-26
- Location: `apps/web/src/pages/Speak.jsx`
- Features:
  - Persists in-progress session to `sessionStorage` (question, style, transcript, etc.)
  - Resume detection on page load with non-blocking banner
  - User can resume or discard the unfinished session
  - Editable live transcript (user edits preserved, new transcription appends)
  - Cleanup on successful submission or explicit discard
- Note: This is for ACCIDENTAL recovery only. Does NOT persist audio blobs.
- Distinction: Separate from Partial Save / Draft Naming (which is intentional, backend-stored).

**Offline Transcription Fallback (GAP-003)** - ✅ COMPLETED
- Implemented: 2026-01-26
- Location: `apps/web/src/components/recording/AudioRecorder.jsx`, `apps/web/src/pages/Speak.jsx`
- Features:
  - If WebSocket connection fails, recording continues locally (offline mode)
  - Amber indicator: "Recording offline — transcription will be added when you save"
  - Audio is still captured in memory
  - Transcription is processed on save (batch upload)
  - WebSocket reconnection attempted on resume from pause
- Note: Audio is NOT persisted to storage in offline mode (in-memory only).

**Partial Save / Draft Naming** - ✅ COMPLETED
- Implemented: 2026-01-27
- Location: 
  - Backend: `apps/api/main.py` (draft endpoints), `apps/api/models.py` (draft schemas)
  - Frontend: `apps/web/src/pages/Speak.jsx`, `apps/web/src/pages/Draft.jsx`, `apps/web/src/pages/Library.jsx`
  - Database: `supabase/migrations/20260127_create_drafts.sql`
- Features:
  - Users can INTENTIONALLY save unfinished work as drafts
  - Optional draft naming (auto-generated from question if not provided)
  - Drafts appear in Library with "Draft" badge
  - Draft page allows: rename, edit transcript, continue recording, save changes, discard
  - No credits consumed for draft saves
  - No LLM calls triggered on draft save
  - Separate from session resume (which is for accidental recovery)
- API Endpoints:
  - `POST /drafts` - create draft
  - `GET /drafts` - list user drafts
  - `GET /drafts/:id` - get specific draft
  - `PUT /drafts/:id` - update draft
  - `DELETE /drafts/:id` - delete draft
- **Migration required:** Run `supabase/migrations/20260127_create_drafts.sql`

---

## 2. Partially Implemented / Fragile

### P0 - Critical

**PARTIAL-001: Live Transcription Error Recovery**
- Location: `apps/web/src/components/recording/AudioRecorder.jsx` lines 150-250 (WebSocket handlers)
- Current State: WebSocket errors are caught but only logged; no automatic reconnection
- Failure Mode: If connection drops mid-recording, user sees stale transcript with no indication of failure
- Fix: Implement exponential backoff reconnection with UI indicator, queue pending audio chunks

**PARTIAL-002: Session Save Race Condition**
- Location: `apps/web/src/pages/Speak.jsx` `handleFinish()` (lines 400-500)
- Current State: `stopRecording()` is async, but navigation to Draft can happen before blob is ready
- Failure Mode: Empty or partial audio saved to session under timing edge cases
- Fix: Await stopRecording result fully before constructing session object, add validation

### P1 - High

**PARTIAL-003: Analytics Contract Versioning**
- Location: `apps/api/analytics_contract.py` and `apps/api/adaptive_analytics.py`
- Current State: Contract version is documented but not enforced at runtime
- Failure Mode: Frontend may receive analytics in unexpected format if backend changes
- Fix: Add version field to response, validate against schema before returning

**PARTIAL-004: Feature Flag Staleness**
- Location: `apps/api/feature_flags.py` and `apps/web/src/hooks/useFeatureFlags.js`
- Current State: Flags fetched once on app load, no refresh mechanism
- Failure Mode: Toggling flags requires user to refresh browser
- Fix: Poll or subscribe to flag changes, or add manual refresh button

**PARTIAL-005: Supabase RLS Gaps**
- Location: `supabase/migrations/20250101_enable_rls.sql`
- Current State: RLS enabled but policies may not cover all edge cases (e.g., shared sessions)
- Failure Mode: Potential unauthorized read/write if sharing features are added
- Fix: Audit all RLS policies against current and planned features, add tests

### P2 - Medium

**PARTIAL-006: Amplitude Calculation Accuracy**
- Location: `apps/web/src/components/recording/AudioRecorder.jsx` lines 50-100 (amplitude calculation)
- Current State: Uses basic RMS calculation, doesn't account for WebM compression artifacts
- Failure Mode: Visual amplitude may not accurately represent actual audio level
- Fix: Use Web Audio API AnalyserNode for real-time frequency analysis

---

## 3. Buggy or Misleading

### P0 - Critical

**BUG-001: useLiveTranscription Hook is Fake**
- Location: `apps/web/src/hooks/useLiveTranscription.ts` (entire file, 83 lines)
- Issue: Returns hardcoded demo phrases on a timer, never connects to WebSocket
- Impact: Any component using this hook shows fake data
- Current Usage: Appears unused (actual transcription in AudioRecorder.jsx)
- Fix: Delete the file entirely, or rename to `useLiveTranscriptionDemo.ts` with clear documentation

**BUG-002: confidenceLevel State Never Updates**
- Location: `apps/web/src/pages/Speak.jsx` line 98
- Issue: `const [confidenceLevel, setConfidenceLevel] = useState(0)` but `setConfidenceLevel` is never called
- Impact: UI displays confidence meter stuck at 0, misleading users
- Fix: Either compute confidence from live analytics and update state, or remove the feature from UI

**BUG-003: computeStrongestMoment Uses Keyword Heuristics, Not Semantics**
- Location: `apps/web/src/pages/Draft.jsx` lines 30-100
- Issue: "Strongest moment" is determined by regex keyword matching (e.g., "I led", "I achieved")
- Impact: May highlight irrelevant sentences while missing genuinely strong content
- Fix: Either rename to "Keyword Highlights" or integrate LLM-based semantic analysis

### P1 - High

**BUG-004: WebSocket Close Reason Not Propagated**
- Location: `apps/web/src/components/recording/AudioRecorder.jsx` line 390 (onclose handler)
- Issue: `ws.onclose` logs the close code but displays generic "Connection closed" message
- Impact: Users cannot distinguish auth failure from network issues
- Fix: Map close codes to specific error messages (4001=auth, 4002=rate limit, etc.)

**BUG-005: ~~Credits Can Go Negative (Race Condition)~~ — FIXED**
- Status: ✅ FIXED (2026-01-26)
- Fix applied:
  - New migration: `supabase/migrations/20260126_atomic_credit_deduction.sql`
  - New DB function: `atomic_decrement_credits(user_id, amount, reason)` 
  - CHECK constraint: `credits_remaining >= 0` (defense in depth)
  - Updated `apps/api/credits.py` to use atomic function
  - Legacy fallback preserved for gradual migration

**BUG-006: Filler Detection Double-Counting**
- Location: `apps/api/adaptive_analytics.py` FILLER_PATTERNS regex (lines 100-150)
- Issue: Overlapping patterns can match same word twice (e.g., "um um" counted as 4 fillers)
- Impact: Filler count inflated, scores artificially penalized
- Fix: Track matched positions, skip overlapping matches

### P2 - Medium

**BUG-007: Dark Mode Toggle Doesn't Persist**
- Location: `apps/web/src/contexts/ThemeContext.jsx` (if exists) or inline in components
- Issue: Theme preference resets on page reload
- Fix: Store in localStorage, read on mount

**BUG-008: Recording Duration Timer Drift**
- Location: `apps/web/src/pages/Speak.jsx` timer logic (lines 200-250)
- Issue: `setInterval` accumulates drift over long recordings
- Impact: Timer may be off by several seconds after 30+ minutes
- Fix: Use `performance.now()` delta from start time instead of accumulating seconds

---

## 4. Hardcoded / Magic Values

### P0 - Critical

**HARDCODE-001: Default Credit Amount**
- Location: `apps/api/credits.py` line 15 (or similar)
- Value: `DEFAULT_CREDITS = 10` (or similar hardcoded value)
- Issue: New user credit allocation not configurable
- Fix: Move to environment variable or feature flag

**HARDCODE-002: LLM Model Selection**
- Location: `apps/api/llm_refinement.py` line 1575 (approximate)
- Value: `model="gpt-4o-mini"` hardcoded
- Issue: Cannot A/B test models or switch without code change
- Fix: Move to config.py with environment variable override

### P1 - High

**HARDCODE-003: WebSocket Reconnection Timings**
- Location: `apps/web/src/components/recording/AudioRecorder.jsx` lines 50-70
- Values: `WEBSOCKET_CONNECTION_TIMEOUT_MS = 15000`, `WEBSOCKET_READY_CHECK_INTERVAL_MS = 100`
- Issue: Tuning requires code change
- Fix: Move to config file or environment-based defaults

**HARDCODE-004: Analytics Score Bounds**
- Location: `apps/api/adaptive_analytics.py` lines 50-100 (FOUNDATIONAL_CONSTANTS)
- Values: `MIN_SCORE = 20`, `MAX_SCORE = 100`, various weights
- Issue: Score calibration requires code change
- Fix: Document immutability reason, or externalize if truly tunable

**HARDCODE-005: Filler Word List**
- Location: `apps/api/adaptive_analytics.py` FILLER_PATTERNS (lines 100-150)
- Issue: Common fillers hardcoded; regional variants not included
- Fix: Move to database or config, allow admin to customize

### P2 - Medium

**HARDCODE-006: Recording Timeslice**
- Location: `apps/web/src/components/recording/AudioRecorder.jsx` line 40
- Value: `RECORDING_TIMESLICE_MS = 250`
- Issue: Trade-off between latency and chunk size not user-configurable
- Fix: Document rationale, consider exposing in advanced settings

**HARDCODE-007: Session Auto-Save Delay**
- Location: `apps/web/src/pages/Draft.jsx` (auto-save timer)
- Issue: Debounce delay hardcoded
- Fix: Move to config, document UX reasoning

---

## 5. LLM & Prompting Gaps

### P0 - Critical

**LLM-001: No Output Validation**
- Location: `apps/api/llm_refinement.py` `refine_transcript()` (lines 1452-1632)
- Issue: LLM response parsed directly without schema validation
- Risk: Malformed JSON, missing fields, or hallucinated structure crashes the endpoint
- Fix: Use Pydantic model to validate response, return error if invalid

**LLM-002: Prompt Injection Vulnerability**
- Location: `apps/api/llm_refinement.py` prompt construction (lines 1189-1449)
- Issue: User transcript inserted directly into prompt without sanitization
- Risk: Malicious transcript content could manipulate LLM behavior
- Fix: Escape or delimit user content, use structured message format

**LLM-003: No Retry Logic on LLM Failure**
- Location: `apps/api/llm_refinement.py` OpenAI call (lines 1601-1606)
- Issue: Single attempt; network blip fails the request
- Risk: Intermittent failures frustrate users
- Fix: Implement retry with exponential backoff (max 3 attempts)

### P1 - High

**LLM-004: Token Count Not Tracked**
- Location: `apps/api/llm_refinement.py` entire file
- Issue: No logging of input/output token counts
- Risk: Cannot monitor costs or detect runaway prompts
- Fix: Log token usage from response metadata, add observability

**LLM-005: System Prompt Versioning**
- Location: `apps/api/llm_refinement.py` prompts defined inline
- Issue: Prompt changes have no versioning or A/B capability
- Risk: Regression in output quality undetectable
- Fix: Store prompts with version IDs, log which version generated each response

**LLM-006: Streaming Response Not Utilized**
- Location: `apps/api/main.py` `/refine` endpoint
- Issue: LLM response awaited in full before sending to client
- Impact: User waits for entire generation; poor perceived latency
- Fix: Implement SSE streaming of LLM output

### P2 - Medium

**LLM-007: No Prompt Caching**
- Location: `apps/api/llm_refinement.py` and `docs/llm_prompt_caching.md`
- Issue: Documentation suggests caching but it's not implemented
- Impact: Redundant tokens sent for identical system prompts
- Fix: Implement prompt prefix caching per OpenAI documentation

**LLM-008: Temperature Not Configurable**
- Location: `apps/api/llm_refinement.py` OpenAI call parameters
- Issue: Temperature hardcoded, cannot tune creativity vs. consistency
- Fix: Add to config, consider different values for different operations

---

## 6. Data Integrity & State Risks

### P0 - Critical

**DATA-001: No Foreign Key Constraints in Migrations**
- Location: `supabase/migrations/20250101_create_tables.sql`
- Issue: `user_id` references exist but may lack explicit FK constraints
- Risk: Orphaned records if user deleted
- Fix: Audit migrations, add ON DELETE CASCADE or RESTRICT as appropriate

**DATA-002: Session State Split Between Client and Server**
- Location: `apps/web/src/stores/useSessionStore.js` and `apps/api/main.py` sessions endpoints
- Issue: Client holds authoritative transcript state until save; server has partial view
- Risk: Data loss on client crash before save
- Fix: Auto-save drafts to server, or use conflict resolution on save

**DATA-003: Audio Blob Size Unbounded**
- Location: `apps/api/main.py` `/upload-audio` endpoint (lines 1100-1150)
- Issue: No server-side file size validation
- Risk: Memory exhaustion or storage abuse
- Fix: Add MAX_AUDIO_SIZE_MB config, reject oversized uploads with 413

### P1 - High

**DATA-004: Transcript UTF-8 Handling**
- Location: Throughout API and frontend
- Issue: No explicit normalization of Unicode (e.g., NFC vs. NFD)
- Risk: Comparison bugs, search mismatches on accented characters
- Fix: Normalize to NFC on ingest, document encoding expectations

**DATA-005: Session Deletion Doesn't Remove Audio from Storage**
- Location: `apps/api/main.py` DELETE `/sessions/{id}` (lines 600-650)
- Issue: Database record deleted but Supabase storage file may persist
- Risk: Storage bloat, potential data retention violation
- Fix: Call storage.delete() before database delete

**DATA-006: Concurrent Edit Conflicts**
- Location: `apps/api/main.py` PUT `/sessions/{id}`
- Issue: No optimistic locking (e.g., `updated_at` check)
- Risk: Last-write-wins can lose edits if multiple tabs open
- Fix: Add `If-Match` header support or return 409 on stale update

### P2 - Medium

**DATA-007: Analytics Results Not Persisted**
- Location: `apps/api/main.py` `/analyze` endpoint
- Issue: Analytics computed on-demand, not stored
- Impact: Re-running analysis costs compute; historical comparison impossible
- Fix: Store analytics snapshot with session record

---

## 7. Recommended Fix Order (Auth-First)

Priority is determined by: User impact, Data risk, Effort, Dependencies.

### Immediate (This Week): Fix Critical Auth Issues

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 1 | AUTH-003 | Add debounce to sign-in button | 30 min |
| 2 | AUTH-004 | Handle email confirmation errors in UI | 30 min |
| 3 | AUTH-001 | Fix sign-in hang (explicit session check + timeout) | 2 hr |
| 4 | AUTH-002 | Add timeout to profile fetch | 1 hr |
| 5 | BUG-001 | Delete fake useLiveTranscription hook | 5 min |

### Week 2: Stability & Data Integrity

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 6 | PARTIAL-001 | WebSocket reconnection logic | 4 hr |
| 7 | PARTIAL-002 | Session save race condition | 2 hr |
| 8 | DATA-003 | Audio file size limit | 1 hr |
| 9 | BUG-002 | Fix/remove confidenceLevel display | 30 min |

### Week 3+: Configuration & Polish

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 10 | HARDCODE-001 | Externalize default credits | 30 min |
| 11 | HARDCODE-002 | Externalize LLM model | 30 min |
| 12 | BUG-007 | Persist dark mode preference | 30 min |
| 13 | LLM-003 | Add LLM retry logic | 2 hr |

### Deferred

- **STRIPE-001**: Stripe integration (2-3 days, separate milestone)
- **BUG-006**: Filler double-counting (low impact)
- **Email Notifications**: Requires email provider setup

---

## 8. Appendix: File Reference Index

| File | Gap IDs |
|------|---------|
| `apps/web/src/pages/Auth.jsx` | AUTH-001, AUTH-003, AUTH-004 |
| `apps/web/src/contexts/AuthContext.jsx` | AUTH-002 |
| `apps/web/src/components/services/api.jsx` | AUTH-004 |
| `apps/web/src/hooks/useLiveTranscription.ts` | BUG-001 |
| `apps/web/src/pages/Speak.jsx` | BUG-002, PARTIAL-002 |
| `apps/web/src/components/recording/AudioRecorder.jsx` | PARTIAL-001 |
| `apps/api/main.py` | DATA-003 |
| `apps/api/llm_refinement.py` | HARDCODE-002, LLM-003 |
| `apps/api/credits.py` | HARDCODE-001 |
| `supabase/migrations/` | DATA-001 |

---

## 9. Verification Checklist

After implementing P0 auth fixes:

- [ ] **Local dev**: Password sign-in works reliably (< 3 seconds to redirect)
- [ ] **Local dev**: Wrong password shows clear error message
- [ ] **Local dev**: Unconfirmed email shows "please confirm email" message
- [ ] **Local dev**: Rapid clicking sign-in only fires 1 request
- [ ] **Production**: Password sign-in works, session persists after refresh
- [ ] **Production**: No infinite `/auth/me` loops in network tab
- [ ] **Production**: No 429 errors during normal sign-in
- [ ] Auth state + redirects behave correctly (login → /home, logout → /auth)

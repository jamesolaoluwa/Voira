# Voira Implementation Gaps

A prioritized, actionable list of implementation gaps, bugs, and technical debt in the Voira codebase. Each item is scoped for independent resolution.

---

## 1. Not Implemented at All

### P1 - High (Feature Gaps)

**GAP-002: Session Resume/Continue Recording**
- Location: `apps/web/src/pages/Speak.jsx` (entire file)
- Status: No mechanism to resume a paused session across page reloads
- Impact: If user accidentally navigates away, recording is lost
- Fix: Store interim audio chunks and transcript in IndexedDB or sessionStorage
- Note: Users should also be able to edit live transcribed text in case of wrong transcription

**Bug**
- User sessions doesn't load when clicked from library, it gives this error: "Error loading draft: Error: Session not found at Object.getSessionById (api.jsx:183:13) at async loadDraftData"**

**GAP-003: Offline Transcription Fallback**
- Location: `apps/web/src/components/recording/AudioRecorder.jsx`
- Status: WebSocket failure aborts recording entirely
- Impact: Users in poor network conditions cannot record at all
- Fix: Allow recording without live transcription, queue audio for later upload

**GAP-004: Rate Limit Persistence**
- Location: `apps/api/rate_limit.py` (entire file)
- Status: In-memory rate limiter resets on server restart; Redis integration is optional and may not be configured
- Impact: Rate limits ineffective across deployments or restarts
- Fix: Make Redis required for production, or implement persistent fallback

**GAP-005: Admin Dashboard**
- Location: References in `apps/api/models.py` (`admin_emails` table) but no admin UI exists
- Status: Admin role check exists but no admin interface
- Impact: Cannot manage users, view analytics, or moderate content without direct DB access
- Fix: Build admin routes and UI, or document this as intentionally deferred

### P2 - Medium (Nice-to-Have)

**GAP-006: Email Notifications for Credit Depletion**
- Location: `apps/api/notifications.py` (empty/stub file)
- Status: No email integration exists
- Impact: Users have no warning when credits are low
- Fix: Integrate email service (SendGrid, SES), trigger on credit thresholds

**GAP-007: Batch Export of Sessions**
- Location: `apps/api/main.py` `/export-data` endpoint (lines 1350-1386)
- Status: GDPR export exists but no UI-driven batch export of selected sessions
- Impact: Users must export one session at a time
- Fix: Add multi-select in Library, endpoint for batch export as ZIP

**GAP-008: Search/Filter in Library**
- Location: `apps/web/src/pages/Library.jsx`
- Status: Sessions are listed but not searchable or filterable
- Impact: Users with many sessions cannot find specific recordings
- Fix: Add client-side filtering by date, topic, or keywords from transcript

---

## Recently Implemented

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

## 7. Transition Note: Next Focus

### Next Priority: GAP-002 (Session Resume/Continue Recording)

**Schema/API Decisions Needed:**
1. Should `/analyze` remain free or consume credits?
2. How is token usage attributed per request type?
3. Credit cost table by operation type:
   - `refine` (existing) - 1 credit
   - `refine-interview` (implemented) - 1 credit
   - `analyze` (currently free) - TBD

**Impact of Longer Prompts:**
- Interview refinement with company context uses more tokens
- Should credit cost vary by prompt complexity?
- Token usage is now logged for `/refine-interview` endpoint

---

## 8. Recommended Fix Order

Priority is determined by: User impact, Data risk, Effort, Dependencies.

### Phase 1: Stabilize Core (Week 1-2)

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 1 | BUG-001 | Delete fake useLiveTranscription hook | 5 min |
| 2 | BUG-002 | Remove or implement confidenceLevel display | 30 min |
| 3 | ~~BUG-005~~ | ~~Fix credits race condition~~ | ✅ DONE |
| 4 | DATA-003 | Add audio file size limit | 1 hr |
| 5 | LLM-001 | Add Pydantic validation to LLM responses | 2 hr |
| 6 | LLM-002 | Sanitize user content in prompts | 1 hr |
| 7 | PARTIAL-001 | Add WebSocket reconnection logic | 4 hr |

### Phase 2: Credit System & Configuration (Week 2-3)

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 8 | ~~GAP-001~~ | ~~Implement analysis credit cost~~ | ✅ DONE |
| 9 | HARDCODE-001 | Externalize default credit amount | 30 min |
| 10 | HARDCODE-002 | Externalize LLM model selection | 30 min |
| 11 | PARTIAL-003 | Enforce analytics contract versioning | 2 hr |
| 12 | LLM-005 | Add prompt versioning | 3 hr |
| 13 | BUG-004 | Map WebSocket close codes to messages | 1 hr |

### Phase 3: Data Integrity (Week 3-4)

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 14 | DATA-001 | Audit and add FK constraints | 3 hr |
| 15 | DATA-002 | Implement auto-save drafts | 4 hr |
| 16 | DATA-005 | Delete storage files on session delete | 1 hr |
| 17 | PARTIAL-002 | Fix session save race condition | 2 hr |
| 18 | DATA-003 | Add audio file size limit | 1 hr |

### Phase 4: Data Integrity Continued (Week 4-5)

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 19 | DATA-004 | Transcript UTF-8 handling | 2 hr |
| 20 | DATA-006 | Concurrent edit conflicts | 2 hr |
| 21 | DATA-007 | Persist analytics results | 3 hr |
| 22 | ~~GAP-001~~ | ~~Validate LLM word limit compliance~~ | ✅ DONE |
| 23 | LLM-003 | Add retry logic to LLM calls | 2 hr |
| 24 | LLM-008 | Make temperature configurable | 1 hr |

### Phase 5: Polish (Week 5+)

| Order | ID | Summary | Effort |
|-------|------|---------|--------|
| 25 | GAP-008 | Add search/filter to Library | 3 hr |
| 26 | LLM-006 | Stream LLM responses to client | 4 hr |
| 27 | GAP-002 | Session resume after navigation | 6 hr |
| 28 | PARTIAL-004 | Feature flag refresh mechanism | 2 hr |
| 29 | BUG-006 | Fix filler detection double-counting | 2 hr |
| 30 | GAP-003 | Offline transcription fallback | 4 hr |

### Deferred / Low Priority

- GAP-005 (Admin Dashboard) - Build only when needed
- GAP-006 (Email Notifications) - Requires email provider setup
- GAP-007 (Batch Export) - Nice-to-have for power users
- HARDCODE-005 (Filler Word List) - Current list adequate for MVP
- LLM-007 (Prompt Caching) - Optimization, not correctness

---

## Appendix: File Reference Index

| File | Gap IDs |
|------|---------|
| `apps/api/main.py` | DATA-003, DATA-005, DATA-006 |
| `apps/api/llm_refinement.py` | LLM-001 through LLM-008 |
| `apps/api/adaptive_analytics.py` | BUG-006, HARDCODE-004, HARDCODE-005 |
| `apps/api/credits.py` | HARDCODE-001 |
| `apps/web/src/hooks/useLiveTranscription.ts` | BUG-001 |
| `apps/web/src/pages/Speak.jsx` | BUG-002, BUG-008, PARTIAL-002 |
| `apps/web/src/pages/Draft.jsx` | BUG-003, HARDCODE-007 |
| `apps/web/src/components/recording/AudioRecorder.jsx` | PARTIAL-001, BUG-004, HARDCODE-003, HARDCODE-006, PARTIAL-006 |
| `supabase/migrations/` | DATA-001, PARTIAL-005 |

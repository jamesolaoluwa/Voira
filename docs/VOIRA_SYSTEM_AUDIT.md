I have completed a comprehensive audit of the Voira codebase and created VOIRA_SYSTEM_AUDIT.md. Here's a summary of the key findings:

Critical Issues Discovered
useLiveTranscription.ts is FAKE - Returns hardcoded demo phrases, not real transcription. The actual live transcription is handled by AudioRecorder.jsx.

Confidence Level Never Updates - The confidenceLevel state in Speak.jsx is initialized to 0 and never updated during recording, yet it's displayed in the UI.

Word Limit Enforcement is Weak - Prompts instruct LLM to respect word limits but there's no post-processing validation.

Architecture Overview
Frontend: React/Vite with Zustand store + React Query
Backend: FastAPI with Deepgram (transcription) + OpenAI (refinement)
Database: Supabase (Auth, PostgreSQL, Storage)
Key Flow: Recording → WebSocket live transcription → /analyze endpoint → Draft page
Feature Status
✅ Production-ready: Auth, session CRUD, live transcription, credits, rate limiting, security headers
🟡 Partial: Strongest moment detection (heuristic-only), voice profile integration
🔴 Buggy: Confidence display, useLiveTranscription hook
❌ Missing: Audio playback, export, undo, versioning
Top Priorities (from the audit)
Remove/flag the fake useLiveTranscription.ts
Fix confidence display or remove from UI
Add word count validation post-LLM
Implement undo for section refinement
Upgrade strongest moment from keyword heuristics to semantic analysis
The audit document is now saved at VOIRA_SYSTEM_AUDIT.md with detailed analysis, file references, and a prioritized roadmap for fixes.# VOIRA SYSTEM AUDIT

**Date:** January 25, 2026  
**Auditor:** Automated System Review  
**Scope:** Full codebase analysis for production readiness  

---

## 1. System Understanding (Brief)

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│                    React/Vite (apps/web)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │  Speak   │ │  Draft   │ │ Library  │ │  Voice   │            │
│  │   Page   │ │   Page   │ │   Page   │ │ Profile  │            │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       │            │            │            │                   │
│       └────────────┴────────────┴────────────┘                   │
│                         │                                        │
│            ┌────────────┴────────────┐                           │
│            │      API Client         │                           │
│            │   (lib/apiClient.js)    │                           │
│            └────────────┬────────────┘                           │
└─────────────────────────┼───────────────────────────────────────┘
                          │ HTTP/REST + WebSocket
┌─────────────────────────┼───────────────────────────────────────┐
│                         ▼                                        │
│                    BACKEND (apps/api)                            │
│                    FastAPI + Python                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    main.py                                │   │
│  │  /sessions, /transcribe, /refine, /analyze, /ws/listen   │   │
│  └────┬─────────────────────────┬───────────────────────────┘   │
│       │                         │                                │
│  ┌────▼────┐   ┌────────────────▼────────────────┐              │
│  │  Auth   │   │      LLM Refinement             │              │
│  │ (auth.py│   │  (llm_refinement.py)            │              │
│  └────┬────┘   │  - OpenAI GPT-4o-mini           │              │
│       │        │  - Context-aware prompts         │              │
│       │        └────────────────┬────────────────┘              │
│       │                         │                                │
│  ┌────▼────────────────────────▼────────────────────────────┐   │
│  │              Transcription Service                        │   │
│  │  - REST: /transcribe (Deepgram REST API)                  │   │
│  │  - WebSocket: /ws/listen (Deepgram Streaming)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│                    EXTERNAL SERVICES                             │
│  ┌──────────────┐  ┌────────────┐  ┌────────────┐               │
│  │   Supabase   │  │  Deepgram  │  │   OpenAI   │               │
│  │  Auth + DB   │  │  Speech-   │  │  LLM API   │               │
│  │  + Storage   │  │  to-Text   │  │  (GPT-4o)  │               │
│  └──────────────┘  └────────────┘  └────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### Key User Flows

1. **Recording → Draft → Refinement → Library**
   - User selects mode (Application/Interview/Free/Practice)
   - Enters question (required for Application/Interview)
   - Records audio with live transcription via WebSocket
   - On finish: Audio uploaded, transcript captured, LLM refinement called
   - Draft page shows before/after, strongest moment, structure analysis
   - User saves to Library

2. **Source of Truth**
   - **Transcript:** Live WebSocket transcription (Deepgram) → stored in `accumulatedTranscriptRef` → saved to Supabase `recordings.transcript`
   - **Refined Draft:** Backend `/analyze` endpoint → `recordings.refined_draft`
   - **Analytics:** Backend `adaptive_analytics.py` → stored in session response

---

## 2. Feature Inventory

### ✅ Fully Implemented & Production-Ready

| Feature | Files | Notes |
|---------|-------|-------|
| Supabase Authentication (Email/Google OAuth) | `AuthContext.jsx`, `api.jsx`, `auth.py` | Works end-to-end with session management |
| Session CRUD Operations | `main.py`, `api.jsx`, `Library.jsx` | Create, Read, Update, Delete sessions |
| Audio Recording (MediaRecorder) | `AudioRecorder.jsx` | Browser-based recording with WebM output |
| Deepgram REST Transcription | `transcription.py` | POST endpoint for audio file transcription |
| Deepgram WebSocket Streaming | `deepgram_streaming.py`, `deepgram_webm.py` | Real-time partial/final transcripts |
| Credits System | `credits.py`, `user_profiles` table | Monthly reset, admin bypass, ledger tracking |
| Rate Limiting | `rate_limit.py`, middleware in `main.py` | Redis-backed (production) / in-memory (dev) |
| Health Checks | `health.py`, `/health/*` endpoints | Liveness, readiness, dependency checks |
| Security Headers Middleware | `main.py` (SecurityHeadersMiddleware) | HSTS, XSS protection, frame options |
| Structured Logging | `logging_config.py` | JSON logging with request IDs |
| Sentry Error Tracking | `sentry_config.py` | Exception capture with context |
| Feature Flags (Static) | `feature_flags.py` | Environment-based feature toggling |
| v3 Analytics Contract | `analytics.py`, `adaptive_analytics.py` | Algorithmic scoring with reliability |

### 🟡 Partially Implemented

| Feature | Status | Issue | Files |
|---------|--------|-------|-------|
| **Strongest Moment Detection** | Heuristic only | Uses keyword scoring, not semantic analysis. Returns null for short transcripts. | `Draft.jsx` (lines 28-100) |
| **Theme Extraction** | Keyword-based | Simple pattern matching, not NLP-based | `Draft.jsx` (lines 102-140) |
| **Structure Analysis** | Basic heuristics | Assumes linear structure, doesn't handle complex responses | `Draft.jsx` (lines 142-175) |
| **Voice Profile Integration** | Stored but underutilized | Profile data fetched but not consistently passed to all LLM calls | `VoiceProfile.jsx`, `llm_refinement.py` |
| **Filler Detection** | Mode-dependent | Works when enabled, but UI toggle hidden. Deepgram count vs regex mismatch possible. | `AudioRecorder.jsx`, `user_settings` migration |
| **Section Refinement** | UI implemented | Text selection works, but LLM context window may be suboptimal for very long drafts | `Draft.jsx` (lines 468-600) |
| **Company Research** | Prompt-based | Relies on LLM's training data for company research when no context provided | `llm_refinement.py` (lines 600-640) |

### 🔴 Implemented but Buggy

| Feature | Status | Issue | Files |
|---------|--------|-------|-------|
| **useLiveTranscription Hook** | SIMULATED | This hook returns FAKE demo text, not real transcription! Frontend uses `AudioRecorder.jsx` instead. | `useLiveTranscription.ts` |
| **Confidence Level Display** | Always 0 | `confidenceLevel` state never updated during recording in Speak.jsx | `Speak.jsx` (line 105, 968) |
| **WPM Calculation** | Potentially incorrect | Calculated only at save time, may use stale duration | `useSessionStore.js`, `api.jsx` |

### ⚠️ Hardcoded / Placeholder

| Item | Location | Details |
|------|----------|---------|
| **Demo Text in useLiveTranscription** | `useLiveTranscription.ts` (lines 30-38) | Returns random phrases like "I started by...", "During my time..." |
| **Default Clarity Score 80** | `Draft.jsx` (line 280) | Falls back to 80 when not provided |
| **Default Confidence/Clarity 70** | `Speak.jsx` (lines 521, 523, 563) | Hardcoded fallback values |
| **Default Analysis Reliability 0.5** | `useSessionStore.js`, `analytics.js` | Magic number without justification |
| **Credits Total 60** | `Home.jsx` (line 184) | Assumes free tier, doesn't check actual plan |
| **Alignment Score** | `Draft.jsx` (lines 303-308) | Derived from clarity_score with static text mapping |

### ❌ Missing but Expected

| Feature | Expected Behavior | Current State |
|---------|-------------------|---------------|
| **Audio Playback** | Review recorded audio on Draft page | Not implemented |
| **Export to PDF/Word** | Download refined essays | Not implemented |
| **Undo/Redo for Refinements** | Revert section edits | Not implemented |
| **Session Versioning** | Track refinement history | Not implemented |
| **Collaborative Review** | Share drafts for feedback | Not implemented |
| **Offline Mode** | Queue recordings when offline | Not implemented |
| **Real-time Confidence Visualization** | Show confidence during recording | State exists but never updated |
| **Practice Mode Feedback** | Real-time coaching during practice | Mode exists but lacks distinct behavior |
| **Reference File Vision Analysis** | Analyze images via GPT-4 Vision | Endpoint exists but untested path |
| **Baseline Personalization** | User-specific analytics baselines | Infrastructure exists but not populated |

---

## 3. Hardcoded & Non-Production Logic

### Critical Hardcoded Values

```javascript
// useLiveTranscription.ts:30-38 - COMPLETELY FAKE DATA
const corpusRef = useRef<string[]>([
  'I started by...',
  'During my time...',
  'I focused on...',
  'This experience taught me...',
  'As a result, we...',
  'I learned to...',
  'In summary, I...',
]);
```

```javascript
// Draft.jsx:280 - Hardcoded default
clarityScore = recording.clarity_score || 80; // Why 80?
```

```javascript
// Speak.jsx:563 - Error fallback with magic numbers
setSessionData({
  transcript: fallbackTranscript,
  refinedDraft: '',
  clarityScore: 75,  // Hardcoded
  confidenceScore: 70,  // Hardcoded
  fillerCount: 0,
  ...
});
```

```python
# adaptive_analytics.py:102-106 - Foundational constants
_FOUNDATIONAL_CONSTANTS = {
    "SCORE_BOUNDS": (15, 95),           # Soft bounds - why these values?
    "RELIABILITY_THRESHOLD": 0.4,        # Arbitrary cutoff
    "BASELINE_ALPHA": 0.2,               # Undocumented tuning
}
```

```javascript
// Home.jsx:184 - Assumes free tier
credits_total ?? 60  // Should query actual plan
```

### Static Defaults That May Leak

| Location | Value | Risk |
|----------|-------|------|
| `config.py:24` | `deepgram_api_key: Optional[str] = None` | Silent failure if not set |
| `config.py:27` | `openai_api_key: Optional[str] = None` | Silent failure if not set |
| `analytics.js:40-45` | `DEFAULT_BASELINE` | Not calibrated to actual user population |
| `models.py:26-28` | `clarity_score: int = Field(default=0)` | 0 is misleading for display |

---

## 4. Draft Page Deep Audit

### Before / After Draft Rendering

**Current Implementation:**
- "Before" shows `draft.original` (raw transcript)
- "After" shows `draft.refined` (LLM output)
- Both render as plain text with `whitespace-pre-wrap`

**Issues:**
1. No diff highlighting between before/after
2. No word count comparison displayed
3. If `refined` is empty, shows "No refined output yet" with generate button
4. No loading state while refinement streams (not implemented)

### Strongest Moment Logic

**File:** `Draft.jsx` (lines 28-100)

```javascript
function computeStrongestMoment(transcript) {
  // VALIDATION: Require minimum content length
  if (!transcript || transcript.trim().length < MIN_TRANSCRIPT_LENGTH_FOR_STRONGEST_MOMENT) {
    return null;
  }
  
  // Split into sentences
  const sentences = transcript.split(/[.!?]+/).filter(s => s.length > 15);
  
  // VALIDATION: Require at least 2 sentences
  if (sentences.length < 2) {
    return null;
  }
  
  // Impact keywords (hardcoded heuristic)
  const impactKeywords = ['led', 'achieved', 'created', ...];
  
  // Score each sentence
  // ...keyword matching + length scoring...
}
```

**Problems:**
1. Uses keyword heuristics, not semantic analysis
2. Keywords are English-centric and biased toward professional contexts
3. Sentence splitting assumes Western punctuation
4. No integration with LLM for semantic understanding
5. Returns `null` silently for short content - UI handles gracefully but user gets no feedback

### Section Refinement Flow

**Flow:**
1. User highlights text → captured in `selectedText` state
2. User enters instruction → `refinementInstruction` state
3. Click "Apply" → calls `/refine` with full context
4. Response replaces selection in-place with animation

**Issues:**
1. Selection detection uses `indexOf(selectedStr)` which may match wrong occurrence if text repeats
2. Context window may be too large for long essays (full essay sent in prompt)
3. No undo functionality
4. Animation duration hardcoded to 900ms

### LLM Output Handling

**Endpoint:** `/refine` and `/analyze` in `main.py`

**Flow:**
1. Backend receives raw transcript + context
2. `refine_transcript()` builds context-aware prompts
3. OpenAI API called with `gpt-4o-mini`
4. Response stripped and returned

**Issues:**
1. No streaming - user waits for full response
2. Token limits may truncate long essays silently
3. Word limit extraction uses regex - may miss edge cases
4. No caching of refined outputs

### What Breaks if Transcript is Empty

| Scenario | Behavior |
|----------|----------|
| Empty transcript | Draft page shows "No Session Data" error state (Bug #5 fix implemented) |
| Very short transcript (<100 chars) | Strongest moment returns null, themes return `['Personal Narrative']` default |
| Partial transcript (mid-sentence) | Structure analysis may misidentify conclusion |
| Transcript with only filler words | Analytics may show 100% filler rate, causing display issues |

### UI Assumptions

1. **Assumes question exists** - Draft page uses `draft.question` for refinement context
2. **Assumes refined text exists** - Multiple sections check `draft.refined` truthiness
3. **Assumes session loaded from either URL or state** - No fallback for direct navigation without params
4. **Assumes single session active** - No multi-session comparison

---

## 5. LLM Interaction Audit

### Where LLM is Called

| Endpoint | Function | Model | Purpose |
|----------|----------|-------|---------|
| `POST /refine` | `refine_transcript()` | gpt-4o-mini | Transform raw transcript to polished text |
| `POST /analyze` | `analyze_and_refine()` | gpt-4o-mini | Analytics + refinement combined |
| Image reference | `refine_transcript()` | gpt-4o | Vision API for image analysis |

### What Context is Passed

```python
# llm_refinement.py - User prompt construction
def build_user_prompt(...):
    prompt_parts = []
    
    # Session-specific context (interview/application/practice/free)
    if session_type == "interview":
        if user_context:
            prompt_parts.extend(["INTERVIEW CONTEXT:", user_context, ...])
        elif company_name:
            prompt_parts.extend(["COMPANY RESEARCH REQUIRED:", company_name, ...])
    
    # Question/Prompt
    if question:
        prompt_parts.extend([f"PROMPT/QUESTION: {question}", ""])
    
    # Goal
    if goal:
        prompt_parts.extend([f"USER'S GOAL: {goal}", ""])
    
    # Desired tone
    if final_tone:
        prompt_parts.extend([f"DESIRED TONE: {final_tone}", ""])
    
    # Reference text (truncated)
    if reference_text:
        truncated_text = smart_truncate_text(reference_text, max_length=2000)
        prompt_parts.extend(["REFERENCE STYLE/MATERIAL:", truncated_text, ...])
    
    # Raw transcript
    prompt_parts.extend(["RAW TRANSCRIPT (verbatim speech):", '"""', raw_transcript, '"""'])
```

### What is Missing from Context

| Missing Element | Impact | Severity |
|-----------------|--------|----------|
| **Prior session history** | LLM can't reference user's previous responses | Medium |
| **Voice profile during refinement** | Profile fetched but not always passed to section refinement | High |
| **User's best performing responses** | Can't use as positive examples | Medium |
| **Filler word positions** | Can't suggest pauses vs remove fillers intelligently | Low |
| **Audio prosody/tone** | Text-only analysis misses delivery quality | Medium |
| **Target word count enforcement** | Word limit extracted but may be ignored by LLM | Medium |

### Prompt Smells / Inconsistencies

1. **Inconsistent system prompts across modes** - Each mode has different instructions but base prompt is shared
2. **Company research relies on LLM knowledge** - May be outdated or hallucinated
3. **"Never sound generic or AI-written"** instruction appears multiple times
4. **Word limit enforcement is weak** - Instruction says "STRICTLY respect" but no post-processing validation
5. **Reference text truncation loses middle** - First 40% + last 40%, may lose key examples
6. **Section refinement sends full essay as context** - Wasteful token usage

---

## 6. Data Integrity Risks

### Where Data Can Be Lost

| Scenario | Risk | Location |
|----------|------|----------|
| **WebSocket disconnect during recording** | Transcript lost if not captured before disconnect | `AudioRecorder.jsx` |
| **Browser crash before save** | Recording lost (no auto-save) | `Speak.jsx` |
| **Supabase quota exceeded** | Audio upload fails silently | `storage.py` |
| **Token expires mid-refinement** | User sees error, work lost | `apiClient.js` |
| **Clear transcript called too early** | Bug #1 was this exact issue (fixed) | `AudioRecorder.jsx` |

### Where Stale Data Can Appear

| Scenario | Risk | Location |
|----------|------|----------|
| **Library not refreshed after save** | New session not visible | `Library.jsx` (mitigated with cache invalidation) |
| **Voice profile not synced** | Old profile used for refinement | `VoiceProfile.jsx` (localStorage vs backend) |
| **Credits display lag** | Shows old credit count after use | `CreditsDisplay`, `Speak.jsx` |
| **Session store vs query cache** | Dual storage can diverge | `useSessionStore.js`, React Query |

### Race Conditions / Async State Issues

1. **Transcript capture timing** - `stopRecording()` must capture transcript before WebSocket closes
   - Fixed with `accumulatedTranscriptRef` sync capture
   
2. **Multiple refinement calls** - No debouncing on regenerate button
   - User can click multiple times, causing multiple API calls
   
3. **Auth state during recording** - Token can expire mid-session
   - No renewal mechanism during long recordings

4. **Credits decrement race** - Credits checked at start, decremented at end
   - User could start multiple sessions if fast enough

### Invalid States

| Action | Invalid State | Prevention |
|--------|---------------|------------|
| Save with empty transcript | Session with no content | Warning shown, but save allowed |
| Refinement with no question (Application mode) | Contextless refinement | Validation blocks recording start |
| Section refinement with no selection | API called with empty selection | Validation in `handleApplyRefinement` |
| Delete session during save | Orphaned audio files | Not prevented |

---

## 7. Developer Experience Issues

### Confusing Files

| File | Issue |
|------|-------|
| `useLiveTranscription.ts` | Simulates transcription, not real. Named misleadingly. |
| `base44Client.js` (referenced) | Legacy abstraction over Supabase, unclear when to use vs direct API |
| `api.jsx` in `components/services/` | Mixes auth, sessions, audio - should be split |
| `adaptive_analytics.py` | 2337 lines, complex algorithmic code - needs documentation |

### Dead Code / Unused Files

| File/Code | Status |
|-----------|--------|
| `useLiveTranscription.ts` | Not used in production flow - `AudioRecorder.jsx` handles live transcription |
| `transcript` state in `Speak.jsx` | Comment says "Deprecated: kept for backward compatibility" |
| `api_versioning.py` | Returns version info but no versioned routes implemented |
| `essay-collection-dashboard/` folder | Separate app, unclear if part of main project |

### Duplicate Logic

| Logic | Locations | Issue |
|-------|-----------|-------|
| Session normalization | `Library.jsx`, `api.jsx`, `useSessionStore.js` | Three different mapping implementations |
| Date parsing | `main.py` (multiple locations) | Custom `parse_datetime` function repeated |
| Filler word patterns | `adaptive_analytics.py`, backend transcription | Defined in multiple places |
| Credits calculation | `credits.py`, `Speak.jsx` (decrementCredits) | Optimistic update + server update |

### Unused Hooks

| Hook | Status |
|------|--------|
| `useLiveTranscription.ts` | Not imported anywhere in main app flow |
| `use-mobile.jsx` | Only export, unclear usage |

### Misleading Abstractions

1. **`base44` client** - Named generically, is actually Supabase wrapper with entity methods
2. **`sessions` in API** - Called "sessions" but maps to "recordings" table
3. **`voice_profile.version`** - Referenced in cache key but doesn't exist in schema
4. **`analysis_reliability`** - Sounds like a boolean but is 0-1 float

---

## 8. Prioritized Fix Roadmap

### 🔴 High Priority (Must Fix for Correctness)

1. **Remove or flag `useLiveTranscription.ts` as unused**
   - Currently returns fake data
   - Could confuse future developers
   - Either delete or rename to `useLiveTranscription.MOCK.ts`

2. **Fix confidence level display during recording**
   - `confidenceLevel` state is initialized to 0 and never updated
   - Either remove from UI or implement real-time analytics

3. **Add word count validation after LLM refinement**
   - Word limit is extracted but not enforced
   - Post-process LLM output to verify limit compliance

4. **Implement undo for section refinement**
   - Users can accidentally destroy good text
   - Store history of refinement operations

5. **Validate reference text doesn't influence output content**
   - Current prompt says "use only as style guide"
   - Add explicit content-copying prevention

### 🟡 Medium Priority (UX / Quality)

6. **Upgrade Strongest Moment detection**
   - Current keyword heuristics are naive
   - Consider using LLM embedding similarity

7. **Add streaming for LLM refinement**
   - Current implementation waits for full response
   - User sees no progress indicator

8. **Unify session data normalization**
   - Three different mapping functions exist
   - Create single source-of-truth mapper

9. **Implement audio playback on Draft page**
   - Audio URL is stored but not used
   - Users can't review their recording

10. **Add real-time confidence visualization**
    - Infrastructure exists (analytics engine)
    - Connect to recording UI

### 🟢 Low Priority (Polish)

11. **Split `api.jsx` into domain modules**
    - `auth.api.js`, `sessions.api.js`, `audio.api.js`
    - Improves maintainability

12. **Document `adaptive_analytics.py` algorithms**
    - 2337 lines with complex math
    - Add README explaining methodology

13. **Add export functionality (PDF/Word)**
    - Common user request
    - Not blocking for MVP

14. **Implement session versioning**
    - Track refinement history
    - Allow reverting to previous versions

15. **Clean up deprecated `transcript` state in Speak.jsx**
    - Comment says deprecated
    - Remove after verifying no dependencies

---



## Appendix: Key File References

| Purpose | File |
|---------|------|
| Main API routes | `apps/api/main.py` |
| LLM prompting | `apps/api/llm_refinement.py` |
| Analytics engine | `apps/api/adaptive_analytics.py` |
| Auth context | `apps/web/src/contexts/AuthContext.jsx` |
| Recording logic | `apps/web/src/components/recording/AudioRecorder.jsx` |
| Draft display | `apps/web/src/pages/Draft.jsx` |
| Session store | `apps/web/src/stores/useSessionStore.js` |
| Database schema | `supabase/migrations/*.sql` |
| API client | `apps/web/src/lib/apiClient.js` |
| Config | `apps/api/config.py` |




---

*End of Audit*

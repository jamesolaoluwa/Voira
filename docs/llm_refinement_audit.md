# LLM Refinement Implementation Audit Report

**Date:** January 2026  
**Version:** 1.0  
**Auditor:** Senior Engineer + Prompt Engineer Review

---

## Executive Summary

This audit examines the LLM refinement implementation in Voira, focusing on Step 4 (Raw vs Refined Transcript Pipeline). The system uses OpenAI's GPT-4o-mini (text) and GPT-4o (Vision API) models for transcript refinement across 5 session types: Application Essay, Interview Response, Free Speak, Refine Draft, and Practice Mode.

**Key Findings:**
- **2 LLM Entrypoints:** `/analyze` (analytics + refinement) and `/refine` (refinement only)
- **5 Session Types:** Each with context-aware prompts
- **Current Model:** GPT-4o-mini (text), GPT-4o (images)
- **Output Cap:** 2000 tokens (hard limit)
- **Temperature:** 0.7 (fixed)
- **No Prompt Caching:** All prompts built dynamically per request
- **No Batch Processing:** All calls are real-time synchronous

---

## Table of Contents

1. [LLM Entrypoints & Data Flow](#llm-entrypoints--data-flow)
2. [Prompt Templates Inventory](#prompt-templates-inventory)
3. [Token Usage Analysis](#token-usage-analysis)
4. [Cost Estimation](#cost-estimation)
5. [Current Limits & Guardrails](#current-limits--guardrails)
6. [Recommendations](#recommendations)
7. [Prompt Caching Opportunities](#prompt-caching-opportunities)
8. [Batch Processing Opportunities](#batch-processing-opportunities)
9. [Code Pointers](#code-pointers)

---

## 1. LLM Entrypoints & Data Flow

### 1.1 Backend Routes

#### Route 1: `POST /analyze`
- **File:** `apps/api/main.py:710-756`
- **Handler:** `analyze_transcript_endpoint`
- **Service:** `llm_refinement.analyze_and_refine`
- **Request Model:** `AnalyzeRequest` (`apps/api/models.py:113-124`)
- **Response Model:** `AnalyzeResponse` (`apps/api/models.py:129-138`)
- **Features:** Analytics (filler words, confidence, clarity) + LLM refinement

#### Route 2: `POST /refine`
- **File:** `apps/api/main.py:671-707`
- **Handler:** `refine_draft`
- **Service:** `llm_refinement.refine_transcript`
- **Request Model:** `RefineRequest` (`apps/api/models.py:96-106`)
- **Response Model:** `RefineResponse` (`apps/api/models.py:108-110`)
- **Features:** LLM refinement only (no analytics)

### 1.2 Frontend Usage

#### Feature 1: Application Essay (Speak Flow)
- **File:** `apps/web/src/pages/Speak.jsx:251-262`
- **Endpoint:** `POST /analyze`
- **Session Type:** `application`
- **Input Flow:**
  1. User records audio → Deepgram WebSocket → `rawTranscript` (verbatim)
  2. On "Finish": `handleFinish` → `POST /analyze`
  3. Request includes: `raw_transcript`, `session_type: 'application'`, `question`, `user_context`, `reference_text`, `reference_file_url`, `desired_tone`, `goal`
- **Output Flow:**
  1. Backend returns: `refined_text`, `confidence_score`, `clarity_score`, `filler_word_count`
  2. Frontend stores: `refinedTranscript` (LLM output), `rawTranscript` (frozen)
  3. Session data: `transcript` (raw), `refinedDraft` (refined)
  4. UI: Review page shows "Before (Raw)" and "After (Refined)"

#### Feature 2: Interview Response (Speak Flow)
- **File:** `apps/web/src/pages/Speak.jsx:251-262`
- **Endpoint:** `POST /analyze`
- **Session Type:** `interview`
- **Input Flow:**
  1. User provides: `companyName`, `companyContext` (optional), `contextPrompt` (question)
  2. Recording → `rawTranscript` → `POST /analyze`
  3. Request includes: `company_name` (for research if context empty), `user_context` (company context)
- **Output Flow:** Same as Application Essay

#### Feature 3: Free Speak (Speak Flow)
- **File:** `apps/web/src/pages/Speak.jsx:251-262`
- **Endpoint:** `POST /analyze`
- **Session Type:** `free`
- **Input Flow:**
  1. Recording → `rawTranscript` → `POST /analyze`
  2. Minimal context (no question, optional goal/tone)
- **Output Flow:** Same as Application Essay

#### Feature 4: Refine Existing Draft
- **File:** `apps/web/src/pages/RefineDraft.jsx:129-139`
- **Endpoint:** `POST /refine`
- **Session Type:** `refine`
- **Input Flow:**
  1. User uploads draft (text or file) → `existingDraft`
  2. Optional: Voice instructions → `voiceNotes`
  3. `handleRefine` → `POST /refine`
  4. Request includes: `raw_transcript: existingDraft`, `user_context` (question + voice notes), `reference_file_url`
- **Output Flow:**
  1. Backend returns: `refined_text` only
  2. Frontend stores: `refinedDraft` in session
  3. Navigates to Draft page with refined text

#### Feature 5: Practice Mode
- **File:** `apps/web/src/pages/Practice.jsx:196-201`
- **Endpoint:** `POST /analyze`
- **Session Type:** `practice`
- **Input Flow:**
  1. User records practice response → `rawTranscript`
  2. `handleStopRecording` → `POST /analyze`
  3. Request includes: `raw_transcript`, `session_type: 'practice'`, `question`, `goal: 'natural'`
- **Output Flow:**
  1. Backend returns: Analytics + refined text
  2. Frontend maps: `clarity`, `confidence`, `fillers`, `improvedAnswer`
  3. UI: Feedback panel with scores and improved answer

### 1.3 Data Storage

**Raw Transcript Storage:**
- Frontend state: `rawTranscript` (during recording), `sessionData.transcript` (after finish)
- Database: `recordings.transcript` (verbatim, includes filler words)
- **Location:** `apps/web/src/pages/Speak.jsx:58, 268`

**Refined Transcript Storage:**
- Frontend state: `refinedTranscript`, `sessionData.refinedDraft`
- Database: `recordings.refined_draft` (LLM output, polished)
- **Location:** `apps/web/src/pages/Speak.jsx:59, 270`

**Analytics Storage:**
- Database: `recordings.clarity_score`, `confidence_score`, `filler_count`
- **Location:** `apps/api/main.py:743-748`

---

## 2. Prompt Templates Inventory

### 2.1 Base System Prompt

**Location:** `apps/api/llm_refinement.py:15-28`

```python
BASE_SYSTEM_PROMPT = """You are an expert writing coach and editor specializing in refining spoken responses into polished, submission-ready written content.

The input you receive is a verbatim transcript of how a user spoke naturally. It may contain filler words, repetitions, false starts, and informal phrasing.

Your core principles:
- Remove filler words (um, uh, like, you know, etc.) while preserving natural flow
- Improve clarity and structure without losing the user's authentic voice
- Preserve the user's unique story, perspective, and meaning
- Maintain the user's personal voice and style—never generic or AI-sounding
- Do NOT invent new information or add content the user didn't express
- Do NOT over-formalize unless explicitly requested
- The output must sound 100% human—indistinguishable from naturally written text

Your goal: Transform raw speech into polished, authentic, submission-ready content that sounds like the user wrote it themselves after careful editing."""
```

**Token Estimate:** ~200 tokens (system message)

### 2.2 Context-Specific System Prompts

**Location:** `apps/api/llm_refinement.py:60-150`

Each session type adds context-specific guidance:

#### Interview (`apps/api/llm_refinement.py:76-85`)
```python
ADDITIONAL CONTEXT FOR INTERVIEW RESPONSES:
- You are refining responses for behavioral interviews
- Consider the company culture, values, and role requirements provided by the user
- Reference industry best practices for interview responses
- Emphasize concrete examples, impact, and results (STAR method principles)
- Maintain authenticity while highlighting relevant skills and experiences
- The output should demonstrate the candidate's fit for the role and company culture
```
**Token Estimate:** ~80 tokens

#### Application (`apps/api/llm_refinement.py:87-97`)
```python
ADDITIONAL CONTEXT FOR APPLICATION ESSAYS:
- You are refining application essays (college admissions, scholarships, etc.)
- Reference award-winning, non-AI written essays as style guides (maintain authentic voice, avoid generic phrasing)
- Emphasize the user's unique story and perspective
- Ensure the essay demonstrates personal growth, reflection, and authenticity
- Avoid clichéd language and overused phrases
- The output should stand out while remaining genuine and compelling
- Maintain the user's authentic voice—never sound generic or AI-generated
```
**Token Estimate:** ~95 tokens

#### Practice (`apps/api/llm_refinement.py:99-107`)
```python
ADDITIONAL CONTEXT FOR PRACTICE MODE:
- You are refining practice responses for skill development
- Provide clear, actionable feedback while maintaining the user's voice
- Emphasize improvement opportunities and strengths
- Keep the tone supportive and encouraging
- The output should help the user practice and improve their communication skills
```
**Token Estimate:** ~55 tokens

#### Refine (`apps/api/llm_refinement.py:109-117`)
```python
ADDITIONAL CONTEXT FOR DRAFT REFINEMENT:
- You are refining an existing written draft based on user voice instructions
- Incorporate the user's requested changes while maintaining the original voice
- Pay close attention to the user's specific instructions for what to change
- Preserve the core message and structure unless explicitly requested to change
- The output should reflect the user's intended improvements while staying authentic
```
**Token Estimate:** ~65 tokens

#### Free (`apps/api/llm_refinement.py:119-126`)
```python
ADDITIONAL CONTEXT FOR FREE SPEAK:
- You are refining general speech into polished written content
- Maintain a conversational yet polished tone
- Keep the user's authentic voice and style
- The output should be natural, clear, and engaging
```
**Token Estimate:** ~40 tokens

### 2.3 Voice Profile Integration

**Location:** `apps/api/llm_refinement.py:129-148`

If voice profile exists, adds:
- Tone preference
- Confidence level target
- Emotional depth target
- Sentence length preference
- Preferred words (up to 10)
- Avoided words (up to 10)
- Example responses (truncated to 500 chars)

**Token Estimate:** ~150-300 tokens (variable)

### 2.4 User Prompt Templates

**Location:** `apps/api/llm_refinement.py:173-419`

The user prompt is built dynamically. Structure:

1. **Interview Context** (if session_type == "interview"):
   - If `user_context` provided: Includes context directly (~50-500 tokens)
   - If `company_name` only: Research instructions (~180 tokens) (`apps/api/llm_refinement.py:216-244`)
   - If neither: Generic interview instructions

2. **Application Context** (if session_type == "application" and `user_context`):
   - Includes question/context (~50-500 tokens)

3. **Refinement Instructions** (if session_type == "refine" and `user_context`):
   - User's voice instructions (~20-200 tokens)

4. **Question/Prompt** (if `question` provided):
   - Format: `PROMPT/QUESTION: {question}` (~10-100 tokens)

5. **Goal** (if `goal` provided):
   - Format: `USER'S GOAL: {goal}` (~10-80 tokens)

6. **Desired Tone** (if `desired_tone` provided):
   - Format: `DESIRED TONE: {tone}` (~10 tokens)

7. **Reference Text** (if `reference_text` provided):
   - Smart truncated (max 2000 chars, keeps first 40% + last 40%)
   - Format: `REFERENCE STYLE/MATERIAL: {truncated_text}` (~300-500 tokens)

8. **Reference File URL** (if `reference_file_url` provided):
   - For images: Note about Vision API (~30 tokens)
   - For documents: Note about text extraction (~40 tokens)

9. **Raw Transcript**:
   - Format: `RAW TRANSCRIPT (verbatim speech): """{raw_transcript}"""` (~63 tokens overhead + transcript tokens)

10. **Instructions** (session-specific):

#### Interview Instructions (`apps/api/llm_refinement.py:336-370`)
```python
INSTRUCTIONS:
Refine this interview response to:
1. Remove filler words and hesitations
2. Structure responses using the STAR method (Situation, Task, Action, Result) where applicable
3. [Context-specific: Align with company / Research company / Generic guidance]
4. Emphasize concrete examples and measurable impact
5. Maintain the user's authentic voice—never sound scripted or generic
6-8. [Additional context-specific points]

Output a polished, authentic response that [context-specific ending]
```
**Token Estimate:** ~120-180 tokens (varies by context)

#### Application Instructions (`apps/api/llm_refinement.py:372-382`)
```python
INSTRUCTIONS:
Refine this application essay to:
1. Remove filler words and improve clarity
2. Emphasize the user's unique story and authentic perspective
3. Reference award-winning essay styles—avoid generic or AI-sounding language
4. Ensure the essay demonstrates personal growth, reflection, and authenticity
5. Make it compelling and memorable while remaining genuine
6. Maintain the user's authentic voice—the essay should sound uniquely theirs

Output a polished, authentic essay that stands out while remaining genuine and compelling.
```
**Token Estimate:** ~110 tokens

#### Practice Instructions (`apps/api/llm_refinement.py:395-404`)
```python
INSTRUCTIONS:
Refine this practice response to:
1. Remove filler words and improve clarity
2. Provide a polished version that demonstrates best practices
3. Maintain the user's authentic voice and style
4. Keep the tone supportive and encouraging
5. Ensure the output helps the user understand how to improve

Output a polished, authentic response that demonstrates effective communication while maintaining the user's voice.
```
**Token Estimate:** ~85 tokens

#### Refine Instructions (`apps/api/llm_refinement.py:384-393`)
```python
INSTRUCTIONS:
Refine this draft according to the instructions above:
1. Apply the requested changes while preserving the original voice
2. Maintain the core message and structure unless explicitly requested to change
3. Incorporate the user's specific improvement requests
4. Ensure the refined version sounds natural and authentic—never AI-generated
5. Preserve the user's unique style and perspective

Output a refined version that incorporates the requested changes while maintaining authenticity.
```
**Token Estimate:** ~95 tokens

#### Free Instructions (`apps/api/llm_refinement.py:406-415`)
```python
INSTRUCTIONS:
Refine this speech to:
1. Remove filler words and hesitations
2. Improve clarity and flow
3. Maintain the user's authentic voice and conversational style
4. Keep it natural and engaging
5. Ensure the output sounds 100% human—never generic or AI-generated

Output a polished, authentic response that sounds like the user wrote it themselves after careful editing.
```
**Token Estimate:** ~80 tokens

### 2.5 Prompt Summary Table

| Component | Location | Base Tokens | Variable Tokens | Uses |
|-----------|----------|-------------|-----------------|------|
| Base System Prompt | `llm_refinement.py:15-28` | 200 | 0 | All features |
| Interview Context | `llm_refinement.py:76-85` | 80 | 0-500 (user_context) or 180 (research) | Interview only |
| Application Context | `llm_refinement.py:87-97` | 95 | 0-500 (user_context) | Application only |
| Practice Context | `llm_refinement.py:99-107` | 55 | 0 | Practice only |
| Refine Context | `llm_refinement.py:109-117` | 65 | 0-200 (user_context) | Refine only |
| Free Context | `llm_refinement.py:119-126` | 40 | 0 | Free only |
| Voice Profile | `llm_refinement.py:129-148` | 0 | 150-300 (if exists) | All (if profile exists) |
| User Prompt Structure | `llm_refinement.py:173-419` | 300-600 | Variable | All features |
| Interview Instructions | `llm_refinement.py:336-370` | 120-180 | 0 | Interview only |
| Application Instructions | `llm_refinement.py:372-382` | 110 | 0 | Application only |
| Practice Instructions | `llm_refinement.py:395-404` | 85 | 0 | Practice only |
| Refine Instructions | `llm_refinement.py:384-393` | 95 | 0 | Refine only |
| Free Instructions | `llm_refinement.py:406-415` | 80 | 0 | Free only |

---

## 3. Token Usage Analysis

### 3.1 Token Estimation Methodology

**Note:** Token counting requires `tiktoken` library. The following estimates use:
- **Approximation:** ~1 token ≈ 4 characters (English text)
- **GPT-4o/GPT-4o-mini:** Use `cl100k_base` tokenizer
- **For precise counts:** Install `tiktoken` and run: `tiktoken.encoding_for_model("gpt-4o").encode(text)`

### 3.2 Typical Input Sizes

**Transcript Variants:**
- **Short:** 250 words ≈ 1000 characters ≈ **250 tokens**
- **Medium:** 600 words ≈ 2400 characters ≈ **600 tokens**
- **Long:** 1000 words ≈ 4000 characters ≈ **1000 tokens**

**User Instructions:**
- **Short:** 20 words ≈ 80 characters ≈ **20 tokens**
- **Medium:** 80 words ≈ 320 characters ≈ **80 tokens**

**Reference Text:**
- **Typical:** 300 words ≈ 1200 characters ≈ **300 tokens** (truncated to 2000 chars max)

**Question/Context:**
- **Short:** 50 words ≈ 200 characters ≈ **50 tokens**
- **Medium:** 200 words ≈ 800 characters ≈ **200 tokens**

### 3.3 Feature Token Breakdown

#### Feature 1: Application Essay

**Prompt Tokens (Base, no user content):**
- System: 200 tokens
- Application Context: 95 tokens
- Application Instructions: 110 tokens
- User Prompt Structure: ~400 tokens (question, goal, tone placeholders)
- **Total Base:** ~805 tokens

**Typical Input Tokens:**
- Transcript (600 words): 600 tokens
- Question (200 words): 200 tokens
- Goal (80 words): 80 tokens
- Reference text (300 words, truncated): 300 tokens
- **Total Variable:** ~1180 tokens

**Total Input (Typical):** ~1985 tokens

**Output Cap:** 2000 tokens (current)  
**Expected Output:** ~400-800 tokens (refined essay)

#### Feature 2: Interview Response (with Company Research)

**Prompt Tokens (Base, no user content):**
- System: 200 tokens
- Interview Context: 80 tokens
- Research Instructions: 180 tokens
- Interview Instructions (research variant): 180 tokens
- User Prompt Structure: ~450 tokens
- **Total Base:** ~1090 tokens

**Typical Input Tokens:**
- Transcript (600 words): 600 tokens
- Question (200 words): 200 tokens
- Company name: 10 tokens
- **Total Variable:** ~810 tokens

**Total Input (Typical):** ~1900 tokens

**Output Cap:** 2000 tokens (current)  
**Expected Output:** ~300-600 tokens (interview response)

#### Feature 3: Interview Response (with User Context)

**Prompt Tokens (Base, no user content):**
- System: 200 tokens
- Interview Context: 80 tokens
- Interview Instructions (with context): 120 tokens
- User Prompt Structure: ~400 tokens
- **Total Base:** ~800 tokens

**Typical Input Tokens:**
- Transcript (600 words): 600 tokens
- Question (200 words): 200 tokens
- Company context (500 words): 500 tokens
- **Total Variable:** ~1300 tokens

**Total Input (Typical):** ~2100 tokens

**Output Cap:** 2000 tokens (current)  
**Expected Output:** ~300-600 tokens

#### Feature 4: Free Speak

**Prompt Tokens (Base, no user content):**
- System: 200 tokens
- Free Context: 40 tokens
- Free Instructions: 80 tokens
- User Prompt Structure: ~300 tokens
- **Total Base:** ~620 tokens

**Typical Input Tokens:**
- Transcript (600 words): 600 tokens
- Goal (optional, 80 words): 80 tokens
- **Total Variable:** ~680 tokens

**Total Input (Typical):** ~1300 tokens

**Output Cap:** 2000 tokens (current)  
**Expected Output:** ~400-800 tokens

#### Feature 5: Refine Draft

**Prompt Tokens (Base, no user content):**
- System: 200 tokens
- Refine Context: 65 tokens
- Refine Instructions: 95 tokens
- User Prompt Structure: ~350 tokens
- **Total Base:** ~710 tokens

**Typical Input Tokens:**
- Draft (400 words): 400 tokens
- User instructions (200 words): 200 tokens
- Question (100 words): 100 tokens
- **Total Variable:** ~700 tokens

**Total Input (Typical):** ~1410 tokens

**Output Cap:** 2000 tokens (current)  
**Expected Output:** ~350-700 tokens (refined draft)

#### Feature 6: Practice Mode

**Prompt Tokens (Base, no user content):**
- System: 200 tokens
- Practice Context: 55 tokens
- Practice Instructions: 85 tokens
- User Prompt Structure: ~350 tokens
- **Total Base:** ~690 tokens

**Typical Input Tokens:**
- Transcript (200 words): 200 tokens
- Question (100 words): 100 tokens
- **Total Variable:** ~300 tokens

**Total Input (Typical):** ~990 tokens

**Output Cap:** 2000 tokens (current)  
**Expected Output:** ~200-400 tokens (practice response)

### 3.4 Token Usage Summary Table

| Feature | Prompt Tokens (Base) | Typical Input Tokens | Output Cap | Expected Output | Total Tokens (Input+Output) |
|---------|---------------------|---------------------|------------|-----------------|----------------------------|
| Application Essay | 805 | 1180 | 2000 | 600 | 2585 |
| Interview (Research) | 1090 | 810 | 2000 | 450 | 2350 |
| Interview (Context) | 800 | 1300 | 2000 | 450 | 2550 |
| Free Speak | 620 | 680 | 2000 | 600 | 1900 |
| Refine Draft | 710 | 700 | 2000 | 525 | 1935 |
| Practice Mode | 690 | 300 | 2000 | 300 | 1290 |

**Notes:**
- "Prompt Tokens (Base)" = System + Context + Instructions + structure (no user content)
- "Typical Input Tokens" = Transcript + question + context + reference (typical usage)
- Output cap is hard limit; expected output is typical refined length
- Total = Input + Expected Output (for cost calculation)

---

## 4. Cost Estimation

### 4.1 Model Pricing Constants

**Pricing (as of January 2026):**
- **GPT-4o-mini:**
  - Input: $0.15 per 1M tokens
  - Output: $0.60 per 1M tokens
- **GPT-4o (Vision API):**
  - Input: $2.50 per 1M tokens
  - Output: $10.00 per 1M tokens
- **GPT-4.1-mini (if used):**
  - Input: $0.40 per 1M tokens
  - Output: $1.60 per 1M tokens

**Current Usage:**
- Text refinement: **GPT-4o-mini** (`apps/api/llm_refinement.py:520`)
- Image refinement: **GPT-4o** (`apps/api/llm_refinement.py:504`)

### 4.2 Cost Per Call

Using GPT-4o-mini pricing (text refinement):

| Feature | Input Tokens | Output Tokens | Input Cost | Output Cost | **Total Cost/Call** |
|---------|--------------|---------------|------------|-------------|---------------------|
| Application Essay | 1985 | 600 | $0.000298 | $0.000360 | **$0.000658** |
| Interview (Research) | 1900 | 450 | $0.000285 | $0.000270 | **$0.000555** |
| Interview (Context) | 2100 | 450 | $0.000315 | $0.000270 | **$0.000585** |
| Free Speak | 1300 | 600 | $0.000195 | $0.000360 | **$0.000555** |
| Refine Draft | 1410 | 525 | $0.000212 | $0.000315 | **$0.000527** |
| Practice Mode | 990 | 300 | $0.000149 | $0.000180 | **$0.000329** |

**Average Cost/Call:** ~$0.000535 (assuming equal distribution)

**Image Refinement (GPT-4o):**
- Input: ~2000 tokens (text) + image
- Output: ~500 tokens
- **Cost:** ~$0.005 (input) + $0.005 (output) = **~$0.01 per image refinement**

### 4.3 Monthly Burn Scenarios

**Assumptions:**
- Average cost/call: $0.000535 (text)
- Image refinement: 5% of calls, $0.01 each
- Weighted average: (0.95 × $0.000535) + (0.05 × $0.01) = **$0.001008 per call**

**Scenario A: 50 calls/day**
- Monthly calls: 50 × 30 = **1,500 calls**
- Monthly cost: 1,500 × $0.001008 = **$1.51/month**

**Scenario B: 200 calls/day**
- Monthly calls: 200 × 30 = **6,000 calls**
- Monthly cost: 6,000 × $0.001008 = **$6.05/month**

**Scenario C: 500 calls/day**
- Monthly calls: 500 × 30 = **15,000 calls**
- Monthly cost: 15,000 × $0.001008 = **$15.12/month**

---

## 5. Current Limits & Guardrails

### 5.1 Output Limits

**Location:** `apps/api/llm_refinement.py:530`

```python
max_tokens=2000,  # Sufficient for most responses
```

**Status:** Hard limit applied uniformly across all features  
**Issue:** Too high for most use cases (typical output: 300-800 tokens)  
**Recommendation:** Feature-specific caps (see Recommendations)

### 5.2 Temperature

**Location:** `apps/api/llm_refinement.py:529`

```python
temperature=0.7,  # Balance creativity and consistency
```

**Status:** Fixed at 0.7 for all features  
**Rationale:** Balances creativity and consistency  
**Recommendation:** Consider 0.5-0.6 for refinement tasks (more deterministic)

### 5.3 Input Validation

**Location:** `apps/api/models.py:96-124`

**Request Model Limits:**
- `raw_transcript`: max_length=50000 (Pydantic validation)
- `user_context`: max_length=5000
- `reference_text`: max_length=10000
- `question`: max_length=1000
- `goal`: max_length=500
- `company_name`: max_length=100

**Status:** Enforced at API layer  
**Recommendation:** Add token-level validation (see Recommendations)

### 5.4 Rate Limiting

**Location:** `apps/api/main.py:684, 726`

```python
rate_limit_middleware(f"refine:{user['id']}")
rate_limit_middleware(f"analyze:{user['id']}")
```

**Status:** Per-user rate limiting (60 requests/minute default)  
**Location:** `apps/api/rate_limit.py`

### 5.5 Credits System

**Location:** `apps/api/main.py:687-692, 728-733`

**Status:** Credits enforced per call (1 credit per refinement)  
**Location:** `apps/api/credits.py`

---

## 6. Recommendations

### 6.1 Quick Wins (≤30 mins each)

#### R1: Feature-Specific Output Caps
**Priority:** High  
**Impact:** 20-40% cost reduction  
**Location:** `apps/api/llm_refinement.py:530`

**Current:** `max_tokens=2000` (uniform)

**Proposed:**
```python
# Feature-specific output caps
OUTPUT_CAPS = {
    "practice": 400,      # Practice responses are shorter
    "interview": 600,     # Interview responses: 300-600 words
    "application": 1000,  # Essays: 400-800 words
    "refine": 800,        # Refined drafts: 350-700 words
    "free": 800,          # Free speak: 400-800 words
}

max_tokens = OUTPUT_CAPS.get(session_type, 800)  # Safe default
```

**Savings:** ~$0.0001-0.0002 per call (reduces unused output tokens)

#### R2: Reduce Temperature for Refinement
**Priority:** Medium  
**Impact:** Minor cost reduction, better consistency  
**Location:** `apps/api/llm_refinement.py:529`

**Proposed:**
```python
temperature=0.5,  # More deterministic for refinement tasks
```

**Rationale:** Refinement is editing, not creative writing. Lower temperature reduces variance.

#### R3: Truncate Voice Profile Examples
**Priority:** Low  
**Impact:** 50-100 token reduction  
**Location:** `apps/api/llm_refinement.py:146`

**Current:** `example_responses[:500]` (500 chars)

**Proposed:**
```python
example_responses[:200]  # Reduce to 200 chars (keep style, remove bulk)
```

#### R4: Shorten Base System Prompt
**Priority:** Medium  
**Impact:** 50-100 token reduction  
**Location:** `apps/api/llm_refinement.py:15-28`

**Current:** ~200 tokens

**Proposed:** Condense to ~150 tokens (remove redundancy):
```python
BASE_SYSTEM_PROMPT = """You are an expert writing coach refining spoken responses into polished, submission-ready written content.

Input: Verbatim transcript (may contain filler words, repetitions, false starts).

Your principles:
- Remove filler words while preserving natural flow
- Improve clarity/structure without losing authentic voice
- Preserve unique story, perspective, and meaning
- Maintain personal voice—never generic or AI-sounding
- Do NOT invent information or over-formalize

Output: Polished, authentic content that sounds like the user wrote it after careful editing."""
```

#### R5: Remove Redundant Instructions
**Priority:** Low  
**Impact:** 20-40 token reduction per feature  
**Location:** `apps/api/llm_refinement.py:336-415`

**Issue:** Instructions repeat points already in system prompt

**Example (Interview):**
- Remove "Remove filler words" (already in system prompt)
- Remove "Maintain authentic voice" (already in system prompt)

**Proposed:** Keep only session-specific instructions (STAR method, company alignment, etc.)

### 6.2 Medium Efforts (half-day each)

#### R6: Implement Token-Level Validation
**Priority:** High  
**Impact:** Prevents over-limit errors, cost predictability  
**Location:** `apps/api/models.py`, `apps/api/llm_refinement.py`

**Proposed:**
```python
# Add to llm_refinement.py
import tiktoken

def estimate_tokens(text: str, model: str = "gpt-4o-mini") -> int:
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

# Validate before API call
total_input_tokens = estimate_tokens(system_prompt) + estimate_tokens(user_prompt)
if total_input_tokens > 128000:  # GPT-4o-mini context limit
    raise ValueError(f"Input too long: {total_input_tokens} tokens (max 128000)")
```

#### R7: Structured Outputs (JSON Schema)
**Priority:** Medium  
**Impact:** 10-20% output token reduction, better parsing  
**Location:** `apps/api/llm_refinement.py:526-531`

**Proposed:**
```python
response = client.chat.completions.create(
    model=model,
    messages=messages,
    temperature=0.5,
    max_tokens=OUTPUT_CAPS[session_type],
    response_format={"type": "json_object"},  # Force JSON
)
```

**Schema:**
```json
{
  "refined_text": "string",
  "changes_summary": "string (optional)"
}
```

**Savings:** Removes "Output a polished..." instruction text, forces concise output.

#### R8: Smart Reference Text Summarization
**Priority:** Medium  
**Impact:** 100-200 token reduction for long references  
**Location:** `apps/api/llm_refinement.py:153-170`

**Current:** Keeps first 40% + last 40% (hard truncation)

**Proposed:**
- If reference > 1000 words: Summarize middle section (use LLM or extractive summarization)
- Keep first 20% + summarized middle + last 20%
- **Alternative:** Extract key style patterns (sentence length, tone words) instead of full text

#### R9: Cache Voice Profile in Request Scope
**Priority:** Low  
**Impact:** Reduces DB calls (not token reduction)  
**Location:** `apps/api/llm_refinement.py:467-468`

**Current:** Fetches voice profile per request

**Proposed:** Cache in memory (TTL: 5 minutes) or pass from endpoint

#### R10: Separate Cheap vs Expensive Tasks
**Priority:** High  
**Impact:** 50-70% cost reduction for simple tasks  
**Location:** `apps/api/llm_refinement.py:422-556`

**Current:** All refinement uses GPT-4o-mini

**Proposed:**
- **Simple tasks (filler removal only):** Use GPT-4o-mini
- **Complex tasks (company research, style matching):** Use GPT-4o-mini
- **Future:** Consider GPT-4o-mini for all (current is already cost-optimized)

**Note:** Already using cheapest model; this recommendation is for future model selection.

### 6.3 Bigger Refactors

#### R11: Prompt Caching (OpenAI API Feature)
**Priority:** High  
**Impact:** 50-70% input token cost reduction for repeated prompts  
**Location:** `apps/api/llm_refinement.py`

**Proposed:**
1. Identify static prompt segments (system prompt, context, instructions)
2. Use OpenAI's prompt caching API (requires `seed` parameter + cached prompt)
3. Cache system message + context (varies by session_type, voice_profile)
4. Only send variable content (transcript, question, goal) per request

**Implementation:**
```python
# Build cached prompt (system + context + instructions)
cached_prompt = build_context_specific_system_prompt(...) + build_instructions(...)
cached_prompt_id = cache_prompt(cached_prompt)  # OpenAI API

# Per request: only send variable content
messages = [
    {"role": "system", "content": cached_prompt_id},  # Reference cached prompt
    {"role": "user", "content": variable_content}  # Only transcript + question + goal
]
```

**Savings:** ~50-70% of input tokens (system + context are cached)

**Trade-off:** Requires OpenAI API prompt caching (beta feature)

#### R12: Batch Processing for Non-Real-Time Tasks
**Priority:** Medium  
**Impact:** 50% cost reduction (batch API pricing)  
**Location:** `apps/api/main.py:671-756`

**Candidates:**
1. **Refine Draft:** Not real-time (user submits, waits for result)
   - **Location:** `apps/web/src/pages/RefineDraft.jsx:111-139`
   - **Current:** Synchronous POST /refine
   - **Proposed:** Queue job → Batch API → Webhook/WebSocket notification
   - **Savings:** 50% cost (batch API pricing)

2. **Background Analytics:** Future feature
   - Re-analyze old transcripts with new models
   - Batch process library sessions

**Trade-off:** Latency (batch jobs run within 24 hours; may need faster queue)

#### R13: Extractive Summarization for Long Transcripts
**Priority:** Low  
**Impact:** 100-300 token reduction for very long transcripts  
**Location:** `apps/api/llm_refinement.py`

**Proposed:**
- If transcript > 2000 words: Summarize first (extractive), then refine summary
- Use cheaper model for summarization (GPT-4o-mini)
- Refine summary (shorter input = fewer tokens)

**Trade-off:** Quality (extractive summarization may lose nuance)

---

## 7. Prompt Caching Opportunities

### 7.1 Static Prompt Segments

**Cacheable Components:**
1. **Base System Prompt** (`llm_refinement.py:15-28`)
   - **Tokens:** ~200
   - **Variability:** None (identical across all requests)
   - **Cache Key:** `system_base`

2. **Context-Specific System Prompt** (`llm_refinement.py:60-150`)
   - **Tokens:** 40-95 (varies by session_type)
   - **Variability:** Session type (5 variants)
   - **Cache Key:** `system_{session_type}`

3. **Session Instructions** (`llm_refinement.py:336-415`)
   - **Tokens:** 80-180 (varies by session_type + context variant)
   - **Variability:** Session type + context type (interview: 3 variants)
   - **Cache Key:** `instructions_{session_type}_{context_variant}`

4. **Voice Profile Guidance** (`llm_refinement.py:129-148`)
   - **Tokens:** 150-300 (if profile exists)
   - **Variability:** Per user (if profile exists)
   - **Cache Key:** `voice_profile_{user_id}` (TTL: 1 hour)

**Total Cacheable:** ~470-775 tokens per request (50-70% of input)

### 7.2 Variable Content (Not Cacheable)

- Raw transcript (changes every request)
- Question (changes every request)
- Goal (changes every request)
- User context (changes every request)
- Reference text (changes every request)

**Total Variable:** ~300-1500 tokens per request

### 7.3 Implementation Approach

**Option 1: OpenAI Prompt Caching API (Recommended)**
- **Requirements:** OpenAI API with prompt caching support
- **Implementation:** Use `seed` parameter + cached system message
- **Savings:** 50-70% input token cost
- **Complexity:** Medium (requires API changes)

**Option 2: Client-Side Prompt Caching (Alternative)**
- **Requirements:** Cache system prompts locally, only send variable content
- **Implementation:** Build messages with cached system + variable user content
- **Savings:** Same as Option 1 (if OpenAI supports it)
- **Complexity:** Low (code changes only)

**Option 3: Hybrid (Future)**
- Cache system prompts in Redis/DB
- Reuse across requests (same session_type + voice_profile)
- **Savings:** Minimal (OpenAI still charges for cached prompts in current API)

**Recommendation:** Implement Option 1 when OpenAI prompt caching is stable (currently beta).

---

## 8. Batch Processing Opportunities

### 8.1 Non-Real-Time Endpoints

#### Candidate 1: Refine Draft (`POST /refine`)
- **File:** `apps/api/main.py:671-707`
- **Frontend:** `apps/web/src/pages/RefineDraft.jsx:111-139`
- **Latency Requirement:** User waits for result (can accept 5-30 seconds)
- **Current:** Synchronous API call
- **Proposed:** Queue job → Batch API → WebSocket/Webhook notification
- **Savings:** 50% cost (batch API pricing: $0.075/$0.30 per 1M tokens)
- **Trade-off:** Latency (batch jobs run within 24 hours; may need fast queue)

**Recommendation:** Defer (current latency is acceptable; batch API adds complexity)

#### Candidate 2: Background Analytics (Future)
- **Use Case:** Re-analyze old transcripts with new models
- **Latency Requirement:** None (background job)
- **Proposed:** Batch API for library-wide re-analysis
- **Savings:** 50% cost
- **Trade-off:** None (background job)

### 8.2 Real-Time Endpoints (Not Candidates)

- **`POST /analyze`** (Speak flow): User waits for result immediately (real-time)
- **Practice Mode:** User expects immediate feedback (real-time)

**Recommendation:** Keep real-time for user-facing features.

---

## 9. Code Pointers

### 9.1 LLM Entrypoints

| Endpoint | File | Lines | Handler | Service |
|----------|------|-------|---------|---------|
| `POST /analyze` | `apps/api/main.py` | 710-756 | `analyze_transcript_endpoint` | `analyze_and_refine` |
| `POST /refine` | `apps/api/main.py` | 671-707 | `refine_draft` | `refine_transcript` |

### 9.2 Prompt Templates

| Component | File | Lines | Function |
|-----------|------|-------|----------|
| Base System Prompt | `apps/api/llm_refinement.py` | 15-28 | Constant |
| Context-Specific System | `apps/api/llm_refinement.py` | 60-150 | `build_context_specific_system_prompt` |
| User Prompt Builder | `apps/api/llm_refinement.py` | 173-419 | `build_user_prompt` |
| Instructions (Interview) | `apps/api/llm_refinement.py` | 336-370 | `build_user_prompt` |
| Instructions (Application) | `apps/api/llm_refinement.py` | 372-382 | `build_user_prompt` |
| Instructions (Practice) | `apps/api/llm_refinement.py` | 395-404 | `build_user_prompt` |
| Instructions (Refine) | `apps/api/llm_refinement.py` | 384-393 | `build_user_prompt` |
| Instructions (Free) | `apps/api/llm_refinement.py` | 406-415 | `build_user_prompt` |

### 9.3 Model Configuration

| Setting | File | Line | Current Value | Recommended |
|---------|------|------|---------------|-------------|
| Model (text) | `apps/api/llm_refinement.py` | 520 | `gpt-4o-mini` | Keep (cost-optimized) |
| Model (image) | `apps/api/llm_refinement.py` | 504 | `gpt-4o` | Keep (Vision API required) |
| Temperature | `apps/api/llm_refinement.py` | 529 | `0.7` | `0.5` (more deterministic) |
| Max Tokens | `apps/api/llm_refinement.py` | 530 | `2000` | Feature-specific (400-1000) |

### 9.4 Frontend Integration

| Feature | File | Lines | Endpoint | Session Type |
|---------|------|-------|----------|--------------|
| Application Essay | `apps/web/src/pages/Speak.jsx` | 251-262 | `POST /analyze` | `application` |
| Interview Response | `apps/web/src/pages/Speak.jsx` | 251-262 | `POST /analyze` | `interview` |
| Free Speak | `apps/web/src/pages/Speak.jsx` | 251-262 | `POST /analyze` | `free` |
| Refine Draft | `apps/web/src/pages/RefineDraft.jsx` | 129-139 | `POST /refine` | `refine` |
| Practice Mode | `apps/web/src/pages/Practice.jsx` | 196-201 | `POST /analyze` | `practice` |

### 9.5 Data Models

| Model | File | Lines | Key Fields |
|-------|------|-------|------------|
| `RefineRequest` | `apps/api/models.py` | 96-106 | `raw_transcript`, `session_type`, `user_context`, `reference_text`, `reference_file_url`, `question`, `goal`, `company_name` |
| `AnalyzeRequest` | `apps/api/models.py` | 113-124 | Same as `RefineRequest` + `duration_seconds` |
| `RefineResponse` | `apps/api/models.py` | 108-110 | `refined_text` |
| `AnalyzeResponse` | `apps/api/models.py` | 129-138 | `refined_text`, `confidence_score`, `clarity_score`, `filler_word_count`, etc. |

---

## 10. Recommended Next Steps

### Priority 1 (Immediate)
1. **Implement Feature-Specific Output Caps** (R1) - 30 mins
2. **Reduce Temperature** (R2) - 5 mins
3. **Add Token Validation** (R6) - half-day

### Priority 2 (Short-term)
4. **Shorten Base System Prompt** (R4) - 30 mins
5. **Remove Redundant Instructions** (R5) - 30 mins
6. **Implement Structured Outputs** (R7) - half-day

### Priority 3 (Future)
7. **Prompt Caching** (R11) - When OpenAI API supports it
8. **Batch Processing** (R12) - For background jobs

---

## Appendix A: Token Estimation Script

**Location:** `scripts/estimate_tokens.py` (to be created)

```python
import tiktoken
from llm_refinement import build_context_specific_system_prompt, build_user_prompt

def estimate_feature_tokens(session_type, transcript_words=600, has_voice_profile=False):
    encoding = tiktoken.encoding_for_model("gpt-4o-mini")
    
    # System prompt
    system_prompt = build_context_specific_system_prompt(session_type, voice_profile if has_voice_profile else None)
    system_tokens = len(encoding.encode(system_prompt))
    
    # User prompt (typical)
    user_prompt = build_user_prompt(
        raw_transcript=" ".join(["word"] * transcript_words),  # Mock transcript
        session_type=session_type,
        question="What is your greatest achievement?" if session_type in ["interview", "application"] else None,
        goal="Be confident and clear",
        reference_text=" ".join(["reference"] * 300) if session_type == "application" else None,
    )
    user_tokens = len(encoding.encode(user_prompt))
    
    return {
        "system_tokens": system_tokens,
        "user_tokens": user_tokens,
        "total_input": system_tokens + user_tokens,
    }

# Run for each feature
for session_type in ["application", "interview", "free", "refine", "practice"]:
    result = estimate_feature_tokens(session_type)
    print(f"{session_type}: {result['total_input']} tokens")
```

---

## Appendix B: Cost Optimization Summary

**Current Monthly Burn (200 calls/day):** $6.05/month

**After Quick Wins (R1-R5):**
- Output caps: -20% output tokens = -$1.20/month
- Prompt shortening: -10% input tokens = -$0.18/month
- **New Total:** ~$4.67/month (**23% reduction**)

**After Medium Efforts (R6-R10):**
- Structured outputs: -15% output tokens = -$0.90/month
- Smart summarization: -5% input tokens = -$0.09/month
- **New Total:** ~$3.68/month (**39% reduction from baseline**)

**After Prompt Caching (R11):**
- 50% input token reduction = -$1.51/month
- **New Total:** ~$2.17/month (**64% reduction from baseline**)

**Total Potential Savings:** Up to **64% cost reduction** with prompt caching.

---

**Report Generated:** January 2026  
**Next Review:** After implementing Priority 1 recommendations

---
name: Voira Production Readiness Plan
overview: Comprehensive checklist of implementation, hosting, and operational tasks needed to make Voira fully functional and production-ready, organized by category and priority.
todos: []
---

# Voira Production Readiness Plan

This plan identifies all tasks needed to make Voira fully functional for production. Tasks are organized by category and include implementation, hosting, configuration, and operational requirements.

## Critical Infrastructure (Must Complete First)

### 1. Database Setup & Migrations

**Status:** Manual steps required

- Run Supabase migrations in order:
- `supabase/migrations/20250101_create_tables.sql`
- `supabase/migrations/20250101_enable_rls.sql`
- `supabase/migrations/20250101_credits_functions.sql`
- `supabase/migrations/20251231_create_voice_profiles.sql`
- `supabase/migrations/20251231_voice_profiles_rls.sql`
- Populate `admin_emails` table with admin email addresses
- Verify RLS policies are working correctly
- Test user profile creation and credit assignment

**Files:** `supabase/README.md`, migration files in `supabase/migrations/`

---

### 2. Environment Configuration

**Status:** Templates exist, values needed

- **Backend** (`apps/api/.env`):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Backend-only key (never expose)
- `SUPABASE_ANON_KEY` - Public anon key
- `PORT` - Server port (default 8000)
- (Future) `REDIS_URL` - For production rate limiting
- (Future) `OPENAI_API_KEY` - For LLM features
- (Future) `DEEPGRAM_API_KEY` - For transcription
- **Frontend** (`apps/web/.env.local`):
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Public anon key
- `VITE_API_BASE_URL` - Backend API URL

**Files:** `.env` files need to be created from templates

---

## Core Functionality Implementation

### 3. Audio Transcription Service

**Status:** Placeholder in `/transcribe` endpoint
**Priority:** High - Core feature

- Integrate speech-to-text service (Deepgram recommended for real-time)
- Deepgram: Real-time streaming, good accuracy
- OpenAI Whisper: Better accuracy but slower
- AssemblyAI: Alternative option
- Implement `/transcribe` endpoint in `apps/api/main.py`
- Accept audio file uploads (WebM, WAV, MP3)
- Call transcription service
- Return transcript with confidence score
- Enforce credits (1 credit per transcription)
- Replace placeholder in frontend (`apps/web/src/components/recording/AudioRecorder.jsx`)
- Add error handling for transcription failures
- Consider streaming transcription for real-time feedback

**Files:** `apps/api/main.py` (line 193-222), `apps/web/src/components/recording/AudioRecorder.jsx`, `apps/web/src/components/services/api.jsx`

---

### 4. LLM Integration for Refinement & Analysis

**Status:** Using stubbed `base44.integrations.Core.InvokeLLM`
**Priority:** High - Core feature

- Replace `base44Client.js` stubs with real OpenAI/Anthropic integration
- Implement backend endpoint `/analyze` for transcript analysis:
- Confidence score calculation
- Clarity score calculation
- Filler word detection and counting
- Generate refined draft based on voice profile
- Implement backend endpoint `/refine` for draft refinement:
- Accept draft text and user instructions
- Use voice profile preferences (tone, confidence level, preferred/avoided words)
- Generate refined version maintaining user's voice
- Update frontend to call backend endpoints instead of base44 stubs
- Add voice profile context to LLM prompts

**Files:** `apps/web/src/api/base44Client.js`, `apps/web/src/pages/Speak.jsx`, `apps/web/src/pages/RefineDraft.jsx`, `apps/web/src/components/services/api.jsx`

---

### 5. File Storage for Audio & Uploads

**Status:** Returning `null` file_url, no storage configured
**Priority:** High - Required for audio playback

- Choose storage solution:
- **Option 1:** Supabase Storage (recommended - already using Supabase)
- **Option 2:** AWS S3 / Cloudflare R2
- **Option 3:** Cloudinary (good for media)
- Implement backend endpoint `/upload`:
- Accept file uploads (audio, documents)
- Store in chosen storage
- Return public URL
- Enforce file size limits (15MB for audio)
- Enforce credits for reference uploads (premium: unlimited, free: 1/month)
- Update frontend to use storage URLs
- Add cleanup job for orphaned files

**Files:** `apps/api/main.py`, `apps/web/src/components/services/api.jsx`

---

### 6. Voice Profiles Backend API

**Status:** Table exists, no backend endpoints
**Priority:** Medium - Enhances personalization

- Implement `/voice-profiles` endpoints:
- `GET /voice-profiles` - Get user's voice profile
- `POST /voice-profiles` - Create voice profile
- `PATCH /voice-profiles` - Update voice profile
- Add voice profile loading to refinement/analysis endpoints
- Update frontend `VoiceProfile.jsx` to use backend API instead of base44 stubs

**Files:** `apps/api/main.py`, `apps/web/src/pages/VoiceProfile.jsx`

---

### 7. Payment & Subscription Integration

**Status:** UI exists, no payment processing
**Priority:** High - Required for monetization

- Choose payment provider:
- **Stripe** (recommended - well documented)
- **Paddle** (good for SaaS)
- **LemonSqueezy** (simple setup)
- Implement Stripe integration:
- Create Stripe products for Free/Premium plans
- Implement `/billing/create-checkout` endpoint
- Implement `/billing/webhook` for subscription events
- Update user role in Supabase when subscription changes
- Handle subscription lifecycle (active, canceled, expired)
- Update `Pricing.jsx` to call checkout endpoint
- Add subscription management page

**Files:** `apps/api/main.py`, `apps/web/src/pages/Pricing.jsx`

---

## Production Infrastructure

### 8. Production Rate Limiting

**Status:** In-memory (dev only)
**Priority:** Medium - Security & cost control

- Set up Redis instance (Upstash Redis recommended - serverless)
- Update `apps/api/rate_limit.py` to use Redis instead of in-memory dict
- Configure rate limits per endpoint:
- `/transcribe`: 10 requests/minute
- `/sessions`: 20 requests/minute
- `/analyze`: 15 requests/minute
- Add rate limit headers to responses

**Files:** `apps/api/rate_limit.py`

---

### 9. CORS Configuration

**Status:** Only localhost allowed
**Priority:** High - Blocks production frontend

- Update CORS origins in `apps/api/main.py`:
- Add production frontend URL (e.g., `https://voira.app`)
- Keep localhost for development
- Consider environment-based configuration

**Files:** `apps/api/main.py` (line 27-34)

---

### 10. Deployment - Backend

**Status:** Not deployed
**Priority:** High - Required for production

- Choose hosting platform:
- **Render** (recommended - easy Python deployment)
- **Railway** (similar to Render)
- **Fly.io** (good for global distribution)
- **AWS/GCP** (more control, more setup)
- Configure deployment:
- Set build command: `pip install -r apps/api/requirements.txt`
- Set start command: `cd apps/api && gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
- Configure environment variables
- Set up health check endpoint monitoring
- Test deployment with staging URL
- Set up logging and monitoring (e.g., Sentry)

**Files:** `infra/README.md`, `apps/api/requirements.txt`

---

### 11. Deployment - Frontend

**Status:** Not deployed
**Priority:** High - Required for production

- Choose hosting platform:
- **Vercel** (recommended - excellent for React/Vite)
- **Netlify** (similar to Vercel)
- **Cloudflare Pages** (fast global CDN)
- Configure deployment:
- Set build command: `cd apps/web && npm install && npm run build`
- Set output directory: `apps/web/dist`
- Configure environment variables
- Set up custom domain
- Update backend CORS with production frontend URL

**Files:** `infra/README.md`

---

### 12. Domain & SSL Configuration

**Status:** Not configured
**Priority:** Medium - Professional appearance

- Register domain name (e.g., `voira.app`)
- Configure DNS:
- Point frontend domain to Vercel/Netlify
- Point API subdomain (e.g., `api.voira.app`) to backend
- SSL certificates (usually automatic with hosting platforms)

---

## Feature Completion

### 13. Practice Mode Backend

**Status:** Frontend exists, backend incomplete
**Priority:** Medium - Feature enhancement

- Implement `/practice` endpoints:
- `POST /practice/start` - Start practice session
- `POST /practice/feedback` - Get real-time feedback
- `POST /practice/complete` - End session and save
- Add coaching feedback logic:
- Real-time filler detection
- Pace monitoring
- Confidence indicators
- Integrate with voice profiles for personalized coaching

**Files:** `apps/api/main.py`, `apps/web/src/pages/Practice.jsx`

---

### 14. Session Analysis & Metrics

**Status:** Partially implemented
**Priority:** Low - Polish feature

- Complete analysis pipeline:
- Words per minute calculation (already partially done)
- Pause detection and analysis
- Emotion/tone detection
- Suggestions for improvement
- Add historical trend tracking
- Create analytics dashboard for users

**Files:** `apps/web/src/components/services/api.jsx` (analysis.analyzeSession)

---

## Operations & Monitoring

### 15. Error Tracking & Logging

**Status:** Not implemented
**Priority:** Medium - Essential for production

- Set up error tracking:
- **Sentry** (recommended for both frontend and backend)
- Or **Rollbar**, **LogRocket**
- Configure logging:
- Backend: Structured logging with Python `logging`
- Frontend: Error boundary with error reporting
- Set up alerts for critical errors

**Files:** Create new files for logging configuration

---

### 16. Database Backups & Maintenance

**Status:** Not configured
**Priority:** Medium - Data protection

- Configure Supabase automated backups
- Set up backup retention policy
- Create database maintenance scripts:
- Cleanup orphaned files
- Archive old sessions (optional)
- Credit reset verification

---

### 17. Security Hardening

**Status:** Basic security in place
**Priority:** High - Security review

- Security audit checklist:
- Verify all endpoints require authentication
- Test RLS policies work correctly
- Verify service_role key never exposed to frontend
- Add request size limits
- Implement CSRF protection if needed
- Set up security headers (CSP, HSTS, etc.)
- Penetration testing (optional but recommended)

**Files:** `SECURITY.md`, `apps/api/main.py`

---

## Optional Enhancements

### 18. Voice Profile Learning

**Status:** Static profile, no learning
**Priority:** Low - Future enhancement

- Implement ML-based learning:
- Analyze user's previous transcripts
- Learn preferred sentence structures
- Adapt tone and style preferences automatically
- Train on user's writing patterns
- Consider fine-tuning a small language model per user (advanced)

**Files:** New ML training pipeline (future work)

---

### 19. Email Notifications

**Status:** Not implemented
**Priority:** Low - User engagement

- Set up email service (SendGrid, Resend, or Supabase Auth emails)
- Send welcome emails
- Credit reset notifications
- Subscription reminders

---

### 20. Admin Dashboard

**Status:** Basic admin check exists
**Priority:** Low - Operations tool

- Build admin panel:
- User management
- Credit management
- Usage analytics
- System health monitoring

**Files:** `apps/web/src/pages/Admin.jsx` (enhance existing)

---

## Testing & Quality Assurance

### 21. End-to-End Testing

**Status:** Backend unit tests exist
**Priority:** Medium - Quality assurance

- Add E2E tests:
- User registration and login flow
- Recording and transcription flow
- Draft refinement flow
- Credit deduction verification
- Set up CI/CD pipeline:
- Run tests on PR
- Automated deployment on merge to main

**Files:** `tests/` directory, GitHub Actions workflow

---

### 22. Performance Optimization

**Status:** Not optimized
**Priority:** Low - Optimization

- Frontend optimizations:
- Code splitting
- Lazy loading
- Image optimization
- Bundle size reduction
- Backend optimizations:
- Response caching where appropriate
- Database query optimization
- Async task processing for heavy operations

---

## Documentation

### 23. API Documentation

**Status:** Basic OpenAPI schema
**Priority:** Low - Developer experience

- Enhance OpenAPI/Swagger docs
- Add request/response examples
- Document authentication flows
- Create Postman collection

**Files:** `apps/api/main.py` (FastAPI auto-generates from docstrings)

---

### 24. User Documentation

**Status:** Missing
**Priority:** Low - User support

- Create user guides:
- Getting started guide
- How to create voice profile
- Best practices for recording
- Troubleshooting guide

---

## Summary

**Critical Path (Must Complete for MVP):**

1. Database Setup & Migrations
2. Environment Configuration
3. Audio Transcription Service
4. LLM Integration
5. File Storage
6. Payment Integration
7. CORS Configuration
8. Backend Deployment
9. Frontend Deployment

**Important (Complete Soon After MVP):**

10. Voice Profiles Backend API
11. Production Rate Limiting
12. Error Tracking & Logging
13. Security Hardening

**Enhancements (Can Add Later):**
14-24. All other items
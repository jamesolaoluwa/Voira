# Voira Production Setup Guide

This guide covers all manual steps required to deploy Voira to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [External Services Setup](#external-services-setup)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [Backend Deployment](#backend-deployment)
6. [Frontend Deployment](#frontend-deployment)
7. [Post-Deployment Verification](#post-deployment-verification)
8. [Monitoring & Alerts](#monitoring--alerts)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- [ ] A [Supabase](https://supabase.com) account and project
- [ ] A [Deepgram](https://deepgram.com) account for transcription
- [ ] An [OpenAI](https://platform.openai.com) account for LLM features
- [ ] A [Sentry](https://sentry.io) account for error tracking
- [ ] A hosting platform account (Render, Railway, Vercel, etc.)
- [ ] A domain name (optional but recommended)

---

## External Services Setup

### 1. Supabase Setup

1. **Create a new project** at [supabase.com](https://supabase.com)

2. **Get your API keys** from Project Settings > API:
   - `SUPABASE_URL` - Your project URL (e.g., `https://xxx.supabase.co`)
   - `SUPABASE_ANON_KEY` - Public anon key (safe for frontend)
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key (backend only, NEVER expose)

3. **Run database migrations** in order:
   ```bash
   # In Supabase SQL Editor, run these files in order:
   supabase/migrations/20250101_create_tables.sql
   supabase/migrations/20250101_enable_rls.sql
   supabase/migrations/20250101_credits_functions.sql
   supabase/migrations/20251231_create_voice_profiles.sql
   supabase/migrations/20251231_voice_profiles_rls.sql
   ```

4. **Add admin emails** (SQL Editor):
   ```sql
   INSERT INTO admin_emails (email) VALUES ('your-admin@email.com');
   ```

5. **Configure authentication**:
   - Go to Authentication > URL Configuration
   - Set Site URL to your frontend URL (e.g., `https://voira.app`)
   - Add redirect URLs for OAuth if using social login

### 2. Deepgram Setup

1. **Create account** at [deepgram.com](https://deepgram.com)

2. **Create an API key**:
   - Go to Settings > API Keys
   - Create a new key with "Member" permissions
   - Copy the key (shown only once!)
   - Save as `DEEPGRAM_API_KEY`

3. **Recommended settings**:
   - Model: `nova-2` (best accuracy)
   - Language: `en` (or your target language)
   - Features: `smart_format`, `punctuate`, `interim_results`

### 3. OpenAI Setup

1. **Create account** at [platform.openai.com](https://platform.openai.com)

2. **Create an API key**:
   - Go to API Keys
   - Create a new key
   - Copy the key (starts with `sk-`)
   - Save as `OPENAI_API_KEY`

3. **Set up billing**:
   - Add a payment method
   - Set usage limits to prevent unexpected charges
   - Recommended: Start with $20/month limit

### 4. Sentry Setup

1. **Create account** at [sentry.io](https://sentry.io)

2. **Create two projects**:
   - **Backend (Python/FastAPI)**:
     - Platform: Python
     - Framework: FastAPI
     - Get DSN → `SENTRY_DSN`
   
   - **Frontend (React)**:
     - Platform: JavaScript
     - Framework: React
     - Get DSN → `VITE_SENTRY_DSN`

3. **Configure alerts** (optional but recommended):
   - Go to Alerts > Create Alert Rule
   - Set up alerts for error spikes
   - Add email/Slack notifications

### 5. Redis Setup (Optional but Recommended)

For production rate limiting, set up Redis:

**Option A: Upstash (Recommended - Serverless)**
1. Create account at [upstash.com](https://upstash.com)
2. Create a new Redis database
3. Copy the connection URL → `REDIS_URL`

**Option B: Redis Cloud**
1. Create account at [redis.com](https://redis.com)
2. Create a free database
3. Copy the connection string → `REDIS_URL`

---

## Environment Variables

### Backend Environment Variables

Create `apps/api/.env`:

```env
# =============================================================================
# REQUIRED
# =============================================================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# =============================================================================
# REQUIRED FOR FEATURES
# =============================================================================
DEEPGRAM_API_KEY=your-deepgram-key
OPENAI_API_KEY=sk-your-openai-key

# =============================================================================
# PRODUCTION SETTINGS
# =============================================================================
ENV=production

# CORS - Add your frontend URL
CORS_ORIGINS=https://voira.app,https://www.voira.app

# Error tracking
SENTRY_DSN=https://xxx@sentry.io/xxx

# Rate limiting (optional, falls back to in-memory)
REDIS_URL=redis://default:xxx@xxx.upstash.io:6379

# =============================================================================
# OPTIONAL TUNING
# =============================================================================
# LOG_LEVEL=INFO
# LOG_JSON=true
# RATE_LIMIT_PER_MINUTE=60
# MAX_REQUEST_SIZE=52428800
```

### Frontend Environment Variables

Create `apps/web/.env.production`:

```env
# =============================================================================
# REQUIRED
# =============================================================================
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=https://api.voira.app

# =============================================================================
# OPTIONAL
# =============================================================================
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## Database Setup

### Run Migrations

In Supabase SQL Editor, run each migration file in order:

1. **Create tables** (`20250101_create_tables.sql`):
   - Creates `profiles`, `sessions`, `admin_emails` tables

2. **Enable RLS** (`20250101_enable_rls.sql`):
   - Enables Row Level Security on all tables
   - Creates access policies

3. **Credits functions** (`20250101_credits_functions.sql`):
   - Creates functions for credit management
   - Adds triggers for automatic profile creation

4. **Voice profiles** (`20251231_create_voice_profiles.sql`):
   - Creates `voice_profiles` table

5. **Voice profiles RLS** (`20251231_voice_profiles_rls.sql`):
   - Enables RLS for voice profiles

### Verify Setup

Run this query to verify everything is set up:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public';
```

---

## Backend Deployment

### Option A: Render (Recommended)

1. **Create a new Web Service** at [render.com](https://render.com)

2. **Configure**:
   - Name: `voira-api`
   - Environment: `Python 3`
   - Build Command: `pip install -r apps/api/requirements.txt`
   - Start Command: `cd apps/api && gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`

3. **Add environment variables** (from Backend section above)

4. **Configure health check**:
   - Path: `/health/ready`
   - Period: 30 seconds

5. **Deploy**

### Option B: Railway

1. **Create a new project** at [railway.app](https://railway.app)

2. **Add a service** from GitHub

3. **Configure**:
   - Root Directory: `apps/api`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`

4. **Add environment variables**

5. **Deploy**

### Option C: Docker

Use the provided Dockerfile:

```bash
# Build
docker build -t voira-api -f infra/Dockerfile .

# Run locally
docker run -p 8000:8000 --env-file apps/api/.env voira-api

# Push to registry
docker tag voira-api your-registry/voira-api:latest
docker push your-registry/voira-api:latest
```

---

## Frontend Deployment

### Option A: Vercel (Recommended)

1. **Import project** at [vercel.com](https://vercel.com)

2. **Configure**:
   - Framework Preset: Vite
   - Root Directory: `apps/web`
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Add environment variables**:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   VITE_API_BASE_URL=https://api.voira.app
   VITE_SENTRY_DSN=...
   ```

4. **Configure domain** (optional):
   - Add custom domain
   - Configure SSL

5. **Deploy**

### Option B: Netlify

1. **Import project** at [netlify.com](https://netlify.com)

2. **Configure**:
   - Build Command: `cd apps/web && npm install && npm run build`
   - Publish Directory: `apps/web/dist`

3. **Add environment variables**

4. **Deploy**

### Option C: Cloudflare Pages

1. **Create a project** at [pages.cloudflare.com](https://pages.cloudflare.com)

2. **Configure**:
   - Build Command: `cd apps/web && npm install && npm run build`
   - Build Output: `apps/web/dist`

3. **Add environment variables**

4. **Deploy**

---

## Post-Deployment Verification

### 1. Backend Health Check

```bash
# Basic liveness
curl https://api.voira.app/health
# Expected: {"status": "ok"}

# Full readiness check
curl https://api.voira.app/health/ready
# Expected: {"status": "healthy", "ready": true, ...}

# Dependency status
curl https://api.voira.app/health/dependencies
# Check all dependencies are healthy
```

### 2. Frontend Verification

1. Open your frontend URL
2. Verify the app loads
3. Check browser console for errors
4. Test login flow

### 3. End-to-End Test

1. **Register/Login** - Create account or sign in
2. **Record** - Start a recording session
3. **Transcribe** - Verify live transcription works
4. **Save** - Save the session
5. **View Draft** - Check the draft page shows content
6. **Library** - Verify session appears in library

### 4. Error Tracking Verification

1. **Backend**: Check Sentry for any startup errors
2. **Frontend**: Trigger a test error and verify it appears in Sentry

---

## Monitoring & Alerts

### Sentry Alerts (Recommended)

Set up these alert rules:

1. **Error Spike Alert**:
   - When: Error count > 10 in 5 minutes
   - Action: Email notification

2. **New Issue Alert**:
   - When: A new error type is detected
   - Action: Email/Slack notification

3. **Performance Alert**:
   - When: p95 response time > 2s
   - Action: Email notification

### Uptime Monitoring (Recommended)

Use a service like:
- [UptimeRobot](https://uptimerobot.com) (free)
- [Better Uptime](https://betterstack.com/uptime)
- [Pingdom](https://pingdom.com)

Monitor these endpoints:
- `https://api.voira.app/health` (every 1 min)
- `https://voira.app` (every 5 min)

---

## Troubleshooting

### Common Issues

#### "CORS error" in frontend

1. Check `CORS_ORIGINS` includes your frontend URL
2. Include both `https://` and `https://www.` versions
3. Restart backend after changing

#### "Transcription not working"

1. Check `DEEPGRAM_API_KEY` is set and valid
2. Check Deepgram dashboard for usage/errors
3. Verify browser has microphone permissions

#### "LLM refinement not working"

1. Check `OPENAI_API_KEY` is set and valid
2. Check OpenAI dashboard for billing/usage
3. Check backend logs for error details

#### "Database connection failed"

1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Check Supabase dashboard for connection issues
3. Verify RLS policies are not blocking access

#### "Rate limited"

1. Check Redis connection if configured
2. Falls back to in-memory (not shared across instances)
3. Adjust `RATE_LIMIT_PER_MINUTE` if needed

### Getting Help

1. Check backend logs: `https://api.voira.app/health/dependencies`
2. Check Sentry for detailed error traces
3. Review browser console for frontend errors

---

## Supabase Storage Setup

The application uses Supabase Storage for file uploads. You need to create the required buckets.

### Create Storage Buckets

In Supabase Dashboard > Storage, create these buckets:

1. **audio-recordings** (for user audio files)
   - Public: Yes (for playback)
   - File size limit: 15MB
   - Allowed MIME types: `audio/*`

2. **reference-files** (for PDF, Word docs, images)
   - Public: Yes
   - File size limit: 25MB
   - Allowed MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/*`

### Storage Policies

Add RLS policies for each bucket:

```sql
-- Users can upload their own audio
CREATE POLICY "Users upload own audio"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own audio
CREATE POLICY "Users view own audio"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own audio
CREATE POLICY "Users delete own audio"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio-recordings'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can upload reference files
CREATE POLICY "Users upload references"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'reference-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);


-- Users can view their own references
CREATE POLICY "Users view references"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'reference-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own references"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'reference-files'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

```

---

## API Features

### Request Timeouts

The API has built-in request timeouts to prevent hanging requests:

| Endpoint Type | Timeout |
|---------------|---------|
| Transcription | 120s |
| WebSocket | 600s |
| Analysis/Refine | 60s |
| File Upload | 60s |
| Standard API | 30s |

### Response Caching

The API uses Redis for response caching. Cache TTLs:

| Cache Type | TTL |
|------------|-----|
| User Profile | 5 minutes |
| Session List | 1 minute |
| Session Detail | 5 minutes |
| Analysis Results | 1 hour |
| Voice Profile | 10 minutes |

To invalidate cache for a user, restart the API or wait for TTL expiry.

### API Versioning

The API supports versioning via:
- URL path: `/api/v1/endpoint`
- Header: `X-API-Version: v1`

Check supported versions: `GET /api/versions`

### Feature Flags

The API includes a feature flag system for gradual rollouts:

```python
# Check if feature is enabled
from feature_flags import is_enabled

if is_enabled("new_feature", user_id=user["id"]):
    # Use new feature
```

Available endpoints:
- `GET /feature-flags` - Get flags for current user
- `GET /admin/feature-flags` - Get all flags (admin only)

### User Data Export (GDPR)

Users can export their data for GDPR compliance:

- `GET /user/export` - Export all user data as JSON
- `GET /sessions/{id}/export?format=json` - Export single session
- `GET /sessions/{id}/export?format=txt` - Export as plain text

### Analytics Events

The API can track analytics events. To enable database storage, create the analytics table:

```sql
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    session_id UUID,
    properties JSONB DEFAULT '{}',
    environment VARCHAR(50),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying
CREATE INDEX idx_analytics_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_timestamp ON analytics_events(timestamp);

-- RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (from backend)
CREATE POLICY "Service role can insert"
ON analytics_events FOR INSERT
TO service_role
WITH CHECK (true);

-- Users can view their own events
CREATE POLICY "Users view own events"
ON analytics_events FOR SELECT
TO authenticated
USING (user_id = auth.uid());
```

### Email Notifications

Email notifications are currently logged in development. For production, configure an email provider:

**Option 1: Resend (Recommended)**
```bash
pip install resend
# Add to .env: RESEND_API_KEY=re_xxxxx
```

**Option 2: SendGrid**
```bash
pip install sendgrid
# Add to .env: SENDGRID_API_KEY=SG.xxxxx
```

Then update `notifications.py` to use your provider.

---

## Security Checklist

Before going live, verify:

- [ ] All secrets are in environment variables (not in code)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only in backend
- [ ] Frontend only has `VITE_SUPABASE_ANON_KEY`
- [ ] HTTPS is enabled for all URLs
- [ ] CORS is configured correctly
- [ ] Rate limiting is enabled
- [ ] Error tracking is configured
- [ ] Admin emails are added to `admin_emails` table
- [ ] Storage buckets have proper RLS policies
- [ ] Request size limits are configured

---

## Maintenance

### Regular Tasks

1. **Weekly**: Check Sentry for new errors
2. **Monthly**: Review usage and costs
3. **Quarterly**: Update dependencies

### Updating

```bash
# Pull latest changes
git pull origin main

# Backend: Redeploy (automatic on most platforms)

# Frontend: Redeploy (automatic on Vercel/Netlify)

# Database: Run any new migrations in SQL Editor
```

# Security Architecture — Voira

This document describes the security architecture of Voira, including client-side vs server-side enforcement, deployment requirements, and environment variables.

## Architecture Overview

Voira uses a **monorepo** with:
- **Frontend** (`apps/web`): React + Vite, uses Supabase anon key only
- **Backend** (`apps/api`): FastAPI, uses Supabase service_role key (server-side only)
- **Database**: Supabase Postgres with RLS (Row Level Security) policies

## Security Principles

1. **No service_role keys in frontend** - Frontend only uses anon key
2. **Backend owns all security checks** - Admin checks, credits, rate limiting
3. **RLS enforces data isolation** - Users can only access their own data
4. **Input validation on backend** - Pydantic models validate all requests
5. **Fail closed** - Default deny, explicit allow

---

## Phase 0 — Inventory summary (scanned automatically)

Findings of note:
- Uses of `dangerouslySetInnerHTML` found in:
  - `src/components/ui/chart.jsx` (careful: review usage — likely used for SVG/chart markup)
- Several occurrences of `console.log`, `console.warn`, `console.error` across the codebase. Most are benign diagnostics but avoid logging full JWTs or tokens.
- Direct client-side query to `admin_emails` in `src/lib/isAdmin.js` (REDACTED)
  - This file was changed to remove direct DB access from the client. See below.
- No use of `eval` or `new Function` was found.
- Dist (build) files contain React/internal references; these are build artifacts.

---

## Changes made (frontend-only, minimal & auditable)

1. `src/components/badges/BadgeCard.jsx`
   - Adjusted Tailwind dark: classes so badges render as dark cards in dark mode.
   - Rationale: UI/UX fix only; no logic changes.

2. `src/lib/isAdmin.js`
   - Replaced direct Supabase client query with a frontend-safe static check against `src/config/admins.js`.
   - Added extensive comments and TODO describing the correct server-side flow (Edge Function) for dynamic admin checks.
   - Rationale: Prevents client-side read of potentially sensitive `admin_emails` table.

3. `SECURITY.md` (this file) added with findings and next steps.

No auth flows, RLS, or DB policies were changed.

---

## Why the `admin_emails` table must not be queried from the browser

- Any table that enumerates admin accounts or privileged emails is sensitive. If readable by authenticated clients it may leak a list of privileged users.
- Supabase RLS policies can help, but the correct pattern is to keep such queries server-side and return only boolean results.
- Frontend must never hold the supabase "service_role" key.

Recommended server-side approaches:
- Implement an Edge Function (Supabase Edge Function or other minimal server) that:
  - Authenticates the caller using the user's JWT.
  - Uses the Supabase service role key to query `admin_emails` safely.
  - Returns a boolean `{ isAdmin: true|false }` and does NOT return the row contents.
- Configure RLS on `admin_emails` to disallow unauthorised reads.

SQL example to create a masked view (document only):

-- TODO: run in Supabase SQL editor
-- 1) Create a view that returns only a boolean for a given email
-- CREATE OR REPLACE FUNCTION app.is_admin(email text) RETURNS boolean LANGUAGE sql AS $$
--   SELECT EXISTS (SELECT 1 FROM admin_emails WHERE lower(email)=lower($1));
-- $$;

-- 2) Use Edge Function to call this function with the service role

Leave these backend changes to be applied in Supabase by a maintainer with DB access.

---

## Phase 1 — Input validation & sanitization (recommendations)

Frontend UX layer: use Zod to validate and sanitize user inputs before sending to server.
- Add `src/lib/validation.ts` with Zod schemas for:
  - Auth (email, password)
  - Voice profile fields (preferred/avoided words)
  - Session save inputs
- Add `src/lib/sanitize.ts` with small wrappers (trim, max-length enforcement).

Note: Frontend validation is UX-only. All validation must also be enforced server-side.

---

## Phase 2 — XSS protection

- `dangerouslySetInnerHTML` occurrences must be reviewed. Wherever possible, prefer plain text rendering.
- If you must render HTML (rich text), sanitize with DOMPurify server-side or before insertion.
- Add comments next to any `dangerouslySetInnerHTML` use explaining why it is safe and what sanitization occurs.

---

## Phase 3 — Authentication & session safety

- Use `supabase.auth.getUser()` (or `auth.getUser()`) when you need a verified user object.
- Avoid trusting local session caches as the single source of truth.
- Do NOT manually persist tokens to localStorage. Use Supabase client defaults.
- Add UX-level toasts for suspicious auth states (session exists but user fetch fails).

---

## Phase 4 — Content Security Policy (CSP)

Development: add conservative CSP meta tag in `index.html` (dev-only) to catch violations.
Production: add CSP + other security headers via hosting platform config (Netlify/Vercel) or server.

Minimum recommended headers (document-only):
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- X-Frame-Options or CSP frame-ancestors
- Permissions-Policy: disable unused APIs

---

## Phase 5 — Rate limiting (architecture notes)

- Frontend: debounce / throttle login, signup, password reset to reduce accidental bursts.
- For true rate limiting, implement at the Edge (e.g., middleware, Cloudflare, Vercel) or use an Edge Function proxied by a gateway.
- Document and plan for Turnstile / reCAPTCHA behind a feature flag.

---

## Client-Side vs Server-Side Enforcement

### Client-Side (Frontend)
- **Auth**: Supabase anon key for user authentication
- **Data Access**: Direct Supabase queries with RLS protection
- **Validation**: UX-only validation (Zod schemas)
- **Admin Check**: Calls backend `/admin/is-admin` endpoint

### Server-Side (Backend)
- **Admin Checks**: Uses service_role to query `admin_emails` table
- **Credits Enforcement**: Server-side decrement and validation
- **Rate Limiting**: In-memory (dev) / Redis/Upstash (prod TODO)
- **Input Validation**: Pydantic models on all endpoints
- **Ownership Enforcement**: Server-side filtering + RLS

## Environment Variables

### Frontend (`apps/web/.env.local`)
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE_URL=http://localhost:8000  # or production URL
```

**Never include:**
- `SUPABASE_SERVICE_ROLE_KEY` (backend only)
- Any secrets or API keys

### Backend (`apps/api/.env`)
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # BACKEND ONLY
SUPABASE_ANON_KEY=your_anon_key
```

**Security:**
- Never commit `.env` files
- Use environment variables in production (Render/Vercel)
- Rotate service_role key periodically

## Deployment

### Frontend (Vercel/Netlify)
1. Build: `cd apps/web && npm run build`
2. Output: `apps/web/dist`
3. Set environment variables in hosting platform
4. Deploy static files

### Backend (Render/Railway)
1. Build: `pip install -r apps/api/requirements.txt`
2. Start: `gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker`
3. Set environment variables in hosting platform
4. Expose port 8000 (or configured PORT)

See `/infra/README.md` for detailed deployment instructions.

## Database Security (Supabase RLS)

### Applied Migrations
All RLS policies are defined in `/supabase/migrations/`:
- `20250101_create_tables.sql` - Creates tables
- `20250101_enable_rls.sql` - Enables RLS and creates policies
- `20250101_credits_functions.sql` - Helper functions

### Manual Steps Required
1. Run migrations in Supabase SQL Editor (see `/supabase/README.md`)
2. Verify RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`
3. Test policies with regular user session

### Tables and Policies
- **recordings**: Users can only access their own (user_id = auth.uid())
- **user_profiles**: Users can only access their own
- **admin_emails**: NO client access (backend-only via service_role)
- **credits_ledger**: Users can read their own, cannot write (backend-only)
- **voice_profiles**: Users can only access their own

## Rate Limiting

**Development**: In-memory rate limiter (simple, not distributed)
**Production**: TODO - Use Redis/Upstash for distributed rate limiting

Current limits:
- 60 requests/minute per user (configurable)
- Applied to: `/admin/is-admin`, `/sessions`, `/transcribe`

## Credits & Subscription Rules

**Basic (free_user):**
- 10 credits/month
- 1 reference upload/month
- Credits reset monthly

**Premium (premium_user):**
- 120 credits/month
- Unlimited reference uploads
- Credits reset monthly

**Admin:**
- Bypass all limits (backend enforces)
- Can access admin-only endpoints

All credit enforcement is **server-side only**.

---

## Phase 7 — Regression guardrails

Create a manual smoke checklist (run after backend changes):
- Login / logout
- Email confirmation flows
- Password reset
- Practice flow (record -> save -> library)
- Voice profile save/load
- Dark mode UI sanity

---

## Why some issues were not fixed in this PR

- RLS and database policy changes cannot be made safely from the frontend. They require admin access and manual configuration in Supabase. TODOs are documented above.
- True server-side rate limiting and secret-safe API endpoints must be implemented on the server/Edge Function and are intentionally left as manual tasks.

## Admin Check Implementation

The admin check is now implemented in the FastAPI backend:

**Endpoint**: `GET /admin/is-admin`
- Requires JWT authentication
- Backend uses service_role to query `admin_emails` table
- Returns `{ isAdmin: boolean }` ONLY
- Never returns admin emails or other sensitive data

**Frontend**: Calls backend endpoint (see `apps/web/src/lib/isAdmin.js`)

## Testing Security

Run backend tests:
```bash
cd apps/api
pytest ../tests -v
```

Test coverage:
- Authentication required for protected endpoints
- Admin check returns boolean only
- Credits enforced server-side
- Ownership enforced (users can't access others' data)

## Manual Supabase Steps

1. **Run migrations** (see `/supabase/README.md`):
   - `20250101_create_tables.sql`
   - `20250101_enable_rls.sql`
   - `20250101_credits_functions.sql`

2. **Populate admin_emails** (via Supabase SQL Editor):
   ```sql
   INSERT INTO admin_emails (email) VALUES ('admin@example.com');
   ```

3. **Verify RLS**:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   ```

4. **Test as regular user**:
   - Try to SELECT from `admin_emails` → should return 0 rows
   - Try to SELECT your own recordings → should work
   - Try to SELECT another user's recordings → should return 0 rows

## Production Checklist

- [ ] All migrations applied in Supabase
- [ ] RLS policies verified
- [ ] Admin emails populated
- [ ] Backend deployed with service_role key
- [ ] Frontend deployed with anon key only
- [ ] Environment variables set in hosting platforms
- [ ] Rate limiting configured (Redis/Upstash for prod)
- [ ] CORS configured for production frontend URL
- [ ] Tests passing: `pytest -q`

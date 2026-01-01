# Security Audit & Hardening Guide — Voira

This file documents a lightweight security inventory, immediate frontend hardening applied, and recommended server-side steps for Supabase.

IMPORTANT: This repository contains frontend code only. Do NOT add service_role keys or other secrets to the frontend. Any server-side enforcement must be configured in Supabase or implemented as Edge Functions.

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

## Phase 6 — Supabase RLS warnings & manual steps

TODOs for maintainers (must perform in Supabase console):
- Ensure `admin_emails` table is not publicly readable. Add RLS policy to deny read for regular users.
- Create an Edge Function (or server endpoint) to safely check admin status using the service role.
- If the frontend requires a list of privileged emails for UX only, consider an admin-only view that the backend returns only when the caller is authorized.

Placeholders and SQL examples were provided earlier in this document.

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

If you want, I can generate a scaffold Edge Function (TypeScript) that implements a safe `is-admin` endpoint (no service keys embedded) and instructions to deploy it to Supabase Edge Functions. This is an optional next step.

---

Contact: maintainers should coordinate backend changes and confirm when the Edge Function / RLS steps are complete.

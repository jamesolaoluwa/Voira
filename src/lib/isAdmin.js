// NOTE: For security we avoid querying a sensitive `admin_emails` table directly
// from the browser. Client-side access to sensitive tables can leak data and
// cannot be protected by RLS. This file provides a safe frontend-only check
// and documents the correct server-side replacement (Edge Function).

import { ADMIN_EMAILS } from '@/config/admins';

/**
 * Frontend-safe admin check.
 *
 * - Uses the static `ADMIN_EMAILS` frontend config (keeps behavior local and auditable).
 * - DOES NOT query the `admin_emails` table from the client. If you require a
 *   dynamic admin list, implement a server-side Edge Function that queries the
 *   database using the Supabase service role key and performs auth checks.
 *
 * Security rationale:
 * - Never allow the browser to read sensitive tables such as `admin_emails`.
 * - Server-side code (Edge Function) should authenticate the caller, perform
 *   the DB lookup, and return only the boolean result.
 *
 * TODO: Replace with Edge Function call once the server endpoint exists.
 */
export async function isAdminByEmail(email) {
  if (!email) return false;
  const normalized = String(email).toLowerCase().trim();

  // Fast, static check against compiled frontend admin list. This preserves
  // functionality for development and small teams without exposing DB contents.
  if (Array.isArray(ADMIN_EMAILS) && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(normalized)) {
    return true;
  }

  // If you need dynamic admin lists, implement an authenticated server-side
  // endpoint (Edge Function) and call it here. Returning false by default
  // avoids leaking whether an email exists in the DB from the client.
  //
  // Example edge flow (manual steps):
  // - Create an Edge Function `/edge/is-admin?email=...` that validates the
  //   incoming request (checks user's JWT), uses the Supabase service role to
  //   query `admin_emails`, and returns `{ isAdmin: boolean }`.
  // - Update this function to call that endpoint and return its result.
  //
  // NEVER add a service_role key to the frontend.
  return false;
}

export default isAdminByEmail;

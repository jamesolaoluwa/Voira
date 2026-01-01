// NOTE: For security we avoid querying a sensitive `admin_emails` table directly
// from the browser. Client-side access to sensitive tables can leak data and
// cannot be protected by RLS. This file provides a safe frontend-only check
// and documents the correct server-side replacement (Edge Function).

/**
 * Frontend admin check using server-side Edge Function.
 *
 * Production behavior:
 * - Calls the deployed Supabase Edge Function at
 *   https://mxkssrtjueyknwdcpj.supabase.co/functions/v1/is-admin via POST
 *   with body { email: normalizedEmail }.
 * - Returns true only if the function responds with JSON { isAdmin: true }.
 * - Fails closed: returns false on network error, non-200 status, or malformed payload.
 *
 * Development fallback:
 * - When `import.meta.env.DEV` is true, a developer may still use a local
 *   `ADMIN_EMAILS` list from `src/config/admins.js`. This fallback is strictly
 *   DEV-only and will not be included in production bundles.
 */
export async function isAdminByEmail(email) {
  if (!email) return false;
  const normalized = String(email).toLowerCase().trim();

  // DEV-only fallback: use the static list only when running in dev mode.
  if (import.meta.env.DEV) {
    try {
      // Dynamically import to avoid bundling admin list into production builds.
      // eslint-disable-next-line no-undef
      const { ADMIN_EMAILS } = await import('@/config/admins');
      if (Array.isArray(ADMIN_EMAILS) && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(normalized)) {
        return true;
      }
    } catch (e) {
      // Ignore import errors in dev fallback; proceed to Edge Function call.
      // eslint-disable-next-line no-console
      console.warn('DEV fallback admin list unavailable', e);
    }
  }

  // Call the deployed Edge Function in production/dev to determine admin status.
  // NOTE: keep URL fixed and do NOT embed any secrets in the client.
  const EDGE_URL = 'https://mxkssrtjueyknwdcpj.supabase.co/functions/v1/is-admin';

  try {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    });

    if (!res.ok) return false;
    const json = await res.json();
    return Boolean(json && json.isAdmin === true);
  } catch (err) {
    // Fail closed on any error.
    // eslint-disable-next-line no-console
    console.error('isAdminByEmail error:', err);
    return false;
  }
}

export default isAdminByEmail;

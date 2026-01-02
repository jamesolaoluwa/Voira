// NOTE: For security we avoid querying a sensitive `admin_emails` table directly
// from the browser. Client-side access to sensitive tables can leak data and
// cannot be protected by RLS. This file provides a safe frontend-only check
// and documents the correct server-side replacement (Edge Function).

/**
 * Frontend admin check using server-side Edge Function.
 *
 * Production behavior:
 * - Calls the configured Supabase Edge Function (set via
 *   `VITE_IS_ADMIN_URL`) via POST with body { email: normalizedEmail }.
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
  // Use the runtime-configured URL so we don't hardcode endpoints in source.
  // NOTE: do NOT embed any secrets in the client.
  let EDGE_URL = import.meta.env.VITE_IS_ADMIN_URL;

  // If the env var is missing, fail closed in production. In DEV, attempt a
  // best-effort derived URL from VITE_SUPABASE_URL (functions host) so local
  // developers can test against a deployed Edge Function without extra env vars.
  if (!EDGE_URL) {
    if (!import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('VITE_IS_ADMIN_URL is not configured; failing closed.');
      return false;
    }

    // Try to derive functions URL from VITE_SUPABASE_URL (dev convenience only)
    try {
      const supaUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supaUrl && typeof supaUrl === 'string') {
        // Example: https://<REF>.supabase.co -> https://<REF>.functions.supabase.co/is-admin
        EDGE_URL = supaUrl.replace('.supabase.co', '.functions.supabase.co').replace(/\/$/, '') + '/is-admin';
        // eslint-disable-next-line no-console
        console.debug('Derived EDGE_URL for DEV from VITE_SUPABASE_URL:', EDGE_URL);
      } else {
        // eslint-disable-next-line no-console
        console.warn('VITE_IS_ADMIN_URL not set and VITE_SUPABASE_URL unavailable; skipping Edge Function call in dev.');
        return false;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to derive EDGE_URL in DEV; skipping Edge Function call.', e);
      return false;
    }
  }

  try {
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
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

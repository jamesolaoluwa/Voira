/**
 * Frontend admin check using FastAPI backend.
 * 
 * IMPORTANT: FastAPI backend is the authoritative source for admin checks.
 * Supabase Edge Functions are NOT used for admin checks.
 * 
 * This function calls GET /admin/is-admin (FastAPI) which:
 * - Validates the caller's JWT
 * - Uses service_role key server-side to query admin_emails table
 * - Returns { isAdmin: boolean } ONLY (never exposes admin emails)
 * 
 * Production behavior:
 * - Calls FastAPI backend endpoint via GET /admin/is-admin
 * - Requires valid Supabase JWT in Authorization header
 * - Returns true only if backend responds with { isAdmin: true }
 * - Fails closed: returns false on network error, non-200 status, or malformed payload
 * 
 * Development fallback:
 * - When `import.meta.env.DEV` is true, a developer may use a local
 *   `ADMIN_EMAILS` list from `src/config/admins.js` for local testing.
 *   This fallback is strictly DEV-only and will not be included in production builds.
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
      // Ignore import errors in dev fallback; proceed to FastAPI call.
      // eslint-disable-next-line no-console
      console.warn('DEV fallback admin list unavailable', e);
    }
  }

  // Call FastAPI backend endpoint /admin/is-admin
  // FastAPI backend uses service_role to check admin_emails table securely
  try {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const { supabase } = await import('@/components/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return false;
    }
    
    const res = await fetch(`${API_BASE_URL}/admin/is-admin`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
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

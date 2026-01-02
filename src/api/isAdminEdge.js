// Edge function scaffold for is-admin check
// Deploy this to Supabase Edge Functions (or your platform) and call from client.

// Expected: receives a JSON body { email: string }
// Returns: { isAdmin: boolean }

export async function handler(req) {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Respond to CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }
  try {
    const body = await req.json();
    const email = (body && body.email) ? String(body.email).toLowerCase().trim() : null;
  if (!email) return new Response(JSON.stringify({ isAdmin: false }), { status: 200, headers: CORS_HEADERS });

  // PRODUCTION: use service_role key on the server and query admin table or a safe config
    // Example (pseudocode):
    // const supabase = createServerSupabaseClient({ serviceRoleKey: process.env.SERVICE_ROLE_KEY });
    // const { data } = await supabase.from('admin_emails').select('email').eq('email', email).limit(1);
    // return { isAdmin: data && data.length > 0 }

  // Placeholder: deny by default. Update with server-side DB check before enabling.
  return new Response(JSON.stringify({ isAdmin: false }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
  return new Response(JSON.stringify({ isAdmin: false }), { status: 200, headers: CORS_HEADERS });
  }
}

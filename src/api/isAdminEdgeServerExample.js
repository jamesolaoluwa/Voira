// Supabase Edge Function example (Node runtime) for checking admin status server-side
// Deploy this as an Edge Function and use a service_role key (never exposed to clients).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function handler(req) {
  try {
    const body = await req.json();
    const email = (body && body.email) ? String(body.email).toLowerCase().trim() : null;
    if (!email) return new Response(JSON.stringify({ isAdmin: false }), { status: 200 });

    // Query admin_emails (server-side only)
    const { data, error } = await supabaseAdmin.from('admin_emails').select('email').eq('email', email).limit(1);
    if (error) {
      console.error('Error checking admin_emails:', error);
      return new Response(JSON.stringify({ isAdmin: false }), { status: 200 });
    }

    const isAdmin = Array.isArray(data) && data.length > 0;
    return new Response(JSON.stringify({ isAdmin }), { status: 200 });
  } catch (err) {
    console.error('isAdmin handler error:', err);
    return new Response(JSON.stringify({ isAdmin: false }), { status: 200 });
  }
}

/*
Deployment notes:
1) Create an Edge Function in Supabase or your hosting platform and set environment variables:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY (service_role key)
2) Do NOT commit the service role key to source-control.
3) Update client-side isAdmin check to call this endpoint instead of reading admin_emails directly.
*/

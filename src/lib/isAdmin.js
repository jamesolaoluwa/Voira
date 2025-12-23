import { supabase } from '@/components/lib/supabase';

// Checks the admin_emails table for the given user's email.
// Returns true if the email exists, false otherwise. Errors default to false.
export async function isAdminByEmail(email) {
  if (!email) return false;
  try {
    const { data, error } = await supabase
      .from('admin_emails')
      .select('email')
      .eq('email', email)
      .limit(1);
    if (error) {
      console.warn('[isAdminByEmail] supabase error', error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.warn('[isAdminByEmail] unexpected error', e);
    return false;
  }
}

export default isAdminByEmail;

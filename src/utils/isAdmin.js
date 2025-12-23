import { ADMIN_EMAILS } from '@/config/admins';

export function isAdmin(user) {
  if (!user || !user.email) return false;
  const email = String(user.email).toLowerCase();
  return ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email);
}

export default isAdmin;

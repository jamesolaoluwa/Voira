import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthDebug() {
  const { user, session, isLoading, isAdmin } = useAuth();

  return (
    // moved to bottom-right so it doesn't cover the top nav / user dropdown
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 999 }}>
      <div className="text-xs p-2 bg-white/90 dark:bg-[#0b0b0b]/90 rounded-md border border-zinc-200 dark:border-white/10 shadow-sm">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Auth Debug</div>
  <div>loading: {isLoading ? 'yes' : 'no'}</div>
  <div>signed in: {user ? 'yes' : 'no'}</div>
  <div>isAdmin: {isAdmin ? 'yes' : 'no'}</div>
  <div style={{ maxWidth: 220, overflowWrap: 'break-word' }}>{user?.email || session?.user?.email || '—'}</div>
      </div>
    </div>
  );
}

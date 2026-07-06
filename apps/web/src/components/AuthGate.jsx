import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import FullPageLoader from '@/components/ui/FullPageLoader';

export default function AuthGate({ children }) {
  const { user, session, isLoading } = useAuth();
  const location = useLocation();

  // While auth state is loading, show a loader (not a blank screen) and don't
  // redirect — let the app settle.
  if (isLoading) return <FullPageLoader label="Loading your account…" />;

  // If auth has finished loading and there's no session, redirect to Auth
  // Note: Check session (not user) because user profile is fetched async after session is established
  if (!session) {
    return <Navigate to={createPageUrl('Auth')} state={{ from: location }} replace />;
  }

  // Authenticated — render children (preserves current location/query params)
  return <>{children}</>;
}

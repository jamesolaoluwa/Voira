import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function AuthGate({ children }) {
  const { user, session, isLoading } = useAuth();
  const location = useLocation();

  // While auth state is loading, don't redirect — let the app settle
  if (isLoading) return null;

  // If auth has finished loading and there's no session/user, redirect to Auth
  if (!user) {
    return <Navigate to={createPageUrl('Auth')} state={{ from: location }} replace />;
  }

  // Authenticated — render children (preserves current location/query params)
  return <>{children}</>;
}

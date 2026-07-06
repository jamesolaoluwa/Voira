import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { createPageUrl } from '@/utils';
import FullPageLoader from '@/components/ui/FullPageLoader';

export default function AdminGuard({ children }) {
  const { user, isLoading, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
  if (!user || !user.email || !isAdmin) navigate(createPageUrl('Home'));
    }
  }, [isLoading, user, isAdmin, navigate]);

  if (isLoading) return <FullPageLoader label="Checking permissions…" />;
  if (!user || !user.email || !isAdmin) return null;
  return <>{children}</>;
}

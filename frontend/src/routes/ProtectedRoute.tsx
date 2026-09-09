import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import type { Role } from '../types';

export function ProtectedRoute({
  allowedRole,
  children,
}: {
  allowedRole?: Role;
  children: ReactNode;
}) {
  const { user, initializing } = useAuth();
  const { t } = useLanguage();

  // Redirecting while the session probe is still in flight would bounce a
  // signed-in user to the login page on every page reload.
  if (initializing) return <div className="page-loading">{t('protectedRoute.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRole && user.role !== allowedRole) {
    return <Navigate to={`/${user.role.toLowerCase()}`} replace />;
  }

  return <>{children}</>;
}

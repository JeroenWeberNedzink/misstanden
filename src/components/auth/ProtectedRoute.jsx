import React, { Suspense, lazy } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { useSettings } from '../../contexts/SettingsContext';

const NoAccessPage = lazy(() => import('./NoAccessPage'));

const AccessDeniedLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-full max-w-sm px-6">
      <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
        <div className="h-4 w-1/2 bg-muted rounded mb-4"></div>
        <div className="h-3 w-full bg-muted/70 rounded mb-2"></div>
        <div className="h-3 w-4/5 bg-muted/70 rounded"></div>
      </div>
    </div>
  </div>
);

/**
 * Protected route component that checks authentication and optionally permissions/roles
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Content to render if access is granted
 * @param {string} props.permission - Single permission required to access route
 * @param {string[]} props.permissions - Array of permissions (requires ANY by default)
 * @param {boolean} props.requireAll - If true, requires ALL permissions in array
 * @param {string} props.role - Single role required to access route
 * @param {string[]} props.roles - Array of roles (requires ANY by default)
 * @param {string} props.redirectTo - Path to redirect to if access denied (default: '/')
 * @param {boolean} props.showAccessDenied - Show access denied message instead of redirect
 */
const ProtectedRoute = ({
  children,
  permission,
  permissions,
  requireAll = false,
  role,
  roles,
  redirectTo = '/',
  showAccessDenied = false,
}) => {
  const { isAuthenticated, isLoading: auth0Loading } = useAuth0();
  const {
    handlerProfile,
    hasPermission: checkPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole: checkRole,
    hasAnyRole,
    loading: permissionsLoading,
  } = usePermissions();
  const { isLoading: settingsLoading } = useSettings();

  const isLoading = auth0Loading || permissionsLoading;
  const hasSessionHint = Boolean(sessionStorage.getItem('auth_token') || sessionStorage.getItem('handler_profile'));

  // Don't show loading if settings are still loading (MaintenanceModeGuard already shows loading)
  if (isLoading && !settingsLoading) {
    if (hasSessionHint) {
      return children;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm px-6">
          <div className="rounded-xl border border-border bg-card p-6 animate-pulse">
            <div className="h-4 w-1/2 bg-muted rounded mb-4"></div>
            <div className="h-3 w-full bg-muted/70 rounded mb-2"></div>
            <div className="h-3 w-4/5 bg-muted/70 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // If settings are loading, return null (MaintenanceModeGuard will show loading)
  if (settingsLoading) {
    return null;
  }

  // First check authentication
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  // Then check permissions/roles if specified
  let hasAccess = true;

  // Check single permission
  if (permission) {
    hasAccess = hasAccess && checkPermission(permission);
  }

  // Check multiple permissions
  if (permissions && permissions.length > 0) {
    if (requireAll) {
      hasAccess = hasAccess && hasAllPermissions(permissions);
    } else {
      hasAccess = hasAccess && hasAnyPermission(permissions);
    }
  }

  // Check single role
  if (role) {
    hasAccess = hasAccess && checkRole(role);
  }

  // Check multiple roles
  if (roles && roles.length > 0) {
    hasAccess = hasAccess && hasAnyRole(roles);
  }

  // If access denied, show message or redirect
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__nzProtectedRouteDebug = {
      path: window.location.pathname,
      isAuthenticated,
      auth0Loading,
      permissionsLoading,
      settingsLoading,
      permission,
      permissions,
      requireAll,
      role,
      roles,
      hasAccess,
      sessionHint: hasSessionHint,
    };
  }

  if (!hasAccess) {
    if (import.meta.env.DEV) {
      console.debug('[ProtectedRoute] Access denied', window.__nzProtectedRouteDebug, window.__nzPermissionsDebug);
    }
    if (showAccessDenied && !handlerProfile?.id) {
      return (
        <Suspense fallback={<AccessDeniedLoading />}>
          <NoAccessPage />
        </Suspense>
      );
    }
    if (showAccessDenied) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center max-w-md">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-4">
              You don't have the required permissions to access this page.
            </p>
            <button
              onClick={() => window.history.back()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-accent hover:bg-accent/90"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }

    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default ProtectedRoute;

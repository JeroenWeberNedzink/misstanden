import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';
import {
  getApiAccessToken,
  getOptionalApiAccessToken,
  isRecoverableAuth0SessionError,
  isValidApiAudience,
} from '../lib/auth0ApiToken';
import { normalizeHandlerRecord } from '../services/utils/handlerNormalization';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole,
  isAdmin,
  parsePermissions,
  resolvePermissions,
  PERMISSIONS,
  ROLES,
} from '../utils/permissions';

const readCachedHandlerProfile = () => {
  try {
    const cached = sessionStorage.getItem('handler_profile');
    return cached ? normalizeHandlerRecord(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
};

const readSessionRoleHints = () => {
  try {
    const role = String(sessionStorage.getItem('user_role') || '').trim();
    if (!role) return [];
    return [role.toUpperCase()];
  } catch {
    return [];
  }
};

/**
 * Custom hook to access user permissions and roles
 * @returns {object} Permission checking utilities and user data
 */
export const usePermissions = () => {
  const { isAuthenticated, user, isLoading: auth0Loading, getAccessTokenSilently } = useAuth0();
  const [handlerProfile, setHandlerProfile] = useState(() => readCachedHandlerProfile());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadHandlerProfile = async () => {
      const bootstrapDebug = {
        startedAt: new Date().toISOString(),
        isAuthenticated,
        email: String(user?.email || ''),
        sub: String(user?.sub || ''),
        cachedProfileMatched: false,
        token: {
          optionalAttempted: false,
          acquired: false,
          retryAttempted: false,
          error: null,
        },
        api: {
          called: false,
          ok: false,
          status: null,
          payload: null,
          error: null,
        },
        fallback: {
          error: null,
          softAuthFailure: false,
        },
      };

      if (import.meta.env.DEV && typeof window !== 'undefined') {
        window.__nzPermissionsBootstrap = bootstrapDebug;
      }

      if (!isAuthenticated) {
        setHandlerProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const normalizedEmail = String(user?.email || '').toLowerCase().trim();
        const normalizedSub = String(user?.sub || '').trim();
        const cachedProfile = readCachedHandlerProfile();

        if (cachedProfile) {
          const cachedEmail = String(cachedProfile?.email || '').toLowerCase().trim();
          const cachedUserId = String(cachedProfile?.user_id || '').trim();
          if (
            (normalizedSub && cachedUserId === normalizedSub) ||
            (normalizedEmail && cachedEmail === normalizedEmail)
          ) {
            bootstrapDebug.cachedProfileMatched = true;
            setHandlerProfile(cachedProfile);
            setError(null);
            setLoading(false);
            return;
          }
        }

        if (!normalizedEmail && !normalizedSub) {
          console.warn('No email/sub available for permission check');
          setHandlerProfile(null);
          setLoading(false);
          return;
        }

        let apiProfile = null;
        let softAuthFailure = false;
        bootstrapDebug.token.optionalAttempted = true;
        let token = await getOptionalApiAccessToken(getAccessTokenSilently);
        bootstrapDebug.token.acquired = Boolean(token);
        if (!token && isValidApiAudience()) {
          try {
            // Protected routes depend on handler context, so do one real token retry
            // before treating the backend handler lookup as unavailable.
            bootstrapDebug.token.retryAttempted = true;
            token = await getApiAccessToken(getAccessTokenSilently, { cacheMode: 'off' });
            bootstrapDebug.token.acquired = Boolean(token);
          } catch (tokenError) {
            if (isRecoverableAuth0SessionError(tokenError)) {
              softAuthFailure = true;
              bootstrapDebug.fallback.softAuthFailure = true;
              if (import.meta.env.DEV) {
                console.debug('[Permissions] Auth0 API token unavailable for handler bootstrap; using cached profile/token claims instead', {
                  message: tokenError?.message || String(tokenError),
                  error: tokenError?.error || null,
                });
              }
            } else {
              bootstrapDebug.token.error = {
                message: tokenError?.message || String(tokenError),
                error: tokenError?.error || null,
                error_description: tokenError?.error_description || null,
              };
              if (import.meta.env.DEV) {
                console.debug('[Permissions] Auth0 API token retry failed; skipping legacy direct handler lookup', tokenError);
              }
            }
          }
        }
        if (token) {
          try {
            bootstrapDebug.api.called = true;
            const response = await fetch('/api/me.api.php', {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            bootstrapDebug.api.status = response.status;
            const payload = await response.json().catch(() => null);
            bootstrapDebug.api.payload = payload;
            bootstrapDebug.api.ok = response.ok;
            if (response.ok && payload?.success && payload?.data?.handler) {
              apiProfile = payload.data.handler;
            }
          } catch (apiError) {
            bootstrapDebug.api.error = apiError?.message || String(apiError);
            console.warn('Handler API context lookup failed:', apiError);
          }
        } else if (bootstrapDebug.token.error) {
          bootstrapDebug.fallback.error = 'Auth0 API token unavailable';
        }

        if (apiProfile) {
          const normalizedProfile = normalizeHandlerRecord(apiProfile);
          setHandlerProfile(normalizedProfile);
          try {
            sessionStorage.setItem('handler_profile', JSON.stringify(normalizedProfile));
          } catch {
            // Ignore session storage write errors.
          }
          setError(null);
          setLoading(false);
          return;
        }

        const fallbackError = softAuthFailure
          ? null
          : (bootstrapDebug.api.error || bootstrapDebug.token.error?.message || null);
        if (fallbackError && import.meta.env.DEV) {
          console.warn('Failed to load handler profile via backend handler lookup:', fallbackError);
        }
        setHandlerProfile(null);
        setError(fallbackError ? new Error(fallbackError) : null);
      } catch (err) {
        console.error('Error loading handler profile:', err);
        setError(err);
        setHandlerProfile(null);
      } finally {
        setLoading(false);
      }
    };

    loadHandlerProfile();
  }, [isAuthenticated, user?.email, user?.sub, getAccessTokenSilently]);

  // Get roles (prefer handler profile, fallback to Auth0 token claims)
  const profileRoles = handlerProfile?.roles || (handlerProfile?.role ? [handlerProfile.role] : null);
  const claimRoles = (() => {
    const out = [];
    const pushRoles = (candidate) => {
      if (Array.isArray(candidate)) {
        candidate.forEach((r) => out.push(String(r)));
      } else if (typeof candidate === 'string' && candidate.trim()) {
        out.push(candidate.trim());
      }
    };

    pushRoles(user?.roles);
    pushRoles(user?.role);

    Object.entries(user || {}).forEach(([key, value]) => {
      const k = String(key || '').toLowerCase();
      if (!k.includes('role')) return;
      pushRoles(value);
    });

    return out.filter(Boolean);
  })();
  const sessionRoles = readSessionRoleHints();

  const roles = (profileRoles && profileRoles.length > 0)
    ? profileRoles
    : (claimRoles.length > 0 ? claimRoles : (sessionRoles.length > 0 ? sessionRoles : null));
  const permissions = resolvePermissions(
    handlerProfile?.permissions ? parsePermissions(handlerProfile.permissions) : null,
    roles
  );
  const isAdminRole = isAdmin(roles);

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__nzPermissionsDebug = {
      isAuthenticated,
      auth0Loading,
      loading,
      error: error
        ? {
            message: error?.message || String(error),
            name: error?.name || null,
          }
        : null,
      handlerProfile,
      permissions,
      roles,
      isAdminRole,
      session: {
        auth_token: sessionStorage.getItem('auth_token'),
        user_role: sessionStorage.getItem('user_role'),
        handler_profile: sessionStorage.getItem('handler_profile'),
      },
    };
  }

  return {
    // User data
    handlerProfile,
    permissions,
    roles,
    loading: auth0Loading || loading,
    error,
    isAuthenticated,

    // Permission checking functions
    hasPermission: (permission) => isAdminRole || hasPermission(permissions, permission),
    hasAnyPermission: (permissionList) => isAdminRole || hasAnyPermission(permissions, permissionList),
    hasAllPermissions: (permissionList) => isAdminRole || hasAllPermissions(permissions, permissionList),

    // Role checking functions
    hasRole: (role) => hasRole(roles, role),
    hasAnyRole: (roleList) => hasAnyRole(roles, roleList),
    isAdmin: () => isAdminRole,

    // Constants for convenience
    PERMISSIONS,
    ROLES,

    // Specific permission checks (convenience)
    canViewTickets: isAdminRole || hasPermission(permissions, PERMISSIONS.VIEW_TICKETS),
    canEditTickets: isAdminRole || hasPermission(permissions, PERMISSIONS.EDIT_TICKETS),
    canDeleteTickets: isAdminRole || hasPermission(permissions, PERMISSIONS.DELETE_TICKETS),
    canManageUsers: isAdminRole || hasPermission(permissions, PERMISSIONS.MANAGE_USERS),
    canExportData: isAdminRole || hasPermission(permissions, PERMISSIONS.EXPORT_DATA),
    canManageWorkflows: isAdminRole || hasPermission(permissions, PERMISSIONS.MANAGE_WORKFLOWS),
  };
};

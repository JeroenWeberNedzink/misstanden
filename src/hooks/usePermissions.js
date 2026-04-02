import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getApiAccessToken, getOptionalApiAccessToken, isValidApiAudience } from '../lib/auth0ApiToken';
import { normalizeHandlerRecord } from '../services/utils/handlerNormalization';
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole,
  isAdmin,
  parsePermissions,
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
          bySubCount: null,
          byEmailCount: null,
          error: null,
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
        bootstrapDebug.token.optionalAttempted = true;
        let token = await getOptionalApiAccessToken(getAccessTokenSilently);
        bootstrapDebug.token.acquired = Boolean(token);
        if (!token && isValidApiAudience()) {
          try {
            // Protected routes depend on handler context, so do one real token retry
            // before falling back to direct Supabase reads that may be blocked by RLS.
            bootstrapDebug.token.retryAttempted = true;
            token = await getApiAccessToken(getAccessTokenSilently, { cacheMode: 'off' });
            bootstrapDebug.token.acquired = Boolean(token);
          } catch (tokenError) {
            bootstrapDebug.token.error = {
              message: tokenError?.message || String(tokenError),
              error: tokenError?.error || null,
              error_description: tokenError?.error_description || null,
            };
            if (import.meta.env.DEV) {
              console.debug('[Permissions] Auth0 API token retry failed, falling back to direct handler lookup', tokenError);
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
            // Fallback to direct Supabase lookup for local/dev scenarios.
            console.warn('Handler API context lookup failed, trying direct profile lookup:', apiError);
          }
        }

        if (apiProfile) {
          setHandlerProfile(normalizeHandlerRecord(apiProfile));
          setError(null);
          setLoading(false);
          return;
        }

        let data = null;
        let fetchError = null;

        if (normalizedSub) {
          const resultBySub = await supabase
            .from('handlers')
            .select('*')
            .eq('user_id', normalizedSub)
            .eq('active', true)
            .maybeSingle();
          data = resultBySub.data;
          fetchError = resultBySub.error;
          bootstrapDebug.fallback.bySubCount = resultBySub.data ? 1 : 0;
        }

        if (!data && normalizedEmail) {
          const resultByEmail = await supabase
            .from('handlers')
            .select('*')
            .ilike('email', normalizedEmail)
            .eq('active', true)
            .maybeSingle();
          data = resultByEmail.data;
          fetchError = resultByEmail.error;
          bootstrapDebug.fallback.byEmailCount = resultByEmail.data ? 1 : 0;

          if (data && normalizedSub && !data.user_id) {
            // Best effort backfill: link handler profile to Auth0 subject for future lookups.
            await supabase
              .from('handlers')
              .update({ user_id: normalizedSub })
              .eq('id', data.id);
          }
        }

        if (fetchError) {
          bootstrapDebug.fallback.error = fetchError?.message || String(fetchError);
          console.error('Failed to load handler profile:', fetchError);
          setError(fetchError);
          setHandlerProfile(null);
        } else if (!data) {
          setHandlerProfile(null);
          setError(null);
        } else {
          setHandlerProfile(normalizeHandlerRecord(data));
          setError(null);
        }
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

  // Parse permissions from handler profile
  const permissions = handlerProfile?.permissions
    ? parsePermissions(handlerProfile.permissions)
    : null;

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

  const roles = (profileRoles && profileRoles.length > 0)
    ? profileRoles
    : (claimRoles.length > 0 ? claimRoles : null);
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

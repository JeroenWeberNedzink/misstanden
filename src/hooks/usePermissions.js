import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getApiAccessToken } from '../lib/auth0ApiToken';
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

/**
 * Custom hook to access user permissions and roles
 * @returns {object} Permission checking utilities and user data
 */
export const usePermissions = () => {
  const { isAuthenticated, user, isLoading: auth0Loading, getAccessTokenSilently } = useAuth0();
  const [handlerProfile, setHandlerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadHandlerProfile = async () => {
      if (!isAuthenticated) {
        setHandlerProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const normalizedEmail = String(user?.email || '').toLowerCase().trim();
        const normalizedSub = String(user?.sub || '').trim();

        if (!normalizedEmail && !normalizedSub) {
          console.warn('No email/sub available for permission check');
          setHandlerProfile(null);
          setLoading(false);
          return;
        }

        let apiProfile = null;
        try {
          const token = await getApiAccessToken(getAccessTokenSilently);
          const response = await fetch('/api/me.api.php', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const payload = await response.json().catch(() => null);
          if (response.ok && payload?.success && payload?.data?.handler) {
            apiProfile = payload.data.handler;
          }
        } catch (apiError) {
          // Fallback to direct Supabase lookup for local/dev scenarios.
          console.warn('Handler API context lookup failed, trying direct profile lookup:', apiError);
        }

        if (apiProfile) {
          setHandlerProfile(apiProfile);
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

          if (data && normalizedSub && !data.user_id) {
            // Best effort backfill: link handler profile to Auth0 subject for future lookups.
            await supabase
              .from('handlers')
              .update({ user_id: normalizedSub })
              .eq('id', data.id);
          }
        }

        if (fetchError) {
          console.error('Failed to load handler profile:', fetchError);
          setError(fetchError);
          setHandlerProfile(null);
        } else if (!data) {
          console.warn(`No active handler found for user (sub=${normalizedSub || 'n/a'}, email=${normalizedEmail || 'n/a'})`);
          setHandlerProfile(null);
          setError(null);
        } else {
          setHandlerProfile(data);
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

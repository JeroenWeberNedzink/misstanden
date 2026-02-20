import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  const { isAuthenticated, user, isLoading: auth0Loading } = useAuth0();
  const [handlerProfile, setHandlerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadHandlerProfile = async () => {
      if (!isAuthenticated || !user?.email) {
        setHandlerProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Normalize email to lowercase for consistent comparison
        const normalizedEmail = String(user.email || '').toLowerCase().trim();

        if (!normalizedEmail) {
          console.warn('No email available for permission check');
          setHandlerProfile(null);
          setLoading(false);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('handlers')
          .select('*')
          .ilike('email', normalizedEmail) // Use ilike for case-insensitive comparison
          .eq('active', true)
          .maybeSingle(); // Use maybeSingle() to handle 0 rows gracefully

        if (fetchError) {
          console.error('Failed to load handler profile:', fetchError);
          setError(fetchError);
          setHandlerProfile(null);
        } else if (!data) {
          console.warn(`No active handler found for email: ${normalizedEmail}`);
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
  }, [isAuthenticated, user?.email]);

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

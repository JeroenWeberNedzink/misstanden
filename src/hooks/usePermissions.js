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

  // Get roles (prefer jsonb roles array, fallback to role field)
  const roles = handlerProfile?.roles || (handlerProfile?.role ? [handlerProfile.role] : null);

  return {
    // User data
    handlerProfile,
    permissions,
    roles,
    loading: auth0Loading || loading,
    error,
    isAuthenticated,

    // Permission checking functions
    hasPermission: (permission) => hasPermission(permissions, permission),
    hasAnyPermission: (permissionList) => hasAnyPermission(permissions, permissionList),
    hasAllPermissions: (permissionList) => hasAllPermissions(permissions, permissionList),

    // Role checking functions
    hasRole: (role) => hasRole(roles, role),
    hasAnyRole: (roleList) => hasAnyRole(roles, roleList),
    isAdmin: () => isAdmin(roles),

    // Constants for convenience
    PERMISSIONS,
    ROLES,

    // Specific permission checks (convenience)
    canViewTickets: hasPermission(permissions, PERMISSIONS.VIEW_TICKETS),
    canEditTickets: hasPermission(permissions, PERMISSIONS.EDIT_TICKETS),
    canDeleteTickets: hasPermission(permissions, PERMISSIONS.DELETE_TICKETS),
    canManageUsers: hasPermission(permissions, PERMISSIONS.MANAGE_USERS),
    canExportData: hasPermission(permissions, PERMISSIONS.EXPORT_DATA),
    canManageWorkflows: hasPermission(permissions, PERMISSIONS.MANAGE_WORKFLOWS),
  };
};

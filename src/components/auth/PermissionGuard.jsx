import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';

/**
 * Component to conditionally render children based on permissions
 *
 * @param {object} props
 * @param {string} props.permission - Single permission to check
 * @param {string[]} props.permissions - Array of permissions (requires ANY by default)
 * @param {boolean} props.requireAll - If true with permissions array, requires ALL permissions
 * @param {string} props.role - Single role to check
 * @param {string[]} props.roles - Array of roles (requires ANY by default)
 * @param {boolean} props.requireAllRoles - If true with roles array, requires ALL roles
 * @param {React.ReactNode} props.children - Content to render if permission check passes
 * @param {React.ReactNode} props.fallback - Optional content to render if permission check fails
 * @param {boolean} props.showLoading - Show loading state while checking permissions (default: false)
 *
 * @example
 * // Single permission check
 * <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
 *   <button>Edit Ticket</button>
 * </PermissionGuard>
 *
 * @example
 * // Multiple permissions (any)
 * <PermissionGuard permissions={[PERMISSIONS.EDIT_TICKETS, PERMISSIONS.DELETE_TICKETS]}>
 *   <button>Modify Ticket</button>
 * </PermissionGuard>
 *
 * @example
 * // Multiple permissions (all required)
 * <PermissionGuard permissions={[PERMISSIONS.EDIT_TICKETS, PERMISSIONS.DELETE_TICKETS]} requireAll>
 *   <button>Edit and Delete</button>
 * </PermissionGuard>
 *
 * @example
 * // Role check
 * <PermissionGuard role={ROLES.ADMIN}>
 *   <AdminPanel />
 * </PermissionGuard>
 *
 * @example
 * // With fallback
 * <PermissionGuard
 *   permission={PERMISSIONS.MANAGE_USERS}
 *   fallback={<div>You don't have permission to manage users</div>}
 * >
 *   <UserManagementPanel />
 * </PermissionGuard>
 */
const PermissionGuard = ({
  permission,
  permissions,
  requireAll = false,
  role,
  roles,
  requireAllRoles = false,
  children,
  fallback = null,
  showLoading = false,
}) => {
  const {
    hasPermission: checkPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole: checkRole,
    hasAnyRole,
    isAdmin: checkIsAdmin,
    loading,
  } = usePermissions();

  // Show loading state if requested
  if (loading && showLoading) {
    return <div className="skeleton h-8 w-24"></div>;
  }

  // Don't render anything while loading (unless showLoading is true)
  if (loading) {
    return null;
  }

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
    if (requireAllRoles) {
      // Check if user has all specified roles
      hasAccess = hasAccess && roles.every(r => checkRole(r));
    } else {
      hasAccess = hasAccess && hasAnyRole(roles);
    }
  }

  // Render children if access is granted, otherwise render fallback
  return hasAccess ? <>{children}</> : <>{fallback}</>;
};

export default PermissionGuard;

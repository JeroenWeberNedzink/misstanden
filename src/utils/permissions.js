// Permission constants
export const PERMISSIONS = {
  VIEW_TICKETS: 'canViewTickets',
  EDIT_TICKETS: 'canEditTickets',
  DELETE_TICKETS: 'canDeleteTickets',
  MANAGE_USERS: 'canManageUsers',
  EXPORT_DATA: 'canExportData',
  MANAGE_WORKFLOWS: 'canManageWorkflows',
};

// Role constants
export const ROLES = {
  ADMIN: 'ADMIN',
  HANDLER: 'HANDLER',
  USER: 'USER',
};

// Default permissions for new users
export const DEFAULT_PERMISSIONS = {
  [PERMISSIONS.VIEW_TICKETS]: false,
  [PERMISSIONS.EDIT_TICKETS]: false,
  [PERMISSIONS.DELETE_TICKETS]: false,
  [PERMISSIONS.MANAGE_USERS]: false,
  [PERMISSIONS.EXPORT_DATA]: false,
  [PERMISSIONS.MANAGE_WORKFLOWS]: false,
};

/**
 * Parse permissions from database (can be string or object)
 * @param {string|object} permissions - Permissions from database
 * @returns {object} Parsed permissions object
 */
export const parsePermissions = (permissions) => {
  if (!permissions) return DEFAULT_PERMISSIONS;

  if (typeof permissions === 'string') {
    try {
      return JSON.parse(permissions);
    } catch (error) {
      console.error('Failed to parse permissions:', error);
      return DEFAULT_PERMISSIONS;
    }
  }

  return permissions;
};

/**
 * Check if user has a specific permission
 * @param {object} permissions - User's permissions object
 * @param {string} permission - Permission to check (use PERMISSIONS constants)
 * @returns {boolean}
 */
export const hasPermission = (permissions, permission) => {
  if (!permissions) return false;
  const parsed = parsePermissions(permissions);
  const value = parsed[permission];
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
};

/**
 * Check if user has ANY of the specified permissions
 * @param {object} permissions - User's permissions object
 * @param {string[]} permissionList - Array of permissions to check
 * @returns {boolean}
 */
export const hasAnyPermission = (permissions, permissionList) => {
  if (!permissions || !permissionList || permissionList.length === 0) return false;
  return permissionList.some(permission => hasPermission(permissions, permission));
};

/**
 * Check if user has ALL of the specified permissions
 * @param {object} permissions - User's permissions object
 * @param {string[]} permissionList - Array of permissions to check
 * @returns {boolean}
 */
export const hasAllPermissions = (permissions, permissionList) => {
  if (!permissions || !permissionList || permissionList.length === 0) return false;
  return permissionList.every(permission => hasPermission(permissions, permission));
};

/**
 * Check if user has a specific role
 * @param {string[]|string} userRoles - User's roles (array or single role)
 * @param {string} role - Role to check (use ROLES constants)
 * @returns {boolean}
 */
export const hasRole = (userRoles, role) => {
  if (!userRoles) return false;
  if (!role) return false;

  // Handle both array and single role
  const rolesArray = Array.isArray(userRoles) ? userRoles : [userRoles];

  // Parse if string (from database)
  const parsedRoles = rolesArray.map(r => {
    if (typeof r === 'string') {
      try {
        // Check if it's a JSON array string
        if (r.startsWith('[')) {
          return JSON.parse(r);
        }
        return r;
      } catch {
        return r;
      }
    }
    return r;
  }).flat().map((r) => {
    if (r == null) return '';
    if (typeof r === 'object' && typeof r.role === 'string') return r.role;
    return String(r);
  });

  const target = String(role).trim().toUpperCase();
  return parsedRoles.some((r) => String(r).trim().toUpperCase() === target);
};

/**
 * Check if user has ANY of the specified roles
 * @param {string[]|string} userRoles - User's roles
 * @param {string[]} roleList - Array of roles to check
 * @returns {boolean}
 */
export const hasAnyRole = (userRoles, roleList) => {
  if (!userRoles || !roleList || roleList.length === 0) return false;
  return roleList.some(role => hasRole(userRoles, role));
};

/**
 * Check if user is admin (convenience function)
 * @param {string[]|string} userRoles - User's roles
 * @returns {boolean}
 */
export const isAdmin = (userRoles) => {
  return hasRole(userRoles, ROLES.ADMIN);
};

/**
 * Validate and normalize permissions object
 * @param {object} permissions - Permissions to validate
 * @returns {object} Normalized permissions with all keys present
 */
export const normalizePermissions = (permissions) => {
  const parsed = parsePermissions(permissions);
  return {
    ...DEFAULT_PERMISSIONS,
    ...parsed,
  };
};

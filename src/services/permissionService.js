import { supabase } from '../lib/supabase';
const WORKFLOW_API_URL = '/api/workflows.api.php';
let permissionTokenProvider = null;

// Helper function to convert snake_case to camelCase
const toCamelCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camelObj = {};
  Object.keys(obj).forEach(key => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelObj[camelKey] = toCamelCase(obj[key]);
  });
  return camelObj;
};

// Helper function to convert camelCase to snake_case
const toSnakeCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;

  const snakeObj = {};
  Object.keys(obj).forEach(key => {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    snakeObj[snakeKey] = toSnakeCase(obj[key]);
  });
  return snakeObj;
};

const setTokenProvider = (provider) => {
  permissionTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  if (!permissionTokenProvider) return {};
  try {
    const token = await permissionTokenProvider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const getAuthHeadersWithRetry = async (requireAdmin = false) => {
  let headers = await getAuthHeaders();
  if (requireAdmin && !headers.Authorization) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    headers = await getAuthHeaders();
  }
  return headers;
};

const apiGet = async (action, params = {}, { requireAdmin = true } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAdmin);
  if (requireAdmin && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${WORKFLOW_API_URL}?${query}`, {
    method: 'GET',
    headers: authHeaders,
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }

  return json?.data;
};

const apiPost = async (action, payload = {}, { requireAdmin = true } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAdmin);
  if (requireAdmin && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const response = await fetch(WORKFLOW_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }

  return json?.data;
};

export const permissionService = {
  setTokenProvider,
  // ==================== Permissions Management ====================

  /**
   * Get all available permissions
   */
  async getAllPermissions() {
    try {
      const data = await apiGet('permissions_list');
      return toCamelCase(data?.rows || []);
    } catch (apiErr) {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category, name');
      if (error) throw apiErr;
      return toCamelCase(data || []);
    }
  },

  /**
   * Get permissions by category
   */
  async getPermissionsByCategory() {
    const permissions = await this.getAllPermissions();

    const grouped = {};
    permissions.forEach(perm => {
      const category = perm.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(perm);
    });

    return grouped;
  },

  /**
   * Create a new permission
   */
  async createPermission(permissionData) {
    const payload = toSnakeCase({
      code: permissionData.code,
      name: permissionData.name,
      description: permissionData.description,
      category: permissionData.category || 'general',
      isSystem: permissionData.isSystem || false,
    });
    const data = await apiPost('permission_create', { payload });
    return toCamelCase(data?.row || data);
  },

  /**
   * Update a permission
   */
  async updatePermission(permissionId, permissionData) {
    const payload = toSnakeCase(permissionData);
    const data = await apiPost('permission_update', { id: permissionId, patch: payload });
    return toCamelCase(data?.row || data);
  },

  /**
   * Delete a permission (only if not system)
   */
  async deletePermission(permissionId) {
    await apiPost('permission_delete', { id: permissionId });
    return { success: true };
  },

  // ==================== Roles Management ====================

  /**
   * Get all roles
   */
  async getAllRoles() {
    try {
      const data = await apiGet('roles_list');
      return toCamelCase(data?.rows || []);
    } catch (apiErr) {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name');
      if (error) throw apiErr;
      return toCamelCase(data || []);
    }
  },

  /**
   * Get role by code
   */
  async getRoleByCode(roleCode) {
    const roles = await this.getAllRoles();
    return roles.find((role) => String(role?.code || '') === String(roleCode || '')) || null;
  },

  /**
   * Get role with its permissions
   */
  async getRoleWithPermissions(roleId) {
    const data = await apiGet('role_with_permissions', { role_id: roleId });
    const role = toCamelCase(data?.row || data);

    // Flatten permissions structure
    if (role.rolePermissions) {
      role.permissions = role.rolePermissions
        .map(rp => rp.permissions)
        .filter(Boolean);
      delete role.rolePermissions;
    }

    return role;
  },

  /**
   * Create a new role
   */
  async createRole(roleData) {
    const payload = toSnakeCase({
      code: roleData.code,
      name: roleData.name,
      description: roleData.description,
      isSystem: roleData.isSystem || false,
      isDefault: roleData.isDefault || false,
    });
    const data = await apiPost('role_create', { payload });
    return toCamelCase(data?.row || data);
  },

  /**
   * Update a role
   */
  async updateRole(roleId, roleData) {
    const payload = toSnakeCase(roleData);
    const data = await apiPost('role_update', { id: roleId, patch: payload });
    return toCamelCase(data?.row || data);
  },

  /**
   * Delete a role (only if not system)
   */
  async deleteRole(roleId) {
    await apiPost('role_delete', { id: roleId });
    return { success: true };
  },

  /**
   * Assign permissions to a role
   */
  async setRolePermissions(roleId, permissionIds) {
    await apiPost('role_set_permissions', {
      role_id: roleId,
      permission_ids: Array.isArray(permissionIds) ? permissionIds : [],
    });
    return { success: true };
  },

  // ==================== Handler Roles & Permissions ====================

  /**
   * Get all roles for a handler
   */
  async getHandlerRoles(handlerId) {
    const { data, error } = await supabase
      .from('handler_roles')
      .select(`
        role_id,
        roles (
          id,
          code,
          name,
          description
        )
      `)
      .eq('handler_id', handlerId);

    if (error) throw error;

    return toCamelCase((data || []).map(hr => hr.roles).filter(Boolean));
  },

  /**
   * Get all permissions for a handler (computed from their roles)
   */
  async getHandlerPermissions(handlerId) {
    const { data, error } = await supabase
      .rpc('get_handler_permissions', { handler_uuid: handlerId });

    if (error) throw error;
    return toCamelCase(data || []);
  },

  /**
   * Get handler permissions as a simple object (for compatibility)
   */
  async getHandlerPermissionsObject(handlerId) {
    const permissions = await this.getHandlerPermissions(handlerId);

    const permissionsObj = {};
    permissions.forEach(perm => {
      permissionsObj[perm.permissionCode] = true;
    });

    return permissionsObj;
  },

  /**
   * Check if handler has a specific permission
   */
  async handlerHasPermission(handlerId, permissionCode) {
    const { data, error } = await supabase
      .rpc('handler_has_permission', {
        handler_uuid: handlerId,
        perm_code: permissionCode,
      });

    if (error) throw error;
    return data === true;
  },

  /**
   * Assign roles to a handler
   */
  async setHandlerRoles(handlerId, roleIds) {
    // First, delete existing handler roles
    const { error: deleteError } = await supabase
      .from('handler_roles')
      .delete()
      .eq('handler_id', handlerId);

    if (deleteError) throw deleteError;

    // Then insert new roles
    if (roleIds && roleIds.length > 0) {
      const inserts = roleIds.map(roleId => ({
        handler_id: handlerId,
        role_id: roleId,
      }));

      const { error: insertError } = await supabase
        .from('handler_roles')
        .insert(inserts);

      if (insertError) throw insertError;
    }

    // Also update the legacy roles column in handlers table for backward compatibility
    const { data: roles } = await supabase
      .from('roles')
      .select('code')
      .in('id', roleIds);

    if (roles) {
      const roleCodes = roles.map(r => r.code);
      await supabase
        .from('handlers')
        .update({ roles: roleCodes })
        .eq('id', handlerId);
    }

    return { success: true };
  },

  /**
   * Get handler with roles and permissions
   */
  async getHandlerWithPermissions(handlerId) {
    const [handler, roles, permissions] = await Promise.all([
      supabase.from('handlers').select('*').eq('id', handlerId).single(),
      this.getHandlerRoles(handlerId),
      this.getHandlerPermissionsObject(handlerId),
    ]);

    if (handler.error) throw handler.error;

    return {
      ...toCamelCase(handler.data),
      roles,
      permissions,
    };
  },

  // ==================== Helper Functions ====================

  /**
   * Sync permissions from old system to new system
   * This is useful during migration
   */
  async syncPermissionsToRoles(handlerId, permissionsObject) {
    // This function can be used to create custom permissions based on the old system
    // For now, we'll just rely on roles
    console.warn('syncPermissionsToRoles is deprecated. Use role-based permissions instead.');
  },

  /**
   * Get permission statistics
   */
  async getPermissionStats() {
    const [permissions, roles] = await Promise.all([
      this.getAllPermissions().catch(() => []),
      this.getAllRoles().catch(() => []),
    ]);
    return {
      totalPermissions: Array.isArray(permissions) ? permissions.length : 0,
      totalRoles: Array.isArray(roles) ? roles.length : 0,
      totalRolePermissions: 0,
      totalHandlerRoles: 0,
    };
  },
};

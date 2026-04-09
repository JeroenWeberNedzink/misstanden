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
    const data = await apiGet('permissions_list');
    return toCamelCase(data?.rows || []);
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
    const data = await apiGet('roles_list');
    return toCamelCase(data?.rows || []);
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
    const data = await apiGet('handler_roles', { handler_id: handlerId });
    return toCamelCase(data?.rows || []);
  },

  /**
   * Get all permissions for a handler (computed from their roles)
   */
  async getHandlerPermissions(handlerId) {
    const data = await apiGet('handler_permissions', { handler_id: handlerId });
    return toCamelCase(data?.rows || []);
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
    const data = await apiGet('handler_has_permission', {
      handler_id: handlerId,
      permission_code: permissionCode,
    });
    return data?.allowed === true;
  },

  /**
   * Assign roles to a handler
   */
  async setHandlerRoles(handlerId, roleIds) {
    await apiPost('set_handler_roles', {
      handler_id: handlerId,
      role_ids: Array.isArray(roleIds) ? roleIds : [],
    });
    return { success: true };
  },

  /**
   * Get handler with roles and permissions
   */
  async getHandlerWithPermissions(handlerId) {
    const [handlerData, roles, permissions] = await Promise.all([
      apiGet('handlers_by_ids', { ids: String(handlerId), include_inactive: '1' }),
      this.getHandlerRoles(handlerId),
      this.getHandlerPermissionsObject(handlerId),
    ]);
    const handler = Array.isArray(handlerData?.rows) ? handlerData.rows[0] : null;
    if (!handler) throw new Error('Handler not found');

    return {
      ...toCamelCase(handler),
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

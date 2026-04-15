const ROLE_PRIORITY = ['SUPER_ADMIN', 'ADMIN', 'PORTAL_ADMIN', 'HANDLER', 'USER'];

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const safeJsonParse = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const tryDecodeIndexedObjectString = (value) => {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 0 || !keys.every((k) => /^\d+$/.test(k))) return null;

  const joined = keys
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => String(value[k] ?? ''))
    .join('');

  return joined.trim() ? joined : null;
};

const normalizeRolesArray = (rolesLike) => {
  const source = Array.isArray(rolesLike) ? rolesLike : [rolesLike];
  const seen = new Set();
  const roles = [];

  for (const item of source) {
    if (item == null) continue;

    if (Array.isArray(item)) {
      for (const nested of normalizeRolesArray(item)) {
        if (!seen.has(nested)) {
          seen.add(nested);
          roles.push(nested);
        }
      }
      continue;
    }

    if (isPlainObject(item)) {
      const decoded = tryDecodeIndexedObjectString(item);
      if (decoded) {
        for (const nested of normalizeRolesArray(decoded)) {
          if (!seen.has(nested)) {
            seen.add(nested);
            roles.push(nested);
          }
        }
      }
      continue;
    }

    if (typeof item === 'string') {
      const parsed = safeJsonParse(item);
      if (parsed !== null) {
        for (const nested of normalizeRolesArray(parsed)) {
          if (!seen.has(nested)) {
            seen.add(nested);
            roles.push(nested);
          }
        }
        continue;
      }

      const role = item.trim().toUpperCase();
      if (role && !seen.has(role)) {
        seen.add(role);
        roles.push(role);
      }
      continue;
    }

    const role = String(item).trim().toUpperCase();
    if (role && !seen.has(role)) {
      seen.add(role);
      roles.push(role);
    }
  }

  return roles;
};

export const normalizeRoles = (rawRoles) => normalizeRolesArray(rawRoles);

export const getPrimaryRole = (roles = []) => {
  const normalized = normalizeRoles(roles);
  for (const candidate of ROLE_PRIORITY) {
    if (normalized.includes(candidate)) return candidate;
  }
  return normalized[0] || null;
};

export const normalizePermissions = (rawPermissions) => {
  if (rawPermissions == null) return {};

  if (typeof rawPermissions === 'string') {
    const parsed = safeJsonParse(rawPermissions);
    return parsed && isPlainObject(parsed) ? parsed : {};
  }

  if (Array.isArray(rawPermissions)) {
    return rawPermissions.reduce((acc, key) => {
      const k = String(key ?? '').trim();
      if (k) acc[k] = true;
      return acc;
    }, {});
  }

  if (isPlainObject(rawPermissions)) {
    const decodedString = tryDecodeIndexedObjectString(rawPermissions);
    if (decodedString) {
      const parsed = safeJsonParse(decodedString);
      if (parsed && isPlainObject(parsed)) return parsed;
    }
    return rawPermissions;
  }

  return {};
};

export const normalizeHandlerRecord = (handler) => {
  if (!isPlainObject(handler)) return handler;

  const roles = normalizeRoles(handler.roles ?? handler.role ?? handler.rolesTmp ?? handler.roles_tmp);
  const role = typeof handler.role === 'string' && handler.role.trim()
    ? handler.role.trim().toUpperCase()
    : getPrimaryRole(roles);
  const permissions = normalizePermissions(handler.permissions);

  return {
    ...handler,
    roles,
    role,
    permissions,
  };
};

export const normalizeHandlerRecords = (handlers = []) => {
  if (!Array.isArray(handlers)) return [];
  return handlers.map((handler) => normalizeHandlerRecord(handler));
};

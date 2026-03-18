import { ROLES } from './permissions';

const parseAllowlist = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const SUPER_ADMIN_EMAILS = new Set(
  parseAllowlist(import.meta.env.VITE_SUPER_ADMIN_EMAILS).map((value) => value.toLowerCase())
);
const SUPER_ADMIN_SUBS = new Set(parseAllowlist(import.meta.env.VITE_SUPER_ADMIN_SUBS));

const normalizeRoles = (roles = []) => {
  const list = Array.isArray(roles) ? roles : [roles];
  return list
    .flatMap((value) => {
      if (value == null) return [];
      if (typeof value === 'object' && typeof value.role === 'string') return [value.role];
      return [String(value)];
    })
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
};

export const isSuperAdminIdentity = ({ roles = [], email = '', sub = '' } = {}) => {
  const normalizedRoles = normalizeRoles(roles);
  if (normalizedRoles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail && SUPER_ADMIN_EMAILS.has(normalizedEmail)) {
    return true;
  }

  const normalizedSub = String(sub || '').trim();
  if (normalizedSub && SUPER_ADMIN_SUBS.has(normalizedSub)) {
    return true;
  }

  return false;
};


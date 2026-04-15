const ACCESS_CAPABILITY_ORDER = [
  'ticketView',
  'ticketEdit',
  'manageUsers',
  'manageWorkflows',
  'manageSettings',
  'exportData',
];

export const ACCESS_CAPABILITY_LABELS = {
  ticketView: 'Ticketinzage',
  ticketEdit: 'Ticketbehandeling',
  manageUsers: 'Gebruikersbeheer',
  manageWorkflows: 'Workflowbeheer',
  manageSettings: 'Instellingen & vertalingen',
  exportData: 'Export',
};

const CAPABILITY_PERMISSION_CODES = {
  ticketView: ['canViewTickets'],
  ticketEdit: ['canEditTickets'],
  manageUsers: ['canManageUsers', 'manage_users'],
  manageWorkflows: ['canManageWorkflows', 'manage_workflows'],
  manageSettings: ['manage_settings', 'manage_translations'],
  exportData: ['canExportData'],
};

export const SYSTEM_ROLE_META = {
  USER: {
    label: 'Gebruiker',
    description: 'Ingelogd zonder toegang tot tickets of beheer.',
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  HANDLER: {
    label: 'Behandelaar',
    description: 'Kan tickets zien en behandelen binnen toegewezen workflows.',
    tone: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  PORTAL_ADMIN: {
    label: 'Portaalbeheerder',
    description: 'Kan gebruikers, workflows en instellingen beheren zonder ticketinzage.',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  ADMIN: {
    label: 'Administrator',
    description: 'Breed beheer met ticketinzage en beheerrechten.',
    tone: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  SUPER_ADMIN: {
    label: 'Super Admin',
    description: 'Technische noodrol met volledige toegang tot het portaal.',
    tone: 'border-violet-200 bg-violet-50 text-violet-700',
  },
};

const DEFAULT_ROLE_CAPABILITIES = {
  USER: {},
  HANDLER: {
    ticketView: true,
    ticketEdit: true,
  },
  PORTAL_ADMIN: {
    manageUsers: true,
    manageWorkflows: true,
    manageSettings: true,
  },
  ADMIN: {
    ticketView: true,
    ticketEdit: true,
    manageUsers: true,
    manageWorkflows: true,
    manageSettings: true,
    exportData: true,
  },
  SUPER_ADMIN: {
    ticketView: true,
    ticketEdit: true,
    manageUsers: true,
    manageWorkflows: true,
    manageSettings: true,
    exportData: true,
  },
};

const DEFAULT_ACCESS_PROFILES = [
  {
    code: 'HANDLER',
    label: 'Behandelaar',
    shortLabel: 'Handler',
    description: 'Voor mensen die meldingen inhoudelijk behandelen.',
    recommendation: 'Standaard profiel voor vertrouwelijke afhandeling.',
    roles: ['HANDLER'],
  },
  {
    code: 'PORTAL_ADMIN',
    label: 'Portaalbeheerder',
    shortLabel: 'Portaalbeheer',
    description: 'Beheert portaal, gebruikers en workflows zonder tickets te zien.',
    recommendation: 'Beste keuze als beheer gescheiden moet blijven van dossierinzage.',
    roles: ['PORTAL_ADMIN'],
  },
  {
    code: 'ADMIN',
    label: 'Administrator',
    shortLabel: 'Admin',
    description: 'Breed beheerprofiel met ticketinzage en beheerrechten.',
    recommendation: 'Alleen toekennen als ticketinzage expliciet gewenst en toegestaan is.',
    roles: ['HANDLER', 'ADMIN'],
  },
  {
    code: 'SUPER_ADMIN',
    label: 'Super Admin',
    shortLabel: 'Super admin',
    description: 'Technische fallback voor IT of noodbeheer.',
    recommendation: 'Gebruik alleen als achtervang of voor technische escalatie.',
    roles: ['SUPER_ADMIN'],
  },
];

const emptyCapabilities = () =>
  ACCESS_CAPABILITY_ORDER.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

export const normalizeRoleCodes = (rawRoles) => {
  const source = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
  const seen = new Set();
  const roles = [];

  for (const entry of source) {
    if (entry == null) continue;

    if (Array.isArray(entry)) {
      normalizeRoleCodes(entry).forEach((roleCode) => {
        if (!seen.has(roleCode)) {
          seen.add(roleCode);
          roles.push(roleCode);
        }
      });
      continue;
    }

    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('[')) {
        try {
          normalizeRoleCodes(JSON.parse(trimmed)).forEach((roleCode) => {
            if (!seen.has(roleCode)) {
              seen.add(roleCode);
              roles.push(roleCode);
            }
          });
          continue;
        } catch {
          // Fall through to scalar role handling.
        }
      }

      const roleCode = trimmed.toUpperCase();
      if (!seen.has(roleCode)) {
        seen.add(roleCode);
        roles.push(roleCode);
      }
      continue;
    }

    if (typeof entry === 'object') {
      const candidate = entry.code ?? entry.role ?? null;
      if (candidate != null) {
        const roleCode = String(candidate).trim().toUpperCase();
        if (roleCode && !seen.has(roleCode)) {
          seen.add(roleCode);
          roles.push(roleCode);
        }
      }
    }
  }

  return roles;
};

const normalizePermissionMap = (permissions) => {
  if (!permissions) return {};

  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  if (Array.isArray(permissions)) {
    return permissions.reduce((acc, code) => {
      const key = String(code || '').trim();
      if (key) acc[key] = true;
      return acc;
    }, {});
  }

  return permissions && typeof permissions === 'object' ? permissions : {};
};

const isEnabledPermissionValue = (value) => {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
};

const mergeCapabilities = (...sources) => {
  const merged = emptyCapabilities();

  sources.forEach((source) => {
    if (!source || typeof source !== 'object') return;
    ACCESS_CAPABILITY_ORDER.forEach((key) => {
      if (source[key]) {
        merged[key] = true;
      }
    });
  });

  return merged;
};

const inferCapabilitiesFromPermissionCodes = (permissionCodes = []) => {
  const availableCodes = new Set(
    (Array.isArray(permissionCodes) ? permissionCodes : [])
      .map((code) => String(code || '').trim())
      .filter(Boolean)
  );
  const capabilities = emptyCapabilities();

  Object.entries(CAPABILITY_PERMISSION_CODES).forEach(([capabilityKey, codes]) => {
    capabilities[capabilityKey] = codes.some((code) => availableCodes.has(code));
  });

  return capabilities;
};

export const buildRoleCapabilityMap = (roleDetailsByCode = {}) => {
  return Object.entries(roleDetailsByCode).reduce((acc, [roleCode, role]) => {
    const normalizedCode = String(roleCode || '').trim().toUpperCase();
    const permissionCodes = Array.isArray(role?.permissions)
      ? role.permissions.map((permission) => permission?.code).filter(Boolean)
      : [];
    acc[normalizedCode] = mergeCapabilities(
      DEFAULT_ROLE_CAPABILITIES[normalizedCode] || {},
      inferCapabilitiesFromPermissionCodes(permissionCodes)
    );
    return acc;
  }, {});
};

export const computeAccessCapabilities = ({ roles = [], permissions = {}, roleCapabilityMap = {} } = {}) => {
  const normalizedRoles = normalizeRoleCodes(roles);
  const permissionMap = normalizePermissionMap(permissions);
  const roleCapabilities = normalizedRoles.reduce(
    (acc, roleCode) => mergeCapabilities(acc, roleCapabilityMap[roleCode] || DEFAULT_ROLE_CAPABILITIES[roleCode] || {}),
    emptyCapabilities()
  );

  const explicitCapabilities = emptyCapabilities();
  Object.entries(CAPABILITY_PERMISSION_CODES).forEach(([capabilityKey, codes]) => {
    explicitCapabilities[capabilityKey] = codes.some((code) => isEnabledPermissionValue(permissionMap[code]));
  });

  return mergeCapabilities(roleCapabilities, explicitCapabilities);
};

export const getRoleMeta = (roleCode, roleDetailsByCode = {}) => {
  const normalizedCode = String(roleCode || '').trim().toUpperCase();
  const fallback = SYSTEM_ROLE_META[normalizedCode] || {
    label: normalizedCode || 'Onbekende rol',
    description: '',
    tone: 'border-border bg-muted/40 text-muted-foreground',
  };
  const roleDetails = roleDetailsByCode[normalizedCode] || null;

  return {
    code: normalizedCode,
    label: String(roleDetails?.name || fallback.label),
    description: String(roleDetails?.description || fallback.description || ''),
    tone: fallback.tone,
    isSystem: roleDetails?.isSystem ?? true,
  };
};

export const getAccessProfiles = ({ availableRoles = [], roleDetailsByCode = {} } = {}) => {
  const availableRoleCodes = new Set(
    (Array.isArray(availableRoles) ? availableRoles : [])
      .map((role) => String(role?.code || role || '').trim().toUpperCase())
      .filter(Boolean)
  );
  const roleCapabilityMap = buildRoleCapabilityMap(roleDetailsByCode);

  return DEFAULT_ACCESS_PROFILES.map((profile) => {
    const selectable = profile.roles.every((roleCode) => availableRoleCodes.has(roleCode));
    const meta = getRoleMeta(profile.code, roleDetailsByCode);

    return {
      ...profile,
      selectable,
      meta,
      capabilities: computeAccessCapabilities({
        roles: profile.roles,
        roleCapabilityMap,
      }),
    };
  });
};

export const findMatchingAccessProfile = (roles, profiles = []) => {
  const normalizedRoles = normalizeRoleCodes(roles).sort();
  if (normalizedRoles.length === 0) return null;

  return (
    profiles.find((profile) => {
      const profileRoles = normalizeRoleCodes(profile?.roles).sort();
      return profileRoles.length === normalizedRoles.length
        && profileRoles.every((roleCode, index) => roleCode === normalizedRoles[index]);
    }) || null
  );
};

export const summarizeCapabilities = (capabilities) => {
  return ACCESS_CAPABILITY_ORDER
    .filter((key) => Boolean(capabilities?.[key]))
    .map((key) => ACCESS_CAPABILITY_LABELS[key]);
};

export const requiresWorkflowSelectionForRoles = ({ roles = [], permissions = {}, roleCapabilityMap = {} } = {}) => {
  const normalizedRoles = normalizeRoleCodes(roles);
  const capabilities = computeAccessCapabilities({ roles: normalizedRoles, permissions, roleCapabilityMap });

  if (!capabilities.ticketView) {
    return false;
  }

  return !normalizedRoles.includes('ADMIN') && !normalizedRoles.includes('SUPER_ADMIN');
};

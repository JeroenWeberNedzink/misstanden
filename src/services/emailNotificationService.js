import { getSharedTokenProvider } from '../lib/serviceTokenProvider';

const DEFAULT_EMAIL_EVENT_TYPES = [
  {
    code: 'TICKET_CREATED',
    category: 'ticket',
    nameEn: 'Ticket Created',
    nameNl: 'Ticket Aangemaakt',
    descriptionEn: 'Send when a new ticket is created',
    descriptionNl: 'Versturen wanneer een nieuw ticket wordt aangemaakt',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_ASSIGNED',
    category: 'ticket',
    nameEn: 'Ticket Assigned',
    nameNl: 'Ticket Toegewezen',
    descriptionEn: 'Send when a ticket is assigned to a handler',
    descriptionNl: 'Versturen wanneer een ticket wordt toegewezen aan een behandelaar',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_STATUS_CHANGED',
    category: 'ticket',
    nameEn: 'Status Changed',
    nameNl: 'Status Gewijzigd',
    descriptionEn: 'Send when ticket status changes',
    descriptionNl: 'Versturen wanneer de ticket status wijzigt',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_COMMENT_ADDED',
    category: 'ticket',
    nameEn: 'Comment Added',
    nameNl: 'Reactie Toegevoegd',
    descriptionEn: 'Send when a comment is added to a ticket',
    descriptionNl: 'Versturen wanneer een reactie wordt toegevoegd aan een ticket',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_RESOLVED',
    category: 'ticket',
    nameEn: 'Ticket Resolved',
    nameNl: 'Ticket Opgelost',
    descriptionEn: 'Send when a ticket is marked as resolved',
    descriptionNl: 'Versturen wanneer een ticket als opgelost wordt gemarkeerd',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_CLOSED',
    category: 'ticket',
    nameEn: 'Ticket Closed',
    nameNl: 'Ticket Gesloten',
    descriptionEn: 'Send when a ticket is closed',
    descriptionNl: 'Versturen wanneer een ticket wordt gesloten',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'TICKET_REOPENED',
    category: 'ticket',
    nameEn: 'Ticket Reopened',
    nameNl: 'Ticket Heropend',
    descriptionEn: 'Send when a resolved/closed ticket is reopened',
    descriptionNl: 'Versturen wanneer een opgelost/gesloten ticket wordt heropend',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'HANDLER_ASSIGNED',
    category: 'handler',
    nameEn: 'Assigned to You',
    nameNl: 'Aan Jou Toegewezen',
    descriptionEn: 'Send when a ticket is assigned to you',
    descriptionNl: 'Versturen wanneer een ticket aan jou wordt toegewezen',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'HANDLER_MENTIONED',
    category: 'handler',
    nameEn: 'Mentioned in Comment',
    nameNl: 'Vermeld in Reactie',
    descriptionEn: 'Send when you are mentioned in a comment',
    descriptionNl: 'Versturen wanneer je wordt vermeld in een reactie',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'HANDLER_DAILY_DIGEST',
    category: 'handler',
    nameEn: 'Daily Digest',
    nameNl: 'Dagelijkse Samenvatting',
    descriptionEn: 'Daily summary of pending tickets',
    descriptionNl: 'Dagelijkse samenvatting van openstaande tickets',
    isSystemCritical: false,
    enabledByDefault: false,
  },
  {
    code: 'SLA_WARNING',
    category: 'sla',
    nameEn: 'SLA Warning',
    nameNl: 'SLA Waarschuwing',
    descriptionEn: 'Send when SLA deadline is approaching',
    descriptionNl: 'Versturen wanneer SLA deadline nadert',
    isSystemCritical: true,
    enabledByDefault: true,
  },
  {
    code: 'SLA_BREACH',
    category: 'sla',
    nameEn: 'SLA Breach',
    nameNl: 'SLA Schending',
    descriptionEn: 'Send when SLA deadline is exceeded',
    descriptionNl: 'Versturen wanneer SLA deadline wordt overschreden',
    isSystemCritical: true,
    enabledByDefault: true,
  },
  {
    code: 'SYSTEM_ERROR',
    category: 'system',
    nameEn: 'System Error',
    nameNl: 'Systeemfout',
    descriptionEn: 'Send when a critical system error occurs',
    descriptionNl: 'Versturen bij een kritieke systeemfout',
    isSystemCritical: true,
    enabledByDefault: true,
  },
  {
    code: 'SYSTEM_MAINTENANCE',
    category: 'system',
    nameEn: 'Maintenance Notice',
    nameNl: 'Onderhoudsbericht',
    descriptionEn: 'Send maintenance notifications',
    descriptionNl: 'Versturen van onderhoudsberichten',
    isSystemCritical: false,
    enabledByDefault: true,
  },
  {
    code: 'SYSTEM_UPDATE',
    category: 'system',
    nameEn: 'System Update',
    nameNl: 'Systeem Update',
    descriptionEn: 'Send notifications about system updates',
    descriptionNl: 'Versturen van berichten over systeem updates',
    isSystemCritical: false,
    enabledByDefault: false,
  },
];

const EMAIL_SETTINGS_API_URL = '/api/email-settings.api.php';
let emailSettingsTokenProvider = null;

const toCamelCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camelObj = {};
  Object.keys(obj).forEach((key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    camelObj[camelKey] = toCamelCase(obj[key]);
  });
  return camelObj;
};

const toSnakeCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;

  const snakeObj = {};
  Object.keys(obj).forEach((key) => {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    snakeObj[snakeKey] = toSnakeCase(obj[key]);
  });
  return snakeObj;
};

const setTokenProvider = (provider) => {
  emailSettingsTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  const provider = emailSettingsTokenProvider || getSharedTokenProvider();
  if (!provider) return {};
  try {
    const token = await provider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const getAuthHeadersWithRetry = async () => {
  let headers = await getAuthHeaders();
  if (!headers.Authorization) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    headers = await getAuthHeaders();
  }
  if (!headers.Authorization) {
    throw new Error('Authorization token required');
  }
  return headers;
};

const apiGet = async (action, params = {}) => {
  const headers = await getAuthHeadersWithRetry();
  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${EMAIL_SETTINGS_API_URL}?${query}`, {
    method: 'GET',
    headers,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Email settings API error (${response.status})`);
  }
  return json?.data;
};

const apiPost = async (action, payload = {}) => {
  const headers = await getAuthHeadersWithRetry();
  const response = await fetch(EMAIL_SETTINGS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Email settings API error (${response.status})`);
  }
  return json?.data;
};

export const emailNotificationService = {
  setTokenProvider,

  async getEmailEventTypesWithMeta() {
    const data = await apiGet('event_types');
    const rows = toCamelCase(data?.rows || []);
    if (rows.length > 0) {
      return { rows, fallbackActive: false };
    }
    return { rows: DEFAULT_EMAIL_EVENT_TYPES, fallbackActive: true };
  },

  async getEmailEventTypes() {
    const result = await this.getEmailEventTypesWithMeta();
    return result.rows || [];
  },

  async getEmailEventTypesByCategory() {
    const types = await this.getEmailEventTypes();
    const grouped = {};
    types.forEach((type) => {
      if (!grouped[type.category]) grouped[type.category] = [];
      grouped[type.category].push(type);
    });
    return grouped;
  },

  async getAdminEmailSettings() {
    const data = await apiGet('admin_overview');
    return toCamelCase(data?.rows || []);
  },

  async updateAdminEmailSetting(eventTypeCode, settings) {
    const data = await apiPost('update_admin_setting', {
      event_type_code: eventTypeCode,
      settings: toSnakeCase(settings),
    });
    return toCamelCase(data?.row || null);
  },

  async getHandlerEmailPreferences(handlerId) {
    const data = await apiGet('handler_preferences', { handler_id: handlerId });
    return toCamelCase(data?.rows || []);
  },

  async getHandlerEmailPreferencesByCategory(handlerId, options = {}) {
    const withMeta = Boolean(options?.withMeta);
    const [preferences, eventTypes] = await Promise.all([
      this.getHandlerEmailPreferences(handlerId),
      this.getEmailEventTypesWithMeta(),
    ]);

    const typeRows = Array.isArray(eventTypes?.rows) ? eventTypes.rows : [];
    const grouped = {};

    typeRows.forEach((type) => {
      if (!grouped[type.category]) grouped[type.category] = [];
      const handlerPref = preferences.find((p) => p.eventTypeCode === type.code);
      grouped[type.category].push({
        ...type,
        isEnabled: handlerPref ? handlerPref.isEnabled : type.enabledByDefault,
        hasHandlerPreference: !!handlerPref,
      });
    });

    if (withMeta) {
      return {
        preferencesByCategory: grouped,
        meta: { fallbackActive: Boolean(eventTypes?.fallbackActive) },
      };
    }

    return grouped;
  },

  async updateHandlerEmailPreference(handlerId, eventTypeCode, isEnabled) {
    const data = await apiPost('update_handler_preferences', {
      handler_id: handlerId,
      preferences: {
        [eventTypeCode]: Boolean(isEnabled),
      },
    });
    const rows = toCamelCase(data?.rows || []);
    return rows.find((row) => row.eventTypeCode === eventTypeCode) || null;
  },

  async updateHandlerEmailPreferences(handlerId, preferences) {
    const data = await apiPost('update_handler_preferences', {
      handler_id: handlerId,
      preferences,
    });
    return toCamelCase(data?.rows || []);
  },

  async shouldSendEmail() {
    return true;
  },

  async resetHandlerEmailPreferences(handlerId) {
    await apiPost('reset_handler_preferences', { handler_id: handlerId });
    return true;
  },
};

export default emailNotificationService;

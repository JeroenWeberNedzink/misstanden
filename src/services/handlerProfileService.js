import { normalizeHandlerRecord } from './utils/handlerNormalization';
import { getSharedTokenProvider } from '../lib/serviceTokenProvider';

const PROFILE_API_URL = '/api/profile.api.php';
let profileTokenProvider = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => UUID_RE.test(String(value || '').trim());

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
  profileTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  const provider = profileTokenProvider || getSharedTokenProvider();
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
  const response = await fetch(`${PROFILE_API_URL}?${query}`, {
    method: 'GET',
    headers,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Profile API error (${response.status})`);
  }
  return json?.data;
};

const apiPost = async (action, payload = {}) => {
  const headers = await getAuthHeadersWithRetry();
  const response = await fetch(PROFILE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Profile API error (${response.status})`);
  }
  return json?.data;
};

export const handlerProfileService = {
  setTokenProvider,

  async getHandlerByUserId(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return null;
    const data = await apiGet('handler_by_user_id', { user_id: normalizedUserId });
    const row = data?.row ? toCamelCase(data.row) : null;
    return row ? normalizeHandlerRecord(row) : null;
  },

  async getHandlerByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;
    const data = await apiGet('handler_by_email', { email: normalizedEmail });
    const row = data?.row ? toCamelCase(data.row) : null;
    return row ? normalizeHandlerRecord(row) : null;
  },

  async getAvailabilityStatus(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return null;
    const data = await apiGet('availability', { user_id: normalizedUserId });
    return toCamelCase(data?.row || null);
  },

  async getNotificationSettings(handlerId) {
    if (!isUuid(handlerId)) return null;
    const data = await apiGet('notification_settings', { handler_id: handlerId });
    return toCamelCase(data?.row || null);
  },

  async updateHandlerContact(handlerId, contactData) {
    if (!isUuid(handlerId)) {
      throw new Error('Ongeldig handler ID voor contact update');
    }
    const data = await apiPost('update_contact', {
      handler_id: handlerId,
      contact: toSnakeCase(contactData),
    });
    const row = data?.row ? toCamelCase(data.row) : null;
    if (!row) {
      throw new Error('Handler profile not found or not accessible');
    }
    return normalizeHandlerRecord(row);
  },

  async updateAvailabilityStatus(userId, availabilityData) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      throw new Error('Ongeldig user ID voor availability update');
    }
    const data = await apiPost('update_availability', {
      user_id: normalizedUserId,
      availability: toSnakeCase(availabilityData),
    });
    return toCamelCase(data?.row || null);
  },

  async updateNotificationSettings(handlerId, settingsData) {
    if (!isUuid(handlerId)) {
      throw new Error('Ongeldig handler ID voor notificatie update');
    }

    const snakeData = toSnakeCase(settingsData);
    if (snakeData.quiet_hours_start === '') snakeData.quiet_hours_start = null;
    if (snakeData.quiet_hours_end === '') snakeData.quiet_hours_end = null;
    if (snakeData.emergency_contact_phone === '') snakeData.emergency_contact_phone = null;
    if (snakeData.min_severity_immediate === '') snakeData.min_severity_immediate = null;

    const data = await apiPost('update_notification_settings', {
      handler_id: handlerId,
      settings: snakeData,
    });
    return toCamelCase(data?.row || null);
  },
};

export default handlerProfileService;

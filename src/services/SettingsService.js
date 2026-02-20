// services/settingsService.js
let tokenProvider = null;

const API_URL = '/api/settings.api.php';

const setTokenProvider = (provider) => {
  tokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  if (!tokenProvider) return {};
  try {
    const token = await tokenProvider();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Settings API error (${response.status})`);
  }
  return json?.data;
};

const normalizeRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const byKey = {};
  const byCategory = {};

  for (const r of list) {
    byKey[r.setting_key] = r;
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  return { rows: list, byKey, byCategory };
};

export const settingsService = {
  setTokenProvider,

  async getSettings({ category = null } = {}) {
    const authHeaders = await getAuthHeaders();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    // If auth header exists, ask for full admin view including sensitive settings.
    if (authHeaders.Authorization) params.set('include_sensitive', '1');

    const url = `${API_URL}?${params.toString()}`;

    try {
      const data = await fetchJson(url, {
        method: 'GET',
        headers: {
          ...authHeaders,
        },
      });
      return {
        ...normalizeRows(data?.rows || []),
        isAdmin: !!data?.is_admin,
        warning: data?.warning || null,
      };
    } catch (error) {
      // Graceful fallback for non-admin sessions: retry without sensitive flag.
      const msg = String(error?.message || '').toLowerCase();
      const shouldRetryWithoutSensitive =
        authHeaders.Authorization &&
        (
          msg.includes('admin') ||
          msg.includes('authorization') ||
          msg.includes('token required') ||
          msg.includes('forbidden') ||
          msg.includes('403') ||
          msg.includes('401')
        );

      if (shouldRetryWithoutSensitive) {
        const retryParams = new URLSearchParams();
        if (category) retryParams.set('category', category);
        const retryData = await fetchJson(`${API_URL}?${retryParams.toString()}`, { method: 'GET' });
        return {
          ...normalizeRows(retryData?.rows || []),
          isAdmin: !!retryData?.is_admin,
          warning: retryData?.warning || null,
        };
      }
      throw error;
    }
  },

  async upsertSetting({ settingKey, value, category, description = null, isSensitive = false, updatedBy = null }) {
    if (!settingKey) throw new Error('settingKey is required');
    if (!category) throw new Error('category is required');

    const authHeaders = await getAuthHeaders();
    const payload = {
      action: 'upsert',
      item: {
        id: settingKey,
        setting_key: settingKey,
        setting_value: value ?? {},
        category,
        description,
        is_sensitive: !!isSensitive,
        updated_by: updatedBy || null,
      },
    };

    const data = await fetchJson(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });

    return data?.row || null;
  },

  async upsertSettings(items = [], { updatedBy = null } = {}) {
    const payload = (items || [])
      .filter(Boolean)
      .map((it) => ({
        id: it.settingKey,
        setting_key: it.settingKey,
        setting_value: it.value ?? {},
        category: it.category,
        description: it.description ?? null,
        is_sensitive: !!it.isSensitive,
        updated_by: updatedBy || null,
      }));
    if (!payload.length) return [];

    const authHeaders = await getAuthHeaders();
    const data = await fetchJson(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        action: 'upsert_many',
        items: payload,
      }),
    });

    return data?.rows || [];
  },
};

// services/settingsService.js
import { getSharedTokenProvider } from '../lib/serviceTokenProvider';

let tokenProvider = null;

const API_URL = '/api/settings.api.php';
const SETTINGS_CACHE_TTL_MS = 30_000;
const settingsGetCache = new Map();
const settingsGetInflight = new Map();

const setTokenProvider = (provider) => {
  tokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  const provider = tokenProvider || getSharedTokenProvider();
  if (!provider) return {};
  try {
    const token = await provider();
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

const buildCacheKey = ({
  category = null,
  includeSensitive = 'auto',
  hasAuthHeader = false,
  requireSuperAdmin = false,
}) =>
  JSON.stringify({
    category: category || '',
    includeSensitive,
    hasAuthHeader,
    requireSuperAdmin,
  });

export const settingsService = {
  setTokenProvider,

  async getSettings({ category = null, includeSensitive = 'auto', requireSuperAdmin = false } = {}) {
    const authHeaders = await getAuthHeaders();
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    // `includeSensitive`:
    // - true: force include_sensitive=1
    // - false: never request sensitive fields
    // - auto: include only when an auth header exists
    const shouldIncludeSensitive =
      includeSensitive === true ||
      (includeSensitive === 'auto' && Boolean(authHeaders.Authorization));

    if (shouldIncludeSensitive) params.set('include_sensitive', '1');
    if (requireSuperAdmin) params.set('require_super_admin', '1');

    const url = `${API_URL}?${params.toString()}`;
    const cacheKey = buildCacheKey({
      category,
      includeSensitive,
      hasAuthHeader: Boolean(authHeaders.Authorization),
      requireSuperAdmin,
    });
    const now = Date.now();
    const cached = settingsGetCache.get(cacheKey);
    if (cached && (now - cached.ts) < SETTINGS_CACHE_TTL_MS) {
      return cached.value;
    }
    const inflight = settingsGetInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      try {
        const data = await fetchJson(url, {
          method: 'GET',
          headers: {
            ...authHeaders,
          },
        });
        const result = {
          ...normalizeRows(data?.rows || []),
          isAdmin: !!data?.is_admin,
          warning: data?.warning || null,
        };
        settingsGetCache.set(cacheKey, { ts: Date.now(), value: result });
        return result;
      } catch (error) {
        // Graceful fallback for non-admin sessions: retry without sensitive flag.
        const msg = String(error?.message || '').toLowerCase();
        const shouldRetryWithoutSensitive =
          shouldIncludeSensitive &&
          !requireSuperAdmin &&
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
          const retryCacheKey = buildCacheKey({
            category,
            includeSensitive: false,
            hasAuthHeader: false,
            requireSuperAdmin: false,
          });
          const retryCached = settingsGetCache.get(retryCacheKey);
          if (retryCached && (Date.now() - retryCached.ts) < SETTINGS_CACHE_TTL_MS) {
            return retryCached.value;
          }
          const retryData = await fetchJson(`${API_URL}?${retryParams.toString()}`, { method: 'GET' });
          const retryResult = {
            ...normalizeRows(retryData?.rows || []),
            isAdmin: !!retryData?.is_admin,
            warning: retryData?.warning || null,
          };
          settingsGetCache.set(retryCacheKey, { ts: Date.now(), value: retryResult });
          return retryResult;
        }
        throw error;
      } finally {
        settingsGetInflight.delete(cacheKey);
      }
    })();

    settingsGetInflight.set(cacheKey, request);
    return request;
  },

  async upsertSetting({
    settingKey,
    value,
    category,
    description = null,
    isSensitive = false,
    updatedBy = null,
    requireSuperAdmin = false,
  }) {
    if (!settingKey) throw new Error('settingKey is required');
    if (!category) throw new Error('category is required');

    const authHeaders = await getAuthHeaders();
    const payload = {
      action: 'upsert',
      require_super_admin: !!requireSuperAdmin,
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

    settingsGetCache.clear();
    settingsGetInflight.clear();

    return data?.row || null;
  },

  async upsertSettings(items = [], { updatedBy = null, requireSuperAdmin = false } = {}) {
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
        require_super_admin: !!requireSuperAdmin,
        items: payload,
      }),
    });

    settingsGetCache.clear();
    settingsGetInflight.clear();

    return data?.rows || [];
  },
};

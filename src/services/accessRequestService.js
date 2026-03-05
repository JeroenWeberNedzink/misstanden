const API_URL = '/api/access-requests.api.php';

let tokenProvider = null;

const toCamelCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const out = {};
  Object.keys(obj).forEach((key) => {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = toCamelCase(obj[key]);
  });
  return out;
};

const setTokenProvider = (provider) => {
  tokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  if (!tokenProvider) return {};
  try {
    const token = await tokenProvider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const getAuthHeadersWithRetry = async (requireAuth = true) => {
  let headers = await getAuthHeaders();
  if (requireAuth && !headers.Authorization) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    headers = await getAuthHeaders();
  }
  return headers;
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Access request API error (${response.status})`);
  }
  return toCamelCase(json);
};

export const accessRequestService = {
  setTokenProvider,

  async getMyRequest() {
    const authHeaders = await getAuthHeadersWithRetry(true);
    if (!authHeaders.Authorization) {
      throw new Error('Authorization token required');
    }

    const payload = await fetchJson(`${API_URL}?action=my`, {
      method: 'GET',
      headers: authHeaders,
    });

    return payload?.row || null;
  },

  async requestAccess({ message = '' } = {}) {
    const authHeaders = await getAuthHeadersWithRetry(true);
    if (!authHeaders.Authorization) {
      throw new Error('Authorization token required');
    }

    const payload = await fetchJson(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        action: 'request_access',
        request_message: String(message || '').trim(),
      }),
    });

    return {
      request: payload?.row || null,
      pendingExists: Boolean(payload?.pendingExists),
    };
  },

  async listRequests({ status = 'pending', limit = 100 } = {}) {
    const authHeaders = await getAuthHeadersWithRetry(true);
    if (!authHeaders.Authorization) {
      throw new Error('Authorization token required');
    }

    const query = new URLSearchParams({
      action: 'list',
      status: String(status || 'pending'),
      limit: String(Math.max(1, Math.min(500, Number(limit || 100)))),
    }).toString();

    const payload = await fetchJson(`${API_URL}?${query}`, {
      method: 'GET',
      headers: authHeaders,
    });

    return {
      rows: Array.isArray(payload?.rows) ? payload.rows : [],
      count: Number(payload?.count || 0),
      counts: payload?.counts || {},
    };
  },

  async approveRequest(requestId, { roles = ['HANDLER'], workflowIds = null, note = '' } = {}) {
    const authHeaders = await getAuthHeadersWithRetry(true);
    if (!authHeaders.Authorization) {
      throw new Error('Authorization token required');
    }

    const normalizedRoles = Array.isArray(roles)
      ? roles.map((role) => String(role || '').trim()).filter(Boolean)
      : ['HANDLER'];

    const payload = await fetchJson(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        action: 'approve',
        request_id: String(requestId || '').trim(),
        roles: normalizedRoles.length > 0 ? normalizedRoles : ['HANDLER'],
        ...(Array.isArray(workflowIds) ? { workflow_ids: workflowIds } : {}),
        review_notes: String(note || '').trim(),
      }),
    });

    return {
      request: payload?.request || null,
      handler: payload?.handler || null,
      warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
    };
  },

  async rejectRequest(requestId, { note = '' } = {}) {
    const authHeaders = await getAuthHeadersWithRetry(true);
    if (!authHeaders.Authorization) {
      throw new Error('Authorization token required');
    }

    const payload = await fetchJson(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        action: 'reject',
        request_id: String(requestId || '').trim(),
        review_notes: String(note || '').trim(),
      }),
    });

    return {
      request: payload?.request || null,
    };
  },
};

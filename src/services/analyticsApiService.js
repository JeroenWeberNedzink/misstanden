const ANALYTICS_API_URL = '/api/analytics.api.php';

let tokenProvider = null;

const getAuthHeaders = async (requireAuth = false) => {
  if (!tokenProvider) {
    if (requireAuth) throw new Error('Authorization token required');
    return {};
  }
  const token = await tokenProvider();
  if (!token && requireAuth) throw new Error('Authorization token required');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const apiGet = async (params = {}, { requireAuth = true } = {}) => {
  const headers = await getAuthHeaders(requireAuth);
  const query = new URLSearchParams(params).toString();
  const resp = await fetch(query ? `${ANALYTICS_API_URL}?${query}` : ANALYTICS_API_URL, {
    method: 'GET',
    headers,
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json?.success) {
    throw new Error(json?.message || `Analytics API error (${resp.status})`);
  }
  return json?.data || {};
};

export const analyticsApiService = {
  setTokenProvider(provider) {
    tokenProvider = typeof provider === 'function' ? provider : null;
  },

  async getDashboardMetrics({ dateFrom, dateTo } = {}) {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    return apiGet(params, { requireAuth: true });
  },
};

export default analyticsApiService;

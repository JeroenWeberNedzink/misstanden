import { getSharedTokenProvider } from '../lib/serviceTokenProvider';

const GUEST_ACCESS_API_URL = '/api/guest-access.api.php';

let tokenProvider = null;

const getAuthHeaders = async (requireAuth = false) => {
  const provider = tokenProvider || getSharedTokenProvider();
  if (!provider) {
    if (requireAuth) throw new Error('Authorization token required');
    return {};
  }
  const token = await provider();
  if (!token && requireAuth) throw new Error('Authorization token required');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const postJson = async (payload, { requireAuth = false } = {}) => {
  const headers = await getAuthHeaders(requireAuth);
  const resp = await fetch(GUEST_ACCESS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json?.success) {
    throw new Error(json?.message || `Guest access API error (${resp.status})`);
  }
  return json?.data || {};
};

const getJson = async (params = {}, { requireAuth = false } = {}) => {
  const headers = await getAuthHeaders(requireAuth);
  const query = new URLSearchParams(params).toString();
  const resp = await fetch(query ? `${GUEST_ACCESS_API_URL}?${query}` : GUEST_ACCESS_API_URL, {
    method: 'GET',
    headers,
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok || !json?.success) {
    throw new Error(json?.message || `Guest access API error (${resp.status})`);
  }
  return json?.data || {};
};

export const guestAccessService = {
  setTokenProvider(provider) {
    tokenProvider = typeof provider === 'function' ? provider : null;
  },

  async createGuestAccess(ticketId, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    return postJson(
      {
        action: 'create',
        ticket_id: ticketId,
        role: options?.role || 'viewer',
        expires_in_hours: Number(options?.expiresInHours || 72),
      },
      { requireAuth: true }
    );
  },

  async fetchGuestTicket(token) {
    if (!token) throw new Error('token is required');
    return getJson({ token: String(token).trim(), action: 'fetch' });
  },
};

export default guestAccessService;

import { getSharedTokenProvider } from '../lib/serviceTokenProvider';

const REPORT_API_URL = '/api/report.api.php';

let tokenProvider = null;

const getAuthHeaders = async () => {
  const provider = tokenProvider || getSharedTokenProvider();
  if (!provider) throw new Error('Authorization token required');
  const token = await provider();
  if (!token) throw new Error('Authorization token required');
  return { Authorization: `Bearer ${token}` };
};

const parseFileName = (contentDisposition, fallback = 'investigation-report.pdf') => {
  const raw = String(contentDisposition || '');
  const match = raw.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
};

export const reportService = {
  setTokenProvider(provider) {
    tokenProvider = typeof provider === 'function' ? provider : null;
  },

  async generateTicketReport(ticketId) {
    if (!ticketId) throw new Error('ticketId is required');
    const authHeaders = await getAuthHeaders();

    const resp = await fetch(REPORT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ ticket_id: ticketId }),
    });

    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    if (!resp.ok || contentType.includes('application/json')) {
      const json = await resp.json().catch(() => null);
      throw new Error(json?.message || `Report API error (${resp.status})`);
    }

    const blob = await resp.blob();
    const fileName = parseFileName(resp.headers.get('content-disposition'));
    return { blob, fileName };
  },
};

export default reportService;

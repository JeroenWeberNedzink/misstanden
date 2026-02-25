import { supabase } from '../lib/supabase';
const WORKFLOW_API_URL = '/api/workflows.api.php';
let auditLogTokenProvider = null;

// Date helper (consistent with ticketService)
const getEndOfDayISO = (dateStr) => {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

const setTokenProvider = (provider) => {
  auditLogTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  if (!auditLogTokenProvider) return {};
  try {
    const token = await auditLogTokenProvider();
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
  return headers;
};

const apiGetAuditLogs = async (filters = {}) => {
  const authHeaders = await getAuthHeadersWithRetry();
  if (!authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const params = {
    action: 'audit_logs',
    date_from: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : '',
    date_to: filters.dateTo ? getEndOfDayISO(filters.dateTo) : '',
    schema_name: filters.schemaName && filters.schemaName !== 'all' ? filters.schemaName : 'all',
    table_name: filters.tableName && filters.tableName !== 'all' ? filters.tableName : 'all',
    operation: filters.operation && filters.operation !== 'all' ? filters.operation : 'all',
    search: filters.search || '',
    limit: String(filters.limit || 500),
    offset: String(filters.offset || 0),
  };

  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${WORKFLOW_API_URL}?${query}`, {
    method: 'GET',
    headers: authHeaders,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }
  return json?.data?.rows || [];
};

export const auditLogService = {
  setTokenProvider,
  async getAuditLogs(filters = {}) {
    if (auditLogTokenProvider) {
      try {
        return await apiGetAuditLogs(filters);
      } catch (apiError) {
        console.warn('[auditLogService] API audit log fetch failed, trying direct supabase fallback', apiError);
      }
    }

    let q = supabase
      .from('audit_logs')
      .select('*')
      .order('occurred_at', { ascending: false });

    // Date filters
    if (filters.dateFrom) q = q.gte('occurred_at', new Date(filters.dateFrom).toISOString());
    if (filters.dateTo) q = q.lte('occurred_at', getEndOfDayISO(filters.dateTo));

    // Other filters
    if (filters.tableName && filters.tableName !== 'all') q = q.eq('table_name', filters.tableName);
    if (filters.schemaName && filters.schemaName !== 'all') q = q.eq('schema_name', filters.schemaName);
    if (filters.operation && filters.operation !== 'all') q = q.eq('operation', filters.operation);
    if (filters.search) q = q.ilike('row_id', `%${filters.search}%`);

    // Pagination support
    const limit = filters.limit || 500;
    const offset = filters.offset || 0;
    q = q.range(offset, offset + limit - 1);

    const { data, error } = await q;
    if (error) {
      console.error('[auditLogService] Failed to fetch audit logs:', error);
      throw error;
    }
    return data || [];
  },

  exportAuditToCSV(rows) {
    if (!rows || rows.length === 0) return '';

    const headers = ['occurred_at', 'schema_name', 'table_name', 'operation', 'row_id', 'changed_by'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => esc(r[h])).join(',')),
    ];
    return lines.join('\n');
  },
};

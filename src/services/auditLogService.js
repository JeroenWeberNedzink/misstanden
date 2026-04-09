import { settingsService } from './SettingsService';
const WORKFLOW_API_URL = '/api/workflows.api.php';
let auditLogTokenProvider = null;
let cachedRetentionDays = null;
let cachedRetentionLoadedAt = 0;
const RETENTION_TTL_MS = 2 * 60 * 1000;

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

const toSettingValue = (raw) => (
  raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value')
    ? raw.value
    : raw
);

const toNumber = (value, fallback = 365) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getDefaultRetentionDays = async () => {
  const now = Date.now();
  if (cachedRetentionDays !== null && now - cachedRetentionLoadedAt < RETENTION_TTL_MS) {
    return cachedRetentionDays;
  }

  try {
    const { rows } = await settingsService.getSettings();
    const map = {};
    (rows || []).forEach((row) => {
      const key = String(row?.setting_key || '').trim();
      if (!key) return;
      map[key] = toSettingValue(row?.setting_value);
    });

    const raw =
      map['compliance.data_retention_days'] ??
      map['audit.retention_days'] ??
      365;
    cachedRetentionDays = toNumber(raw, 365);
  } catch {
    cachedRetentionDays = 365;
  }

  cachedRetentionLoadedAt = now;
  return cachedRetentionDays;
};

const apiGetAuditLogs = async (filters = {}) => {
  const authHeaders = await getAuthHeadersWithRetry();
  if (!authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const retentionDays = await getDefaultRetentionDays();
  const effectiveDateFrom = filters.dateFrom
    ? new Date(filters.dateFrom).toISOString()
    : new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000)).toISOString();

  const params = {
    action: 'audit_logs',
    date_from: effectiveDateFrom,
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
    const retentionDays = await getDefaultRetentionDays();
    const effectiveFilters = { ...filters };
    if (!effectiveFilters.dateFrom) {
      effectiveFilters.dateFrom = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000)).toISOString();
    }

    return apiGetAuditLogs(effectiveFilters);
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

import { supabase } from '../lib/supabase';

// Date helper (consistent with ticketService)
const getEndOfDayISO = (dateStr) => {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

export const auditLogService = {
  async getAuditLogs(filters = {}) {
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
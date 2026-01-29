import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

// Helper function to convert snake_case to camelCase
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

const throwIfError = (error, context = '') => {
  if (!error) return;
  const msg = context ? `${context}: ${error.message || error}` : (error.message || String(error));
  const e = new Error(msg);
  e.original = error;
  throw e;
};

// Normalize date filters so you don’t accidentally exclude a whole day.
const normalizeDateRange = (dateFrom, dateTo) => {
  // Expecting 'yyyy-MM-dd'
  const fromIso = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).toISOString() : null;

  // make dateTo inclusive for the entire day
  const toIso = dateTo ? new Date(`${dateTo}T23:59:59.999Z`).toISOString() : null;

  return { fromIso, toIso };
};

// Optional: if you want user_id to be “either handler uuid OR email”, we can resolve both.
const buildHandlerLookup = (handlers) => {
  const byId = new Map();
  const byEmail = new Map();

  handlers.forEach((h) => {
    if (h?.id) byId.set(String(h.id), h);
    if (h?.email) byEmail.set(String(h.email).toLowerCase(), h);
  });

  return { byId, byEmail };
};

export const communicationService = {
  /**
   * Fetch handlers once (used to enrich logs).
   * Keep it small: only fields you actually render/export.
   */
  async getHandlersLite() {
    const { data, error } = await supabase
      .from('handlers')
      .select('id,name,email,phone')
      .eq('active', true)
      .order('name');

    throwIfError(error, 'getHandlersLite');
    return toCamelCase(data || []);
  },

  /**
   * Get all notification logs (NO relational join, because no FK exists)
   * filters: { channel, status, dateFrom, dateTo }
   */
  async getNotificationLogs(filters = {}) {
    let q = supabase
      .from('notification_logs')
      .select('*')
      .order('created_at', { ascending: false });

    // channel filter
    if (filters?.channel && filters.channel !== 'all') {
      q = q.eq('channel', filters.channel);
    }

    // status filter
    if (filters?.status && filters.status !== 'all') {
      q = q.eq('status', filters.status);
    }

    // date range filters (inclusive)
    const { fromIso, toIso } = normalizeDateRange(filters?.dateFrom, filters?.dateTo);
    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso) q = q.lte('created_at', toIso);

    const { data, error } = await q;
    throwIfError(error, 'getNotificationLogs(notification_logs)');

    const logs = toCamelCase(data || []);

    // Enrich with handler info without FK join
    // user_id is TEXT, so we match:
    // - if it looks like a uuid string, match handlers.id
    // - otherwise also try email match (handy if you ever store emails there)
    let handlers = [];
    try {
      handlers = await this.getHandlersLite();
    } catch (e) {
      // Don't fail the logs page if handler lookup fails, just continue
      console.warn('getNotificationLogs: failed to fetch handlers for enrichment:', e);
    }

    if (!handlers.length) {
      // still return logs, but with handlers: null
      return logs.map((log) => ({ ...log, handlers: null }));
    }

    const { byId, byEmail } = buildHandlerLookup(handlers);

    return logs.map((log) => {
      const rawUserId = log?.userId;
      const userId = rawUserId ? String(rawUserId).trim() : '';

      // 1) try id match
      let handler = byId.get(userId) || null;

      // 2) try email match (if user_id stores email)
      if (!handler && userId.includes('@')) {
        handler = byEmail.get(userId.toLowerCase()) || null;
      }

      // mimic your previous shape: log.handlers.name
      return {
        ...log,
        handlers: handler
          ? {
              id: handler.id,
              name: handler.name,
              email: handler.email,
              phone: handler.phone,
            }
          : null,
      };
    });
  },

  /**
   * Get delivery statistics (counts by channel/status)
   * supports channels: sms/email/both/push and statuses: success/failed/pending/retrying
   */
  async getDeliveryStats(dateFrom, dateTo) {
    const { fromIso, toIso } = normalizeDateRange(dateFrom, dateTo);

    let q = supabase.from('notification_logs').select('channel,status');

    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso) q = q.lte('created_at', toIso);

    const { data, error } = await q;
    throwIfError(error, 'getDeliveryStats(notification_logs)');

    const rows = data || [];

    const mk = () => ({ total: 0, success: 0, failed: 0, pending: 0, retrying: 0 });

    const stats = {
      total: rows.length,
      sms: mk(),
      email: mk(),
      push: mk(),
      both: mk(),
    };

    rows.forEach((r) => {
      const ch = r.channel; // sms/email/push/both
      const st = r.status;  // success/failed/pending/retrying

      if (!stats[ch]) return;

      stats[ch].total += 1;
      if (stats[ch][st] !== undefined) stats[ch][st] += 1;
    });

    return stats;
  },

  /**
   * Export logs to CSV format
   * (works with enriched logs where log.handlers may be null)
   */
  exportLogsToCSV(logs) {
    const headers = ['Timestamp', 'Handler', 'Channel', 'Recipient', 'Status', 'Event', 'Error Message'];

    const safe = (v) => {
      if (v === null || v === undefined) return '';
      return String(v).replace(/"/g, '""');
    };

    const rows = (logs || []).map((log) => [
      log?.createdAt ? format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss') : '',
      log?.handlers?.name || 'N/A',
      (log?.channel || '').toUpperCase(),
      log?.metadata?.recipient || log?.metadata?.phone || log?.metadata?.email || 'N/A',
      log?.status || '',
      log?.event || '',
      log?.errorMessage || '',
    ]);

    return [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${safe(cell)}"`).join(',')),
    ].join('\n');
  },
};
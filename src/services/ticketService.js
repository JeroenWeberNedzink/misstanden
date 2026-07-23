// ticketService.js
import { notificationService } from './notificationService';
import { workflowService } from './workflowService';
import { settingsService } from './SettingsService';
import { permissionService } from './permissionService';
import { isReceiptConfirmationStatus, toDateSafe } from '../utils/slaUtils';
import { normalizeHandlerRecord, normalizeHandlerRecords, normalizePermissions } from './utils/handlerNormalization';
import { getSharedTokenProvider } from '../lib/serviceTokenProvider';

// -----------------------------
// Case conversion helpers
// -----------------------------
const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

const isUniqueViolation = (err) => {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint') || err?.code === '23505';
};

const isForeignKeyViolation = (err) =>
  err?.code === '23503' || String(err?.message || '').toLowerCase().includes('foreign key');

const isSchemaCacheMissingTable = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'PGRST205' ||
    (
      msg.includes('schema cache') &&
      (msg.includes('could not find the table') || msg.includes('not found'))
    )
  );
};

const isMissingRelation = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === '42P01' ||
    isSchemaCacheMissingTable(err) ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    (msg.includes('table') && msg.includes('does not exist'))
  );
};

const isMissingTicketHandlersRelation = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  const hint = String(err?.hint || '').toLowerCase();
  const status = Number(err?.status || 0);
  if (status === 404) return true;
  if (isMissingRelation(err)) return true;
  if (err?.code === 'PGRST205' && (msg.includes('ticket_handlers') || hint.includes('ticket_handlers'))) {
    return true;
  }
  if (!msg.includes('ticket_handlers')) return false;
  return (
    msg.includes('does not exist') ||
    msg.includes('not found') ||
    msg.includes('could not find')
  );
};

const isAuthOrRlsError = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  const details = String(err?.details || '').toLowerCase();
  const hint = String(err?.hint || '').toLowerCase();
  const status = Number(err?.status || 0);
  const code = String(err?.code || '').toUpperCase();

  if (status === 401 || status === 403) return true;
  if (code === '42501') return true; // insufficient_privilege / policy blocked

  return (
    msg.includes('row-level security') ||
    details.includes('row-level security') ||
    hint.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('not authenticated') ||
    msg.includes('jwt') ||
    msg.includes('unauthorized')
  );
};

const TICKETS_API_URL = '/api/tickets.api.php';
const TICKET_READ_API_URL = '/api/ticket-read.api.php';
const TICKET_ASSIGNMENT_API_URL = '/api/ticket-assignment.api.php';
const HANDLER_DASHBOARD_API_URL = '/api/handler-dashboard.api.php';
const WORKFLOWS_API_URL = '/api/workflows.api.php';
const CATALOG_API_URL = '/api/catalog.api.php';
const FILES_API_URL = '/api/files.api.php';
let ticketTokenProvider = null;
const TICKET_RUNTIME_SETTINGS_TTL_MS = 2 * 60 * 1000;
let cachedTicketSettingsByKey = null;
let cachedTicketRuntimeSettingsAt = 0;

const setTokenProvider = (provider) => {
  ticketTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  const provider = ticketTokenProvider || getSharedTokenProvider();
  if (!provider) return {};
  try {
    const token = await provider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const getAuthHeadersWithRetry = async (requireAuth = false) => {
  let headers = await getAuthHeaders();
  if (requireAuth && !headers.Authorization) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    headers = await getAuthHeaders();
  }
  return headers;
};

const ticketsApiErrorMessage = (json, fallbackMessage, requestAction = '') => {
  const data = json?.data || {};
  const errorId = String(data?.error_id || json?.error_id || json?.errorId || '').trim();
  const action = String(data?.action || json?.action || requestAction || '').trim();
  const stage = String(data?.stage || json?.stage || '').trim();
  const message = json?.message || fallbackMessage;
  const hints = [
    action ? `action: ${action}` : '',
    stage ? `stage: ${stage}` : '',
    errorId ? `error_id: ${errorId}` : '',
  ].filter(Boolean);
  return hints.length > 0 ? `${message} [${hints.join('] [')}]` : message;
};

const coerceSettingValue = (value, fallback = null) => {
  if (value === undefined) return fallback;
  return value;
};

const normalizeSettingBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'ja', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'nee', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeSettingNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeSeverityCode = (value, fallback = 'low') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['low', 'medium', 'high', 'critical'].includes(normalized) ? normalized : fallback;
};

const normalizeTicketPrefix = (value, fallback = 'NZ') => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
};
const STATUS_ROLLBACK_WINDOW_MS = 60 * 60 * 1000;

const readSettingByAliases = (normalizedByKey, aliases = [], fallback = undefined) => {
  for (const key of aliases) {
    if (normalizedByKey[key] !== undefined) return normalizedByKey[key];
  }
  return fallback;
};

const normalizeWorkflowCode = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

const buildScopedWorkflowSettingKey = (workflowType, workflowSettingKey) => {
  const code = normalizeWorkflowCode(workflowType);
  const base = String(workflowSettingKey || '').trim();
  if (!code || !base.startsWith('workflow.')) return null;
  const suffix = base.slice('workflow.'.length);
  return suffix ? `workflow.${code}.${suffix}` : null;
};

const buildTicketRuntimeSettings = (normalizedByKey = {}, workflowType = '') => {
  const scopedWorkflowKey = (workflowKey) => buildScopedWorkflowSettingKey(workflowType, workflowKey);

  const allowPublicSubmission = normalizeSettingBoolean(
    readSettingByAliases(normalizedByKey, ['tickets.allow_public_submission', 'portal.enable_public_submissions'], true),
    true
  );
  const autoAssignEnabled = normalizeSettingBoolean(
    readSettingByAliases(
      normalizedByKey,
      [
        ...(scopedWorkflowKey('workflow.auto_assign') ? [scopedWorkflowKey('workflow.auto_assign')] : []),
        'tickets.auto_assign_enabled',
        'workflow.auto_assign',
      ],
      true
    ),
    true
  );
  const autoCloseResolvedDays = normalizeSettingNumber(
    readSettingByAliases(normalizedByKey, ['tickets.auto_close_resolved_days', 'retention.tickets_resolved_days'], 0),
    0
  );
  const defaultPriority = normalizeSeverityCode(
    readSettingByAliases(normalizedByKey, ['tickets.default_priority', 'workflow.default_priority', 'portal.default_priority'], 'low'),
    'low'
  );
  const requireEmailVerification = normalizeSettingBoolean(
    readSettingByAliases(normalizedByKey, ['tickets.require_email_verification'], true),
    true
  );
  const slaResponseTimeHours = normalizeSettingNumber(
    readSettingByAliases(normalizedByKey, ['tickets.sla_response_time_hours', 'sla.default_response_hours'], 24),
    24
  );
  const slaResolutionTimeHours = normalizeSettingNumber(
    readSettingByAliases(normalizedByKey, ['tickets.sla_resolution_time_hours', 'sla.default_resolution_hours'], 72),
    72
  );
  const ticketNumberPrefix = normalizeTicketPrefix(
    readSettingByAliases(normalizedByKey, ['tickets.ticket_number_prefix'], 'NZ'),
    'NZ'
  );
  const anonymizeClosedTickets = normalizeSettingBoolean(
    readSettingByAliases(normalizedByKey, ['compliance.anonymize_closed_tickets'], false),
    false
  );
  const auditLogEnabled = normalizeSettingBoolean(
    readSettingByAliases(normalizedByKey, ['compliance.audit_log_enabled', 'audit.enable_logging'], true),
    true
  );
  const backupFrequency = String(readSettingByAliases(normalizedByKey, ['compliance.backup_frequency'], 'weekly') || 'weekly');
  const dataRetentionDays = normalizeSettingNumber(
    readSettingByAliases(normalizedByKey, ['compliance.data_retention_days', 'audit.retention_days'], 365),
    365
  );
  const gdprCompliant = normalizeSettingBoolean(
    readSettingByAliases(normalizedByKey, ['compliance.gdpr_compliant'], true),
    true
  );
  const allowStatusRollback = normalizeSettingBoolean(
    readSettingByAliases(
      normalizedByKey,
      [
        ...(scopedWorkflowKey('workflow.allow_status_rollback') ? [scopedWorkflowKey('workflow.allow_status_rollback')] : []),
        'workflow.allow_status_rollback',
      ],
      false
    ),
    false
  );
  const requireCommentOnStatusChange = normalizeSettingBoolean(
    readSettingByAliases(
      normalizedByKey,
      [
        ...(scopedWorkflowKey('workflow.require_comment_on_status_change') ? [scopedWorkflowKey('workflow.require_comment_on_status_change')] : []),
        'workflow.require_comment_on_status_change',
      ],
      true
    ),
    true
  );
  const notifyOnAssignment = normalizeSettingBoolean(
    readSettingByAliases(
      normalizedByKey,
      [
        ...(scopedWorkflowKey('workflow.notify_on_assignment') ? [scopedWorkflowKey('workflow.notify_on_assignment')] : []),
        'workflow.notify_on_assignment',
      ],
      true
    ),
    true
  );

  return {
    allowPublicSubmission,
    autoAssignEnabled,
    allowStatusRollback,
    requireCommentOnStatusChange,
    notifyOnAssignment,
    autoCloseResolvedDays,
    defaultPriority,
    requireEmailVerification,
    slaResponseTimeHours,
    slaResolutionTimeHours,
    ticketNumberPrefix,
    anonymizeClosedTickets,
    auditLogEnabled,
    backupFrequency,
    dataRetentionDays,
    gdprCompliant,
  };
};

const getNormalizedTicketSettingsByKey = async () => {
  const now = Date.now();
  if (cachedTicketSettingsByKey && now - cachedTicketRuntimeSettingsAt < TICKET_RUNTIME_SETTINGS_TTL_MS) {
    return cachedTicketSettingsByKey;
  }

  try {
    const { rows } = await settingsService.getSettings({ includeSensitive: false });
    const normalizedByKey = {};
    (rows || []).forEach((row) => {
      const key = String(row?.setting_key || '').trim();
      if (!key) return;
      const raw = row?.setting_value;
      const value = raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value')
        ? raw.value
        : raw;
      normalizedByKey[key] = value;
    });
    cachedTicketSettingsByKey = normalizedByKey;
  } catch (error) {
    console.warn('[ticketService] Failed to load runtime settings, using defaults', error);
    cachedTicketSettingsByKey = {};
  }

  cachedTicketRuntimeSettingsAt = now;
  return cachedTicketSettingsByKey;
};

const getTicketRuntimeSettings = async (workflowType = '') => {
  const normalizedByKey = await getNormalizedTicketSettingsByKey();
  return buildTicketRuntimeSettings(normalizedByKey, workflowType);
};

const isResolvedStatus = (statusCode) => {
  const value = String(statusCode || '').trim().toLowerCase();
  return value === 'resolved' || value === 'opgelost';
};

const isClosedStatus = (statusCode) => {
  const value = String(statusCode || '').trim().toLowerCase();
  return value === 'closed' || value === 'gesloten';
};

const applyTicketRuntimePolicies = (ticket, runtimeSettings, options = {}) => {
  if (!ticket || typeof ticket !== 'object') return ticket;

  const next = { ...ticket };
  const statusCode = next?.statusCode || next?.status_code || '';
  const now = Date.now();
  const reporterView = options?.reporterView === true;

  if (!isClosedStatus(statusCode) && isResolvedStatus(statusCode) && Number(runtimeSettings?.autoCloseResolvedDays || 0) > 0) {
    const baseDateRaw = next?.lastUpdateAt || next?.last_update_at || next?.updatedAt || next?.submittedAt || next?.submitted_at || null;
    const baseDate = toDateSafe(baseDateRaw);
    if (baseDate) {
      const daysSinceUpdate = (now - baseDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate >= Number(runtimeSettings.autoCloseResolvedDays)) {
        next.statusCode = 'closed';
        next.status_code = 'closed';
        next.currentStage = 'closed';
        next.current_stage = 'closed';
        next.status = next.status || 'Closed';
      }
    }
  }

  if (reporterView && runtimeSettings?.anonymizeClosedTickets && isClosedStatus(next?.statusCode || next?.status_code)) {
    next.reporterName = null;
    next.reporter_name = null;
    next.reporterPhone = null;
    next.reporter_phone = null;
  }

  return next;
};

const ticketApiPost = async (payload, { requireAuth = false } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAuth);
  if (requireAuth && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }
  const requestAction = String(payload?.action || 'create').trim();

  const response = await fetch(TICKETS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(ticketsApiErrorMessage(json, `Tickets API error (${response.status})`, requestAction));
  }
  return json?.data;
};

const ticketReadGet = async (action, params = {}, { requireAuth = true } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAuth);
  if (requireAuth && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${TICKET_READ_API_URL}?${query}`, {
    method: 'GET',
    headers: authHeaders,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Ticket read API error (${response.status})`);
  }
  return json?.data;
};

const ticketAssignmentPost = async (payload, { requireAuth = true } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAuth);
  if (requireAuth && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const response = await fetch(TICKET_ASSIGNMENT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Ticket assignment API error (${response.status})`);
  }
  return toCamelCase(json?.data);
};

const handlerDashboardGet = async (params = {}, { token = '', requireAuth = true } = {}) => {
  const authHeaders = token
    ? { Authorization: `Bearer ${token}` }
    : await getAuthHeadersWithRetry(requireAuth);
  if (requireAuth && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${HANDLER_DASHBOARD_API_URL}${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: authHeaders,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const errorId = String(json?.data?.error_id || json?.error_id || json?.errorId || '').trim();
    const message = json?.message || `Handler dashboard API error (${response.status})`;
    throw new Error(errorId ? `${message} [error_id: ${errorId}]` : message);
  }
  return json?.data;
};

const workflowApiGet = async (action, params = {}, { requireAuth = false } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAuth);
  if (requireAuth && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${WORKFLOWS_API_URL}?${query}`, {
    method: 'GET',
    headers: authHeaders,
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }

  return json?.data;
};

const workflowApiPost = async (action, payload = {}, { requireAuth = false } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAuth);
  if (requireAuth && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

  const response = await fetch(WORKFLOWS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }

  return json?.data;
};

const catalogApiGet = async (action, params = {}) => {
  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${CATALOG_API_URL}?${query}`, {
    method: 'GET',
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Catalog API error (${response.status})`);
  }

  return json?.data;
};

const TICKET_HANDLERS_RECHECK_MS = 24 * 60 * 60 * 1000;
const TICKET_ACTIONS_RECHECK_MS = 24 * 60 * 60 * 1000;
const TICKET_HANDLERS_STATE_KEY = 'ticket_handlers_relation_state_v1';
const TICKET_ACTIONS_STATE_KEY = 'ticket_actions_write_state_v1';
const resolveBrowserStorage = () => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || window.sessionStorage || null;
  } catch {
    return null;
  }
};

const readTicketHandlersState = () => {
  try {
    const storage = resolveBrowserStorage();
    if (!storage) {
      return { available: null, checkedAt: 0 };
    }
    const raw = storage.getItem(TICKET_HANDLERS_STATE_KEY);
    if (!raw) return { available: null, checkedAt: 0 };
    const parsed = JSON.parse(raw);
    const available = parsed?.available;
    const checkedAt = Number(parsed?.checkedAt || 0);
    if (available !== true && available !== false) return { available: null, checkedAt: 0 };
    if (!Number.isFinite(checkedAt) || checkedAt <= 0) return { available: null, checkedAt: 0 };
    return { available, checkedAt };
  } catch {
    return { available: null, checkedAt: 0 };
  }
};

const persistTicketHandlersState = (state) => {
  try {
    const storage = resolveBrowserStorage();
    if (!storage) return;
    storage.setItem(TICKET_HANDLERS_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
};

const initialTicketHandlersState = readTicketHandlersState();
const ticketHandlersRelationState = {
  available: initialTicketHandlersState.available, // null = unknown, true = available, false = missing
  checkedAt: initialTicketHandlersState.checkedAt,
};
const readTicketActionsState = () => {
  try {
    const storage = resolveBrowserStorage();
    if (!storage) return { available: null, checkedAt: 0 };
    const raw = storage.getItem(TICKET_ACTIONS_STATE_KEY);
    if (!raw) return { available: null, checkedAt: 0 };
    const parsed = JSON.parse(raw);
    const available = parsed?.available;
    const checkedAt = Number(parsed?.checkedAt || 0);
    if (available !== true && available !== false) return { available: null, checkedAt: 0 };
    if (!Number.isFinite(checkedAt) || checkedAt <= 0) return { available: null, checkedAt: 0 };
    return { available, checkedAt };
  } catch {
    return { available: null, checkedAt: 0 };
  }
};

const persistTicketActionsState = (state) => {
  try {
    const storage = resolveBrowserStorage();
    if (!storage) return;
    storage.setItem(TICKET_ACTIONS_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
};

const initialTicketActionsState = readTicketActionsState();
const ticketActionsWriteState = {
  available: initialTicketActionsState.available, // null = unknown, true = writable, false = blocked
  checkedAt: initialTicketActionsState.checkedAt,
};
const HANDLER_LOOKUP_TTL_MS = 5 * 60 * 1000;
const ALL_HANDLERS_TTL_MS = 2 * 60 * 1000;
const handlerLookupCache = new Map();
const handlerLookupInflight = new Map();
const allHandlersCache = new Map();
const allHandlersInflight = new Map();

const shouldProbeTicketHandlersRelation = () => {
  if (ticketHandlersRelationState.available !== false) return true;
  return Date.now() - ticketHandlersRelationState.checkedAt > TICKET_HANDLERS_RECHECK_MS;
};

const markTicketHandlersRelationState = (available) => {
  ticketHandlersRelationState.available = available;
  ticketHandlersRelationState.checkedAt = Date.now();
  persistTicketHandlersState(ticketHandlersRelationState);
};

const shouldAttemptTicketActionsWrite = () => {
  if (ticketActionsWriteState.available !== false) return true;
  return Date.now() - ticketActionsWriteState.checkedAt > TICKET_ACTIONS_RECHECK_MS;
};

const markTicketActionsWriteState = (available) => {
  ticketActionsWriteState.available = available;
  ticketActionsWriteState.checkedAt = Date.now();
  persistTicketActionsState(ticketActionsWriteState);
};

const friendlyHandlerError = (error, context = 'handlers') => {
  if (isUniqueViolation(error)) {
    const e = new Error('Er bestaat al een gebruiker met dit e-mailadres.');
    e.code = 'DUPLICATE_EMAIL';
    e.original = error;
    throw e;
  }
  if (isForeignKeyViolation(error)) {
    const e = new Error('Verwijderen mislukt omdat er nog gekoppelde gegevens bestaan.');
    e.code = 'FK_HAS_RELATIONS';
    e.original = error;
    throw e;
  }
  throwIfError(error, context);
};
const toCamelCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const out = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = toCamelCase(obj[key]);
  }
  return out;
};

const toSnakeCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;

  const out = {};
  for (const key of Object.keys(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[snakeKey] = toSnakeCase(obj[key]);
  }
  return out;
};

const isAbsoluteUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

const filesApiDownloadPath = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return null;

  try {
    const parsed = new URL(value, 'https://local.invalid');
    if (!parsed.pathname.replace(/\\/g, '/').endsWith('/api/files.api.php')) {
      return null;
    }
    const path = parsed.searchParams.get('path');
    return path ? path.replace(/^\/+/, '') : null;
  } catch {
    return null;
  }
};

const toStoragePath = (rawUrl, bucket = 'attachments') => {
  const value = String(rawUrl || '').trim();
  if (!value || value === '#') return null;

  const existingDownloadPath = filesApiDownloadPath(value);
  if (existingDownloadPath) return existingDownloadPath;

  if (!isAbsoluteUrl(value)) {
    const normalized = value.replace(/^\/+/, '');
    if (!normalized) return null;
    return normalized;
  }

  try {
    const parsed = new URL(value);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    const path = parsed.pathname.slice(idx + marker.length);
    return path || null;
  } catch {
    return null;
  }
};

const createSignedAttachmentUrl = async (rawUrl, bucket = 'attachments', expiresIn = 600) => {
  void bucket;
  void expiresIn;
  const path = toStoragePath(rawUrl, bucket);
  if (!path) {
    return isAbsoluteUrl(rawUrl) ? String(rawUrl).trim() : null;
  }
  return `${FILES_API_URL}?action=download&path=${encodeURIComponent(path)}`;
};

const uploadFileToLocalStorage = async (file, folder) => {
  const formData = new FormData();
  formData.append('action', 'upload');
  formData.append('folder', folder);
  formData.append('file', file, file.name || 'file');

  const response = await fetch(FILES_API_URL, {
    method: 'POST',
    body: formData,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `File upload failed (${response.status})`);
  }
  return json?.data || {};
};

const deleteLocalFile = async (path) => {
  if (!path) return;
  await fetch(FILES_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', path }),
  });
};

const attachSignedUrlsToTicket = async (ticket, bucket = 'attachments') => {
  if (!ticket || !Array.isArray(ticket?.attachments) || ticket.attachments.length === 0) {
    return ticket;
  }

  const signedAttachments = await attachSignedUrlsToAttachments(ticket.attachments, bucket);

  return {
    ...ticket,
    attachments: signedAttachments,
  };
};

const attachSignedUrlsToAttachments = async (attachments, bucket = 'attachments') => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const signedAttachments = await Promise.all(
    attachments.map(async (att) => {
      const rawUrl = att?.fileUrl || att?.file_url || att?.url || '';
      const signedUrl = await createSignedAttachmentUrl(rawUrl, bucket, 600);
      if (!signedUrl) return att;
      return {
        ...att,
        fileUrl: signedUrl,
        file_url: signedUrl,
        url: signedUrl,
      };
    })
  );

  return signedAttachments;
};

// -----------------------------
// Error helper
// -----------------------------
const throwIfError = (error, context = '') => {
  if (!error) return;
  const msg = context ? `${context}: ${error.message || error}` : (error.message || String(error));
  const e = new Error(msg);
  e.original = error;
  throw e;
};

const loadHandlerContactById = async (handlerId, context = 'handler lookup') => {
  const normalizedId = String(handlerId || '').trim();
  if (!normalizedId) return null;

  try {
    const row = (await fetchHandlersByIdsCached([normalizedId]))[0] || null;
    return row ? { id: row.id, name: row.name, email: row.email } : null;
  } catch (err) {
    console.warn(`[ticketService] ${context} failed unexpectedly, continuing`, err);
    return null;
  }
};

function getClientMeta() {
  try {
    return {
      user_agent: navigator.userAgent || null,
      language: navigator.language || null,
      languages: Array.isArray(navigator.languages) ? navigator.languages : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      platform: navigator.platform || null,
      viewport: {
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      },
      created_from: window.location?.href || null,
      created_at_client: new Date().toISOString(),
    };
  } catch {
    return { created_at_client: new Date().toISOString() };
  }
}

// -----------------------------
// Date helpers (consistent across services)
// -----------------------------
const getEndOfDayISO = (dateStr) => {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

const addDaysISO = (dateLike, days) => {
  if (!dateLike || !Number.isFinite(Number(days))) return null;
  const d = toDateSafe(dateLike);
  if (!d) return null;
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
};

const normalizeHandlerIds = (handlerIds) => {
  const source = Array.isArray(handlerIds)
    ? handlerIds
    : handlerIds
      ? [handlerIds]
      : [];

  const seen = new Set();
  const out = [];
  for (const raw of source) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

const normalizeCachedHandlerRow = (row) => {
  const handler = toCamelCase(row || null);
  const id = String(handler?.id || '').trim();
  if (!id) return null;
  return { ...handler, id };
};

const rememberHandlerRows = (rows = []) => {
  const now = Date.now();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const handler = normalizeCachedHandlerRow(row);
    if (!handler?.id) return;
    handlerLookupCache.set(handler.id, { handler, ts: now });
  });
};

const invalidateAllHandlersCache = () => {
  allHandlersCache.clear();
  allHandlersInflight.clear();
};

const getCachedHandlerRow = (handlerId) => {
  const id = String(handlerId || '').trim();
  if (!id) return null;
  const cached = handlerLookupCache.get(id);
  if (!cached || Date.now() - cached.ts > HANDLER_LOOKUP_TTL_MS) {
    handlerLookupCache.delete(id);
    return null;
  }
  return cached.handler;
};

const fetchHandlersByIdsCached = async (handlerIds = []) => {
  const normalizedIds = normalizeHandlerIds(handlerIds);
  if (normalizedIds.length === 0) return [];

  const byId = new Map();
  const missingIds = [];
  normalizedIds.forEach((id) => {
    const cached = getCachedHandlerRow(id);
    if (cached) {
      byId.set(id, cached);
      return;
    }
    missingIds.push(id);
  });

  if (missingIds.length > 0) {
    const inflightKey = missingIds.slice().sort().join(',');
    let request = handlerLookupInflight.get(inflightKey);
    if (!request) {
      request = workflowApiGet(
        'handlers_by_ids',
        {
          ids: missingIds.join(','),
          include_inactive: '1',
        },
        { requireAuth: true }
      ).then((apiData) => {
        const rows = Array.isArray(apiData?.rows) ? apiData.rows : [];
        rememberHandlerRows(rows);
        return rows.map(normalizeCachedHandlerRow).filter(Boolean);
      }).finally(() => {
        handlerLookupInflight.delete(inflightKey);
      });
      handlerLookupInflight.set(inflightKey, request);
    }

    const fetched = await request;
    fetched.forEach((handler) => {
      if (handler?.id) byId.set(handler.id, handler);
    });
  }

  return normalizedIds.map((id) => byId.get(id)).filter(Boolean);
};

const fetchAllHandlersCached = async (includeInactive, force = false) => {
  const cacheKey = includeInactive ? 'include-inactive' : 'active-only';
  const cached = allHandlersCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.ts < ALL_HANDLERS_TTL_MS) {
    return cached.rows;
  }

  if (!force && allHandlersInflight.has(cacheKey)) {
    return allHandlersInflight.get(cacheKey);
  }

  const request = workflowApiGet(
    'all_handlers',
    { include_inactive: includeInactive ? '1' : '0' },
    { requireAuth: true }
  ).then((apiData) => {
    const rows = Array.isArray(apiData?.rows) ? apiData.rows : [];
    allHandlersCache.set(cacheKey, { rows, ts: Date.now() });
    rememberHandlerRows(rows);
    return rows;
  }).finally(() => {
    allHandlersInflight.delete(cacheKey);
  });

  allHandlersInflight.set(cacheKey, request);
  return request;
};

const normalizeAssignmentRole = (value, fallback = 'secondary') => {
  const role = String(value || '').trim().toLowerCase();
  if (['primary', 'secondary', 'legal', 'observer'].includes(role)) {
    return role;
  }
  return fallback;
};

const buildAssignmentRolesMap = (handlerIds = [], explicitRoles = {}) => {
  const ids = normalizeHandlerIds(handlerIds);
  const out = {};
  ids.forEach((handlerId, index) => {
    const explicit = explicitRoles?.[handlerId];
    const fallback = index === 0 ? 'primary' : 'secondary';
    out[handlerId] = normalizeAssignmentRole(explicit, fallback);
  });
  return out;
};

const loadHandlersByIdsWithFallback = async (handlerIds = []) => {
  const normalizedIds = normalizeHandlerIds(handlerIds);
  if (normalizedIds.length === 0) return [];

  const rows = await fetchHandlersByIdsCached(normalizedIds);
  return rows.map((row) => ({
    id: row?.id,
    name: row?.name ?? null,
    email: row?.email ?? null,
    active: row?.active ?? null,
  }));
};

const insertTicketActionSafe = async (payload, context = 'ticket action') => {
  if (!shouldAttemptTicketActionsWrite()) {
    return { skipped: true, reason: 'policy_blocked' };
  }

  try {
    const result = await ticketApiPost(
      {
        action: 'handler_log_action',
        ticket_id: payload?.ticket_id,
        action_type: payload?.action_type,
        action_label: payload?.action,
        description: payload?.description || null,
        handler_name: payload?.handler_name || null,
      },
      { requireAuth: true }
    );
    if (result?.skipped) {
      markTicketActionsWriteState(false);
      return {
        skipped: true,
        reason: 'server_skipped',
        errorId: result?.error_id || result?.errorId || null,
      };
    }
    markTicketActionsWriteState(true);
    return { ok: true, source: 'api' };
  } catch (error) {
    markTicketActionsWriteState(false);
    console.warn(`[ticketService] ${context}: ticket_actions write unavailable, skipping`, error);
    return { skipped: true, reason: 'policy_blocked', error };
  }
};

const syncTicketHandlers = async (ticketId, nextHandlerIds = [], rolesByHandlerId = {}) => {
  const normalized = normalizeHandlerIds(nextHandlerIds);
  const normalizedRoles = buildAssignmentRolesMap(normalized, rolesByHandlerId);
  return ticketAssignmentPost(
    {
      ticket_id: ticketId,
      handler_ids: normalized,
      roles_by_handler_id: normalizedRoles,
    },
    { requireAuth: true }
  );
};

// -----------------------------
// Workflow statuses (DB-driven)
// -----------------------------
const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

const parseJsonArrayMaybe = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeWorkflowStatuses = (rawStatuses) => {
  const arr = parseJsonArrayMaybe(rawStatuses);
  if (!arr) return [];

  return arr
    .filter((s) => s && safeTrim(s.code) && safeTrim(s.label))
    .map((s) => ({
      code: safeTrim(s.code),
      label: safeTrim(s.label),
      description: safeTrim(s.description) || null,
      color: safeTrim(s.color) || null,
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : 999,
      // Optional: only if you want to also update tickets.status (enum)
      enumLabel: safeTrim(s.enumLabel) || null,
      // Optional: if you want stage separate from status_code
      stage: safeTrim(s.stage) || null,
      // Optional: UX hints
      next: Array.isArray(s.next) ? s.next.map(safeTrim).filter(Boolean) : null,
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
};

// Small in-memory cache (session)
const workflowCache = new Map();
const WORKFLOW_CACHE_TTL_MS = 30_000;

const getWorkflowWithStatuses = async (workflowCode) => {
  const code = safeTrim(workflowCode);
  if (!code) return { workflow: null, statuses: [] };

  const now = Date.now();
  const cached = workflowCache.get(code);
  if (cached && now - cached.ts < WORKFLOW_CACHE_TTL_MS) {
    return { workflow: cached.workflow, statuses: cached.statuses };
  }

  const workflowRows = await catalogApiGet('workflows', { include_inactive: '1' });
  const workflow = toCamelCase((workflowRows?.rows || []).find((row) => safeLower(row?.code) === safeLower(code)) || null);
  if (!workflow?.id) {
    throw new Error(`Workflow not found: ${code}`);
  }

  const statusData = await catalogApiGet('workflow_statuses', { workflow_id: workflow.id });
  const statusesData = statusData?.rows || [];

  const statuses = (statusesData || []).map(s => ({
    code: safeTrim(s.code),
    label: safeTrim(s.label),
    description: safeTrim(s.description) || null,
    color: safeTrim(s.color) || null,
    order: Number(s.sort_order ?? 0),
    isTerminal: Boolean(s.is_terminal),
    isFirstResponse: Boolean(s.is_first_response),
    nextCodes: Array.isArray(s.next_codes) ? s.next_codes : [],
    expectedDurationDays: Number.isFinite(Number(s.expected_duration_days))
      ? Number(s.expected_duration_days)
      : null,
    contactPersonName: safeTrim(s.contact_person_name) || null,
    contactPersonEmail: safeTrim(s.contact_person_email) || null,
    contactPersonPhone: safeTrim(s.contact_person_phone) || null,
    contactNotes: safeTrim(s.contact_notes) || null,
  }));

  workflowCache.set(code, { workflow, statuses, ts: now });
  return { workflow, statuses };
};

const findStatusByCodeOrLabel = (statuses, value) => {
  const v = safeTrim(value);
  if (!v) return null;

  const byCode = statuses.find((s) => safeLower(s.code) === safeLower(v));
  if (byCode) return byCode;

  const byLabel = statuses.find((s) => safeLower(s.label) === safeLower(v));
  if (byLabel) return byLabel;

  return null;
};

const findStatusIndexByCodeOrLabel = (statuses, value) => {
  const status = findStatusByCodeOrLabel(statuses, value);
  if (!status) return -1;
  return statuses.findIndex((item) => safeLower(item?.code) === safeLower(status.code));
};

const resolveStatusChangedAt = (ticket = {}) =>
  ticket?.metadata?.workflow_status_changed_at ||
  ticket?.metadata?.workflowStatusChangedAt ||
  ticket?.last_update_at ||
  ticket?.lastUpdateAt ||
  ticket?.submitted_at ||
  ticket?.submittedAt ||
  null;

const isRollbackWindowOpen = (value) => {
  if (!value) return false;
  const date = toDateSafe(value);
  if (!date) return false;
  return Date.now() - date.getTime() <= STATUS_ROLLBACK_WINDOW_MS;
};

const pickDefaultStatus = (statuses) => statuses?.[0] || null;

// -----------------------------
// Ticket relation select snippets
// -----------------------------
const SELECT_TICKET_LIST = `
  *,
  handlers:handler_id ( id, name, email, roles )
`;

const SELECT_TICKET_FULL = `
  *,
  handlers:handler_id ( id, name, email, roles ),
  attachments (*),
  messages (*),
  ticket_comments (*),
  ticket_actions (*)
`;

const SELECT_TICKET_RELATIONS = `
  attachments (*),
  messages (*),
  ticket_comments (*),
  ticket_actions (*)
`;

// -----------------------------
// Service
// -----------------------------
export const ticketService = {
  // ----- Read/list -----
  async getHandlerDashboardBootstrap(options = {}) {
    const params = {
      ...(options.statusCode && options.statusCode !== 'all' ? { status_code: options.statusCode } : {}),
      ...(options.severityCode && options.severityCode !== 'all' ? { severity_code: options.severityCode } : {}),
      ...(options.workflowType && options.workflowType !== 'all' ? { workflow_type: options.workflowType } : {}),
      ...(options.dateFrom ? { date_from: new Date(options.dateFrom).toISOString() } : {}),
      ...(options.dateTo ? { date_to: getEndOfDayISO(options.dateTo) } : {}),
      ...(options.search ? { search: String(options.search).trim() } : {}),
      ...(options.includeInactive ? { include_inactive: '1' } : {}),
    };
    const data = await handlerDashboardGet(params, {
      token: options.token || '',
      requireAuth: options.requireAuth !== false,
    });
    const handler = normalizeHandlerRecord(toCamelCase(data?.handler || null));
    const tickets = toCamelCase(data?.tickets?.rows || []);
    const workflows = toCamelCase(data?.catalog?.workflows || []);
    const severities = toCamelCase(data?.catalog?.severities || []);

    return {
      handler,
      isAdmin: Boolean(data?.is_admin ?? data?.isAdmin),
      claimsSub: data?.claims_sub || data?.claimsSub || '',
      tickets,
      workflows,
      severities,
    };
  },

  async getAllTickets(filters = {}) {
    const params = {
      ...(filters.handlerId && filters.handlerId !== 'all' ? { handler_id: filters.handlerId } : {}),
      ...(filters.statusCode && filters.statusCode !== 'all' ? { status_code: filters.statusCode } : {}),
      ...(filters.severityCode && filters.severityCode !== 'all' ? { severity_code: filters.severityCode } : {}),
      ...(filters.workflowType && filters.workflowType !== 'all' ? { workflow_type: filters.workflowType } : {}),
      ...(filters.dateFrom ? { date_from: new Date(filters.dateFrom).toISOString() } : {}),
      ...(filters.dateTo ? { date_to: getEndOfDayISO(filters.dateTo) } : {}),
      ...(filters.search ? { search: String(filters.search).trim() } : {}),
      ...(filters.summary ? { summary: '1' } : {}),
    };
    const [runtimeSettings, data] = await Promise.all([
      getTicketRuntimeSettings(),
      ticketReadGet('list', params),
    ]);
    const tickets = toCamelCase(data?.rows || []);
    return tickets.map((ticket) => applyTicketRuntimePolicies(ticket, runtimeSettings));
  },

  async getTicketById(ticketId, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    const includeRelations = options?.includeRelations !== false;
    const settingsByKeyPromise = getNormalizedTicketSettingsByKey();
    const data = await ticketReadGet('get', {
      ticket_id: ticketId,
      ...(includeRelations ? { include_relations: '1' } : {}),
    });
    const ticket = toCamelCase(data?.row || null);
    const normalizedByKey = await settingsByKeyPromise;
    const runtimeSettings = buildTicketRuntimeSettings(normalizedByKey, ticket?.workflowType || ticket?.workflow_type);
    if (!includeRelations) return applyTicketRuntimePolicies(ticket, runtimeSettings);
    const relations = data?.relations ? toCamelCase(data.relations) : await this.getTicketRelations(ticketId);
    const withRelations = {
      ...ticket,
      attachments: relations.attachments,
      messages: relations.messages,
      ticketComments: relations.ticketComments,
      ticketActions: relations.ticketActions,
    };
    const withSignedUrls = await attachSignedUrlsToTicket(withRelations);
    return applyTicketRuntimePolicies(withSignedUrls, runtimeSettings);
  },

  async getTicketRelations(ticketId) {
    if (!ticketId) throw new Error('ticketId is required');
    const data = await ticketReadGet('relations', { ticket_id: ticketId });
    const raw = toCamelCase(data || {});
    const attachments = await attachSignedUrlsToAttachments(raw?.attachments || []);

    return {
      attachments,
      messages: Array.isArray(raw?.messages) ? raw.messages : [],
      ticketComments: Array.isArray(raw?.ticketComments) ? raw.ticketComments : [],
      ticketActions: Array.isArray(raw?.ticketActions) ? raw.ticketActions : [],
    };
  },

  async getTicketByCredentials(ticketInput, accessCode) {
    if (!ticketInput || !accessCode) throw new Error('Ticket number/ID and access code are required');

    const ticket = String(ticketInput).trim();
    const code = String(accessCode).trim().padStart(6, '0');

    const resp = await fetch('/api/tickets.api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'access',
        ticket_input: ticket,
        access_code: code,
      }),
    });

    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.success || !json?.data) {
      throw new Error(ticketsApiErrorMessage(json, 'Ongeldige ticket-ID of toegangscode', 'access'));
    }

    const loadedTicket = toCamelCase(json.data);
    const runtimeSettings = await getTicketRuntimeSettings(loadedTicket?.workflowType || loadedTicket?.workflow_type);
    return applyTicketRuntimePolicies(loadedTicket, runtimeSettings, { reporterView: true });
  },

  async addReporterMessageByCredentials(ticketInput, accessCode, body) {
    if (!ticketInput || !accessCode) throw new Error('Ticket number/ID and access code are required');
    if (!body || !String(body).trim()) throw new Error('body is required');

    const ticket = String(ticketInput).trim();
    const code = String(accessCode).trim().padStart(6, '0');
    const payload = {
      action: 'message',
      ticket_input: ticket,
      access_code: code,
      body: String(body).trim(),
    };

    const resp = await fetch('/api/tickets.api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => null);

    if (!resp.ok || !json?.success) {
      throw new Error(ticketsApiErrorMessage(json, 'Failed to send reporter message', 'message'));
    }

    const message = toCamelCase(json?.data?.message || null);
    const updatedTicket = toCamelCase(json?.data?.ticket || null);
    const runtimeSettings = await getTicketRuntimeSettings(updatedTicket?.workflowType || updatedTicket?.workflow_type);
    return { message, ticket: applyTicketRuntimePolicies(updatedTicket, runtimeSettings, { reporterView: true }) };
  },

  // ----- Create -----
  async createTicket(ticketData) {
    if (!ticketData?.description) throw new Error('description is required');
    const workflowType = safeTrim(ticketData?.workflowType);
    if (!workflowType) throw new Error('workflowType is required');
    const runtimeSettings = await getTicketRuntimeSettings(workflowType);
    if (!runtimeSettings.allowPublicSubmission) {
      throw new Error('Public submissions are currently disabled by system settings.');
    }

    const isAnonymous = !!ticketData?.isAnonymous;
    const reporterEmail = safeTrim(ticketData?.reporterEmail);
    if (runtimeSettings.requireEmailVerification && reporterEmail === '') {
      throw new Error('reporterEmail is required by system policy');
    }
    if (!isAnonymous && reporterEmail === '') {
      throw new Error('reporterEmail is required');
    }

    const { statuses } = await getWorkflowWithStatuses(workflowType);
    const def = pickDefaultStatus(statuses);
    if (!def) throw new Error(`No statuses configured for workflow: ${workflowType}`);

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    const effectivePrefix = normalizeTicketPrefix(
      ticketData?.ticketNumberPrefix || runtimeSettings.ticketNumberPrefix || 'NZ',
      'NZ'
    );
    const ticketNumber = `${effectivePrefix}-${year}-${String(randomNum).padStart(6, '0')}`;

    const accessCode = String(Math.floor(100000 + Math.random() * 900000)).padStart(6, '0');
    const severityCode = normalizeSeverityCode(ticketData?.severity, runtimeSettings.defaultPriority || 'low');
    const slaResponseHours = normalizeSettingNumber(
      coerceSettingValue(ticketData?.slaResponseHours, runtimeSettings.slaResponseTimeHours),
      24
    );
    const slaResolutionHours = normalizeSettingNumber(
      coerceSettingValue(ticketData?.slaResolutionHours, runtimeSettings.slaResolutionTimeHours),
      72
    );

    const nextStepDueAt = def?.expectedDurationDays
      ? addDaysISO(nowIso, def.expectedDurationDays)
      : null;

    const reporterLanguage = String(ticketData?.reporterLanguage || '')
      .trim()
      .toLowerCase()
      .split('-')[0];

    const payload = {
      ticket_number: ticketNumber,
      access_code: accessCode,
      description: ticketData.description,
      location: ticketData.location || null,
      workflow_type: workflowType,
      severity_code: severityCode,
      reporter_email: reporterEmail || null,
      reporter_name: ticketData.reporterName || null,
      reporter_phone: ticketData.reporterPhone || null,
      email_notify: reporterEmail ? !!ticketData.emailNotify : false,
      status_email_notify:
        reporterEmail
          ? (ticketData.statusEmailNotify === undefined ? true : !!ticketData.statusEmailNotify)
          : false,

      // DB-driven initial state
      status_code: def.code,
      current_stage: def.stage || def.code,
      next_step_due: nextStepDueAt,

      // Optional: keep UI label stored in metadata (since there is NO status_label column)
      metadata: {
        ...(ticketData.metadata || {}),
        status_label: def.label,
        workflow_status_changed_at: nowIso,
        workflow_status_previous_code: null,
        workflow_status_previous_stage: null,
        reporter_language: reporterLanguage || null,
        sla_response_hours: slaResponseHours,
        sla_resolution_hours: slaResolutionHours,
        compliance: {
          gdpr_compliant: runtimeSettings.gdprCompliant !== false,
          anonymize_closed_tickets: runtimeSettings.anonymizeClosedTickets === true,
          backup_frequency: runtimeSettings.backupFrequency || 'weekly',
          data_retention_days: Number(runtimeSettings.dataRetentionDays || 365),
        },
        ...(isAnonymous || runtimeSettings.gdprCompliant !== false ? {} : { reporter_meta_client: getClientMeta() }),
      },

      // Optional: update enum only if DB config provides it
      ...(def.enumLabel ? { status: def.enumLabel } : {}),
    };

    const resp = await fetch('/api/tickets.api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        is_anonymous: isAnonymous
      })
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.success) {
      throw new Error(ticketsApiErrorMessage(json, 'Failed to create ticket', 'create'));
    }

    const createdTicket = toCamelCase(json?.data);

    // Send confirmation email to reporter (async, don't wait)
    if (createdTicket.emailNotify && (createdTicket.reporterEmail || createdTicket.reporterEmailEncrypted)) {
      notificationService.notifyReporterTicketCreated(createdTicket)
        .catch(err => console.error('Failed to send ticket creation email:', err));
    }

    return applyTicketRuntimePolicies(createdTicket, runtimeSettings, { reporterView: isAnonymous });
  },

  // ----- Status updates (DB-driven) -----
  async updateTicketProgress(ticketId, payload = {}) {
    if (!ticketId) throw new Error('ticketId is required');

    // Fetch workflow_type if not provided
    let workflowType = safeTrim(payload.workflowType);
    if (!workflowType) {
      const currentTicket = await this.getTicketById(ticketId, { includeRelations: false });
      workflowType = safeTrim(currentTicket?.workflowType || currentTicket?.workflow_type);
    }

    if (!workflowType) throw new Error('workflowType is required (ticket has no workflow_type)');

    const { statuses } = await getWorkflowWithStatuses(workflowType);
    if (!statuses?.length) throw new Error(`No statuses configured for workflow: ${workflowType}`);

    // user selection (prefer code)
    const requested = payload.statusCode || payload.statusLabel;
    const resolved = findStatusByCodeOrLabel(statuses, requested);
    if (!resolved) throw new Error(`Invalid status for workflow "${workflowType}": ${requested}`);

    const nowIso = new Date().toISOString();

    // The ONLY guaranteed-valid writes (your trigger validates status_code):
    const nextStepDueAt = resolved?.expectedDurationDays
      ? addDaysISO(nowIso, resolved.expectedDurationDays)
      : null;

    const update = {
      last_update_at: nowIso,
      status_code: resolved.code,
      current_stage: resolved.stage || resolved.code,
      next_step_due: nextStepDueAt,
      // Metadata merge handled below
    };

    // Fetch current ticket data (for metadata and old status)
    const cur = await this.getTicketById(ticketId, { includeRelations: false });

    const hasAssignedHandler = Boolean(cur?.handlerId || cur?.handler_id || (cur?.ticketHandlers || []).length > 0);

    if (!hasAssignedHandler) {
      const e = new Error('Wijs eerst een handler toe voordat de status kan worden aangepast.');
      e.code = 'ASSIGNMENT_REQUIRED_FOR_STATUS_CHANGE';
      throw e;
    }

    const currentStatusComparable = cur?.current_stage || cur?.status_code || null;
    const currentIdx = findStatusIndexByCodeOrLabel(statuses, currentStatusComparable);
    const newIdx = findStatusIndexByCodeOrLabel(statuses, resolved.code);
    const isRollback = currentIdx >= 0 && newIdx >= 0 && newIdx < currentIdx;
    if (isRollback && !isRollbackWindowOpen(resolveStatusChangedAt(cur))) {
      const e = new Error('Status terugzetten is alleen binnen 1 uur na de laatste statuswijziging toegestaan.');
      e.code = 'STATUS_ROLLBACK_WINDOW_EXPIRED';
      throw e;
    }

    // Get old status label for notification
    const oldStatusObj = findStatusByCodeOrLabel(statuses, cur?.status_code);
    const oldStatusLabel = oldStatusObj?.label || cur?.status_code || 'Unknown';

    const existingFirstResponseAt =
      cur?.metadata?.first_response_at ||
      cur?.metadata?.firstResponseAt ||
      null;
    const shouldBackfillFirstResponseOnTerminal = !existingFirstResponseAt && Boolean(resolved?.isTerminal);
    const shouldStampFirstResponseOnConfiguredStatus = !existingFirstResponseAt && Boolean(resolved?.isFirstResponse);
    const shouldStampFirstResponseAt =
      !existingFirstResponseAt &&
      (
        shouldStampFirstResponseOnConfiguredStatus ||
        isReceiptConfirmationStatus(resolved?.code, resolved?.label) ||
        shouldBackfillFirstResponseOnTerminal
      );

    update.metadata = {
      ...(cur?.metadata || {}),
      status_label: resolved.label,
      workflow_status_code: resolved.code,
      workflow_status_changed_at: nowIso,
      workflow_status_previous_code: cur?.status_code || null,
      workflow_status_previous_stage: cur?.current_stage || null,
      status_contact_person_name: null,
      status_contact_person_email: null,
      status_contact_person_phone: null,
      status_contact_notes: null,
      ...(shouldStampFirstResponseAt
        ? {
            first_response_at: nowIso,
            first_response_status_code: resolved?.code || null,
            first_response_status_label: resolved?.label || null,
          }
        : {}),
    };

    // Optional: only set enum if explicitly provided by DB config
    if (resolved.enumLabel) {
      update.status = resolved.enumLabel;
    }

    const updatedTicket = await this.updateTicket(ticketId, update);

    const note = payload.note ? String(payload.note).trim() : '';
    if (note && await this.isAuditLoggingEnabled()) {
      await insertTicketActionSafe({
        ticket_id: ticketId,
        action_type: 'status_update',
        action: `Status changed to ${resolved.label}`,
        description: note,
        created_at: nowIso,
      }, 'updateTicketProgress(note)');
    }

    const result = toCamelCase(updatedTicket);

    // Send status change notifications (async, don't wait)
    // Only send if status actually changed
    if (oldStatusLabel !== resolved.label) {
      notificationService.notifyStatusChange(result, oldStatusLabel, resolved.label)
        .catch(err => console.error('Failed to send status change notifications:', err));
    }

    return result;
  },

  async updateTicketStatus(ticketId, statusLabel, statusCode, currentStage = null, note = null, workflowType = null) {
    // keep backward compatibility, but we only really use statusCode/statusLabel
    return this.updateTicketProgress(ticketId, {
      workflowType,
      statusLabel,
      statusCode,
      currentStage,
      note,
    });
  },
    // ----- User/Handler Management -----

async updateHandler(handlerId, updates = {}) {
  if (!handlerId) throw new Error('handlerId is required');

  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.roles !== undefined) payload.roles = updates.roles;
  // Support legacy 'role' parameter by converting to roles array
  if (updates.role !== undefined && updates.roles === undefined) {
    payload.roles = updates.role === 'admin' ? ['HANDLER', 'ADMIN'] : ['HANDLER'];
  }
  if (updates.active !== undefined) payload.active = updates.active;
  if (updates.isActive !== undefined) payload.active = updates.isActive;
  if (updates.permissions !== undefined) payload.permissions = updates.permissions;

  if (updates.email !== undefined) {
    payload.email = normalizeEmail(updates.email);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('No valid fields provided to updateHandler');
  }

  const apiData = await workflowApiPost(
    'update_handler',
    { id: handlerId, patch: payload },
    { requireAuth: true }
  );
  invalidateAllHandlersCache();
  return normalizeHandlerRecord(toCamelCase(apiData?.row || null));
},

  // Optional but usually handy:

async createHandler(handlerData = {}) {
  if (!handlerData?.name) throw new Error('name is required');
  if (!handlerData?.email) throw new Error('email is required');

  const email = normalizeEmail(handlerData.email);

  // Convert role to roles array if provided
  let roles = handlerData.roles || ['HANDLER'];
  if (handlerData.role && !handlerData.roles) {
    roles = handlerData.role === 'admin' ? ['HANDLER', 'ADMIN'] : ['HANDLER'];
  }

  const payload = {
    name: handlerData.name,
    email,
    roles,
    active: handlerData.active !== undefined ? handlerData.active : (handlerData.isActive ?? true),
    permissions: handlerData.permissions || {},
  };

  const apiData = await workflowApiPost(
    'create_handler',
    { payload },
    { requireAuth: true }
  );
  invalidateAllHandlersCache();
  return normalizeHandlerRecord(toCamelCase(apiData?.row || null));
},

async deleteHandler(handlerId, options = {}) {
  if (!handlerId) throw new Error('handlerId is required');

  const { hard = false, forceDetach = false } = options;

  const apiData = await workflowApiPost(
    'delete_handler',
    { id: handlerId, hard, force_detach: forceDetach },
    { requireAuth: true }
  );
  invalidateAllHandlersCache();
  return {
    success: true,
    mode: apiData?.mode || (hard ? 'hard' : 'soft'),
    handler: toCamelCase(apiData?.row || null),
  };
},

  async isAuditLoggingEnabled() {
    const runtimeSettings = await getTicketRuntimeSettings();
    return runtimeSettings.auditLogEnabled !== false;
  },

  async getWorkflowRuntimeSettings(workflowType = '') {
    return getTicketRuntimeSettings(workflowType);
  },

  // ----- Generic ticket update -----
  async updateTicket(ticketId, updates = {}) {
    if (!ticketId) throw new Error('ticketId is required');

    const apiData = await ticketApiPost(
      {
        action: 'handler_update_ticket',
        ticket_id: ticketId,
        updates: toSnakeCase(updates || {}),
      },
      { requireAuth: true }
    );
    return toCamelCase(apiData?.ticket || apiData);
  },

  // ----- Assignment -----
  async setTicketHandlers(ticketId, handlerIds = [], note = null, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');

    const nowIso = new Date().toISOString();
    const trimmed = note ? String(note).trim() : '';
    const normalizedHandlerIds = normalizeHandlerIds(handlerIds);
    const trustedHandlerIds = new Set(normalizeHandlerIds(options?.currentHandlerId));
    const assignmentRoles = buildAssignmentRolesMap(normalizedHandlerIds, options?.rolesByHandlerId || {});
    const handlerMap = new Map();
    const knownHandlers = Array.isArray(options?.knownHandlers) ? options.knownHandlers : [];
    knownHandlers.forEach((handler) => {
      const normalizedId = String(handler?.id || '').trim();
      if (!normalizedId || !normalizedHandlerIds.includes(normalizedId)) return;
      handlerMap.set(normalizedId, {
        ...handler,
        id: normalizedId,
        active: handler?.active ?? handler?.isActive ?? true,
      });
    });
    trustedHandlerIds.forEach((handlerId) => {
      if (!normalizedHandlerIds.includes(handlerId) || handlerMap.has(handlerId)) return;
      handlerMap.set(handlerId, {
        id: handlerId,
        name: options?.currentHandlerName || null,
        email: options?.currentHandlerEmail || null,
        active: true,
      });
    });

    if (normalizedHandlerIds.length > 0) {
      let handlers = [];
      try {
        const missingHandlerIds = normalizedHandlerIds.filter((handlerId) => !handlerMap.has(handlerId));
        handlers = await loadHandlersByIdsWithFallback(missingHandlerIds);
      } catch (handlerError) {
        if (isAuthOrRlsError(handlerError)) {
          console.warn('[ticketService] Handler validation query blocked by policy, trusting current handler where possible', handlerError);
        } else {
          throwIfError(handlerError, 'setTicketHandlers(fetch handlers)');
        }
      }

      for (const handler of handlers || []) {
        const normalizedId = String(handler?.id || '').trim();
        if (normalizedId) {
          handlerMap.set(normalizedId, handler);
        }
      }

      for (const handlerId of normalizedHandlerIds) {
        const handler = handlerMap.get(handlerId);
        if (!handler?.id) {
          if (trustedHandlerIds.has(handlerId)) {
            continue;
          }
          const e = new Error('Geselecteerde handler bestaat niet meer.');
          e.code = 'HANDLER_NOT_FOUND';
          throw e;
        }

        if (handler.active === false) {
          const e = new Error('Inactieve handlers kunnen niet worden toegewezen.');
          e.code = 'HANDLER_INACTIVE';
          throw e;
        }
      }
    }

    const syncResult = await syncTicketHandlers(ticketId, normalizedHandlerIds, assignmentRoles);
    if (!syncResult.available && normalizedHandlerIds.length > 1) {
      const blockedByPolicy = Boolean(syncResult.restricted);
      const e = new Error(
        blockedByPolicy
          ? 'Multi-handler toewijzing is met de huidige toegangsrechten niet toegestaan.'
          : 'Multi-handler toewijzing vereist migratie "ticket_handlers".'
      );
      e.code = blockedByPolicy
        ? 'TICKET_HANDLERS_PERMISSION_REQUIRED'
        : 'TICKET_HANDLERS_MIGRATION_REQUIRED';
      throw e;
    }

    let result = syncResult?.ticket || null;
    if (!result) {
      result = await this.getTicketById(ticketId, { includeRelations: false });
    }
    if (!result) {
      const e = new Error('Ticket bestaat niet meer.');
      e.code = 'TICKET_NOT_FOUND';
      throw e;
    }

    const workflowRuntimeSettings = await getTicketRuntimeSettings(
      safeTrim(result?.workflowType || result?.workflow_type)
    );
    const shouldNotifyOnAssignment = workflowRuntimeSettings.notifyOnAssignment !== false;

    if (trimmed && await this.isAuditLoggingEnabled()) {
      let handlerInfo = null;
      if (options.currentHandlerId) {
        handlerInfo = await loadHandlerContactById(
          options.currentHandlerId,
          'read current handler info for assignment log'
        );
      }

      await insertTicketActionSafe({
        ticket_id: ticketId,
        action_type: 'assignment',
        action: 'Handler Assigned',
        description: trimmed,
        handler_id: handlerInfo?.id || null,
        handler_name: handlerInfo?.name || null,
        handler_email: handlerInfo?.email || null,
        performed_by: handlerInfo?.name || 'System',
        created_at: nowIso,
      }, 'setTicketHandlers(note)');
    }

    result = applyTicketRuntimePolicies(result, workflowRuntimeSettings);

    const hadAnyAssignmentBefore = syncResult.available
      ? (syncResult.previousIds || []).length > 0
      : false;
    const hasAnyAssignmentNow = normalizedHandlerIds.length > 0;
    const firstAssignment = !hadAnyAssignmentBefore && hasAnyAssignmentNow;

    if (shouldNotifyOnAssignment && firstAssignment) {
      const assignedHandlersForReporter = normalizedHandlerIds
        .map((id) => handlerMap.get(id))
        .filter(Boolean);

      notificationService.notifyReporterAssignmentStarted(result, {
        assignedHandlers: assignedHandlersForReporter,
      }).catch((err) => console.error('Failed to send reporter assignment-started notification:', err));
    }

    return result;
  },

  async assignHandler(ticketId, handlerId, note = null, options = {}) {
    const normalized = handlerId ? [handlerId] : [];
    return this.setTicketHandlers(ticketId, normalized, note, options);
  },

  async setTicketHandlerRole(ticketId, handlerId, role) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!handlerId) throw new Error('handlerId is required');
    const normalizedRole = normalizeAssignmentRole(role, '');
    if (!normalizedRole) throw new Error('role is required');

    const apiResult = await ticketApiPost(
      {
        action: 'handler_set_ticket_handler_role',
        ticket_id: ticketId,
        handler_id: handlerId,
        role: normalizedRole,
      },
      { requireAuth: true }
    );

    let ticket = toCamelCase(apiResult?.ticket || null);
    if (ticket) {
      const runtimeSettings = await getTicketRuntimeSettings(ticket?.workflowType || ticket?.workflow_type);
      ticket = applyTicketRuntimePolicies(ticket, runtimeSettings);
    } else {
      ticket = await this.getTicketById(ticketId, { includeRelations: false });
    }
    return {
      ticketHandler: toCamelCase(apiResult?.ticket_handler || apiResult || null),
      ticket,
    };
  },

  // ----- Comments & messages -----
  async addComment(ticketId, comment, authorName, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!comment || !String(comment).trim()) throw new Error('comment is required');

    void options;
    const trimmedComment = String(comment).trim();
    const apiData = await ticketApiPost(
      {
        action: 'handler_add_comment',
        ticket_id: ticketId,
        comment: trimmedComment,
        author_name: authorName || null,
      },
      { requireAuth: true }
    );

    const result = toCamelCase(apiData?.comment || apiData);
    const performedBy = String(apiData?.performed_by || authorName || 'System');
    let ticket = toCamelCase(apiData?.ticket || null);
    if (ticket) {
      const runtimeSettings = await getTicketRuntimeSettings(ticket?.workflowType || ticket?.workflow_type);
      ticket = applyTicketRuntimePolicies(ticket, runtimeSettings);
      const isInternal = true;
      notificationService.notifyComment(
        ticket,
        trimmedComment,
        performedBy,
        isInternal
      ).catch(err => console.error('Failed to send comment notification:', err));
    }

    return result;
  },

  async updateComment(ticketId, commentId, comment) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!commentId) throw new Error('commentId is required');
    if (!comment || !String(comment).trim()) throw new Error('comment is required');

    const apiData = await ticketApiPost(
      {
        action: 'handler_update_comment',
        ticket_id: ticketId,
        comment_id: commentId,
        comment: String(comment).trim(),
      },
      { requireAuth: true }
    );

    return toCamelCase(apiData?.comment || apiData);
  },

  async addMessage(ticketId, sender, body, isInternal = false, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!sender) throw new Error('sender is required');
    if (!body || !String(body).trim()) throw new Error('body is required');

    const trimmedBody = String(body).trim();
    const senderKey = String(sender || '').toLowerCase();
    const isHandlerSender = senderKey === 'handler';
    const discloseHandlerIdentity = options?.discloseHandlerIdentity === true;

    const apiData = await ticketApiPost(
      {
        action: 'handler_add_message',
        ticket_id: ticketId,
        sender,
        body: trimmedBody,
        is_internal: !!isInternal,
        disclose_handler_identity: discloseHandlerIdentity,
      },
      { requireAuth: true }
    );

    const result = toCamelCase(apiData?.message || apiData);
    const senderName =
      (isHandlerSender && discloseHandlerIdentity
        ? (apiData?.public_handler_name || null)
        : null);
    let ticket = toCamelCase(apiData?.ticket || null);
    if (ticket) {
      const runtimeSettings = await getTicketRuntimeSettings(ticket?.workflowType || ticket?.workflow_type);
      ticket = applyTicketRuntimePolicies(ticket, runtimeSettings);
      notificationService.notifyMessage(
        ticket,
        sender,
        trimmedBody,
        isInternal,
        {
          discloseHandlerIdentity,
          senderName,
        }
      ).catch(err => console.error('Failed to send message notification:', err));
    }

    return result;
  },

  // ----- Lookups -----
  async getAllHandlers(options = {}) {
    const includeInactive = options.includeInactive !== undefined
      ? Boolean(options.includeInactive)
      : options.activeOnly !== undefined
        ? !Boolean(options.activeOnly)
        : true;
    const rows = await fetchAllHandlersCached(includeInactive, options.force === true);

    // Enrich handlers with permissions from new RBAC system.
    const handlers = normalizeHandlerRecords(toCamelCase(rows) || []);
    const shouldEnrichPermissions = options.enrichPermissions !== false;

    if (!shouldEnrichPermissions || handlers.length === 0) {
      return handlers;
    }

    const enrichedHandlers = await Promise.all(
      handlers.map(async (handler) => {
        try {
          const permissionsObj = await permissionService.getHandlerPermissionsObject(handler.id);

          const mergedPermissions = {
            ...normalizePermissions(handler.permissions),
            ...permissionsObj,
          };

          return {
            ...handler,
            permissions: mergedPermissions,
          };
        } catch (err) {
          console.error(`[ticketService] RBAC enrichment failed for handler ${handler.id}:`, err);
          console.error(`[ticketService] Handler email: ${handler.email}, falling back to legacy permissions`);
          return {
            ...handler,
            __rbac_enrichment_failed: true,
          };
        }
      })
    );

    return enrichedHandlers;
  },

  async getHandlerById(handlerId) {
    if (!handlerId) throw new Error('handlerId is required');

    const row = (await fetchHandlersByIdsCached([handlerId]))[0] || null;
    return row ? normalizeHandlerRecord(row) : null;
  },

  async getWorkflows(includeInactive = false) {
    const data = await catalogApiGet('workflows', {
      include_inactive: includeInactive ? '1' : '0',
    });
    return toCamelCase(data?.rows || []);
  },

  async getSeverities() {
    const data = await catalogApiGet('severities');
    return toCamelCase(data?.rows || []);
  },

  async getWorkflowStatuses(workflowCode) {
    const { workflow, statuses } = await getWorkflowWithStatuses(workflowCode);
    return { workflow, statuses };
  },

  // ----- Attachments -----
  async createAttachmentRecord(ticketId, fileMeta) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!fileMeta?.name) throw new Error('fileMeta.name is required');
    void fileMeta;
    throw new Error('Direct attachment inserts are no longer supported; use handler/reporter attachment APIs.');
  },

  async uploadAttachment(ticketId, file, options = {}) {
    const {
      bucket = 'attachments',
      makePublicUrl = false,
      upsert = false,
      currentHandlerId = null,
      isInternal = false,
      noteId = null,
      notifyReporter = false,
      accessCode = null,
      ticketInput = null,
    } = options;

    if (!ticketId) throw new Error('ticketId is required');
    if (!file) throw new Error('file is required');

    // Get handler info for logging
    let handlerInfo = null;
    if (currentHandlerId) {
      handlerInfo = await loadHandlerContactById(
        currentHandlerId,
        'read current handler info for attachment log'
      );
    }

    const originalName = String(file.name || 'file');
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const uid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const path = `${ticketId}/${uid}_${safeName}`;

    const uploadData = await uploadFileToLocalStorage(file, `${bucket}/${ticketId}`);
    const fileUrl = uploadData?.path || path;

    const attachmentPayload = {
      name: originalName,
      url: fileUrl,
      type: file.type,
      size: file.size,
      isInternal,
      noteId,
    };

    let attachment = null;
    let attachmentCreatedViaApi = false;
    let handlerApiAttempted = false;
    let handlerApiError = null;
    let reporterApiAttempted = false;
    let reporterApiError = null;
    let ticketForNotification = null;

    if (currentHandlerId) {
      handlerApiAttempted = true;
      try {
        const apiData = await ticketApiPost(
          {
            action: 'handler_add_attachment',
            ticket_id: ticketId,
            file_name: originalName,
            file_url: fileUrl,
            mime_type: file.type || 'application/octet-stream',
            size_bytes: Number(file.size || 0) || 0,
            is_internal: !!isInternal,
            note_id: noteId || null,
          },
          { requireAuth: true }
        );
        attachment = toCamelCase(apiData?.attachment || apiData);
        ticketForNotification = toCamelCase(apiData?.ticket || null);
        attachmentCreatedViaApi = true;
      } catch (apiError) {
        handlerApiError = apiError;
        console.warn('[ticketService] handler_add_attachment API failed', apiError);
      }
    }

    if (!attachment && accessCode) {
      reporterApiAttempted = true;
      try {
        const apiData = await ticketApiPost(
          {
            action: 'reporter_add_attachment',
            ticket_input: String(ticketInput || ticketId),
            access_code: String(accessCode).trim().padStart(6, '0'),
            file_name: originalName,
            file_url: fileUrl,
            mime_type: file.type || 'application/octet-stream',
            size_bytes: Number(file.size || 0) || 0,
          },
          { requireAuth: false }
        );
        attachment = toCamelCase(apiData?.attachment || apiData);
        attachmentCreatedViaApi = true;
      } catch (apiError) {
        reporterApiError = apiError;
        console.warn('[ticketService] reporter_add_attachment API failed', apiError);
      }
    }

    if (!attachment && reporterApiAttempted && !currentHandlerId) {
      // In reporter flow, direct table insert is usually blocked by RLS.
      // Avoid noisy fallback errors and return the real API failure.
      try {
        await deleteLocalFile(fileUrl);
      } catch (cleanupError) {
        console.warn('[ticketService] Failed to cleanup uploaded reporter attachment after API failure', cleanupError);
      }
      const e = new Error(`uploadAttachment(reporter_add_attachment): ${reporterApiError?.message || 'Failed to attach file'}`);
      e.original = reporterApiError || null;
      throw e;
    }

    if (!attachment && handlerApiAttempted && currentHandlerId) {
      try {
        await deleteLocalFile(fileUrl);
      } catch (cleanupError) {
        console.warn('[ticketService] Failed to cleanup uploaded handler attachment after API failure', cleanupError);
      }
      const e = new Error(`uploadAttachment(handler_add_attachment): ${handlerApiError?.message || 'Failed to attach file'}`);
      e.original = handlerApiError || null;
      throw e;
    }

    if (!attachment) {
      // Legacy fallback only for internal flows without handler/reporter API context.
      attachment = await this.createAttachmentRecord(ticketId, attachmentPayload);
    }
    const signedUrl = await createSignedAttachmentUrl(fileUrl, bucket, 600);
    const attachmentWithUrl = signedUrl
      ? { ...attachment, fileUrl: signedUrl, file_url: signedUrl, url: signedUrl }
      : attachment;

    // Log action
    if (!attachmentCreatedViaApi && await this.isAuditLoggingEnabled()) {
      await insertTicketActionSafe({
        ticket_id: ticketId,
        action_type: 'attachment_added',
        action: 'Attachment Added',
        description: `Uploaded file: ${originalName}`,
        handler_id: handlerInfo?.id || null,
        handler_name: handlerInfo?.name || null,
        handler_email: handlerInfo?.email || null,
        performed_by: handlerInfo?.name || 'System',
      }, 'uploadAttachment(log)');
    }

    if (notifyReporter && !isInternal) {
      try {
        let ticket = ticketForNotification;
        if (ticket) {
          const runtimeSettings = await getTicketRuntimeSettings(ticket?.workflowType || ticket?.workflow_type);
          ticket = applyTicketRuntimePolicies(ticket, runtimeSettings);
        } else {
          ticket = await this.getTicketById(ticketId, { includeRelations: false }).catch(() => null);
        }
        if (ticket) {
          notificationService.notifyAttachmentAdded(
            ticket,
            attachmentWithUrl,
            handlerInfo?.name || 'Handler'
          ).catch(err => console.error('Failed to send attachment notification:', err));
        }
      } catch (err) {
        console.error('Error loading ticket for attachment notification:', err);
      }
    }

    return attachmentWithUrl;
  },

  async addInvestigationNote(ticketId, comment, authorName, attachments = [], options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!comment || !String(comment).trim()) throw new Error('comment is required');

    const created = await this.addComment(ticketId, comment, authorName, options);

    const uploaded = [];
    const files = Array.isArray(attachments) ? attachments : [];
    for (const file of files) {
      const att = await this.uploadAttachment(ticketId, file, {
        currentHandlerId: options?.currentHandlerId || null,
        isInternal: true,
        noteId: created?.id || null,
      });
      uploaded.push(att);
    }

    return { comment: created, attachments: uploaded };
  },

  // ----- Action Logging Utility -----
  async logAction(ticketId, actionType, action, description, options = {}) {
    const { currentHandlerId = null } = options;
    if (!(await this.isAuditLoggingEnabled())) {
      return true;
    }

    // Get handler info for logging
    let handlerInfo = null;
    if (currentHandlerId) {
      handlerInfo = await loadHandlerContactById(
        currentHandlerId,
        'read current handler info for action log'
      );
    }

    const result = await insertTicketActionSafe({
      ticket_id: ticketId,
      action_type: actionType,
      action: action,
      description: description,
      handler_id: handlerInfo?.id || null,
      handler_name: handlerInfo?.name || null,
      handler_email: handlerInfo?.email || null,
      performed_by: handlerInfo?.name || 'System',
    }, 'logAction');

    return result?.ok === true;
  },

  // ----- Utilities exposed -----
  setTokenProvider,
  toCamelCase,
  toSnakeCase,
};

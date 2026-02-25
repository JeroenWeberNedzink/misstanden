// ticketService.js
import { supabase } from '../lib/supabase';
import { notificationService } from './notificationService';
import { workflowService } from './workflowService';
import { isReceiptConfirmationStatus } from '../utils/slaUtils';
import { normalizeHandlerRecord, normalizeHandlerRecords, normalizePermissions } from './utils/handlerNormalization';

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
const WORKFLOWS_API_URL = '/api/workflows.api.php';
let ticketTokenProvider = null;

const setTokenProvider = (provider) => {
  ticketTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async () => {
  if (!ticketTokenProvider) return {};
  try {
    const token = await ticketTokenProvider();
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

const ticketApiPost = async (payload, { requireAuth = false } = {}) => {
  const authHeaders = await getAuthHeadersWithRetry(requireAuth);
  if (requireAuth && !authHeaders.Authorization) {
    throw new Error('Authorization token required');
  }

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
    throw new Error(json?.message || `Tickets API error (${response.status})`);
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

const TICKET_HANDLERS_RECHECK_MS = 3_600_000;
const TICKET_HANDLERS_STATE_KEY = 'ticket_handlers_relation_state_v1';
const readTicketHandlersState = () => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return { available: null, checkedAt: 0 };
    }
    const raw = window.sessionStorage.getItem(TICKET_HANDLERS_STATE_KEY);
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
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(TICKET_HANDLERS_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
};

const initialTicketHandlersState = readTicketHandlersState();
const ticketHandlersRelationState = {
  available: initialTicketHandlersState.available, // null = unknown, true = available, false = missing
  checkedAt: initialTicketHandlersState.checkedAt,
};

const shouldProbeTicketHandlersRelation = () => {
  if (ticketHandlersRelationState.available !== false) return true;
  return Date.now() - ticketHandlersRelationState.checkedAt > TICKET_HANDLERS_RECHECK_MS;
};

const markTicketHandlersRelationState = (available) => {
  ticketHandlersRelationState.available = available;
  ticketHandlersRelationState.checkedAt = Date.now();
  persistTicketHandlersState(ticketHandlersRelationState);
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

const toStoragePath = (rawUrl, bucket = 'attachments') => {
  const value = String(rawUrl || '').trim();
  if (!value || value === '#') return null;

  if (!isAbsoluteUrl(value)) {
    const normalized = value.replace(/^\/+/, '');
    if (!normalized) return null;
    if (normalized.startsWith(`${bucket}/`)) {
      return normalized.slice(bucket.length + 1) || null;
    }
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
  const path = toStoragePath(rawUrl, bucket);
  if (!path) {
    return isAbsoluteUrl(rawUrl) ? String(rawUrl).trim() : null;
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    return isAbsoluteUrl(rawUrl) ? String(rawUrl).trim() : null;
  }
  return data.signedUrl;
};

const attachSignedUrlsToTicket = async (ticket, bucket = 'attachments') => {
  if (!ticket || !Array.isArray(ticket?.attachments) || ticket.attachments.length === 0) {
    return ticket;
  }

  const signedAttachments = await Promise.all(
    ticket.attachments.map(async (att) => {
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

  return {
    ...ticket,
    attachments: signedAttachments,
  };
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

const getAssignedTicketCount = async (handlerId) => {
  const { count, error } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('handler_id', handlerId);

  if (error) {
    console.warn('[ticketService] Could not count assigned tickets before delete:', error);
    return 0;
  }

  return Number(count || 0);
};

const detachHandlerReferences = async (handlerId, nowIso) => {
  const warnings = [];
  const stats = {
    autoUnassignedTickets: 0,
  };

  stats.autoUnassignedTickets = await getAssignedTicketCount(handlerId);

  const ops = [
    {
      label: 'tickets.handler_id',
      run: () =>
        supabase
          .from('tickets')
          .update({ handler_id: null, last_update_at: nowIso })
          .eq('handler_id', handlerId),
    },
    {
      label: 'handler_workflows',
      run: async () => {
        try {
          await workflowService.clearHandlerWorkflows(handlerId);
          return { error: null };
        } catch (error) {
          return { error };
        }
      },
    },
    {
      label: 'ticket_handlers',
      run: () => supabase.from('ticket_handlers').delete().eq('handler_id', handlerId),
    },
    {
      label: 'handler_roles',
      run: () => supabase.from('handler_roles').delete().eq('handler_id', handlerId),
    },
    {
      label: 'messages.handler_id',
      run: () => supabase.from('messages').update({ handler_id: null }).eq('handler_id', handlerId),
    },
    {
      label: 'ticket_actions.handler_id',
      run: () => supabase.from('ticket_actions').update({ handler_id: null }).eq('handler_id', handlerId),
    },
    {
      label: 'handler_email_preferences',
      run: () => supabase.from('handler_email_preferences').delete().eq('handler_id', handlerId),
    },
    {
      label: 'handler_notification_settings',
      run: () => supabase.from('handler_notification_settings').delete().eq('handler_id', handlerId),
    },
    {
      label: 'user_availability',
      run: () => supabase.from('user_availability').delete().eq('user_id', handlerId),
    },
  ];

  for (const op of ops) {
    const { error } = await op.run();
    if (!error) continue;
    if (isMissingRelation(error) || isMissingTicketHandlersRelation(error)) continue;
    warnings.push({ label: op.label, error });
  }

  return { warnings, stats };
};

const addDaysISO = (dateLike, days) => {
  if (!dateLike || !Number.isFinite(Number(days))) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
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

const loadHandlersByIdsWithFallback = async (handlerIds = []) => {
  const normalizedIds = normalizeHandlerIds(handlerIds);
  if (normalizedIds.length === 0) return [];

  let rows = [];
  let directError = null;

  try {
    const { data, error } = await supabase
      .from('handlers')
      .select('id, name, email, active')
      .in('id', normalizedIds);

    if (error) throw error;
    rows = Array.isArray(data) ? data : [];
  } catch (err) {
    directError = err;
  }

  const missingIds = normalizedIds.filter((id) => !(rows || []).some((row) => row?.id === id));
  const shouldTryApi =
    Boolean(ticketTokenProvider) &&
    (Boolean(directError) || missingIds.length > 0);

  if (shouldTryApi) {
    try {
      const idsForApi = missingIds.length > 0 ? missingIds : normalizedIds;
      const apiData = await workflowApiGet(
        'handlers_by_ids',
        {
          ids: idsForApi.join(','),
          include_inactive: '1',
        },
        { requireAuth: true }
      );
      const apiRows = Array.isArray(apiData?.rows) ? apiData.rows : [];
      const allowed = new Set(normalizedIds);
      const apiMatches = apiRows
        .filter((row) => allowed.has(String(row?.id || '').trim()))
        .map((row) => ({
          id: row?.id,
          name: row?.name ?? null,
          email: row?.email ?? null,
          active: row?.active ?? null,
        }));

      if (apiMatches.length > 0) {
        const byId = new Map();
        for (const row of rows || []) byId.set(String(row?.id || '').trim(), row);
        for (const row of apiMatches) byId.set(String(row?.id || '').trim(), row);
        rows = Array.from(byId.values());
        directError = null;
      }
    } catch (apiErr) {
      if (directError) {
        throwIfError(directError, 'loadHandlersByIdsWithFallback');
      }
      console.warn('[ticketService] Handler API fallback failed during assignment validation', apiErr);
    }
  }

  if (directError && rows.length === 0) {
    throwIfError(directError, 'loadHandlersByIdsWithFallback');
  }

  return rows;
};

const getTicketHandlersMap = async (ticketIds = []) => {
  const ids = Array.from(new Set((ticketIds || []).filter(Boolean)));
  if (ids.length === 0) {
    return { map: new Map(), available: true };
  }

  if (!shouldProbeTicketHandlersRelation()) {
    return { map: new Map(), available: false };
  }

  const { data, error } = await supabase
    .from('ticket_handlers')
    .select('id, ticket_id, handler_id, created_at, handlers:handler_id ( id, name, email, roles, active )')
    .in('ticket_id', ids)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingTicketHandlersRelation(error)) {
      markTicketHandlersRelationState(false);
      return { map: new Map(), available: false };
    }
    if (isAuthOrRlsError(error)) {
      // Avoid repeatedly probing a relation the current user cannot read.
      markTicketHandlersRelationState(false);
      console.warn('[ticketService] ticket_handlers lookup blocked by policy, continuing without relation map', error);
      return { map: new Map(), available: false };
    }
    throwIfError(error, 'getTicketHandlersMap');
  }

  markTicketHandlersRelationState(true);

  const map = new Map();
  for (const row of data || []) {
    const ticketId = row?.ticket_id;
    if (!ticketId) continue;
    const assignment = {
      id: row?.id,
      ticketId: row?.ticket_id,
      handlerId: row?.handler_id,
      createdAt: row?.created_at,
      handler: toCamelCase(row?.handlers || null),
    };
    if (!map.has(ticketId)) map.set(ticketId, []);
    map.get(ticketId).push(assignment);
  }
  return { map, available: true };
};

const decorateTicketsWithTicketHandlers = async (tickets = []) => {
  const list = Array.isArray(tickets) ? tickets : [];
  if (list.length === 0) return [];

  const ticketIds = list.map((ticket) => ticket?.id).filter(Boolean);
  const { map } = await getTicketHandlersMap(ticketIds);

  return list.map((ticket) => ({
    ...ticket,
    handlers: ticket?.handlers ? normalizeHandlerRecord(ticket.handlers) : ticket?.handlers,
    ticketHandlers: map.get(ticket?.id) || [],
  }));
};

const decorateTicketWithTicketHandlers = async (ticket) => {
  if (!ticket) return ticket;
  const [decorated] = await decorateTicketsWithTicketHandlers([ticket]);
  return decorated || ticket;
};

const syncTicketHandlers = async (ticketId, nextHandlerIds = []) => {
  const normalized = normalizeHandlerIds(nextHandlerIds);

  if (!shouldProbeTicketHandlersRelation()) {
    return { available: false, restricted: false, addedIds: [], removedIds: [], previousIds: [], nextIds: normalized };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('ticket_handlers')
    .select('handler_id')
    .eq('ticket_id', ticketId);

  if (existingError) {
    if (isMissingTicketHandlersRelation(existingError)) {
      markTicketHandlersRelationState(false);
      return { available: false, restricted: false, addedIds: [], removedIds: [], previousIds: [], nextIds: normalized };
    }
    if (isAuthOrRlsError(existingError)) {
      console.warn('[ticketService] ticket_handlers sync blocked by policy (fetch existing), continuing with primary handler only', existingError);
      return { available: false, restricted: true, addedIds: [], removedIds: [], previousIds: [], nextIds: normalized };
    }
    throwIfError(existingError, 'syncTicketHandlers(fetch existing)');
  }

  markTicketHandlersRelationState(true);

  const existingIds = (existingRows || []).map((row) => row?.handler_id).filter(Boolean);
  const toAdd = normalized.filter((id) => !existingIds.includes(id));
  const toRemove = existingIds.filter((id) => !normalized.includes(id));

  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from('ticket_handlers')
      .delete()
      .eq('ticket_id', ticketId)
      .in('handler_id', toRemove);
    if (removeError) {
      if (isMissingTicketHandlersRelation(removeError) || isMissingRelation(removeError)) {
        markTicketHandlersRelationState(false);
        return { available: false, restricted: false, addedIds: [], removedIds: [], previousIds: existingIds, nextIds: normalized };
      }
      if (isAuthOrRlsError(removeError)) {
        console.warn('[ticketService] ticket_handlers sync blocked by policy (remove), continuing with primary handler only', removeError);
        return { available: false, restricted: true, addedIds: [], removedIds: [], previousIds: existingIds, nextIds: normalized };
      }
      throwIfError(removeError, 'syncTicketHandlers(remove)');
    }
  }

  if (toAdd.length > 0) {
    const rows = toAdd.map((handlerId) => ({
      ticket_id: ticketId,
      handler_id: handlerId,
    }));

    const { error: addError } = await supabase
      .from('ticket_handlers')
      .insert(rows);
    if (addError) {
      if (isMissingTicketHandlersRelation(addError) || isMissingRelation(addError)) {
        markTicketHandlersRelationState(false);
        return { available: false, restricted: false, addedIds: [], removedIds: [], previousIds: existingIds, nextIds: normalized };
      }
      if (isAuthOrRlsError(addError)) {
        console.warn('[ticketService] ticket_handlers sync blocked by policy (add), continuing with primary handler only', addError);
        return { available: false, restricted: true, addedIds: [], removedIds: [], previousIds: existingIds, nextIds: normalized };
      }
      throwIfError(addError, 'syncTicketHandlers(add)');
    }
  }

  return {
    available: true,
    restricted: false,
    addedIds: toAdd,
    removedIds: toRemove,
    previousIds: existingIds,
    nextIds: normalized,
  };
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

  // Fetch workflow
  const { data: wf, error: wfError } = await supabase
    .from('workflows')
    .select('*')
    .eq('code', code)
    .single();

  throwIfError(wfError, 'getWorkflowWithStatuses(workflows)');

  // Fetch statuses from workflow_statuses table
  const { data: statusesData, error: statusError } = await supabase
    .from('workflow_statuses')
    .select('*')
    .eq('workflow_id', wf.id)
    .order('sort_order', { ascending: true });

  throwIfError(statusError, 'getWorkflowWithStatuses(workflow_statuses)');

  const workflow = toCamelCase(wf);
  const statuses = (statusesData || []).map(s => ({
    code: safeTrim(s.code),
    label: safeTrim(s.label),
    description: safeTrim(s.description) || null,
    color: safeTrim(s.color) || null,
    order: Number(s.sort_order ?? 0),
    isTerminal: Boolean(s.is_terminal),
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

const pickDefaultStatus = (statuses) => statuses?.[0] || null;

// -----------------------------
// Supabase select snippets
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

// -----------------------------
// Service
// -----------------------------
export const ticketService = {
  // ----- Read/list -----
  async getAllTickets(filters = {}) {
    const runTicketListQuery = async (query) => {
      const { data, error } = await query;
      throwIfError(error, 'getAllTickets');
      const tickets = toCamelCase(data || []);
      return decorateTicketsWithTicketHandlers(tickets);
    };

    // Filter by handler's assigned workflows first if handlerId is provided
    if (filters.handlerId && filters.handlerId !== 'all') {
      // Get handler's assigned workflows
      const { data: handlerWorkflows, error: handlerWorkflowsError } = await supabase
        .from('handler_workflows')
        .select('workflow_id')
        .eq('handler_id', filters.handlerId);

      if (handlerWorkflowsError) {
        // Common in stricter RLS setups: fallback to tickets directly assigned to this handler.
        console.warn('[ticketService] handler_workflows lookup failed, falling back to assigned tickets', handlerWorkflowsError);
        let fallback = supabase
          .from('tickets')
          .select(SELECT_TICKET_LIST)
          .eq('handler_id', filters.handlerId)
          .order('submitted_at', { ascending: false });
        if (filters.statusCode && filters.statusCode !== 'all') fallback = fallback.eq('status_code', filters.statusCode);
        if (filters.severityCode && filters.severityCode !== 'all') fallback = fallback.eq('severity_code', filters.severityCode);
        if (filters.workflowType && filters.workflowType !== 'all') fallback = fallback.eq('workflow_type', filters.workflowType);
        if (filters.dateFrom) fallback = fallback.gte('submitted_at', new Date(filters.dateFrom).toISOString());
        if (filters.dateTo) fallback = fallback.lte('submitted_at', getEndOfDayISO(filters.dateTo));
        if (filters.search) {
          const s = String(filters.search).trim();
          fallback = fallback.or(`ticket_number.ilike.%${s}%,description.ilike.%${s}%,reporter_name.ilike.%${s}%`);
        }
        return runTicketListQuery(fallback);
      }

      const workflowIds = (handlerWorkflows || []).map(hw => hw.workflow_id);

      if (workflowIds.length === 0) {
        // No workflow assignments yet: still return directly assigned tickets.
        let fallback = supabase
          .from('tickets')
          .select(SELECT_TICKET_LIST)
          .eq('handler_id', filters.handlerId)
          .order('submitted_at', { ascending: false });
        if (filters.statusCode && filters.statusCode !== 'all') fallback = fallback.eq('status_code', filters.statusCode);
        if (filters.severityCode && filters.severityCode !== 'all') fallback = fallback.eq('severity_code', filters.severityCode);
        if (filters.workflowType && filters.workflowType !== 'all') fallback = fallback.eq('workflow_type', filters.workflowType);
        if (filters.dateFrom) fallback = fallback.gte('submitted_at', new Date(filters.dateFrom).toISOString());
        if (filters.dateTo) fallback = fallback.lte('submitted_at', getEndOfDayISO(filters.dateTo));
        if (filters.search) {
          const s = String(filters.search).trim();
          fallback = fallback.or(`ticket_number.ilike.%${s}%,description.ilike.%${s}%,reporter_name.ilike.%${s}%`);
        }
        return runTicketListQuery(fallback);
      }

      // Get workflow codes from workflow IDs
      const { data: workflows, error: workflowsError } = await supabase
        .from('workflows')
        .select('code')
        .in('id', workflowIds);

      if (workflowsError) {
        throwIfError(workflowsError, 'getAllTickets(workflows)');
      }

      const workflowCodes = (workflows || []).map(w => w.code);

      if (workflowCodes.length === 0) {
        let fallback = supabase
          .from('tickets')
          .select(SELECT_TICKET_LIST)
          .eq('handler_id', filters.handlerId)
          .order('submitted_at', { ascending: false });
        if (filters.statusCode && filters.statusCode !== 'all') fallback = fallback.eq('status_code', filters.statusCode);
        if (filters.severityCode && filters.severityCode !== 'all') fallback = fallback.eq('severity_code', filters.severityCode);
        if (filters.workflowType && filters.workflowType !== 'all') fallback = fallback.eq('workflow_type', filters.workflowType);
        if (filters.dateFrom) fallback = fallback.gte('submitted_at', new Date(filters.dateFrom).toISOString());
        if (filters.dateTo) fallback = fallback.lte('submitted_at', getEndOfDayISO(filters.dateTo));
        if (filters.search) {
          const s = String(filters.search).trim();
          fallback = fallback.or(`ticket_number.ilike.%${s}%,description.ilike.%${s}%,reporter_name.ilike.%${s}%`);
        }
        return runTicketListQuery(fallback);
      }

      // Build query with workflow filter
      let q = supabase.from('tickets').select(SELECT_TICKET_LIST).order('submitted_at', { ascending: false });
      q = q.in('workflow_type', workflowCodes);

      if (filters.statusCode && filters.statusCode !== 'all') q = q.eq('status_code', filters.statusCode);
      if (filters.severityCode && filters.severityCode !== 'all') q = q.eq('severity_code', filters.severityCode);
      if (filters.workflowType && filters.workflowType !== 'all') q = q.eq('workflow_type', filters.workflowType);

      if (filters.dateFrom) q = q.gte('submitted_at', new Date(filters.dateFrom).toISOString());
      if (filters.dateTo) q = q.lte('submitted_at', getEndOfDayISO(filters.dateTo));

      if (filters.search) {
        const s = String(filters.search).trim();
        q = q.or(`ticket_number.ilike.%${s}%,description.ilike.%${s}%,reporter_name.ilike.%${s}%`);
      }

      return runTicketListQuery(q);
    }

    // Normal flow without handler filter
    let q = supabase.from('tickets').select(SELECT_TICKET_LIST).order('submitted_at', { ascending: false });

    if (filters.statusCode && filters.statusCode !== 'all') q = q.eq('status_code', filters.statusCode);
    if (filters.severityCode && filters.severityCode !== 'all') q = q.eq('severity_code', filters.severityCode);
    if (filters.workflowType && filters.workflowType !== 'all') q = q.eq('workflow_type', filters.workflowType);

    if (filters.dateFrom) q = q.gte('submitted_at', new Date(filters.dateFrom).toISOString());
    if (filters.dateTo) q = q.lte('submitted_at', getEndOfDayISO(filters.dateTo));

    if (filters.search && String(filters.search).trim() !== '') {
      const s = String(filters.search).trim();
      q = q.or(`ticket_number.ilike.%${s}%,description.ilike.%${s}%`);
    }

    return runTicketListQuery(q);
  },

  async getTicketById(ticketId, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');

    const { data, error } = await supabase.from('tickets').select(SELECT_TICKET_FULL).eq('id', ticketId).single();
    throwIfError(error, 'getTicketById');

    // If handlerId is provided, verify access
    if (options.handlerId) {
      const ticket = toCamelCase(data);

      // Get handler's assigned workflows
      const { data: handlerWorkflows } = await supabase
        .from('handler_workflows')
        .select('workflow_id')
        .eq('handler_id', options.handlerId);

      const workflowIds = (handlerWorkflows || []).map(hw => hw.workflow_id);

      if (workflowIds.length === 0) {
        throw new Error('Access denied: Handler has no workflow assignments');
      }

      // Get workflow codes
      const { data: workflows } = await supabase
        .from('workflows')
        .select('code')
        .in('id', workflowIds);

      const workflowCodes = (workflows || []).map(w => w.code);

      // Check if ticket's workflow is in handler's assigned workflows
      if (!workflowCodes.includes(ticket.workflowType)) {
        throw new Error('Access denied: Ticket workflow not assigned to handler');
      }
    }

    const ticket = toCamelCase(data);
    const withHandlers = await decorateTicketWithTicketHandlers(ticket);
    return attachSignedUrlsToTicket(withHandlers);
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
      throw new Error(json?.message || 'Ongeldige ticket-ID of toegangscode');
    }

    return toCamelCase(json.data);
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
      throw new Error(json?.message || 'Failed to send reporter message');
    }

    const message = toCamelCase(json?.data?.message || null);
    const updatedTicket = toCamelCase(json?.data?.ticket || null);
    return { message, ticket: updatedTicket };
  },

  // ----- Create -----
  async createTicket(ticketData) {
    if (!ticketData?.description) throw new Error('description is required');
    if (!ticketData?.severity) throw new Error('severity is required');
    if (!ticketData?.reporterEmail) throw new Error('reporterEmail is required');

    const workflowType = safeTrim(ticketData?.workflowType);
    if (!workflowType) throw new Error('workflowType is required');

    const { statuses } = await getWorkflowWithStatuses(workflowType);
    const def = pickDefaultStatus(statuses);
    if (!def) throw new Error(`No statuses configured for workflow: ${workflowType}`);

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    const ticketNumber = `NZ-${year}-${String(randomNum).padStart(6, '0')}`;

    const accessCode = String(Math.floor(100000 + Math.random() * 900000)).padStart(6, '0');

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
      severity_code: ticketData.severity,
      reporter_email: ticketData.reporterEmail || null,
      reporter_name: ticketData.reporterName || null,
      reporter_phone: ticketData.reporterPhone || null,
      email_notify: !!ticketData.emailNotify,
      status_email_notify:
        ticketData.statusEmailNotify === undefined ? true : !!ticketData.statusEmailNotify,

      // DB-driven initial state
      status_code: def.code,
      current_stage: def.stage || def.code,
      next_step_due: nextStepDueAt,

      // Optional: keep UI label stored in metadata (since there is NO status_label column)
      metadata: {
        ...(ticketData.metadata || {}),
        status_label: def.label,
        reporter_language: reporterLanguage || null,
        ...(ticketData?.isAnonymous ? {} : { reporter_meta_client: getClientMeta() }),
      },

      // Optional: update enum only if DB config provides it
      ...(def.enumLabel ? { status: def.enumLabel } : {}),
    };

    const resp = await fetch('/api/tickets.api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        is_anonymous: !!ticketData?.isAnonymous
      })
    });
    const json = await resp.json();
    if (!resp.ok || !json?.success) {
      throw new Error(json?.message || 'Failed to create ticket');
    }

    const createdTicket = toCamelCase(json?.data);

    // Send confirmation email to reporter (async, don't wait)
    if (createdTicket.emailNotify && (createdTicket.reporterEmail || createdTicket.reporterEmailEncrypted)) {
      notificationService.notifyReporterTicketCreated(createdTicket)
        .catch(err => console.error('Failed to send ticket creation email:', err));
    }

    // Notify all active handlers that can access this workflow.
    notificationService.notifyHandlersNewReport(createdTicket)
      .catch(err => console.error('Failed to send workflow handler new-report emails:', err));

    return createdTicket;
  },

  // ----- Status updates (DB-driven) -----
  async updateTicketProgress(ticketId, payload = {}) {
    if (!ticketId) throw new Error('ticketId is required');

    // Fetch workflow_type if not provided
    let workflowType = safeTrim(payload.workflowType);
    if (!workflowType) {
      const { data, error } = await supabase
        .from('tickets')
        .select('workflow_type')
        .eq('id', ticketId)
        .single();

      throwIfError(error, 'updateTicketProgress(fetch workflow_type)');
      workflowType = safeTrim(data?.workflow_type);
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
    const { data: cur, error: curErr } = await supabase
      .from('tickets')
      .select('metadata, status_code, handler_id')
      .eq('id', ticketId)
      .single();
    throwIfError(curErr, 'updateTicketProgress(fetch metadata)');

    let hasAssignedHandler = Boolean(cur?.handler_id);
    if (!hasAssignedHandler && shouldProbeTicketHandlersRelation()) {
      const { count: linkedHandlersCount, error: linkedHandlersError } = await supabase
        .from('ticket_handlers')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', ticketId);

      if (!linkedHandlersError) {
        markTicketHandlersRelationState(true);
        hasAssignedHandler = Number(linkedHandlersCount || 0) > 0;
      } else if (!isMissingTicketHandlersRelation(linkedHandlersError)) {
        throwIfError(linkedHandlersError, 'updateTicketProgress(check ticket_handlers)');
      } else {
        markTicketHandlersRelationState(false);
      }
    }

    if (!hasAssignedHandler) {
      const e = new Error('Wijs eerst een handler toe voordat de status kan worden aangepast.');
      e.code = 'ASSIGNMENT_REQUIRED_FOR_STATUS_CHANGE';
      throw e;
    }

    // Get old status label for notification
    const oldStatusObj = findStatusByCodeOrLabel(statuses, cur?.status_code);
    const oldStatusLabel = oldStatusObj?.label || cur?.status_code || 'Unknown';

    const existingFirstResponseAt =
      cur?.metadata?.first_response_at ||
      cur?.metadata?.firstResponseAt ||
      null;
    const shouldStampFirstResponseAt =
      !existingFirstResponseAt &&
      isReceiptConfirmationStatus(resolved?.code, resolved?.label);

    update.metadata = {
      ...(cur?.metadata || {}),
      status_label: resolved.label,
      workflow_status_code: resolved.code,
      status_contact_person_name: resolved?.contactPersonName || null,
      status_contact_person_email: resolved?.contactPersonEmail || null,
      status_contact_person_phone: resolved?.contactPersonPhone || null,
      status_contact_notes: resolved?.contactNotes || null,
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
    if (note) {
      const { error: actionError } = await supabase.from('ticket_actions').insert({
        ticket_id: ticketId,
        action_type: 'status_update',
        action: `Status changed to ${resolved.label}`,
        description: note,
        created_at: nowIso,
      });
      if (actionError) console.warn('Ticket updated but failed to insert ticket_actions:', actionError);
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

  // If email changes, precheck duplicates (excluding current)
  if (payload.email) {
    const { data: existing, error: exErr } = await supabase
      .from('handlers')
      .select('id')
      .eq('email', payload.email)
      .neq('id', handlerId)
      .maybeSingle();

    throwIfError(exErr, 'updateHandler(precheck email)');
    if (existing?.id) {
      const e = new Error('Er bestaat al een gebruiker met dit e-mailadres.');
      e.code = 'DUPLICATE_EMAIL';
      throw e;
    }
  }

  const { data, error } = await supabase
    .from('handlers')
    .update(payload)
    .eq('id', handlerId)
    .select('*')
    .single();

  if (error) friendlyHandlerError(error, 'updateHandler');

  // Sync roles to new RBAC system if roles were updated
  if (data?.id && payload.roles) {
    try {
      // Get role IDs from role codes
      const { data: roleRecords } = await supabase
        .from('roles')
        .select('id, code')
        .in('code', payload.roles);

      if (roleRecords) {
        // Delete existing handler_roles
        await supabase
          .from('handler_roles')
          .delete()
          .eq('handler_id', handlerId);

        // Insert new handler_roles
        if (roleRecords.length > 0) {
          const handlerRoles = roleRecords.map(role => ({
            handler_id: handlerId,
            role_id: role.id
          }));

          await supabase
            .from('handler_roles')
            .insert(handlerRoles)
            .select();
        }
      }
    } catch (err) {
      console.error('Error syncing roles to RBAC system:', err);
      // Continue even if RBAC sync fails
    }
  }

  return normalizeHandlerRecord(toCamelCase(data));
},

  // Optional but usually handy:

async createHandler(handlerData = {}) {
  if (!handlerData?.name) throw new Error('name is required');
  if (!handlerData?.email) throw new Error('email is required');

  const email = normalizeEmail(handlerData.email);

  // Optional: fast pre-check (gives a nicer UX before insert)
  const { data: existing, error: exErr } = await supabase
    .from('handlers')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  throwIfError(exErr, 'createHandler(precheck)');

  if (existing?.id) {
    const e = new Error('Er bestaat al een gebruiker met dit e-mailadres.');
    e.code = 'DUPLICATE_EMAIL';
    throw e;
  }

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

  const { data, error } = await supabase
    .from('handlers')
    .insert(payload)
    .select('*')
    .single();

  if (error) friendlyHandlerError(error, 'createHandler');

  // Sync roles to new RBAC system
  if (data?.id && roles?.length > 0) {
    try {
      // Get role IDs from role codes
      const { data: roleRecords } = await supabase
        .from('roles')
        .select('id, code')
        .in('code', roles);

      if (roleRecords && roleRecords.length > 0) {
        const handlerRoles = roleRecords.map(role => ({
          handler_id: data.id,
          role_id: role.id
        }));

        await supabase
          .from('handler_roles')
          .insert(handlerRoles)
          .select();
      }
    } catch (err) {
      console.error('Error syncing roles to RBAC system:', err);
      // Continue even if RBAC sync fails
    }
  }

  return normalizeHandlerRecord(toCamelCase(data));
},

async deleteHandler(handlerId, options = {}) {
  if (!handlerId) throw new Error('handlerId is required');

  const { hard = false, forceDetach = false } = options;

  if (hard) {
    try {
      const nowIso = new Date().toISOString();
      const assignedTickets = await getAssignedTicketCount(handlerId);
      let autoUnassignedTickets = 0;

      if (forceDetach) {
        // Best-effort detach of known relations before deleting handler.
        const detachResult = await detachHandlerReferences(handlerId, nowIso);
        autoUnassignedTickets = Number(detachResult?.stats?.autoUnassignedTickets || 0);

        if (detachResult?.warnings?.length > 0) {
          console.warn('[ticketService] Detach warnings before handler delete:', detachResult.warnings);
        }
      }

      let { error: deleteError } = await supabase.from('handlers').delete().eq('id', handlerId);

      // Retry once after another detach pass for strict FK environments.
      if (deleteError && isForeignKeyViolation(deleteError) && forceDetach) {
        const retryResult = await detachHandlerReferences(handlerId, nowIso);
        autoUnassignedTickets = Math.max(
          autoUnassignedTickets,
          Number(retryResult?.stats?.autoUnassignedTickets || 0)
        );
        if (retryResult?.warnings?.length > 0) {
          console.warn('[ticketService] Detach warnings on retry before handler delete:', retryResult.warnings);
        }
        const retry = await supabase.from('handlers').delete().eq('id', handlerId);
        deleteError = retry.error;
      }

      if (deleteError && isForeignKeyViolation(deleteError) && !forceDetach) {
        const e = new Error('Deze gebruiker heeft nog gekoppelde gegevens. Gebruik "Opnieuw proberen met auto-ontkoppelen".');
        e.code = 'FK_HAS_RELATIONS';
        e.assignedTickets = assignedTickets;
        e.original = deleteError;
        throw e;
      }

      if (deleteError) throw deleteError;

      return {
        success: true,
        mode: 'hard',
        forceDetachApplied: Boolean(forceDetach),
        autoUnassignedTickets: forceDetach ? autoUnassignedTickets : 0,
      };
    } catch (error) {
      if (error?.code === 'FK_HAS_RELATIONS') {
        throw error;
      }
      if (isForeignKeyViolation(error)) {
        const e = new Error('Verwijderen mislukt: er zijn nog gekoppelde gegevens. Probeer opnieuw met auto-ontkoppelen.');
        e.code = 'FK_HAS_RELATIONS';
        e.assignedTickets = Number(error?.assignedTickets || 0);
        e.original = error;
        throw e;
      }
      friendlyHandlerError(error, 'deleteHandler(hard)');
    }
  }

  // Soft delete default: set inactive
  const { data, error } = await supabase
    .from('handlers')
    .update({ active: false })
    .eq('id', handlerId)
    .select('id, active')
    .single();

  if (error) friendlyHandlerError(error, 'deleteHandler(soft)');
  return { success: true, mode: 'soft', handler: toCamelCase(data) };
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
    const normalizedHandlerIds = normalizeHandlerIds(handlerIds);
    const trustedHandlerIds = new Set(normalizeHandlerIds(options?.currentHandlerId));
    const primaryHandlerId = normalizedHandlerIds[0] || null;
    const handlerMap = new Map();
    let ticketBefore = null;
    const { data: ticketBeforeData, error: ticketBeforeError } = await supabase
      .from('tickets')
      .select('handler_id')
      .eq('id', ticketId)
      .maybeSingle();
    if (ticketBeforeError) {
      if (isAuthOrRlsError(ticketBeforeError)) {
        console.warn('[ticketService] Could not read current ticket assignment due to policy, continuing', ticketBeforeError);
      } else {
        throwIfError(ticketBeforeError, 'setTicketHandlers(fetch current ticket)');
      }
    } else {
      if (!ticketBeforeData) {
        if (ticketTokenProvider) {
          // In strict RLS setups a visible ticket can still resolve as no row in direct client queries.
          console.warn('[ticketService] Ticket lookup returned 0 rows during assignment; continuing via API update path');
        } else {
          const e = new Error('Ticket bestaat niet meer.');
          e.code = 'TICKET_NOT_FOUND';
          throw e;
        }
      }
      ticketBefore = ticketBeforeData;
    }

    if (normalizedHandlerIds.length > 0) {
      let handlers = [];
      try {
        handlers = await loadHandlersByIdsWithFallback(normalizedHandlerIds);
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

    const syncResult = await syncTicketHandlers(ticketId, normalizedHandlerIds);
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

    const updatedTicket = await this.updateTicket(ticketId, { handlerId: primaryHandlerId });

    // Get handler info for logging
    let handlerInfo = null;
    if (options.currentHandlerId) {
      const { data: handler, error: handlerInfoError } = await supabase
        .from('handlers')
        .select('id, name, email')
        .eq('id', options.currentHandlerId)
        .maybeSingle();
      if (handlerInfoError) {
        if (isAuthOrRlsError(handlerInfoError)) {
          console.warn('[ticketService] Could not read current handler info due to policy, continuing', handlerInfoError);
        } else {
          console.warn('[ticketService] Failed to read current handler info for assignment log, continuing', handlerInfoError);
        }
      } else {
        handlerInfo = handler;
      }
    }

    // Log assignment action
    const trimmed = note ? String(note).trim() : '';
    if (trimmed) {
      const { error: actionError } = await supabase.from('ticket_actions').insert({
        ticket_id: ticketId,
        action_type: 'assignment',
        action: 'Handler Assigned',
        description: trimmed,
        handler_id: handlerInfo?.id || null,
        handler_name: handlerInfo?.name || null,
        handler_email: handlerInfo?.email || null,
        performed_by: handlerInfo?.name || 'System',
        created_at: nowIso,
      });
      if (actionError) console.warn('setTicketHandlers: failed to write ticket_actions note:', actionError);
    }

    let result = toCamelCase(updatedTicket);
    result = await decorateTicketWithTicketHandlers(result);

    // Send assignment notification only to newly added handlers.
    const addedHandlerIds = syncResult.available
      ? syncResult.addedIds
      : primaryHandlerId
        ? [primaryHandlerId]
        : [];
    if (addedHandlerIds.length > 0) {
      for (const assignedId of addedHandlerIds) {
        const assignedHandler = handlerMap.get(assignedId);
        if (!assignedHandler) continue;
        notificationService.notifyHandlerAssignment(result, assignedHandler)
          .catch(err => console.error('Failed to send handler assignment notification:', err));
      }
    }

    const hadAnyAssignmentBefore = syncResult.available
      ? (syncResult.previousIds || []).length > 0 || Boolean(ticketBefore?.handler_id)
      : Boolean(ticketBefore?.handler_id);
    const hasAnyAssignmentNow = normalizedHandlerIds.length > 0;
    const firstAssignment = !hadAnyAssignmentBefore && hasAnyAssignmentNow;

    if (firstAssignment) {
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

  // ----- Comments & messages -----
  async addComment(ticketId, comment, authorName, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!comment || !String(comment).trim()) throw new Error('comment is required');

    const trimmedComment = String(comment).trim();
    if (ticketTokenProvider) {
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

      const { data: ticket } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticket) {
        const isInternal = true;
        notificationService.notifyComment(
          toCamelCase(ticket),
          trimmedComment,
          performedBy,
          isInternal
        ).catch(err => console.error('Failed to send comment notification:', err));
      }

      return result;
    }

    // Get handler info for logging
    let handlerInfo = null;
    if (options.currentHandlerId) {
      const { data: handler } = await supabase
        .from('handlers')
        .select('id, name, email')
        .eq('id', options.currentHandlerId)
        .single();
      handlerInfo = handler;
    }

    const { data, error } = await supabase
      .from('ticket_comments')
      .insert({ ticket_id: ticketId, comment: trimmedComment, author_name: handlerInfo?.name || authorName || null })
      .select()
      .single();

    throwIfError(error, 'addComment');

    // Log action
    const { error: actionError } = await supabase.from('ticket_actions').insert({
      ticket_id: ticketId,
      action_type: 'note_added',
      action: 'Note Added',
      description: `Added investigation note: ${String(comment).substring(0, 100)}...`,
      handler_id: handlerInfo?.id || null,
      handler_name: handlerInfo?.name || authorName,
      handler_email: handlerInfo?.email || null,
      performed_by: handlerInfo?.name || authorName || 'System',
    });
    if (actionError) console.error('Error logging action:', actionError);

    const result = toCamelCase(data);

    // Send comment notification
    // Fetch ticket info for notifications
    const { data: ticket } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticket) {
      const isInternal = true; // Comments are typically internal/handler-only notes
      notificationService.notifyComment(
        toCamelCase(ticket),
        trimmedComment,
        handlerInfo?.name || authorName || 'System',
        isInternal
      ).catch(err => console.error('Failed to send comment notification:', err));
    }

    return result;
  },

  async addMessage(ticketId, sender, body, isInternal = false, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!sender) throw new Error('sender is required');
    if (!body || !String(body).trim()) throw new Error('body is required');

    const trimmedBody = String(body).trim();
    const senderKey = String(sender || '').toLowerCase();
    const isHandlerSender = senderKey === 'handler';
    const discloseHandlerIdentity = options?.discloseHandlerIdentity === true;

    if (ticketTokenProvider) {
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

      const { data: ticket } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticket) {
        notificationService.notifyMessage(
          toCamelCase(ticket),
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
    }

    // Get handler info for logging
    let handlerInfo = null;
    if (options.currentHandlerId) {
      const { data: handler } = await supabase
        .from('handlers')
        .select('id, name, email')
        .eq('id', options.currentHandlerId)
        .single();
      handlerInfo = handler;
    }

    const handlerNameForReporter = isHandlerSender && discloseHandlerIdentity
      ? (handlerInfo?.name || null)
      : null;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        sender,
        body: trimmedBody,
        is_internal: !!isInternal,
        handler_id: handlerInfo?.id || null,
        handler_name: handlerNameForReporter
      })
      .select()
      .single();

    throwIfError(error, 'addMessage');

    // Log action
    const { error: actionError } = await supabase.from('ticket_actions').insert({
      ticket_id: ticketId,
      action_type: 'message_sent',
      action: 'Message Sent',
      description: `Sent message: ${String(body).substring(0, 100)}...`,
      handler_id: handlerInfo?.id || null,
      handler_name: handlerInfo?.name || null,
      handler_email: handlerInfo?.email || null,
      performed_by: handlerInfo?.name || sender,
    });
    if (actionError) console.error('Error logging action:', actionError);

    const result = toCamelCase(data);

    // Send message notification
    // Fetch ticket info for notifications
    const { data: ticket } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticket) {
      notificationService.notifyMessage(
        toCamelCase(ticket),
        sender,
        trimmedBody,
        isInternal,
        {
          discloseHandlerIdentity,
          senderName: handlerNameForReporter,
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
    const preferApi = options.preferApi === true;

    let rows = [];
    let directError = null;
    let usedApiFallback = false;

    if (preferApi && ticketTokenProvider) {
      try {
        const apiData = await workflowApiGet(
          'all_handlers',
          { include_inactive: includeInactive ? '1' : '0' },
          { requireAuth: true }
        );
        const apiRows = Array.isArray(apiData?.rows) ? apiData.rows : [];
        rows = apiRows;
        usedApiFallback = true;
      } catch (apiErr) {
        console.warn('[ticketService] API-first load for getAllHandlers failed; trying direct Supabase query', apiErr);
      }
    }

    if (rows.length === 0) {
      try {
        let query = supabase.from('handlers').select('*').order('name');
        if (!includeInactive) query = query.eq('active', true);
        const { data, error } = await query;
        throwIfError(error, 'getAllHandlers');
        rows = Array.isArray(data) ? data : [];
      } catch (err) {
        directError = err;
      }
    }

    const shouldTryApiFallback =
      Boolean(ticketTokenProvider) &&
      (directError || rows.length === 0);

    if (shouldTryApiFallback) {
      try {
        const apiData = await workflowApiGet(
          'all_handlers',
          { include_inactive: includeInactive ? '1' : '0' },
          { requireAuth: true }
        );
        const apiRows = Array.isArray(apiData?.rows) ? apiData.rows : [];
        if (apiRows.length > 0 || rows.length === 0) {
          rows = apiRows;
          usedApiFallback = true;
          directError = null;
        }
      } catch (apiErr) {
        if (directError) {
          throwIfError(directError, 'getAllHandlers');
        }
        console.warn('[ticketService] API fallback for getAllHandlers failed; using direct query result', apiErr);
      }
    }

    if (directError && rows.length === 0) {
      throwIfError(directError, 'getAllHandlers');
    }

    // Enrich handlers with permissions from new RBAC system.
    // Skip enrichment when using API fallback in policy-restricted setups to avoid noisy RPC failures.
    const handlers = normalizeHandlerRecords(toCamelCase(rows) || []);
    const shouldEnrichPermissions =
      options.enrichPermissions !== false &&
      !usedApiFallback;

    if (!shouldEnrichPermissions || handlers.length === 0) {
      return handlers;
    }

    const enrichedHandlers = await Promise.all(
      handlers.map(async (handler) => {
        try {
          const { data: permsData } = await supabase
            .rpc('get_handler_permissions', { handler_uuid: handler.id });

          const permissionsObj = {};
          (permsData || []).forEach((perm) => {
            permissionsObj[perm.permission_code] = true;
          });

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

    const { data, error } = await supabase
      .from('handlers')
      .select('*')
      .eq('id', handlerId)
      .single();

    throwIfError(error, 'getHandlerById');
    return normalizeHandlerRecord(toCamelCase(data));
  },

  async getWorkflows(includeInactive = false) {
    let query = supabase.from('workflows').select('*');
    if (!includeInactive) query = query.eq('active', true);

    const { data, error } = await query.order('display_order');
    throwIfError(error, 'getWorkflows');
    return toCamelCase(data);
  },

  async getSeverities() {
    const { data, error } = await supabase.from('incident_severities').select('*').order('sort_order');
    throwIfError(error, 'getSeverities');
    return toCamelCase(data);
  },

  async getWorkflowStatuses(workflowCode) {
    const { workflow, statuses } = await getWorkflowWithStatuses(workflowCode);
    return { workflow, statuses };
  },

  // ----- Attachments -----
  async createAttachmentRecord(ticketId, fileMeta) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!fileMeta?.name) throw new Error('fileMeta.name is required');

    const { data, error } = await supabase
      .from('attachments')
      .insert({
        ticket_id: ticketId,
        file_name: fileMeta.name,
        file_url: fileMeta.url || '#',
        mime_type: fileMeta.type || 'application/octet-stream',
        size_bytes: fileMeta.size || null,
        is_internal: !!fileMeta.isInternal,
        note_id: fileMeta.noteId || null,
      })
      .select()
      .single();

    throwIfError(error, 'createAttachmentRecord');
    return toCamelCase(data);
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
    } = options;

    if (!ticketId) throw new Error('ticketId is required');
    if (!file) throw new Error('file is required');

    // Get handler info for logging
    let handlerInfo = null;
    if (currentHandlerId) {
      const { data: handler } = await supabase
        .from('handlers')
        .select('id, name, email')
        .eq('id', currentHandlerId)
        .single();
      handlerInfo = handler;
    }

    const originalName = String(file.name || 'file');
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');

    const uid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const path = `${ticketId}/${uid}_${safeName}`;

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: !!upsert,
      contentType: file.type || 'application/octet-stream',
    });
    throwIfError(uploadError, 'uploadAttachment(upload)');

    let fileUrl = path;
    if (makePublicUrl) {
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      if (pub?.publicUrl) fileUrl = pub.publicUrl;
    }

    const attachment = await this.createAttachmentRecord(ticketId, {
      name: originalName,
      url: fileUrl,
      type: file.type,
      size: file.size,
      isInternal,
      noteId,
    });
    const signedUrl = await createSignedAttachmentUrl(fileUrl, bucket, 600);
    const attachmentWithUrl = signedUrl
      ? { ...attachment, fileUrl: signedUrl, file_url: signedUrl, url: signedUrl }
      : attachment;

    // Log action
    const { error: actionError } = await supabase.from('ticket_actions').insert({
      ticket_id: ticketId,
      action_type: 'attachment_added',
      action: 'Attachment Added',
      description: `Uploaded file: ${originalName}`,
      handler_id: handlerInfo?.id || null,
      handler_name: handlerInfo?.name || null,
      handler_email: handlerInfo?.email || null,
      performed_by: handlerInfo?.name || 'System',
    });
    if (actionError) console.error('Error logging action:', actionError);

    if (notifyReporter && !isInternal) {
      try {
        const { data: ticket } = await supabase
          .from('tickets')
          .select('*')
          .eq('id', ticketId)
          .single();
        if (ticket) {
          notificationService.notifyAttachmentAdded(
            toCamelCase(ticket),
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

    // Get handler info for logging
    let handlerInfo = null;
    if (currentHandlerId) {
      const { data: handler } = await supabase
        .from('handlers')
        .select('id, name, email')
        .eq('id', currentHandlerId)
        .single();
      handlerInfo = handler;
    }

    const { error: actionError } = await supabase.from('ticket_actions').insert({
      ticket_id: ticketId,
      action_type: actionType,
      action: action,
      description: description,
      handler_id: handlerInfo?.id || null,
      handler_name: handlerInfo?.name || null,
      handler_email: handlerInfo?.email || null,
      performed_by: handlerInfo?.name || 'System',
    });

    if (actionError) {
      console.error('Error logging action:', actionError);
    }

    return !actionError;
  },

  // ----- Utilities exposed -----
  setTokenProvider,
  toCamelCase,
  toSnakeCase,
};

// src/services/workflowService.js

// -----------------------------
// Helpers
// -----------------------------
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

const throwIfError = (error, context = '') => {
  if (!error) return;
  const msg = context ? `${context}: ${error.message || error}` : (error.message || String(error));
  const e = new Error(msg);
  e.original = error;
  throw e;
};

const safeTrim = (v) => String(v ?? '').trim();
const WORKFLOW_API_URL = '/api/workflows.api.php';
const CATALOG_API_URL = '/api/catalog.api.php';
let workflowTokenProvider = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isAuthStatus = (status) => status === 401 || status === 403;

const setTokenProvider = (provider) => {
  workflowTokenProvider = typeof provider === 'function' ? provider : null;
};

const getAuthHeaders = async (options = {}) => {
  if (!workflowTokenProvider) return {};
  try {
    const token = await workflowTokenProvider(options);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const getAdminAuthHeaders = async () => {
  let headers = await getAuthHeaders();
  if (headers.Authorization) return headers;

  await wait(75);
  headers = await getAuthHeaders();
  if (headers.Authorization) return headers;

  await wait(150);
  return getAuthHeaders({ forceRefresh: true });
};

const parseJsonResponse = async (response) => response.json().catch(() => null);

const apiGet = async (action, params = {}, { requireAdmin = false } = {}) => {
  let headers = requireAdmin ? await getAdminAuthHeaders() : await getAuthHeaders();
  if (requireAdmin && !headers.Authorization) {
    throw new Error('Admin session unavailable. Please sign in again.');
  }
  const urlParams = new URLSearchParams({ action, ...params });
  const url = `${WORKFLOW_API_URL}?${urlParams.toString()}`;
  let response = await fetch(url, {
    method: 'GET',
    headers,
  });
  let json = await parseJsonResponse(response);

  if (requireAdmin && isAuthStatus(response.status)) {
    const retryHeaders = await getAuthHeaders({ forceRefresh: true });
    if (retryHeaders.Authorization) {
      headers = retryHeaders;
      response = await fetch(url, {
        method: 'GET',
        headers,
      });
      json = await parseJsonResponse(response);
    }
  }

  if (!response.ok || !json?.success) {
    const message = json?.message || `Workflows API error (${response.status})`;
    if (requireAdmin && (!headers.Authorization || isAuthStatus(response.status))) {
      throw new Error(`Admin session unavailable: ${message}`);
    }
    throw new Error(message);
  }
  return json?.data;
};

const apiPost = async (action, payload = {}, { requireAdmin = true } = {}) => {
  let headers = requireAdmin ? await getAdminAuthHeaders() : await getAuthHeaders();
  if (requireAdmin && !headers.Authorization) {
    throw new Error('Admin session unavailable. Please sign in again.');
  }

  const requestOptions = (requestHeaders) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...requestHeaders,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  let response = await fetch(WORKFLOW_API_URL, requestOptions(headers));
  let json = await parseJsonResponse(response);

  if (requireAdmin && isAuthStatus(response.status)) {
    const retryHeaders = await getAuthHeaders({ forceRefresh: true });
    if (retryHeaders.Authorization) {
      headers = retryHeaders;
      response = await fetch(WORKFLOW_API_URL, requestOptions(headers));
      json = await parseJsonResponse(response);
    }
  }

  if (!response.ok || !json?.success) {
    const message = json?.message || `Workflows API error (${response.status})`;
    if (requireAdmin && (!headers.Authorization || isAuthStatus(response.status))) {
      throw new Error(`Admin session unavailable: ${message}`);
    }
    throw new Error(message);
  }
  return json?.data;
};

const catalogGet = async (action, params = {}) => {
  const urlParams = new URLSearchParams({ action, ...params });
  const response = await fetch(`${CATALOG_API_URL}?${urlParams.toString()}`, {
    method: 'GET',
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const message = json?.message || `Catalog API error (${response.status})`;
    throw new Error(message);
  }
  return json?.data;
};

// -----------------------------
// Small cache (optional)
// -----------------------------
const cache = {
  statusesByWorkflowId: new Map(), // workflowId -> { statuses, ts }
};
const TTL_MS = 30_000;

function invalidateWorkflowStatusesCache(workflowId) {
  if (!workflowId) return;
  cache.statusesByWorkflowId.delete(String(workflowId));
}

// -----------------------------
// Workflow service
// -----------------------------
export const workflowService = {
  // ----- Workflows -----

  /**
   * Returns workflows with status count, ticket count, and handler count (for UI badges).
   * Admin read via backend API.
   */
  async getWorkflowsWithStats() {
    const data = await apiGet('list_with_stats', {}, { requireAdmin: true });

    const rows = (data?.rows || []).map((w) => {
      const statusCount = w?.workflow_statuses?.[0]?.count ?? 0;
      const ticketCount = w?.tickets?.[0]?.count ?? 0;
      const handlerCount = w?.handler_workflows?.[0]?.count ?? 0;

      const clean = { ...w };
      delete clean.workflow_statuses;
      delete clean.tickets;
      delete clean.handler_workflows;

      return {
        ...clean,
        status_count: statusCount,
        statusCount,
        ticket_count: ticketCount,
        ticketCount,
        handler_count: handlerCount,
        handlerCount
      };
    });

    return toCamelCase(rows);
  },

  async getWorkflows(includeInactive = true) {
    const data = await catalogGet('workflows', {
      include_inactive: includeInactive ? '1' : '0',
    });
    return toCamelCase(data?.rows || []);
  },

  async getWorkflowById(id) {
    if (!id) throw new Error('workflow id is required');
    const data = await catalogGet('workflow_by_id', { id });
    return toCamelCase(data?.row || null);
  },

  async getWorkflowByCode(code) {
    const c = safeTrim(code);
    if (!c) return null;
    try {
      const data = await catalogGet('workflow_by_code', { code: c });
      return toCamelCase(data?.row || null);
    } catch (error) {
      if (String(error?.message || '').toLowerCase().includes('not found')) {
        return null;
      }
      throw error;
    }
  },

  async createWorkflow(payload) {
    const data = await apiPost('create_workflow', { payload: toSnakeCase(payload) });
    return toCamelCase(data?.row);
  },

  async updateWorkflow(id, patch) {
    if (!id) throw new Error('workflow id is required');

    const data = await apiPost('update_workflow', { id, patch: toSnakeCase(patch) });
    return toCamelCase(data?.row);
  },

  async toggleWorkflowStatus(id, active) {
    if (!id) throw new Error('workflow id is required');

    const data = await apiPost('toggle_workflow_status', { id, active: !!active });
    return toCamelCase(data?.row);
  },

  async deleteWorkflowForce(id) {
    if (!id) throw new Error('workflow id is required');
    await apiPost('delete_workflow_force', { id });
    invalidateWorkflowStatusesCache(id);
    return true;
  },

  // ----- Workflow Statuses (DB-driven table public.workflow_statuses) -----

  async getWorkflowStatuses(workflowId, { useCache = true } = {}) {
    const id = safeTrim(workflowId);
    if (!id) return [];

    const now = Date.now();
    const cached = cache.statusesByWorkflowId.get(id);
    if (useCache && cached && now - cached.ts < TTL_MS) return cached.statuses;

    const data = await catalogGet('workflow_statuses', { workflow_id: id });
    const statuses = toCamelCase(data?.rows || []);
    cache.statusesByWorkflowId.set(id, { statuses, ts: now });
    return statuses;
  },

  async getWorkflowStatusesAdmin(workflowId) {
    const id = safeTrim(workflowId);
    if (!id) return [];
    const data = await apiGet('status_list', { workflow_id: id }, { requireAdmin: true });
    const statuses = toCamelCase(data?.rows || []);
    cache.statusesByWorkflowId.set(id, { statuses, ts: Date.now() });
    return statuses;
  },

  async saveWorkflowStatuses(workflowId, statuses = [], deleteIds = []) {
    const id = safeTrim(workflowId);
    if (!id) throw new Error('workflowId is required');

    const rows = (statuses || []).map((s, i) => ({
      id: safeTrim(s.id) || null,
      code: safeTrim(s.code),
      label: safeTrim(s.label),
      description: safeTrim(s.description) || null,
      color: safeTrim(s.color) || null,
      sort_order: Number(s.sortOrder ?? s.sort_order ?? i),
      is_terminal: Boolean(s.isTerminal ?? s.is_terminal ?? false),
      is_first_response: Boolean(s.isFirstResponse ?? s.is_first_response ?? false),
      next_codes: Array.isArray(s.nextCodes ?? s.next_codes) ? (s.nextCodes ?? s.next_codes) : [],
      expected_duration_days: s.expectedDurationDays ?? s.expected_duration_days ?? null,
      contact_person_name: safeTrim(s.contactPersonName ?? s.contact_person_name) || null,
      contact_person_email: safeTrim(s.contactPersonEmail ?? s.contact_person_email) || null,
      contact_person_phone: safeTrim(s.contactPersonPhone ?? s.contact_person_phone) || null,
      contact_notes: safeTrim(s.contactNotes ?? s.contact_notes) || null,
    }));

    const data = await apiPost('save_statuses', {
      workflow_id: id,
      statuses: rows,
      delete_ids: (deleteIds || []).map((x) => safeTrim(x)).filter(Boolean),
    });

    const persisted = toCamelCase(data?.rows || []);
    cache.statusesByWorkflowId.set(id, { statuses: persisted, ts: Date.now() });
    return persisted;
  },

  async createWorkflowStatus(workflowId, status) {
    const id = safeTrim(workflowId);
    if (!id) throw new Error('workflowId is required');

    const payload = {
      code: safeTrim(status?.code),
      label: safeTrim(status?.label),
      description: safeTrim(status?.description) || null,
      color: safeTrim(status?.color) || null,
      sort_order: Number(status?.sortOrder ?? status?.sort_order ?? 0),
      is_terminal: Boolean(status?.isTerminal ?? status?.is_terminal ?? false),
      is_first_response: Boolean(status?.isFirstResponse ?? status?.is_first_response ?? false),
      next_codes: Array.isArray(status?.nextCodes ?? status?.next_codes) ? (status?.nextCodes ?? status?.next_codes) : [],
      expected_duration_days: status?.expectedDurationDays ?? status?.expected_duration_days ?? null,
      contact_person_name: safeTrim(status?.contactPersonName ?? status?.contact_person_name) || null,
      contact_person_email: safeTrim(status?.contactPersonEmail ?? status?.contact_person_email) || null,
      contact_person_phone: safeTrim(status?.contactPersonPhone ?? status?.contact_person_phone) || null,
      contact_notes: safeTrim(status?.contactNotes ?? status?.contact_notes) || null,
    };

    const data = await apiPost('create_status', {
      workflow_id: id,
      status: payload,
    });

    invalidateWorkflowStatusesCache(id);
    return toCamelCase(data?.row);
  },

  async updateWorkflowStatus(statusId, patch) {
    const sid = safeTrim(statusId);
    if (!sid) throw new Error('statusId is required');
    const payload = {};
    if (patch.code !== undefined) payload.code = safeTrim(patch.code);
    if (patch.label !== undefined) payload.label = safeTrim(patch.label);
    if (patch.description !== undefined) payload.description = safeTrim(patch.description) || null;
    if (patch.color !== undefined) payload.color = safeTrim(patch.color) || null;
    if (patch.sortOrder !== undefined) payload.sort_order = Number(patch.sortOrder ?? 0);
    if (patch.isTerminal !== undefined) payload.is_terminal = !!patch.isTerminal;
    if (patch.isFirstResponse !== undefined) payload.is_first_response = !!patch.isFirstResponse;
    if (patch.nextCodes !== undefined) payload.next_codes = patch.nextCodes;
    if (patch.expectedDurationDays !== undefined) payload.expected_duration_days = patch.expectedDurationDays;
    if (patch.contactPersonName !== undefined) payload.contact_person_name = safeTrim(patch.contactPersonName) || null;
    if (patch.contactPersonEmail !== undefined) payload.contact_person_email = safeTrim(patch.contactPersonEmail) || null;
    if (patch.contactPersonPhone !== undefined) payload.contact_person_phone = safeTrim(patch.contactPersonPhone) || null;
    if (patch.contactNotes !== undefined) payload.contact_notes = safeTrim(patch.contactNotes) || null;
    const data = await apiPost('update_status', {
      status_id: sid,
      patch: payload,
    });
    const row = toCamelCase(data?.row);
    if (row?.workflowId) invalidateWorkflowStatusesCache(row.workflowId);
    else cache.statusesByWorkflowId.clear();
    return row;
  },

  async deleteWorkflowStatus(statusId) {
    const sid = safeTrim(statusId);
    if (!sid) throw new Error('statusId is required');
    const data = await apiPost('delete_status', { status_id: sid });
    // If row returned, we can invalidate exact workflow cache
    const wfId = data?.row?.workflow_id;
    if (wfId) invalidateWorkflowStatusesCache(wfId);
    else cache.statusesByWorkflowId.clear();
    return true;
  },

  /**
   * Bulk save statuses for a workflow.
   * - Upserts by (workflow_id, code) unique constraint.
   * - Also supports existing `id` if you pass it.
   */
  async upsertWorkflowStatuses(workflowId, statuses = []) {
    return this.saveWorkflowStatuses(workflowId, statuses, []);
  },

  /**
   * Reorder helper: expects [{id, sortOrder}] or [{id, sort_order}]
   */
  async reorderWorkflowStatuses(workflowId, orderPairs = []) {
    const id = safeTrim(workflowId);
    if (!id) throw new Error('workflowId is required');
    const updates = (orderPairs || []).map((p) => ({
      id: p.id,
      sort_order: Number(p.sortOrder ?? p.sort_order ?? 0),
    }));
    await apiPost('reorder_statuses', {
      workflow_id: id,
      items: updates,
    });
    invalidateWorkflowStatusesCache(id);
    return true;
  },

  async duplicateWorkflow(id) {
    if (!id) throw new Error('workflow id is required');
    const data = await apiPost('duplicate_workflow', { id });
    return toCamelCase(data?.row);
  },

  // ----- Handler Routing (handler_workflows table) -----

  async getRoutingRules(workflowId) {
    const id = safeTrim(workflowId);
    if (!id) return [];
    const data = await apiGet('routing_rules', { workflow_id: id }, { requireAdmin: true });
    return toCamelCase(data?.rows || []);
  },

  async addRoutingRule(workflowId, handlerId) {
    const wfId = safeTrim(workflowId);
    const hId = safeTrim(handlerId);
    if (!wfId || !hId) throw new Error('workflowId and handlerId are required');
    const data = await apiPost('add_routing_rule', { workflow_id: wfId, handler_id: hId });
    return toCamelCase(data?.row);
  },

  async removeRoutingRule(ruleId) {
    const id = safeTrim(ruleId);
    if (!id) throw new Error('ruleId is required');
    await apiPost('remove_routing_rule', { rule_id: id });
    return true;
  },

  async getActiveHandlers() {
    const data = await apiGet('active_handlers', {}, { requireAdmin: true });
    return toCamelCase(data?.rows || []);
  },
  async getHandlerWorkflowIds(handlerId) {
    const id = safeTrim(handlerId);
    if (!id) throw new Error('handlerId is required');
    const data = await apiGet('handler_workflow_ids', { handler_id: id }, { requireAdmin: true });
    return Array.isArray(data?.workflow_ids) ? data.workflow_ids : [];
  },
  async getHandlerStats(handlerIds = []) {
    const ids = Array.from(
      new Set((Array.isArray(handlerIds) ? handlerIds : []).map((id) => safeTrim(id)).filter(Boolean))
    );
    if (ids.length === 0) return [];
    const data = await apiGet('handler_stats', { ids: ids.join(',') }, { requireAdmin: true });
    return toCamelCase(data?.rows || []);
  },
  async setHandlerWorkflows(handlerId, workflowIds = []) {
    const id = safeTrim(handlerId);
    if (!id) throw new Error('handlerId is required');
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(workflowIds) ? workflowIds : [])
          .map((wid) => safeTrim(wid))
          .filter(Boolean)
      )
    );
    const data = await apiPost('set_handler_workflows', {
      handler_id: id,
      workflow_ids: normalizedIds,
    });
    return Array.isArray(data?.workflow_ids) ? data.workflow_ids : normalizedIds;
  },
  async clearHandlerWorkflows(handlerId) {
    const id = safeTrim(handlerId);
    if (!id) throw new Error('handlerId is required');
    await apiPost('clear_handler_workflows', { handler_id: id });
    return true;
  },

  // ----- Utilities -----
  toCamelCase,
  toSnakeCase,
  invalidateWorkflowStatusesCache,
  setTokenProvider,
};


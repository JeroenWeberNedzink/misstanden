// src/services/workflowService.js
import { supabase } from '../lib/supabase';

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
   * NOTE: This uses PostgREST embedded count via workflow_statuses(count), tickets(count), and handler_workflows(count).
   */
  async getWorkflowsWithStats() {
    const { data, error } = await supabase
      .from('workflows')
      .select(
        `
        *,
        workflow_statuses:workflow_statuses(count),
        tickets:tickets(count),
        handler_workflows:handler_workflows(count)
      `
      )
      .order('display_order', { ascending: true });

    throwIfError(error, 'getWorkflowsWithStats(workflows)');

    const rows = (data || []).map((w) => {
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
    let q = supabase.from('workflows').select('*').order('display_order', { ascending: true });
    if (!includeInactive) q = q.eq('active', true);

    const { data, error } = await q;
    throwIfError(error, 'getWorkflows(workflows)');
    return toCamelCase(data);
  },

  async getWorkflowById(id) {
    if (!id) throw new Error('workflow id is required');

    const { data, error } = await supabase.from('workflows').select('*').eq('id', id).single();
    throwIfError(error, 'getWorkflowById(workflows)');
    return toCamelCase(data);
  },

  async getWorkflowByCode(code) {
    const c = safeTrim(code);
    if (!c) return null;

    const { data, error } = await supabase.from('workflows').select('*').eq('code', c).maybeSingle();
    throwIfError(error, 'getWorkflowByCode(workflows)');
    return toCamelCase(data);
  },

  async createWorkflow(payload) {
    const { data, error } = await supabase.from('workflows').insert(toSnakeCase(payload)).select().single();
    throwIfError(error, 'createWorkflow(workflows)');
    return toCamelCase(data);
  },

  async updateWorkflow(id, patch) {
    if (!id) throw new Error('workflow id is required');

    const { data, error } = await supabase
      .from('workflows')
      .update(toSnakeCase(patch))
      .eq('id', id)
      .select()
      .single();

    throwIfError(error, 'updateWorkflow(workflows)');
    return toCamelCase(data);
  },

  async toggleWorkflowStatus(id, active) {
    if (!id) throw new Error('workflow id is required');

    const { data, error } = await supabase.from('workflows').update({ active: !!active }).eq('id', id).select().single();
    throwIfError(error, 'toggleWorkflowStatus(workflows)');
    return toCamelCase(data);
  },

  async deleteWorkflowForce(id) {
    if (!id) throw new Error('workflow id is required');

    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, code')
      .eq('id', id)
      .maybeSingle();
    throwIfError(workflowError, 'deleteWorkflowForce(fetch workflow)');
    if (!workflow?.id) throw new Error('Workflow not found');

    // Delete child records first to avoid FK constraint violations
    // 1. Delete handler assignments
    const { error: handlerWorkflowsError } = await supabase
      .from('handler_workflows')
      .delete()
      .eq('workflow_id', id);
    throwIfError(handlerWorkflowsError, 'deleteWorkflowForce(handler_workflows)');

    // 2. Delete workflow statuses
    const { error: statusesError } = await supabase
      .from('workflow_statuses')
      .delete()
      .eq('workflow_id', id);
    throwIfError(statusesError, 'deleteWorkflowForce(workflow_statuses)');

    // 3. Nullify ticket workflow references before deleting workflow row.
    // In this app `tickets.workflow_type` stores workflow code (legacy may contain id).
    const candidates = [workflow.code, id].filter(Boolean);
    const { error: ticketsError } = await supabase
      .from('tickets')
      .update({ workflow_type: null })
      .in('workflow_type', candidates);
    throwIfError(ticketsError, 'deleteWorkflowForce(tickets)');

    // 4. Finally delete the workflow itself
    const { error } = await supabase.from('workflows').delete().eq('id', id);
    throwIfError(error, 'deleteWorkflowForce(workflows)');

    // Clear cache
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

    const { data, error } = await supabase
      .from('workflow_statuses')
      .select('*')
      .eq('workflow_id', id)
      .order('sort_order', { ascending: true });

    throwIfError(error, 'getWorkflowStatuses(workflow_statuses)');

    const statuses = toCamelCase(data || []);
    cache.statusesByWorkflowId.set(id, { statuses, ts: now });
    return statuses;
  },

  async createWorkflowStatus(workflowId, status) {
    const id = safeTrim(workflowId);
    if (!id) throw new Error('workflowId is required');

    const payload = {
      workflow_id: id,
      code: safeTrim(status?.code),
      label: safeTrim(status?.label),
      description: safeTrim(status?.description) || null,
      color: safeTrim(status?.color) || null,
      sort_order: Number(status?.sortOrder ?? status?.sort_order ?? 0),
      is_terminal: Boolean(status?.isTerminal ?? status?.is_terminal ?? false),
      next_codes: status?.nextCodes ?? status?.next_codes ?? null,
    };

    const { data, error } = await supabase.from('workflow_statuses').insert(payload).select().single();
    throwIfError(error, 'createWorkflowStatus(workflow_statuses)');

    invalidateWorkflowStatusesCache(id);
    return toCamelCase(data);
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
    if (patch.nextCodes !== undefined) payload.next_codes = patch.nextCodes;

    const { data, error } = await supabase.from('workflow_statuses').update(payload).eq('id', sid).select().single();
    throwIfError(error, 'updateWorkflowStatus(workflow_statuses)');

    // We don’t know workflow_id here reliably without extra select, so just clear whole cache.
    cache.statusesByWorkflowId.clear();
    return toCamelCase(data);
  },

  async deleteWorkflowStatus(statusId) {
    const sid = safeTrim(statusId);
    if (!sid) throw new Error('statusId is required');

    const { data, error } = await supabase.from('workflow_statuses').delete().eq('id', sid).select().maybeSingle();
    throwIfError(error, 'deleteWorkflowStatus(workflow_statuses)');

    // If row returned, we can invalidate exact workflow cache
    const wfId = data?.workflow_id;
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
    const id = safeTrim(workflowId);
    if (!id) throw new Error('workflowId is required');

    const rows = (statuses || []).map((s, i) => ({
      id: s.id || undefined,
      workflow_id: id,
      code: safeTrim(s.code),
      label: safeTrim(s.label),
      description: safeTrim(s.description) || null,
      color: safeTrim(s.color) || null,
      sort_order: Number(s.sortOrder ?? s.sort_order ?? i),
      is_terminal: Boolean(s.isTerminal ?? s.is_terminal ?? false),
      next_codes: s.nextCodes ?? s.next_codes ?? null,
      expected_duration_days: s.expectedDurationDays ?? s.expected_duration_days ?? null,
      contact_person_name: safeTrim(s.contactPersonName ?? s.contact_person_name) || null,
      contact_person_email: safeTrim(s.contactPersonEmail ?? s.contact_person_email) || null,
      contact_person_phone: safeTrim(s.contactPersonPhone ?? s.contact_person_phone) || null,
      contact_notes: safeTrim(s.contactNotes ?? s.contact_notes) || null,
    }));

    // Supabase upsert supports onConflict
    const { data, error } = await supabase
      .from('workflow_statuses')
      .upsert(rows, { onConflict: 'workflow_id,code' })
      .select();

    throwIfError(error, 'upsertWorkflowStatuses(workflow_statuses)');

    invalidateWorkflowStatusesCache(id);
    return toCamelCase(data || []);
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

    // Do it sequentially (simple + safe). If you want faster: RPC.
    for (const u of updates) {
      if (!u.id) continue;
      const { error } = await supabase.from('workflow_statuses').update({ sort_order: u.sort_order }).eq('id', u.id);
      throwIfError(error, 'reorderWorkflowStatuses(workflow_statuses)');
    }

    invalidateWorkflowStatusesCache(id);
    return true;
  },

  async duplicateWorkflow(id) {
    if (!id) throw new Error('workflow id is required');

    const { data: original, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();

    throwIfError(fetchError, 'duplicateWorkflow(fetch)');

    const suffix = `_copy_${Date.now()}`;
    const payload = {
      name: `${original.name} (kopie)`,
      code: `${original.code}${suffix}`,
      description: original.description,
      icon_name: original.icon_name,
      color_scheme: original.color_scheme,
      display_order: (original.display_order || 0) + 1,
      active: false,
      changed_by: '00000000-0000-0000-0000-000000000000', // System user for duplications
    };

    const { data: newWorkflow, error: createError } = await supabase
      .from('workflows')
      .insert(payload)
      .select()
      .single();

    throwIfError(createError, 'duplicateWorkflow(create)');

    // Copy statuses
    const { data: statuses, error: statusError } = await supabase
      .from('workflow_statuses')
      .select('*')
      .eq('workflow_id', id);

    throwIfError(statusError, 'duplicateWorkflow(fetch statuses)');

    if (statuses && statuses.length > 0) {
      const statusCopies = statuses.map((s) => ({
        workflow_id: newWorkflow.id,
        code: s.code,
        label: s.label,
        description: s.description,
        color: s.color,
        sort_order: s.sort_order,
        is_terminal: s.is_terminal,
        next_codes: s.next_codes,
      }));

      const { error: insertError } = await supabase.from('workflow_statuses').insert(statusCopies);

      throwIfError(insertError, 'duplicateWorkflow(copy statuses)');
    }

    return toCamelCase(newWorkflow);
  },

  // ----- Handler Routing (handler_workflows table) -----

  async getRoutingRules(workflowId) {
    const id = safeTrim(workflowId);
    if (!id) return [];

    const { data, error } = await supabase
      .from('handler_workflows')
      .select(
        `
        id,
        handler_id,
        workflow_id,
        handlers:handler_id (
          id,
          name,
          email,
          role,
          active
        )
      `
      )
      .eq('workflow_id', id);

    throwIfError(error, 'getRoutingRules(handler_workflows)');
    return toCamelCase(data || []);
  },

  async addRoutingRule(workflowId, handlerId) {
    const wfId = safeTrim(workflowId);
    const hId = safeTrim(handlerId);
    if (!wfId || !hId) throw new Error('workflowId and handlerId are required');

    const { data, error } = await supabase
      .from('handler_workflows')
      .insert({ workflow_id: wfId, handler_id: hId })
      .select()
      .single();

    throwIfError(error, 'addRoutingRule(handler_workflows)');
    return toCamelCase(data);
  },

  async removeRoutingRule(ruleId) {
    const id = safeTrim(ruleId);
    if (!id) throw new Error('ruleId is required');

    const { error } = await supabase.from('handler_workflows').delete().eq('id', id);

    throwIfError(error, 'removeRoutingRule(handler_workflows)');
    return true;
  },

  async getActiveHandlers() {
    const { data, error } = await supabase
      .from('handlers')
      .select('id, name, email, role')
      .eq('active', true)
      .order('name', { ascending: true });

    throwIfError(error, 'getActiveHandlers(handlers)');
    return toCamelCase(data || []);
  },

  // ----- Utilities -----
  toCamelCase,
  toSnakeCase,
  invalidateWorkflowStatusesCache,
};

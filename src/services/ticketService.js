// ticketService.js
import { supabase } from '../lib/supabase';
import { notificationService } from './notificationService';

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

const isMissingRelation = (err) => {
  const msg = String(err?.message || '').toLowerCase();
  return err?.code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'));
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
      run: () => supabase.from('handler_workflows').delete().eq('handler_id', handlerId),
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
    if (isMissingRelation(error)) continue;
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
    // Filter by handler's assigned workflows first if handlerId is provided
    if (filters.handlerId && filters.handlerId !== 'all') {
      // Get handler's assigned workflows
      const { data: handlerWorkflows } = await supabase
        .from('handler_workflows')
        .select('workflow_id')
        .eq('handler_id', filters.handlerId);

      const workflowIds = (handlerWorkflows || []).map(hw => hw.workflow_id);

      if (workflowIds.length === 0) {
        // Handler has no workflows assigned, return empty
        return [];
      }

      // Get workflow codes from workflow IDs
      const { data: workflows } = await supabase
        .from('workflows')
        .select('code')
        .in('id', workflowIds);

      const workflowCodes = (workflows || []).map(w => w.code);

      if (workflowCodes.length === 0) {
        return [];
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

      const { data, error } = await q;
      throwIfError(error, 'getAllTickets');
      return toCamelCase(data || []);
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

    const { data, error } = await q;
    throwIfError(error, 'getAllTickets');
    return toCamelCase(data);
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

    return toCamelCase(data);
  },

  async getTicketByCredentials(ticketInput, accessCode) {
    if (!ticketInput || !accessCode) throw new Error('Ticket number/ID and access code are required');

    const ticket = String(ticketInput).trim();
    const code = String(accessCode).trim().padStart(6, '0');

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticket);

    let q = supabase
      .from('tickets')
      .select(`
        *,
        handlers:handler_id ( id, name, email, roles ),
        attachments (*),
        messages (*),
        ticket_actions (*)
      `)
      .eq('access_code', code);

    q = isUuid ? q.eq('id', ticket) : q.eq('ticket_number', ticket.toUpperCase());

    const { data, error } = await q.maybeSingle();
    if (!data) throw new Error('Ongeldige ticket-ID of toegangscode');
    throwIfError(error, 'getTicketByCredentials');
    return toCamelCase(data);
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
      .select('metadata, status_code')
      .eq('id', ticketId)
      .single();
    throwIfError(curErr, 'updateTicketProgress(fetch metadata)');

    // Get old status label for notification
    const oldStatusObj = findStatusByCodeOrLabel(statuses, cur?.status_code);
    const oldStatusLabel = oldStatusObj?.label || cur?.status_code || 'Unknown';

    update.metadata = {
      ...(cur?.metadata || {}),
      status_label: resolved.label,
      workflow_status_code: resolved.code,
      status_contact_person_name: resolved?.contactPersonName || null,
      status_contact_person_email: resolved?.contactPersonEmail || null,
      status_contact_person_phone: resolved?.contactPersonPhone || null,
      status_contact_notes: resolved?.contactNotes || null,
    };

    // Optional: only set enum if explicitly provided by DB config
    if (resolved.enumLabel) {
      update.status = resolved.enumLabel;
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from('tickets')
      .update(update)
      .eq('id', ticketId)
      .select()
      .single();

    throwIfError(updateError, 'updateTicketProgress(update tickets)');

    const note = payload.note ? String(payload.note).trim() : '';
    if (note) {
      const { error: actionError } = await supabase.from('ticket_actions').insert({
        ticket_id: ticketId,
        action_type: 'status_update',
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

  return toCamelCase(data);
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

  return toCamelCase(data);
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

    const nowIso = new Date().toISOString();
    const payload = {
      ...updates,
      last_update_at: nowIso,
    };

    const { data, error } = await supabase.from('tickets').update(payload).eq('id', ticketId).select().single();
    throwIfError(error, 'updateTicket');
    return toCamelCase(data);
  },

  // ----- Assignment -----
  async assignHandler(ticketId, handlerId, note = null, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');

    const nowIso = new Date().toISOString();
    const normalizedHandlerId = handlerId || null;
    let assignedHandler = null;

    if (normalizedHandlerId) {
      const { data: handler, error: handlerError } = await supabase
        .from('handlers')
        .select('id, name, email, active')
        .eq('id', normalizedHandlerId)
        .maybeSingle();

      throwIfError(handlerError, 'assignHandler(fetch handler)');

      if (!handler?.id) {
        const e = new Error('Geselecteerde handler bestaat niet meer.');
        e.code = 'HANDLER_NOT_FOUND';
        throw e;
      }

      if (handler.active === false) {
        const e = new Error('Inactieve handlers kunnen niet worden toegewezen.');
        e.code = 'HANDLER_INACTIVE';
        throw e;
      }

      assignedHandler = handler;
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ handler_id: normalizedHandlerId, last_update_at: nowIso })
      .eq('id', ticketId)
      .select()
      .single();

    throwIfError(error, 'assignHandler');

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
      if (actionError) console.warn('assignHandler: failed to write ticket_actions note:', actionError);
    }

    const result = toCamelCase(data);

    // Send assignment notification to the newly assigned handler
    if (assignedHandler) {
      notificationService.notifyHandlerAssignment(result, assignedHandler)
        .catch(err => console.error('Failed to send handler assignment notification:', err));
    }

    return result;
  },

  // ----- Comments & messages -----
  async addComment(ticketId, comment, authorName, options = {}) {
    if (!ticketId) throw new Error('ticketId is required');
    if (!comment || !String(comment).trim()) throw new Error('comment is required');

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
      .insert({ ticket_id: ticketId, comment: String(comment).trim(), author_name: handlerInfo?.name || authorName || null })
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
        String(comment).trim(),
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
      .from('messages')
      .insert({
        ticket_id: ticketId,
        sender,
        body: String(body).trim(),
        is_internal: !!isInternal,
        handler_id: handlerInfo?.id || null,
        handler_name: handlerInfo?.name || null
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
        String(body).trim(),
        isInternal
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

    let query = supabase.from('handlers').select('*').order('name');
    if (!includeInactive) query = query.eq('active', true);

    const { data, error } = await query;
    throwIfError(error, 'getAllHandlers');

    // Enrich handlers with permissions from new RBAC system
    const handlers = toCamelCase(data);

    // For each handler, fetch their permissions from the RBAC system
    const enrichedHandlers = await Promise.all(
      handlers.map(async (handler) => {
        try {
          // Get permissions from new RBAC system
          const { data: permsData } = await supabase
            .rpc('get_handler_permissions', { handler_uuid: handler.id });

          // Convert to permissions object
          const permissionsObj = {};
          (permsData || []).forEach(perm => {
            permissionsObj[perm.permission_code] = true;
          });

          // Merge with existing permissions (if any) from handlers table
          const mergedPermissions = {
            ...(handler.permissions || {}),
            ...permissionsObj
          };

          return {
            ...handler,
            permissions: mergedPermissions
          };
        } catch (err) {
          console.error(`[ticketService] RBAC enrichment failed for handler ${handler.id}:`, err);
          console.error(`[ticketService] Handler email: ${handler.email}, falling back to legacy permissions`);
          // Return handler with existing permissions if RBAC fetch fails
          return {
            ...handler,
            __rbac_enrichment_failed: true // Debug flag for troubleshooting
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
    return toCamelCase(data);
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
      makePublicUrl = true,
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
            attachment,
            handlerInfo?.name || 'Handler'
          ).catch(err => console.error('Failed to send attachment notification:', err));
        }
      } catch (err) {
        console.error('Error loading ticket for attachment notification:', err);
      }
    }

    return attachment;
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
  toCamelCase,
  toSnakeCase,
};

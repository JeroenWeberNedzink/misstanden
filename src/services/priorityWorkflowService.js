import { supabase } from '../lib/supabase';
import { normalizeHandlerRecord, normalizeHandlerRecords } from './utils/handlerNormalization';

// Helper function to convert snake_case to camelCase
const toCamelCase = (obj) => {
  if (!obj) return obj;
  if (Array.isArray(obj)) return obj?.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camelObj = {};
  Object.keys(obj)?.forEach(key => {
    const camelKey = key?.replace(/_([a-z])/g, (_, letter) => letter?.toUpperCase());
    camelObj[camelKey] = toCamelCase(obj?.[key]);
  });
  return camelObj;
};

export const priorityWorkflowService = {
  // Get urgent and high-severity cases
  async getPriorityCases(filters = {}) {
    // Get terminal status codes to exclude
    const { data: terminalStatuses } = await supabase
      .from('workflow_statuses')
      .select('code')
      .eq('is_terminal', true);

    const terminalCodes = terminalStatuses?.map(s => s.code) || [];

    let query = supabase
      ?.from('tickets')
      ?.select(`
        *,
        handlers:handler_id (
          id,
          name,
          email,
          roles,
          active
        )
      `)
      ?.in('severity_code', ['critical', 'high']);

    // Exclude terminal statuses
    if (terminalCodes.length > 0) {
      query = query?.not('status_code', 'in', `(${terminalCodes.join(',')})`);
    }

    // Apply filters
    if (filters?.severity && filters?.severity !== 'all') {
      query = query?.eq('severity_code', filters?.severity);
    }

    if (filters?.workflowType && filters?.workflowType !== 'all') {
      query = query?.eq('workflow_type', filters?.workflowType);
    }

    if (filters?.handlerId && filters?.handlerId !== 'all') {
      query = query?.eq('handler_id', filters?.handlerId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Convert to camelCase
    const cases = (toCamelCase(data) || []).map((ticket) => ({
      ...ticket,
      handlers: ticket?.handlers ? normalizeHandlerRecord(ticket.handlers) : ticket?.handlers,
    }));

    // Calculate priority scores and sort
    return cases?.map(ticket => {
      const now = new Date();
      const assignedAt = new Date(ticket?.submittedAt);
      const deadline = ticket?.nextStepDue ? new Date(ticket?.nextStepDue) : null;

      // Calculate hours since assignment
      const hoursSinceAssignment = (now - assignedAt) / (1000 * 60 * 60);

      // Calculate hours until deadline
      const hoursUntilDeadline = deadline ? (deadline - now) / (1000 * 60 * 60) : null;

      // Priority score calculation
      let priorityScore = 0;
      
      // Severity weight (critical = 100, high = 50)
      priorityScore += ticket?.severityCode === 'critical' ? 100 : 50;
      
      // Time since assignment (add 1 point per hour)
      priorityScore += hoursSinceAssignment;
      
      // Deadline proximity (subtract hours until deadline, negative = overdue)
      if (hoursUntilDeadline !== null) {
        priorityScore += (24 - hoursUntilDeadline); // Closer deadline = higher score
      }

      return {
        ...ticket,
        hoursSinceAssignment: Math.round(hoursSinceAssignment * 10) / 10,
        hoursUntilDeadline: hoursUntilDeadline ? Math.round(hoursUntilDeadline * 10) / 10 : null,
        priorityScore: Math.round(priorityScore),
        isOverdue: hoursUntilDeadline !== null && hoursUntilDeadline < 0
      };
    })?.sort((a, b) => b?.priorityScore - a?.priorityScore); // Sort by priority score descending
  },

  // Get all active handlers for filter
  async getActiveHandlers() {
    const { data, error } = await supabase
      ?.from('handlers')
      ?.select('id, name, email, active, roles, permissions, user_id, picture, created_at, updated_at, last_login')
      ?.eq('active', true)
      ?.order('name');

    if (error) throw error;
    return normalizeHandlerRecords(toCamelCase(data) || []);
  },

  // Update ticket priority
  async updateTicketPriority(ticketId, severityCode) {
    const { data, error } = await supabase
      ?.from('tickets')
      ?.update({ severity_code: severityCode })
      ?.eq('id', ticketId)
      ?.select()
      ?.single();

    if (error) throw error;
    return toCamelCase(data);
  },

  // Reassign ticket to different handler
  async reassignTicket(ticketId, newHandlerId) {
    const normalizedHandlerId = newHandlerId || null;

    if (normalizedHandlerId) {
      const { data: handler, error: handlerError } = await supabase
        ?.from('handlers')
        ?.select('id, active')
        ?.eq('id', normalizedHandlerId)
        ?.maybeSingle();

      if (handlerError) throw handlerError;
      if (!handler?.id) throw new Error('Selected handler no longer exists');
      if (handler.active === false) throw new Error('Inactive handlers cannot be assigned');
    }

    const { data, error } = await supabase
      ?.from('tickets')
      ?.update({ handler_id: normalizedHandlerId })
      ?.eq('id', ticketId)
      ?.select()
      ?.single();

    if (error) throw error;
    return toCamelCase(data);
  }
};

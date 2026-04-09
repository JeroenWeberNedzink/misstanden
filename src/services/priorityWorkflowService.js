import { normalizeHandlerRecord, normalizeHandlerRecords } from './utils/handlerNormalization';
import { ticketService } from './ticketService';

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
    const allTickets = await ticketService.getAllTickets(filters);
    const workflowCodes = Array.from(new Set(
      (allTickets || []).map((ticket) => String(ticket?.workflowType || ticket?.workflow_type || '').trim()).filter(Boolean)
    ));
    const terminalCodes = new Set();

    await Promise.all(
      workflowCodes.map(async (workflowCode) => {
        const { statuses } = await ticketService.getWorkflowStatuses(workflowCode);
        (statuses || []).forEach((status) => {
          if (status?.isTerminal || status?.is_terminal) {
            terminalCodes.add(String(status?.code || '').trim());
          }
        });
      })
    );

    const cases = (toCamelCase(allTickets) || [])
      .filter((ticket) => ['critical', 'high'].includes(String(ticket?.severityCode || '').toLowerCase()))
      .filter((ticket) => !terminalCodes.has(String(ticket?.statusCode || '').trim()))
      .map((ticket) => ({
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
    const handlers = await ticketService.getAllHandlers({
      includeInactive: false,
      enrichPermissions: false,
      preferApi: true,
    });
    return normalizeHandlerRecords(toCamelCase(handlers) || []);
  },

  // Update ticket priority
  async updateTicketPriority(ticketId, severityCode) {
    const updated = await ticketService.updateTicket(ticketId, { severityCode });
    return toCamelCase(updated);
  },

  // Reassign ticket to different handler
  async reassignTicket(ticketId, newHandlerId) {
    const normalizedHandlerId = newHandlerId || null;
    if (!normalizedHandlerId) {
      const updated = await ticketService.setTicketHandlers(ticketId, []);
      return toCamelCase(updated);
    }
    const updated = await ticketService.assignHandler(ticketId, normalizedHandlerId);
    return toCamelCase(updated);
  }
};

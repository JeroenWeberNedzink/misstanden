import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

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

export const analyticsService = {
  // Get volume trends over time
  async getVolumeTrends(dateFrom, dateTo, groupBy = 'day') {
    const { data, error } = await supabase
      ?.from('tickets')
      ?.select('submitted_at, status_code, workflow_type, severity_code')
      ?.gte('submitted_at', dateFrom)
      ?.lte('submitted_at', dateTo)
      ?.order('submitted_at');

    if (error) throw error;

    // Group by date
    const grouped = {};
    data?.forEach(ticket => {
      const date = format(new Date(ticket?.submitted_at), 'yyyy-MM-dd');
      if (!grouped?.[date]) {
        grouped[date] = { date, total: 0 };
      }
      grouped[date].total++;
      // Use dynamic status codes - track each status individually
      const statusKey = ticket?.status_code || 'unknown';
      grouped[date][statusKey] = (grouped[date][statusKey] || 0) + 1;
    });

    return Object.values(grouped);
  },

  // Get resolution time statistics
  async getResolutionTimeStats(dateFrom, dateTo) {
    // Filter for terminal statuses only
    const { data: terminalStatuses } = await supabase
      .from('workflow_statuses')
      .select('code')
      .eq('is_terminal', true);

    const terminalCodes = terminalStatuses?.map(s => s.code) || [];

    const { data, error } = await supabase
      ?.from('tickets')
      ?.select('submitted_at, last_update_at, status_code, workflow_type, severity_code, handler_id')
      ?.in('status_code', terminalCodes)
      ?.gte('submitted_at', dateFrom)
      ?.lte('submitted_at', dateTo);

    if (error) throw error;

    // Calculate resolution times in hours
    const resolutionTimes = data?.map(ticket => {
      const submitted = new Date(ticket?.submitted_at);
      const resolved = new Date(ticket?.last_update_at);
      const hours = (resolved - submitted) / (1000 * 60 * 60);
      return {
        hours: Math.round(hours * 10) / 10,
        workflowType: ticket?.workflow_type,
        severityCode: ticket?.severity_code,
        handlerId: ticket?.handler_id
      };
    });

    // Calculate statistics
    const times = resolutionTimes?.map(rt => rt?.hours)?.sort((a, b) => a - b);
    const avg = times?.length > 0 ? times?.reduce((sum, t) => sum + t, 0) / times?.length : 0;
    const median = times?.length > 0 ? times?.[Math.floor(times?.length / 2)] : 0;
    const min = times?.length > 0 ? times?.[0] : 0;
    const max = times?.length > 0 ? times?.[times?.length - 1] : 0;

    // Group by workflow
    const byWorkflow = {};
    resolutionTimes?.forEach(rt => {
      if (!byWorkflow?.[rt?.workflowType]) {
        byWorkflow[rt?.workflowType] = [];
      }
      byWorkflow?.[rt?.workflowType]?.push(rt?.hours);
    });

    const workflowStats = Object.keys(byWorkflow)?.map(workflow => {
      const wfTimes = byWorkflow?.[workflow]?.sort((a, b) => a - b);
      return {
        workflow,
        avgTime: wfTimes?.reduce((sum, t) => sum + t, 0) / wfTimes?.length,
        count: wfTimes?.length
      };
    });

    // Group by severity
    const bySeverity = {};
    resolutionTimes?.forEach(rt => {
      if (!bySeverity?.[rt?.severityCode]) {
        bySeverity[rt?.severityCode] = [];
      }
      bySeverity?.[rt?.severityCode]?.push(rt?.hours);
    });

    const severityStats = Object.keys(bySeverity)?.map(severity => {
      const sevTimes = bySeverity?.[severity]?.sort((a, b) => a - b);
      return {
        severity,
        avgTime: sevTimes?.reduce((sum, t) => sum + t, 0) / sevTimes?.length,
        count: sevTimes?.length
      };
    });

    return {
      overall: { avg, median, min, max, count: times?.length },
      byWorkflow: workflowStats,
      bySeverity: severityStats
    };
  },

  // Get severity distribution
  async getSeverityDistribution(dateFrom, dateTo) {
    const { data, error } = await supabase
      ?.from('tickets')
      ?.select('severity_code')
      ?.gte('submitted_at', dateFrom)
      ?.lte('submitted_at', dateTo);

    if (error) throw error;

    // Count by severity
    const distribution = {};
    data?.forEach(ticket => {
      const severity = ticket?.severity_code || 'unknown';
      distribution[severity] = (distribution?.[severity] || 0) + 1;
    });

    return Object.keys(distribution)?.map(severity => ({
      severity,
      count: distribution?.[severity],
      percentage: (distribution?.[severity] / data?.length * 100)?.toFixed(1)
    }));
  },

  // Get workflow performance statistics
  async getWorkflowPerformance(dateFrom, dateTo) {
    const { data, error } = await supabase
      ?.from('tickets')
      ?.select('workflow_type, status_code, submitted_at')
      ?.gte('submitted_at', dateFrom)
      ?.lte('submitted_at', dateTo);

    if (error) throw error;

    // Group by workflow
    const byWorkflow = {};
    data?.forEach(ticket => {
      const workflow = ticket?.workflow_type || 'unknown';
      if (!byWorkflow?.[workflow]) {
        byWorkflow[workflow] = { total: 0 };
      }
      byWorkflow[workflow].total++;
      // Track each status dynamically
      const statusKey = ticket?.status_code || 'unknown';
      byWorkflow[workflow][statusKey] = (byWorkflow[workflow][statusKey] || 0) + 1;
    });

    return Object.keys(byWorkflow)?.map(workflow => {
      const wfData = byWorkflow[workflow];
      return {
        workflow,
        ...wfData,
        completionRate: wfData?.total > 0
          ? ((Object.values(wfData).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0) / wfData.total) * 100)?.toFixed(1)
          : 0
      };
    });
  },

  // Get summary metrics
  async getSummaryMetrics(dateFrom, dateTo) {
    // Get terminal status codes
    const { data: terminal } = await supabase
      .from('workflow_statuses')
      .select('code')
      .eq('is_terminal', true);

    const terminalCodes = new Set(terminal?.map(s => s.code) || []);

    const { data: tickets, error: ticketsError } = await supabase
      ?.from('tickets')
      ?.select('id, status_code, submitted_at, last_update_at')
      ?.gte('submitted_at', dateFrom)
      ?.lte('submitted_at', dateTo);

    if (ticketsError) throw ticketsError;

    const totalIncidents = tickets?.length || 0;
    const pendingCases = tickets?.filter(t => !terminalCodes.has(t?.status_code))?.length || 0;

    // Calculate average resolution time for closed tickets
    const closedTickets = tickets?.filter(t => terminalCodes.has(t?.status_code));
    let avgResolutionTime = 0;
    if (closedTickets?.length > 0) {
      const totalHours = closedTickets?.reduce((sum, ticket) => {
        const submitted = new Date(ticket?.submitted_at);
        const resolved = new Date(ticket?.last_update_at);
        return sum + (resolved - submitted) / (1000 * 60 * 60);
      }, 0);
      avgResolutionTime = Math.round(totalHours / closedTickets?.length);
    }

    // Compliance indicator (percentage of tickets closed within expected time)
    const complianceRate = totalIncidents > 0 
      ? ((closedTickets?.length / totalIncidents) * 100)?.toFixed(1)
      : 0;

    return {
      totalIncidents,
      avgResolutionTime,
      pendingCases,
      complianceRate
    };
  },

  // Get handler performance statistics
  async getHandlerPerformance(dateFrom, dateTo) {
    // Get terminal status codes
    const { data: terminal } = await supabase
      .from('workflow_statuses')
      .select('code')
      .eq('is_terminal', true);

    const terminalCodes = new Set(terminal?.map(s => s.code) || []);

    const { data, error } = await supabase
      ?.from('tickets')
      ?.select(`
        handler_id,
        status_code,
        submitted_at,
        last_update_at,
        handlers:handler_id (
          id,
          name
        )
      `)
      ?.gte('submitted_at', dateFrom)
      ?.lte('submitted_at', dateTo)
      ?.not('handler_id', 'is', null);

    if (error) throw error;

    // Group by handler
    const byHandler = {};
    data?.forEach(ticket => {
      const handlerId = ticket?.handler_id;
      const handlerName = ticket?.handlers?.name || 'Unknown';
      if (!byHandler?.[handlerId]) {
        byHandler[handlerId] = {
          handlerId,
          handlerName,
          assigned: 0,
          closed: 0,
          pending: 0,
          totalResolutionTime: 0
        };
      }
      byHandler[handlerId].assigned++;

      // Check if status is terminal
      const isTerminal = terminalCodes.has(ticket?.status_code);

      if (isTerminal) {
        byHandler[handlerId].closed++;
        const submitted = new Date(ticket?.submitted_at);
        const resolved = new Date(ticket?.last_update_at);
        byHandler[handlerId].totalResolutionTime += (resolved - submitted) / (1000 * 60 * 60);
      } else {
        byHandler[handlerId].pending++;
      }
    });

    return Object.values(byHandler)?.map(handler => ({
      ...handler,
      avgResolutionTime: handler?.closed > 0
        ? Math.round(handler?.totalResolutionTime / handler?.closed)
        : 0,
      completionRate: handler?.assigned > 0
        ? ((handler?.closed / handler?.assigned) * 100)?.toFixed(1)
        : 0
    }));
  },

  // Get deadline statistics
  async getDeadlineStatistics(dateFrom, dateTo) {
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('id, submitted_at, workflow_type, status_code, metadata')
      .gte('submitted_at', dateFrom)
      .lte('submitted_at', dateTo);

    if (error) throw error;

    // Get terminal statuses
    const { data: terminal } = await supabase
      .from('workflow_statuses')
      .select('code')
      .eq('is_terminal', true);

    const terminalCodes = new Set(terminal?.map(s => s.code) || []);

    // Get workflows with deadlines
    const { data: workflows } = await supabase
      .from('workflows')
      .select('*');

    let overdue = 0;
    let approaching = 0;
    let onTrack = 0;

    for (const ticket of tickets) {
      // Skip closed tickets
      if (terminalCodes.has(ticket.status_code)) {
        continue;
      }

      const workflow = workflows?.find(w => w.code === ticket.workflow_type);
      if (!workflow || !workflow.statutory_deadline_days) {
        continue;
      }

      const submittedDate = new Date(ticket.submitted_at);
      const now = new Date();
      const daysElapsed = Math.floor((now - submittedDate) / (1000 * 60 * 60 * 24));
      const daysRemaining = workflow.statutory_deadline_days - daysElapsed;

      if (daysRemaining < 0) {
        overdue++;
      } else if (daysRemaining <= 5) {
        approaching++;
      } else {
        onTrack++;
      }
    }

    return { overdue, approaching, onTrack };
  }
};
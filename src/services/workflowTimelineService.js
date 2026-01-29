import { supabase } from '../lib/supabase';

/**
 * Service for workflow timeline operations
 */
export const workflowTimelineService = {
  /**
   * Get all phases for a specific workflow
   */
  async getWorkflowPhases(workflowId) {
    try {
      console.log('[workflowTimelineService] Fetching phases for workflow:', workflowId);
      const { data, error } = await supabase
        .from('workflow_phases')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('[workflowTimelineService] Error fetching phases:', error);
        throw error;
      }
      console.log('[workflowTimelineService] Phases fetched:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getWorkflowPhases:', error);
      return [];
    }
  },

  /**
   * Get phases by workflow code
   */
  async getPhasesByWorkflowCode(workflowCode) {
    try {
      console.log('[workflowTimelineService] Fetching phases by code:', workflowCode);
      const { data, error } = await supabase
        .from('workflow_phases')
        .select(`
          *,
          workflow:workflows!inner(code, name)
        `)
        .eq('workflows.code', workflowCode)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('[workflowTimelineService] Error fetching phases by code:', error);
        throw error;
      }
      console.log('[workflowTimelineService] Phases by code fetched:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getPhasesByWorkflowCode:', error);
      return [];
    }
  },

  /**
   * Get steps for a specific phase
   */
  async getPhaseSteps(phaseId) {
    try {
      console.log('[workflowTimelineService] Fetching steps for phase:', phaseId);
      const { data, error } = await supabase
        .from('workflow_phase_steps')
        .select('*')
        .eq('phase_id', phaseId)
        .order('sort_order', { ascending: true });

      if (error) {
        console.error('[workflowTimelineService] Error fetching steps:', error);
        throw error;
      }
      console.log('[workflowTimelineService] Steps fetched:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getPhaseSteps:', error);
      return [];
    }
  },

  /**
   * Get complete timeline (phases with steps) for a workflow
   */
  async getCompleteTimeline(workflowId) {
    try {
      console.log('[workflowTimelineService] Fetching complete timeline for workflow:', workflowId);
      // Get phases
      const phases = await this.getWorkflowPhases(workflowId);
      console.log('[workflowTimelineService] Phases retrieved:', phases.length);

      // Get steps for all phases
      const phasesWithSteps = await Promise.all(
        phases.map(async (phase) => {
          const steps = await this.getPhaseSteps(phase.id);
          return {
            ...phase,
            steps
          };
        })
      );

      console.log('[workflowTimelineService] Complete timeline assembled');
      return phasesWithSteps;
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getCompleteTimeline:', error);
      return [];
    }
  },

  /**
   * Get contacts for a workflow (optionally filtered by country and phase)
   */
  async getWorkflowContacts(workflowId, countryCode = null, phaseId = null) {
    try {
      console.log('[workflowTimelineService] Fetching contacts for workflow:', workflowId, 'country:', countryCode, 'phase:', phaseId);
      let query = supabase
        .from('workflow_contacts')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('sort_order', { ascending: true });

      if (countryCode) {
        query = query.or(`country_code.eq.${countryCode},country_code.is.null`);
      }

      if (phaseId) {
        query = query.eq('phase_id', phaseId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[workflowTimelineService] Error fetching contacts:', error);
        throw error;
      }
      console.log('[workflowTimelineService] Contacts fetched:', data?.length || 0);
      return data || [];
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getWorkflowContacts:', error);
      return [];
    }
  },

  /**
   * Get contacts by country
   */
  async getContactsByCountry(countryCode) {
    try {
      const { data, error } = await supabase
        .from('workflow_contacts')
        .select(`
          *,
          workflow:workflows(code, name)
        `)
        .or(`country_code.eq.${countryCode},country_code.is.null`)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching contacts by country:', error);
      throw error;
    }
  },

  /**
   * Get advice phase contacts (internal and external advisors)
   */
  async getAdviceContacts(countryCode = 'NL') {
    try {
      const { data, error } = await supabase
        .from('workflow_contacts')
        .select(`
          *,
          phase:workflow_phases!inner(phase_code)
        `)
        .eq('workflow_phases.phase_code', 'advice')
        .or(`country_code.eq.${countryCode},country_code.is.null`)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching advice contacts:', error);
      throw error;
    }
  },

  /**
   * Get external authorities by country
   */
  async getExternalAuthorities(countryCode) {
    try {
      const { data, error } = await supabase
        .from('workflow_contacts')
        .select('*')
        .eq('contact_type', 'authority')
        .eq('country_code', countryCode)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching external authorities:', error);
      throw error;
    }
  },

  /**
   * Calculate ticket deadline status based on workflow phases
   */
  async getTicketDeadlineStatus(ticket, workflow) {
    try {
      console.log('[workflowTimelineService] Calculating deadline for ticket:', ticket.id, 'workflow:', workflow.code);
      const phases = await this.getWorkflowPhases(workflow.id);
      console.log('[workflowTimelineService] Found phases:', phases.length);

      // Find the phase with the longest deadline (usually the employer position phase)
      const maxDeadlinePhase = phases.reduce((max, phase) => {
        if (!phase.deadline_days) return max;
        if (!max || phase.deadline_days > max.deadline_days) return phase;
        return max;
      }, null);

      if (!maxDeadlinePhase) {
        console.log('[workflowTimelineService] No phase with deadline found for workflow:', workflow.code);
        return {
          status: 'unknown',
          daysRemaining: null,
          daysElapsed: 0
        };
      }

      console.log('[workflowTimelineService] Max deadline phase:', maxDeadlinePhase.phase_name, 'days:', maxDeadlinePhase.deadline_days);

      const createdAt = new Date(ticket.created_at);
      const now = new Date();
      const daysElapsed = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      const daysRemaining = maxDeadlinePhase.deadline_days - daysElapsed;

      let status = 'on_track';
      if (daysRemaining < 0) {
        status = 'overdue';
      } else if (daysRemaining <= 7) {
        status = 'approaching';
      }

      console.log('[workflowTimelineService] Ticket deadline status:', {
        ticketId: ticket.id,
        status,
        daysElapsed,
        daysRemaining,
        deadlineDays: maxDeadlinePhase.deadline_days
      });

      return {
        status,
        daysRemaining,
        daysElapsed,
        deadlineDays: maxDeadlinePhase.deadline_days,
        phaseName: maxDeadlinePhase.phase_name
      };
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getTicketDeadlineStatus:', error);
      return {
        status: 'error',
        daysRemaining: null,
        daysElapsed: 0
      };
    }
  }
};

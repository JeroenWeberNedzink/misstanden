const WORKFLOW_API_URL = '/api/workflows.api.php';

const apiGet = async (action, params = {}) => {
  const query = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${WORKFLOW_API_URL}?${query}`, { method: 'GET' });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(json?.message || `Workflows API error (${response.status})`);
  }
  return json?.data || {};
};

const normalizePhase = (phase) => ({
  ...phase,
  phase_description: phase?.phase_description ?? phase?.description ?? null,
});

const normalizeStep = (step) => ({
  ...step,
  step_text: step?.step_text ?? step?.step_name ?? step?.description ?? '',
});

const normalizeContact = (contact) => ({
  ...contact,
  website: contact?.website ?? contact?.website_url ?? null,
  online_form_url: contact?.online_form_url ?? null,
});

/**
 * Service for workflow timeline operations
 */
export const workflowTimelineService = {
  async getWorkflowPhases(workflowId) {
    try {
      console.log('[workflowTimelineService] Fetching phases for workflow:', workflowId);
      const data = await apiGet('workflow_phases', { workflow_id: workflowId });
      const rows = (data?.rows || []).map(normalizePhase);
      console.log('[workflowTimelineService] Phases fetched:', rows.length);
      return rows;
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getWorkflowPhases:', error);
      return [];
    }
  },

  async getPhasesByWorkflowCode(workflowCode) {
    try {
      console.log('[workflowTimelineService] Fetching phases by code:', workflowCode);
      const data = await apiGet('workflow_phases_by_code', { workflow_code: workflowCode });
      const rows = (data?.rows || []).map(normalizePhase);
      console.log('[workflowTimelineService] Phases by code fetched:', rows.length);
      return rows;
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getPhasesByWorkflowCode:', error);
      return [];
    }
  },

  async getPhaseSteps(phaseId) {
    try {
      console.log('[workflowTimelineService] Fetching steps for phase:', phaseId);
      const data = await apiGet('workflow_phase_steps', { phase_id: phaseId });
      const rows = (data?.rows || []).map(normalizeStep);
      console.log('[workflowTimelineService] Steps fetched:', rows.length);
      return rows;
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getPhaseSteps:', error);
      return [];
    }
  },

  async getCompleteTimeline(workflowId) {
    try {
      const phases = await this.getWorkflowPhases(workflowId);
      return Promise.all(
        phases.map(async (phase) => ({
          ...phase,
          steps: await this.getPhaseSteps(phase.id),
        }))
      );
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getCompleteTimeline:', error);
      return [];
    }
  },

  async getWorkflowContacts(workflowId, countryCode = null, phaseId = null) {
    try {
      const data = await apiGet('workflow_contacts', {
        workflow_id: workflowId,
        ...(countryCode ? { country_code: countryCode } : {}),
        ...(phaseId ? { phase_id: phaseId } : {}),
      });
      const rows = (data?.rows || []).map(normalizeContact);
      console.log('[workflowTimelineService] Contacts fetched:', rows.length);
      return rows;
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getWorkflowContacts:', error);
      return [];
    }
  },

  async getContactsByCountry(countryCode) {
    try {
      const data = await apiGet('workflow_contacts_by_country', { country_code: countryCode });
      return (data?.rows || []).map(normalizeContact);
    } catch (error) {
      console.error('Error fetching contacts by country:', error);
      throw error;
    }
  },

  async getAdviceContacts(countryCode = 'NL') {
    try {
      const data = await apiGet('workflow_advice_contacts', { country_code: countryCode });
      return (data?.rows || []).map(normalizeContact);
    } catch (error) {
      console.error('Error fetching advice contacts:', error);
      throw error;
    }
  },

  async getExternalAuthorities(countryCode) {
    try {
      const data = await apiGet('workflow_external_authorities', { country_code: countryCode });
      return (data?.rows || []).map(normalizeContact);
    } catch (error) {
      console.error('Error fetching external authorities:', error);
      throw error;
    }
  },

  async getTicketDeadlineStatus(ticket, workflow) {
    try {
      console.log('[workflowTimelineService] Calculating deadline for ticket:', ticket.id, 'workflow:', workflow.code);
      const phases = await this.getWorkflowPhases(workflow.id);

      const maxDeadlinePhase = phases.reduce((max, phase) => {
        if (!phase.deadline_days) return max;
        if (!max || phase.deadline_days > max.deadline_days) return phase;
        return max;
      }, null);

      if (!maxDeadlinePhase) {
        return {
          status: 'unknown',
          daysRemaining: null,
          daysElapsed: 0,
        };
      }

      const createdAt = new Date(ticket.created_at || ticket.createdAt || ticket.submitted_at || ticket.submittedAt);
      const now = new Date();
      const daysElapsed = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
      const daysRemaining = maxDeadlinePhase.deadline_days - daysElapsed;

      let status = 'on_track';
      if (daysRemaining < 0) {
        status = 'overdue';
      } else if (daysRemaining <= 7) {
        status = 'approaching';
      }

      return {
        status,
        daysRemaining,
        daysElapsed,
        deadlineDays: maxDeadlinePhase.deadline_days,
        phaseName: maxDeadlinePhase.phase_name,
      };
    } catch (error) {
      console.error('[workflowTimelineService] Exception in getTicketDeadlineStatus:', error);
      return {
        status: 'error',
        daysRemaining: null,
        daysElapsed: 0,
      };
    }
  },
};

export default workflowTimelineService;

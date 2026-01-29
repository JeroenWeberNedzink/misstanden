import React, { useState, useEffect } from 'react';
import Icon from './AppIcon';
import { workflowTimelineService } from '../services/workflowTimelineService';

/**
 * WorkflowTimeline component - displays the timeline phases for a workflow
 * Can be used in case management, legal guidance, or anywhere timeline info is needed
 */
const WorkflowTimeline = ({ workflowId, workflowCode, countryCode = 'NL', showContacts = false }) => {
  const [timeline, setTimeline] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTimeline();
  }, [workflowId, workflowCode]);

  const loadTimeline = async () => {
    console.log('[WorkflowTimeline] Loading timeline...', { workflowId, workflowCode, countryCode });
    try {
      setIsLoading(true);
      setError(null);

      // Get timeline based on whether we have workflowId or workflowCode
      let timelineData;
      if (workflowId) {
        console.log('[WorkflowTimeline] Loading by workflowId:', workflowId);
        timelineData = await workflowTimelineService.getCompleteTimeline(workflowId);
        console.log('[WorkflowTimeline] Timeline data loaded:', timelineData?.length || 0, 'phases');

        if (showContacts) {
          console.log('[WorkflowTimeline] Loading contacts for country:', countryCode);
          const contactsData = await workflowTimelineService.getWorkflowContacts(workflowId, countryCode);
          console.log('[WorkflowTimeline] Contacts loaded:', contactsData?.length || 0);
          setContacts(contactsData);
        }
      } else if (workflowCode) {
        console.log('[WorkflowTimeline] Loading by workflowCode:', workflowCode);
        timelineData = await workflowTimelineService.getPhasesByWorkflowCode(workflowCode);
        console.log('[WorkflowTimeline] Phases loaded:', timelineData?.length || 0);

        // Load steps for each phase
        const timelineWithSteps = await Promise.all(
          timelineData.map(async (phase) => {
            const steps = await workflowTimelineService.getPhaseSteps(phase.id);
            console.log('[WorkflowTimeline] Steps for phase', phase.phase_name, ':', steps?.length || 0);
            return { ...phase, steps };
          })
        );
        timelineData = timelineWithSteps;
      } else {
        console.warn('[WorkflowTimeline] Neither workflowId nor workflowCode provided');
      }

      console.log('[WorkflowTimeline] Setting timeline data:', timelineData?.length || 0, 'phases');
      setTimeline(timelineData || []);
    } catch (err) {
      console.error('[WorkflowTimeline] Error loading workflow timeline:', err);
      console.error('[WorkflowTimeline] Error stack:', err.stack);
      setError('Fout bij het laden van de tijdlijn');
      setTimeline([]);
    } finally {
      setIsLoading(false);
      console.log('[WorkflowTimeline] Finished loading timeline');
    }
  };

  const getPhaseIcon = (phaseCode) => {
    switch (phaseCode) {
      case 'advice':
        return 'MessageCircle';
      case 'internal_report':
        return 'FileText';
      case 'investigation':
        return 'Search';
      case 'employer_position':
        return 'FileCheck';
      case 'external_report':
        return 'ExternalLink';
      case 'protection':
        return 'Shield';
      default:
        return 'Circle';
    }
  };

  const formatDeadline = (days) => {
    if (!days) return null;
    if (days === 7) return '7 dagen';
    if (days === 14) return '2 weken';
    if (days === 56) return '8 weken';
    if (days === 84) return '12 weken';
    return `${days} dagen`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Icon name="Loader" size={24} className="animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Tijdlijn laden...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-lg">
        <Icon name="AlertTriangle" size={20} className="inline mr-2" />
        {error}
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        Geen tijdlijn beschikbaar voor deze workflow
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {timeline.map((phase, index) => (
        <div key={phase.id} className="relative">
          {/* Connector line */}
          {index < timeline.length - 1 && (
            <div
              className="absolute left-6 top-12 bottom-0 w-0.5 bg-border"
              style={{ height: 'calc(100% + 1.5rem)' }}
            />
          )}

          {/* Phase Card */}
          <div className="bg-card border border-border rounded-lg p-6 relative">
            <div className="flex items-start gap-4">
              {/* Phase Icon */}
              <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center relative z-10">
                <Icon
                  name={getPhaseIcon(phase.phase_code)}
                  size={24}
                  color="var(--color-primary)"
                />
              </div>

              {/* Phase Content */}
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {phase.phase_name}
                      {phase.is_optional && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (optioneel)
                        </span>
                      )}
                    </h3>
                    {phase.deadline_days && (
                      <p className="text-sm text-primary font-medium mt-1">
                        <Icon name="Clock" size={14} className="inline mr-1" />
                        Deadline: {formatDeadline(phase.deadline_days)}
                      </p>
                    )}
                  </div>
                </div>

                {phase.phase_description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {phase.phase_description}
                  </p>
                )}

                {/* Steps */}
                {phase.steps && phase.steps.length > 0 && (
                  <div className="space-y-2">
                    {phase.steps.map((step) => (
                      <div
                        key={step.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Icon
                          name="CheckCircle2"
                          size={16}
                          className="text-success mt-0.5 flex-shrink-0"
                        />
                        <span className="text-foreground">{step.step_text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Contacts Section */}
      {showContacts && contacts.length > 0 && (
        <div className="bg-muted/50 border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Icon name="Users" size={20} color="var(--color-primary)" />
            Contactpersonen en Autoriteiten ({countryCode})
          </h3>
          <div className="space-y-4">
            {contacts.map((contact) => (
              <div key={contact.id} className="border-l-4 border-primary pl-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground">
                      {contact.contact_name}
                    </h4>
                    {contact.role_title && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {contact.role_title}
                      </p>
                    )}
                    <div className="space-y-1 text-sm">
                      {contact.email && (
                        <div className="flex items-center gap-2">
                          <Icon name="Mail" size={14} className="text-muted-foreground" />
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-primary hover:underline"
                          >
                            {contact.email}
                          </a>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-2">
                          <Icon name="Phone" size={14} className="text-muted-foreground" />
                          <a
                            href={`tel:${contact.phone}`}
                            className="text-primary hover:underline"
                          >
                            {contact.phone}
                          </a>
                        </div>
                      )}
                      {contact.website && (
                        <div className="flex items-center gap-2">
                          <Icon name="Globe" size={14} className="text-muted-foreground" />
                          <a
                            href={contact.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Website
                          </a>
                        </div>
                      )}
                      {contact.online_form_url && (
                        <div className="flex items-center gap-2">
                          <Icon name="ExternalLink" size={14} className="text-muted-foreground" />
                          <a
                            href={contact.online_form_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Online Formulier
                          </a>
                        </div>
                      )}
                    </div>
                    {contact.notes && (
                      <p className="text-xs text-muted-foreground mt-2 italic">
                        {contact.notes}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      contact.contact_type === 'internal'
                        ? 'bg-success/10 text-success'
                        : contact.contact_type === 'external'
                        ? 'bg-accent/10 text-accent'
                        : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {contact.contact_type === 'internal'
                      ? 'Intern'
                      : contact.contact_type === 'external'
                      ? 'Extern'
                      : 'Autoriteit'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowTimeline;

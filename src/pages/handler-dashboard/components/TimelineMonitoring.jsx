import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import { ticketService } from '../../../services/ticketService';
import { workflowTimelineService } from '../../../services/workflowTimelineService';
import { workflowService } from '../../../services/workflowService';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

const TimelineMonitoring = () => {
  console.log('[TimelineMonitoring] Component rendering...');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [timelineData, setTimelineData] = React.useState({
    overdue: [],
    approaching: [],
    onTrack: 0
  });
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    console.log('[TimelineMonitoring] Component mounted, loading data...');
    loadTimelineData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTimelineData = async () => {
    console.log('[TimelineMonitoring] Starting to load timeline data...');
    try {
      setIsLoading(true);

      console.log('[TimelineMonitoring] Fetching tickets and workflows...');
      const tickets = await ticketService.getAllTickets();
      const workflows = await workflowService.getWorkflows();

      console.log('[TimelineMonitoring] Tickets fetched:', tickets?.length || 0);
      console.log('[TimelineMonitoring] Workflows fetched:', workflows?.length || 0);

      if (!tickets || tickets.length === 0) {
        console.log('[TimelineMonitoring] No tickets found');
        setTimelineData({ overdue: [], approaching: [], onTrack: 0 });
        setIsLoading(false);
        return;
      }

      const workflowStatusMap = new Map(); // workflowCode -> Map(statusCodeLower -> meta)
      await Promise.all(
        (workflows || []).map(async (wf) => {
          const statuses = await workflowService.getWorkflowStatuses(wf.id).catch(() => []);
          const inner = new Map();
          (statuses || []).forEach((s) => {
            const code = safeTrim(s?.code);
            if (!code) return;
            inner.set(safeLower(code), {
              code,
              label: safeTrim(s?.label),
              isTerminal: Boolean(s?.isTerminal ?? s?.is_terminal),
            });
          });
          workflowStatusMap.set(safeTrim(wf?.code), inner);
        })
      );

      const overdue = [];
      const approaching = [];
      let onTrack = 0;

      console.log('[TimelineMonitoring] Processing tickets...');
      for (const ticket of tickets) {
        const workflowType = ticket.workflowType || ticket.workflow_type;

        if (!workflowType) {
          console.log('[TimelineMonitoring] Ticket has no workflow_type:', ticket.id, 'Full ticket:', ticket);
          continue;
        }

        const statusCode = safeTrim(ticket?.statusCode || ticket?.status_code);
        const wfMap = workflowStatusMap.get(safeTrim(workflowType));
        const statusMeta = wfMap?.get(safeLower(statusCode));
        if (statusMeta?.isTerminal) {
          console.log('[TimelineMonitoring] Skipping terminal status ticket:', ticket.id);
          continue;
        }

        const workflow = workflows.find(w => w.code === workflowType);
        if (!workflow) {
          console.log('[TimelineMonitoring] No workflow found for ticket:', ticket.id, 'workflow_type:', workflowType, 'Available workflows:', workflows.map(w => w.code));
          continue;
        }

        console.log('[TimelineMonitoring] Processing ticket:', ticket.id, 'workflow:', workflow.name);

        const deadlineStatus = await workflowTimelineService.getTicketDeadlineStatus(ticket, workflow);

        if (deadlineStatus.status === 'unknown') {
          console.log('[TimelineMonitoring] Unknown deadline status for ticket:', ticket.id);
          continue;
        }

        if (deadlineStatus.status === 'error') {
          console.error('[TimelineMonitoring] Error calculating deadline for ticket:', ticket.id);
          continue;
        }

        const ticketWithDeadline = {
          ...ticket,
          ...deadlineStatus,
          workflowName: workflow.name
        };

        if (deadlineStatus.status === 'overdue') {
          console.log('[TimelineMonitoring] Ticket is OVERDUE:', ticket.id);
          overdue.push(ticketWithDeadline);
        } else if (deadlineStatus.status === 'approaching') {
          console.log('[TimelineMonitoring] Ticket deadline APPROACHING:', ticket.id);
          approaching.push(ticketWithDeadline);
        } else {
          console.log('[TimelineMonitoring] Ticket is ON TRACK:', ticket.id);
          onTrack++;
        }
      }

      overdue.sort((a, b) => a.daysRemaining - b.daysRemaining);
      approaching.sort((a, b) => a.daysRemaining - b.daysRemaining);

      console.log('[TimelineMonitoring] Timeline data summary:', {
        overdue: overdue.length,
        approaching: approaching.length,
        onTrack
      });

      setTimelineData({ overdue, approaching, onTrack });
    } catch (error) {
      console.error('[TimelineMonitoring] Exception in loadTimelineData:', error);
      console.error('[TimelineMonitoring] Error stack:', error.stack);
      setTimelineData({ overdue: [], approaching: [], onTrack: 0 });
    } finally {
      setIsLoading(false);
      console.log('[TimelineMonitoring] Finished loading timeline data');
    }
  };

  const handleTicketClick = (ticketId) => {
    navigate(`/case-management-detail?id=${ticketId}`);
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Icon name="Clock" size={24} color="var(--color-primary)" />
          <h2 className="text-xl font-semibold text-foreground">Tijdlijn Monitoring</h2>
        </div>
        <p className="text-muted-foreground">Laden...</p>
      </div>
    );
  }

  const summaryCards = [
    {
      id: 'overdue',
      title: 'Verlopen',
      value: timelineData.overdue.length,
      icon: 'AlertTriangle',
      iconColor: 'var(--color-destructive)',
      bgColor: 'bg-destructive/10'
    },
    {
      id: 'approaching',
      title: 'Deadline Nabij',
      value: timelineData.approaching.length,
      icon: 'Clock',
      iconColor: 'var(--color-warning)',
      bgColor: 'bg-warning/10'
    },
    {
      id: 'onTrack',
      title: 'Op Schema',
      value: timelineData.onTrack,
      icon: 'CheckCircle2',
      iconColor: 'var(--color-success)',
      bgColor: 'bg-success/10'
    }
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="Clock" size={18} color="var(--color-primary)" />
          <h3 className="text-sm font-medium text-foreground">
            Wettelijke Deadlines
          </h3>
        </div>
        <button
          onClick={loadTimelineData}
          className="text-primary hover:text-primary/80 transition-colors"
        >
          <Icon name="RefreshCw" size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {summaryCards.map((card) => (
          <div
            key={card.id}
            className={`${card.bgColor} border border-border rounded-lg p-3`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name={card.icon} size={14} color={card.iconColor} />
              <h4 className="text-xs font-medium text-foreground">{card.title}</h4>
            </div>
            <p className="text-lg font-bold">{card.value}</p>
          </div>
        ))}
      </div>

      {timelineData.overdue.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1.5">
            <Icon name="AlertTriangle" size={12} />
            Verlopen ({timelineData.overdue.length})
          </h4>
          <div className="space-y-1.5">
            {timelineData.overdue.slice(0, 3).map(ticket => (
              <div
                key={ticket.id}
                onClick={() => handleTicketClick(ticket.id)}
                className="flex items-center justify-between p-2 bg-destructive/5 border border-destructive/20 rounded hover:bg-destructive/10 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Icon name="AlertTriangle" size={12} color="var(--color-destructive)" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      #{ticket.id.slice(0, 8)} - {ticket.workflowName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {ticket.daysElapsed}d oud
                    </p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="text-xs font-bold text-destructive whitespace-nowrap">
                    {Math.abs(ticket.daysRemaining)}d te laat
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {timelineData.approaching.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-warning mb-2 flex items-center gap-1.5">
            <Icon name="Clock" size={12} />
            Deadline Nadert ({timelineData.approaching.length})
          </h4>
          <div className="space-y-1.5">
            {timelineData.approaching.slice(0, 3).map(ticket => (
              <div
                key={ticket.id}
                onClick={() => handleTicketClick(ticket.id)}
                className="flex items-center justify-between p-2 bg-warning/5 border border-warning/20 rounded hover:bg-warning/10 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Icon name="Clock" size={12} color="var(--color-warning)" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      #{ticket.id.slice(0, 8)} - {ticket.workflowName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {ticket.daysElapsed}d oud
                    </p>
                  </div>
                </div>
                <div className="text-right ml-2">
                  <p className="text-xs font-bold text-warning whitespace-nowrap">
                    {ticket.daysRemaining}d rest
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {timelineData.overdue.length === 0 && timelineData.approaching.length === 0 && (
        <div className="text-center py-4">
          <Icon name="CheckCircle2" size={24} color="var(--color-success)" className="mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Alle tickets binnen deadlines
          </p>
        </div>
      )}
    </div>
  );
};

export default TimelineMonitoring;

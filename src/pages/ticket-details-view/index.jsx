import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AnonymousNavHeader from '../../components/navigation/AnonymousNavHeader';
import Icon from '../../components/AppIcon';
import AttachmentsSection from './components/AttachmentsSection';
import ActionHistoryPanel from '../case-management-detail/components/ActionHistoryPanel';
import CommunicationPanel from './components/CommunicationPanel';
import NextStepsPanel from './components/NextStepsPanel';
import SLAStatus from './components/SLAStatus';
import WorkflowProgress from './components/WorkflowProgress';
import SubmissionMetadata from './components/SubmissionMetadata';
import { ticketService } from '../../services/ticketService';

const toDateSafe = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const addHours = (date, hours) => {
  if (!date || !Number.isFinite(Number(hours))) return null;
  const d = new Date(date);
  d.setHours(d.getHours() + Number(hours));
  return d;
};

const getFirstResponseAt = (ticket) => {
  const actions = ticket?.ticketActions || ticket?.ticket_actions || [];
  const actionDates = actions
    .filter((a) => {
      const t = a?.action_type || a?.actionType;
      return t === 'status_update' || t === 'status_change';
    })
    .map((a) => toDateSafe(a?.created_at || a?.createdAt))
    .filter(Boolean);

  const messages = ticket?.messages || [];
  const messageDates = messages
    .filter((m) => {
      const sender = String(m?.sender ?? '').toLowerCase();
      return sender && sender !== 'reporter';
    })
    .map((m) => toDateSafe(m?.created_at || m?.createdAt))
    .filter(Boolean);

  const all = [...actionDates, ...messageDates].filter(Boolean);
  if (!all.length) return null;
  return new Date(Math.min(...all.map((d) => d.getTime())));
};


export default function TicketDetailsView() {
  const [ticketData, setTicketData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionTimeout, setSessionTimeout] = useState(30); // 30 minutes default
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    loadTicketData();
  }, []);

  const loadTicketData = async () => {
    try {
      // Get ticket from sessionStorage
      const storedTicket = sessionStorage.getItem('current_ticket');
      
      if (!storedTicket) {
        navigate('/ticket-access-portal');
        return;
      }

      const ticket = JSON.parse(storedTicket);
      
      // Format data for display
      const submissionDate = ticket?.submitted_at || ticket?.submittedAt || ticket?.created_at || ticket?.createdAt;
      const submittedAtDate = toDateSafe(submissionDate);
      const slaResponseHours = ticket?.sla_response_hours || ticket?.slaResponseHours || 24;
      const slaResolutionHours = ticket?.sla_resolution_hours || ticket?.slaResolutionHours || null;
      const nextStepDueAt =
        ticket?.next_step_due ||
        ticket?.nextStepDue ||
        ticket?.sla_deadline ||
        ticket?.slaDeadline ||
        null;
      const expectedResolutionDate =
        ticket?.expected_resolution_date ||
        ticket?.expectedResolutionDate ||
        null;

      const firstResponseAt = getFirstResponseAt(ticket);
      const firstResponseDueAt = submittedAtDate ? addHours(submittedAtDate, slaResponseHours) : null;
      const resolutionDueAt = expectedResolutionDate
        ? toDateSafe(expectedResolutionDate)
        : (submittedAtDate && slaResolutionHours ? addHours(submittedAtDate, slaResolutionHours) : null);

      const formattedTicket = {
        ticketNumber: ticket?.ticket_number || ticket?.ticketNumber,
        submissionDate,
        status: ticket?.status,
        statusCode: ticket?.status_code || ticket?.statusCode,
        currentStage: ticket?.current_stage || ticket?.currentStage,
        workflowType: ticket?.workflow_type || ticket?.workflowType,
        description: ticket?.description,
        location: ticket?.location,
        severity: ticket?.severity_code || ticket?.severityCode,
        nextStepDue: nextStepDueAt,
        slaDeadline: ticket?.sla_deadline || ticket?.slaDeadline,
        slaResponseHours,
        slaResolutionHours,
        expectedResolutionDate,
        firstResponseAt,
        firstResponseDueAt,
        resolutionDueAt,
        contactInfo: {
          name: ticket?.reporter_name || ticket?.reporterName || '',
          email: ticket?.reporter_email || ticket?.reporterEmail || '',
          phone: ticket?.reporter_phone || ticket?.reporterPhone || ''
        },
        handlerInfo: ticket?.handlers ? {
          name: ticket?.handlers?.name || 'Toegewezen',
          email: ticket?.handlers?.email,
          assignedAt: ticket?.assigned_at
        } : null,
        metadata: {
          screenResolution: ticket?.metadata?.reporter_meta_client?.viewport ?
            `${ticket.metadata.reporter_meta_client.viewport.w}x${ticket.metadata.reporter_meta_client.viewport.h}` : null,
          viewportSize: ticket?.metadata?.reporter_meta_client?.viewport ?
            `${ticket.metadata.reporter_meta_client.viewport.w}x${ticket.metadata.reporter_meta_client.viewport.h}` : null,
          userAgent: ticket?.metadata?.reporter_meta_client?.user_agent,
          browser: null,
          os: ticket?.metadata?.reporter_meta_client?.platform,
          timezone: ticket?.metadata?.reporter_meta_client?.timezone,
          languages: ticket?.metadata?.reporter_meta_client?.languages,
          submittedAt: ticket?.submitted_at || ticket?.submittedAt,
          deviceType: ticket?.metadata?.reporter_meta_client?.platform,
          colorDepth: ticket?.metadata?.reporter_meta_client?.viewport?.dpr,
          createdFrom: ticket?.metadata?.reporter_meta_client?.created_from
        },
        attachments: (ticket?.attachments || [])
          .filter((att) =>
            !att?.is_internal &&
            !att?.note_id &&
            !att?.isInternal &&
            !att?.noteId
          )
          .map(att => ({
          name: att?.file_name || att?.fileName,
          type: att?.mime_type || att?.mimeType,
          size: att?.size_bytes || att?.sizeBytes,
          url: att?.file_url || att?.fileUrl
        })),
        timeline: [
          {
            status: 'Nieuw',
            timestamp: ticket?.submitted_at || ticket?.submittedAt,
            description: t('ticketDetails.reportReceived'),
            handlerNote: null
          }
        ],
        actionHistory: [
          {
            id: 'created',
            actionType: 'created',
            action: 'Case Created',
            description: `New report received via ${ticket?.metadata?.reporter_meta_client?.created_from || 'anonymous reporting form'}`,
            timestamp: ticket?.submitted_at || ticket?.submittedAt || new Date().toISOString(),
            performedBy: 'System'
          },
          ...(ticket?.ticketActions || ticket?.ticket_actions || []).map(a => ({
            id: a?.id,
            actionType: a?.action_type || a?.actionType || 'action',
            action: a?.action || 'Actie',
            description: a?.description || '',
            timestamp: a?.created_at || a?.createdAt || new Date().toISOString(),
            performedBy: a?.performed_by || a?.performedBy || 'System'
          }))
        ].reverse(),
        communications: (ticket?.messages || []).map(msg => ({
          from: msg?.sender,
          timestamp: msg?.created_at || msg?.createdAt,
          message: msg?.body,
          requiresResponse: false
        }))
      };

      setTicketData(formattedTicket);
    } catch (err) {
      setError(t('ticketDetails.errorLoadingTicket'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (messageContent) => {
    try {
      const storedTicket = sessionStorage.getItem('current_ticket');
      if (!storedTicket) throw new Error('No ticket in session');

      const parsed = JSON.parse(storedTicket);
      const ticketId = parsed?.id;
      if (!ticketId) throw new Error('Ticket id ontbreekt');

      const created = await ticketService.addMessage(ticketId, 'reporter', messageContent, false);
      const newMessage = {
        from: 'reporter',
        timestamp: created?.createdAt || new Date().toISOString(),
        message: created?.body || messageContent,
        isRead: false
      };

      const updatedTicket = {
        ...parsed,
        messages: [...(parsed?.messages || []), created]
      };
      sessionStorage.setItem('current_ticket', JSON.stringify(updatedTicket));

      setTicketData(prev => ({
        ...prev,
        communications: [...(prev?.communications || []), newMessage]
      }));

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const handleDownloadSummary = () => {
    // Generate and download ticket summary
    const summaryText = `
Ticket Nummer: ${ticketData?.ticketNumber}
Status: ${ticketData?.status}
Workflow: ${ticketData?.workflowType}
Ingediend op: ${new Date(ticketData?.submissionDate).toLocaleString('nl-NL')}

Beschrijving:
${ticketData?.description}

Locatie: ${ticketData?.location || t('ticketDetails.locationNotProvided')}
Ernst: ${ticketData?.severity}
    `;

    const blob = new Blob([summaryText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${ticketData?.ticketNumber}-samenvatting.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <>
        <AnonymousNavHeader />
        <div className="min-h-screen bg-background pt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-lg text-muted-foreground">{t('ticketDetails.loadingReport')}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!ticketData) {
    return (
      <>
        <AnonymousNavHeader />
        <div className="min-h-screen bg-background pt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
              <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center">
                <Icon name="AlertCircle" size={40} color="var(--color-error)" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-foreground mb-2">
                  {t('ticketDetails.ticketNotFound')}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {t('ticketDetails.ticketNotFoundDescription')}
                </p>
                <button
                  onClick={() => navigate('/ticket-access-portal')}
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-smooth"
                >
                  {t('ticketDetails.backToAccessPortal')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const formatBadgeDate = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <AnonymousNavHeader />
      <div className="min-h-screen bg-background pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon name="FileText" size={24} color="var(--color-primary)" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold text-foreground">
                      Melding #{ticketData?.ticketNumber}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ingediend op {new Date(ticketData?.submissionDate).toLocaleDateString('nl-NL', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                    ticketData?.status === 'Nieuw' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                    ticketData?.status === 'In behandeling' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                  }`}>
                    <Icon name="Activity" size={18} />
                    <span>{ticketData?.status}</span>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground">
                    <Icon name="Workflow" size={18} />
                    <span className="text-sm font-medium">{ticketData?.workflowType}</span>
                  </div>

                  {ticketData?.firstResponseDueAt && !ticketData?.firstResponseAt && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-50 text-sky-700">
                      <Icon name="Clock" size={16} />
                      <span className="text-xs font-semibold">
                        Reactie voor {formatBadgeDate(ticketData.firstResponseDueAt)}
                      </span>
                    </div>
                  )}
                  {ticketData?.nextStepDue && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-700">
                      <Icon name="Calendar" size={16} />
                      <span className="text-xs font-semibold">
                        Volgende stap: {formatBadgeDate(ticketData.nextStepDue)}
                      </span>
                    </div>
                  )}
                  {ticketData?.resolutionDueAt && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700">
                      <Icon name="CheckCircle" size={16} />
                      <span className="text-xs font-semibold">
                        Oplossen voor {formatBadgeDate(ticketData.resolutionDueAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Report Details */}
              <div className="lg:col-span-2 space-y-6">
                {/* Description */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Icon name="FileText" size={20} className="text-primary" />
                    Uw Melding
                  </h2>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {ticketData?.description}
                  </p>
                  {ticketData?.location && (
                    <div className="mt-4 flex items-start gap-2">
                      <Icon name="MapPin" size={16} className="text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Locatie</p>
                        <p className="text-sm text-foreground">{ticketData?.location}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Next Steps */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Icon name="Compass" size={20} className="text-primary" />
                    Volgende Stappen
                  </h2>
                  <NextStepsPanel
                    workflowType={ticketData?.workflowType}
                    status={ticketData?.status}
                  />
                </div>

                {/* SLA Timeline */}
                <div className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Icon name="Clock" size={20} className="text-primary" />
                    SLA Tijdlijn
                  </h2>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">Eerste reactie</p>
                        <p className="text-xs text-muted-foreground">
                          {ticketData?.firstResponseAt
                            ? `Gereageerd op ${formatBadgeDate(ticketData.firstResponseAt)}`
                            : `Uiterlijk ${formatBadgeDate(ticketData?.firstResponseDueAt)}`}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        ticketData?.firstResponseAt
                          ? 'bg-success/10 text-success'
                          : 'bg-warning/10 text-warning'
                      }`}>
                        {ticketData?.firstResponseAt ? 'Ontvangen' : 'In behandeling'}
                      </span>
                    </div>

                    {ticketData?.nextStepDue && (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Volgende stap</p>
                          <p className="text-xs text-muted-foreground">
                            Verwacht voor {formatBadgeDate(ticketData.nextStepDue)}
                          </p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                          Verwacht
                        </span>
                      </div>
                    )}

                    {ticketData?.resolutionDueAt && (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Oplossen</p>
                          <p className="text-xs text-muted-foreground">
                            Verwacht voor {formatBadgeDate(ticketData.resolutionDueAt)}
                          </p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                          Oplossing
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Attachments */}
                {ticketData?.attachments?.length > 0 && (
                  <div className="bg-card rounded-xl border border-border p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Icon name="Paperclip" size={20} className="text-primary" />
                      Bijlagen ({ticketData?.attachments?.length})
                    </h2>
                    <AttachmentsSection attachments={ticketData?.attachments} />
                  </div>
                )}

                {/* Submission Metadata */}
                <SubmissionMetadata
                  metadata={ticketData?.metadata}
                  submissionDate={ticketData?.submissionDate}
                />

                {/* Action History */}
                <ActionHistoryPanel actions={ticketData?.actionHistory} />

                {/* Communication */}
                <CommunicationPanel
                  ticketId={ticketData?.ticketNumber}
                  initialMessages={ticketData?.communications || []}
                  onSendMessage={handleSendMessage}
                />
              </div>

              {/* Right Sidebar */}
              <div className="space-y-6">
                {/* SLA Status */}
                <SLAStatus
                  submittedAt={ticketData?.submissionDate}
                  status={ticketData?.status}
                  slaResponseHours={ticketData?.slaResponseHours}
                  slaResolutionHours={ticketData?.slaResolutionHours}
                  firstResponseAt={ticketData?.firstResponseAt}
                  firstResponseDueAt={ticketData?.firstResponseDueAt}
                  nextStepDueAt={ticketData?.nextStepDue}
                  resolutionDueAt={ticketData?.resolutionDueAt}
                />

                {/* Workflow Progress */}
                <WorkflowProgress
                  workflowType={ticketData?.workflowType}
                  currentStage={ticketData?.currentStage}
                  statusCode={ticketData?.statusCode}
                />

                {/* Handler Info */}
                {ticketData?.handlerInfo && (
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon name="UserCheck" size={20} className="text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Behandelaar</h3>
                        <p className="text-xs text-muted-foreground">Toegewezen aan uw zaak</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{ticketData.handlerInfo.name}</p>
                        {ticketData.handlerInfo.assignedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Toegewezen op {new Date(ticketData.handlerInfo.assignedAt).toLocaleDateString('nl-NL', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expected Resolution */}
                {ticketData?.nextStepDue && (
                  <div className="bg-card rounded-xl border border-border p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                        <Icon name="Calendar" size={20} className="text-warning" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">Volgende Stap</h3>
                        <p className="text-xs text-muted-foreground">Verwachte actie</p>
                      </div>
                    </div>
                    <p className="text-sm text-foreground">
                      Verwachte actie voor: {new Date(ticketData.nextStepDue).toLocaleDateString('nl-NL', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                )}

                {/* Privacy & Security */}
                <div className="bg-success/10 rounded-xl border border-success/20 p-6">
                  <div className="flex items-start gap-3">
                    <Icon name="Shield" size={24} className="text-success" />
                    <div>
                      <h3 className="text-base font-semibold text-success mb-1">Beveiligde Toegang</h3>
                      <p className="text-sm text-success/80">Volledig anoniem • End-to-end encrypted</p>
                      <p className="text-xs text-success/70 mt-2">
                        Uw gegevens zijn versleuteld en alleen toegankelijk via uw toegangscode
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

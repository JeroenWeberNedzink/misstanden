import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AnonymousNavHeader from '../../components/navigation/AnonymousNavHeader';
import Icon from '../../components/AppIcon';
import AttachmentsSection from './components/AttachmentsSection';
import ActionHistoryCard from './components/ActionHistoryCard';
import CommunicationPanel from './components/CommunicationPanel';
import SLAStatus from './components/SLAStatus';
import SubmissionMetadata from './components/SubmissionMetadata';
import { ticketService } from '../../services/ticketService';
import { addHours, getFirstResponseAt, getFirstResponseHoursForTicket, toDateSafe } from '../../utils/slaUtils';

const formatDateTime = (value, locale, options = {}) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(locale || undefined, options);
};

export default function TicketDetailsView() {
  const [ticketData, setTicketData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    loadTicketData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTicketData = async () => {
    try {
      const storedAccess = sessionStorage.getItem('current_ticket_access');
      const storedTicket = sessionStorage.getItem('current_ticket');

      if (!storedAccess && !storedTicket) {
        navigate('/ticket-access-portal');
        return;
      }

      let ticket = null;

      if (storedAccess) {
        try {
          const access = JSON.parse(storedAccess);
          if (access?.ticketInput && access?.accessCode) {
            ticket = await ticketService.getTicketByCredentials(access.ticketInput, access.accessCode);
            sessionStorage.setItem('current_ticket', JSON.stringify(ticket));
          }
        } catch (lookupErr) {
          console.error('Reporter ticket refresh via API failed:', lookupErr);
        }
      }

      if (!ticket && storedTicket) {
        ticket = JSON.parse(storedTicket);
      }

      if (!ticket) {
        navigate('/ticket-access-portal');
        return;
      }

      const submissionDate = ticket?.submitted_at || ticket?.submittedAt || ticket?.created_at || ticket?.createdAt;
      const submittedAtDate = toDateSafe(submissionDate);
      const slaResponseHours = getFirstResponseHoursForTicket(ticket);
      const slaResolutionHours =
        ticket?.sla_resolution_hours ||
        ticket?.slaResolutionHours ||
        ticket?.metadata?.sla_resolution_hours ||
        ticket?.metadata?.slaResolutionHours ||
        null;
      const nextStepDueAt = ticket?.next_step_due || ticket?.nextStepDue || ticket?.sla_deadline || ticket?.slaDeadline || null;
      const expectedResolutionDate = ticket?.expected_resolution_date || ticket?.expectedResolutionDate || null;

      const firstResponseAt = getFirstResponseAt(ticket, { strictReceiptStatus: true });
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
        slaResponseHours,
        slaResolutionHours,
        firstResponseAt,
        firstResponseDueAt,
        resolutionDueAt,
        metadata: {
          screenResolution: ticket?.metadata?.reporter_meta_client?.viewport
            ? `${ticket.metadata.reporter_meta_client.viewport.w}x${ticket.metadata.reporter_meta_client.viewport.h}`
            : null,
          userAgent: ticket?.metadata?.reporter_meta_client?.user_agent,
          os: ticket?.metadata?.reporter_meta_client?.platform,
          timezone: ticket?.metadata?.reporter_meta_client?.timezone,
          languages: ticket?.metadata?.reporter_meta_client?.languages,
          createdFrom: ticket?.metadata?.reporter_meta_client?.created_from,
        },
        attachments: (ticket?.attachments || [])
          .filter((att) => !att?.is_internal && !att?.note_id && !att?.isInternal && !att?.noteId)
          .map((att) => ({
            name: att?.file_name || att?.fileName,
            type: att?.mime_type || att?.mimeType,
            size: att?.size_bytes || att?.sizeBytes,
            url: att?.file_url || att?.fileUrl,
          })),
        actionHistory: [
          {
            id: 'created',
            actionType: 'created',
            action: t('ticketDetailsView.activity.caseCreated'),
            description: t('ticketDetailsView.activity.newReportReceived'),
            timestamp: ticket?.submitted_at || ticket?.submittedAt || new Date().toISOString(),
            performedBy: t('ticketDetailsView.activity.system'),
          },
          ...(ticket?.ticketActions || ticket?.ticket_actions || []).map((a) => ({
            id: a?.id,
            actionType: a?.action_type || a?.actionType || 'action',
            action: a?.action || t('ticketDetailsView.activity.defaultAction'),
            description: a?.description || '',
            timestamp: a?.created_at || a?.createdAt || new Date().toISOString(),
            performedBy: a?.performed_by || a?.performedBy || t('ticketDetailsView.activity.system'),
          })),
        ].reverse(),
        communications: (ticket?.messages || []).map((msg) => ({
          from: msg?.sender,
          senderName: msg?.sender === 'handler'
            ? (msg?.handler_name || msg?.handlerName || t('ticketDetailsView.communication.handler'))
            : t('ticketDetailsView.communication.you'),
          timestamp: msg?.created_at || msg?.createdAt,
          message: msg?.body,
          isRead: msg?.read ?? msg?.isRead ?? false,
        })),
      };

      setTicketData(formattedTicket);
      setError('');
    } catch {
      setError(t('ticketDetails.errorLoadingTicket'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (messageContent) => {
    try {
      const storedAccess = sessionStorage.getItem('current_ticket_access');
      if (!storedAccess) throw new Error('No ticket credentials in session');

      const access = JSON.parse(storedAccess);
      const ticketInput = String(access?.ticketInput || '').trim();
      const accessCode = String(access?.accessCode || '').trim();
      if (!ticketInput || !accessCode) throw new Error('Missing ticket access credentials');

      const { message: created, ticket: updatedTicket } = await ticketService.addReporterMessageByCredentials(
        ticketInput,
        accessCode,
        messageContent,
      );
      const newMessage = {
        from: 'reporter',
        senderName: t('ticketDetailsView.communication.you'),
        timestamp: created?.createdAt || new Date().toISOString(),
        message: created?.body || messageContent,
        isRead: false,
      };

      if (updatedTicket) {
        sessionStorage.setItem('current_ticket', JSON.stringify(updatedTicket));
      } else {
        const storedTicket = sessionStorage.getItem('current_ticket');
        const parsed = storedTicket ? JSON.parse(storedTicket) : {};
        const fallbackTicket = { ...parsed, messages: [...(parsed?.messages || []), created] };
        sessionStorage.setItem('current_ticket', JSON.stringify(fallbackTicket));
      }

      setTicketData((prev) => ({
        ...prev,
        communications: [...(prev?.communications || []), newMessage],
      }));

      return true;
    } catch (sendError) {
      console.error('Error sending message:', sendError);
      throw sendError;
    }
  };

  if (isLoading) {
    return (
      <>
        <AnonymousNavHeader />
        <div className="min-h-screen app-page-gradient bg-background pt-20">
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
        <div className="min-h-screen app-page-gradient bg-background pt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
              <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center">
                <Icon name="AlertCircle" size={40} color="var(--color-error)" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-foreground mb-2">{t('ticketDetails.ticketNotFound')}</h2>
                <p className="text-muted-foreground mb-6">{t('ticketDetails.ticketNotFoundDescription')}</p>
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

  const locale = i18n?.resolvedLanguage || i18n?.language;
  const workflowKey = String(ticketData?.workflowType || '').trim().toLowerCase();
  const workflowLabel = workflowKey
    ? t(`reportForm.workflowOptions.${workflowKey}.name`, { defaultValue: ticketData?.workflowType })
    : '-';
  const statusLabel = ticketData?.status
    || t(`handlerDashboard.status.${ticketData?.statusCode}`, {
      defaultValue: ticketData?.statusCode || t('ticketDetailsView.unknown'),
    });

  const formatBadgeDate = (value) =>
    formatDateTime(value, locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
      <AnonymousNavHeader />
      <div className="min-h-screen app-page-gradient bg-background pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="space-y-6">
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="bg-card rounded-xl border border-border p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h1 className="text-xl md:text-2xl font-semibold text-foreground">
                    {t('ticketDetails.title')} #{ticketData?.ticketNumber}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('ticketDetails.submittedOn')}: {formatDateTime(ticketData?.submissionDate, locale, {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    <Icon name="Activity" size={14} />
                    {statusLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    <Icon name="Workflow" size={14} />
                    {workflowLabel}
                  </span>
                  {ticketData?.nextStepDue && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                      <Icon name="Calendar" size={14} />
                      {t('ticketDetailsView.sla.nextStep')}: {formatBadgeDate(ticketData.nextStepDue)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-card rounded-xl border border-border p-5 md:p-6">
                  <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Icon name="FileText" size={18} className="text-primary" />
                    {t('ticketDetails.reportDetails')}
                  </h2>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {ticketData?.description || '-'}
                  </p>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t('ticketDetails.location')}</p>
                    <p className="text-sm text-foreground">
                      {ticketData?.location || t('ticketDetails.locationNotProvided')}
                    </p>
                  </div>
                </div>

                {ticketData?.attachments?.length > 0 && (
                  <div className="bg-card rounded-xl border border-border p-5 md:p-6">
                    <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Icon name="Paperclip" size={18} className="text-primary" />
                      {t('ticketDetails.attachments')} ({ticketData?.attachments?.length})
                    </h2>
                    <AttachmentsSection attachments={ticketData?.attachments} />
                  </div>
                )}

                <CommunicationPanel
                  initialMessages={ticketData?.communications || []}
                  onSendMessage={handleSendMessage}
                />
              </div>

              <div className="lg:col-span-4 space-y-6">
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

                <ActionHistoryCard actions={ticketData?.actionHistory} />

                <SubmissionMetadata metadata={ticketData?.metadata} submissionDate={ticketData?.submissionDate} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


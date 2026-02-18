import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth0 } from '@auth0/auth0-react';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import CaseHeader from './components/CaseHeader';
import CaseDetailsPanel from './components/CaseDetailsPanel';
import AttachmentsPanel from './components/AttachmentsPanel';
import InvestigationNotesPanel from './components/InvestigationNotesPanel';
import CommunicationPanel from './components/CommunicationPanel';
import ActionHistoryPanel from './components/ActionHistoryPanel';
import StatusUpdateModal from './components/StatusUpdateModal';
import CaseManagementPanel from './components/CaseManagementPanel';
import SLACompactCard from './components/SLACompactCard';
import Icon from '../../components/AppIcon';
import { ticketService } from '../../services/ticketService';

const fmtDateTime = (value, locale) => {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(locale || undefined);
  } catch {
    return String(value);
  }
};

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

export default function CaseManagementDetail() {
  const [caseData, setCaseData] = useState(null);
  const [workflowStatuses, setWorkflowStatuses] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [investigationNotes, setInvestigationNotes] = useState([]);
  const [communicationMessages, setCommunicationMessages] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);
  const [availableHandlers, setAvailableHandlers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [currentHandlerId, setCurrentHandlerId] = useState(null);

  const navigate = useNavigate();
  const isMountedRef = useRef(true);
  const { t, i18n } = useTranslation();
  const { user } = useAuth0();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [t]);

  const showToast = useCallback((message) => {
    setToastMessage(message);
    setShowSuccessToast(true);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setShowSuccessToast(false), 3000);
  }, []);

  const getStoredTicketId = useCallback(() => {
    const storedCase = sessionStorage.getItem('current_case');
    if (!storedCase) return null;
    try {
      const parsed = JSON.parse(storedCase);
      return parsed?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const severityToPriorityLabel = useCallback((severityCode) => {
    return severityCode === 'critical'
      ? t('caseManagement.critical')
      : severityCode === 'high'
      ? t('caseManagement.high')
      : severityCode === 'medium'
      ? t('caseManagement.medium')
      : t('caseManagement.low');
  }, [t]);

  const formatCase = useCallback((fullTicket, statusMeta = null) => {
    if (!fullTicket) return null;
    const submissionDateValue =
      fullTicket?.submittedAt ||
      fullTicket?.submitted_at ||
      fullTicket?.createdAt ||
      fullTicket?.created_at ||
      null;
    const submittedAtDate = toDateSafe(submissionDateValue);
    const statusCodeValue =
      fullTicket?.statusCode ||
      fullTicket?.status_code ||
      fullTicket?.currentStage ||
      fullTicket?.current_stage ||
      fullTicket?.metadata?.workflow_status_code ||
      null;
    const slaResponseHours = fullTicket?.slaResponseHours || fullTicket?.sla_response_hours || 24;
    const slaResolutionHours = fullTicket?.slaResolutionHours || fullTicket?.sla_resolution_hours || null;
    const nextStepDueAt =
      fullTicket?.nextStepDue ||
      fullTicket?.next_step_due ||
      fullTicket?.slaDeadline ||
      fullTicket?.sla_deadline ||
      null;
    const expectedResolutionDate =
      fullTicket?.expectedResolutionDate ||
      fullTicket?.expected_resolution_date ||
      null;
    const firstResponseAt = getFirstResponseAt(fullTicket);
    const firstResponseDueAt = submittedAtDate ? addHours(submittedAtDate, slaResponseHours) : null;
    const resolutionDueAt = expectedResolutionDate
      ? toDateSafe(expectedResolutionDate)
      : (submittedAtDate && slaResolutionHours ? addHours(submittedAtDate, slaResolutionHours) : null);

    const statusStartAt = toDateSafe(fullTicket?.lastUpdateAt || fullTicket?.last_update_at || submissionDateValue);
    const computedNextStepDueAt =
      statusStartAt && Number.isFinite(Number(statusMeta?.expectedDurationDays))
        ? addHours(statusStartAt, Number(statusMeta.expectedDurationDays) * 24)
        : null;

    const statusLabel =
      statusMeta?.label ||
      fullTicket?.metadata?.status_label ||
      statusCodeValue ||
      fullTicket?.status ||
      '-';

    return {
      id: fullTicket?.id,
      ticketNumber: fullTicket?.ticketNumber,
      accessCode: fullTicket?.accessCode,
      status: statusLabel,          // display label
      statusLabel,
      statusCode: statusCodeValue,  // workflow status code
      currentStage: fullTicket?.currentStage,
      workflowType: fullTicket?.workflowType,
      metadata: fullTicket?.metadata || null,

      priority: severityToPriorityLabel(fullTicket?.severityCode),
      priorityCode: fullTicket?.severityCode || 'low',

      submittedDate: submissionDateValue ? fmtDateTime(submissionDateValue, i18n?.resolvedLanguage || i18n?.language) : '-',
      assignedTo: fullTicket?.handlers?.name || t('caseManagement.notAssigned'),
      assignedToId: fullTicket?.handlerId,
      statusEmailNotify:
        fullTicket?.statusEmailNotify ??
        fullTicket?.status_email_notify ??
        true,

      description: fullTicket?.description,
      location: fullTicket?.location,
      sla: {
        firstResponseAt,
        firstResponseDueAt,
        nextStepDueAt: nextStepDueAt || computedNextStepDueAt,
        resolutionDueAt,
        currentStatusDurationDays: statusMeta?.expectedDurationDays ?? null,
        contactPersonName: statusMeta?.contactPersonName || null,
        contactPersonEmail: statusMeta?.contactPersonEmail || null,
        contactPersonPhone: statusMeta?.contactPersonPhone || null,
        contactNotes: statusMeta?.contactNotes || null,
      },

      reporterDetails: {
        name: fullTicket?.reporterName || t('caseManagement.anonymous'),
        email: fullTicket?.reporterEmail || '',
        phone: fullTicket?.reporterPhone || null,
        phoneVerified: fullTicket?.reporterPhoneVerified || false,
      },
    };
  }, [severityToPriorityLabel, t]);

  const resolveStatusMeta = useCallback((ticket, statuses = workflowStatuses) => {
    const statusCode =
      ticket?.statusCode ||
      ticket?.status_code ||
      ticket?.currentStage ||
      ticket?.current_stage ||
      ticket?.metadata?.workflow_status_code ||
      null;
    if (!statusCode || !Array.isArray(statuses)) return null;
    const code = String(statusCode).trim().toLowerCase();
    return statuses.find((s) => String(s?.code || '').trim().toLowerCase() === code) || null;
  }, [workflowStatuses]);

  const pushAction = useCallback((action) => {
    // action shape that ActionHistoryPanel accepts
    setActionHistory((prev) => [
      {
        id: action?.id || `${Date.now()}_${Math.random()}`,
        actionType: action?.actionType || 'action',
        action: action?.action || t('caseManagementDetail.actionHistory.defaultAction'),
        description: action?.description || '',
        timestamp: action?.timestamp || new Date().toISOString(),
        performedBy: action?.performedBy || t('caseManagement.system'),
      },
      ...(prev || []),
    ]);
  }, [t]);

  // --- load handler profile ---
  useEffect(() => {
    (async () => {
      if (!user?.email) return;
      try {
        const handlers = await ticketService.getAllHandlers();
        const handler = handlers?.find(h => h?.email?.toLowerCase() === user?.email?.toLowerCase());
        if (handler?.id) setCurrentHandlerId(handler.id);
      } catch (err) {
        console.error('Error loading handler profile:', err);
      }
    })();
  }, [user?.email]);

  const loadHandlers = useCallback(async () => {
    try {
      const handlers = await ticketService.getAllHandlers({ includeInactive: true });
      if (!isMountedRef.current) return;
      setAvailableHandlers(
        (handlers ?? []).map((h) => ({
          id: h?.id,
          name: h?.name,
          role: h?.role || t('caseManagement.handler'),
          active: h?.active !== false,
        }))
      );
    } catch (err) {
      console.error('Error loading handlers:', err);
    }
  }, [t]);

  const loadCaseData = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      const ticketId = getStoredTicketId();
      if (!ticketId) {
        navigate('/handler-dashboard');
        return;
      }

      const fullTicket = await ticketService.getTicketById(ticketId);
      if (!isMountedRef.current) return;

      let statuses = [];
      try {
        const wfCode = fullTicket?.workflowType || fullTicket?.workflow_type;
        if (wfCode) {
          const res = await ticketService.getWorkflowStatuses(wfCode);
          statuses = res?.statuses || [];
          if (isMountedRef.current) setWorkflowStatuses(statuses);
        }
      } catch (err) {
        console.warn('Error loading workflow statuses for SLA:', err);
      }

      const statusMeta = resolveStatusMeta(fullTicket, statuses);

      // core
      setCaseData(formatCase(fullTicket, statusMeta));

      const allAttachments = fullTicket?.attachments ?? [];
      const publicAttachments = allAttachments.filter(
        (att) => !att?.isInternal && !att?.noteId
      );
      const noteAttachments = allAttachments.filter(
        (att) => att?.noteId || att?.isInternal
      );

      // attachments (public)
      setAttachments(
        publicAttachments.map((att) => ({
          id: att?.id,
          name: att?.fileName,
          type: att?.mimeType?.includes('pdf') ? 'pdf' : 'image',
          size: att?.sizeBytes,
          uploadedDate: att?.createdAt ? fmtDateTime(att.createdAt, i18n?.resolvedLanguage || i18n?.language) : '-',
          uploadedBy: t('caseManagement.reporter'),
          url: att?.fileUrl,
          alt: t('caseManagementDetail.attachments.attachmentAlt', { name: att?.fileName }),
        }))
      );

      const attachmentsByNoteId = noteAttachments.reduce((acc, att) => {
        const noteId = att?.noteId;
        if (!noteId) return acc;
        if (!acc[noteId]) acc[noteId] = [];
        acc[noteId].push({
          id: att?.id,
          name: att?.fileName,
          type: att?.mimeType?.includes('pdf') ? 'pdf' : 'image',
          size: att?.sizeBytes,
          uploadedDate: att?.createdAt ? fmtDateTime(att.createdAt, i18n?.resolvedLanguage || i18n?.language) : '-',
          url: att?.fileUrl,
        });
        return acc;
      }, {});

      // notes
      setInvestigationNotes(
        (fullTicket?.ticketComments ?? []).map((comment) => ({
          id: comment?.id,
          author: comment?.authorName || t('caseManagement.handler'),
          role: t('caseManagement.handler'),
          timestamp: comment?.createdAt ? fmtDateTime(comment.createdAt, i18n?.resolvedLanguage || i18n?.language) : '-',
          content: comment?.comment,
          attachments: attachmentsByNoteId[comment?.id] || [],
        }))
      );

      // messages
      setCommunicationMessages(
        (fullTicket?.messages ?? []).map((msg) => ({
          id: msg?.id,
          sender: msg?.sender,
          senderName: msg?.sender === 'handler'
            ? (msg?.handlerName || fullTicket?.handlers?.name || user?.name || t('caseManagement.handler'))
            : t('caseManagement.reporter'),
          timestamp: msg?.createdAt ? fmtDateTime(msg.createdAt, i18n?.resolvedLanguage || i18n?.language) : '-',
          content: msg?.body,
          read: msg?.read ?? msg?.isRead ?? false,
        }))
      );

      // actions
      const base = [{
        id: 'created',
        actionType: 'created',
        action: t('caseManagement.caseCreated'),
        description: t('caseManagement.newReportReceived'),
        timestamp: fullTicket?.submittedAt || new Date().toISOString(),
        performedBy: t('caseManagement.system'),
      }];

      const dbActions = (fullTicket?.ticketActions ?? []).map((a) => ({
        id: a?.id,
        actionType: a?.actionType || 'action',
        action: a?.action || t('caseManagementDetail.actionHistory.defaultAction'),
        description: a?.description || '',
        timestamp: a?.createdAt || new Date().toISOString(),
        performedBy: a?.performedBy || t('caseManagement.system'),
      }));

      setActionHistory([...dbActions.reverse(), ...base]);
    } catch (err) {
      console.error('Error loading case:', err);
      if (!isMountedRef.current) return;
      setError(t('caseManagement.errorLoadingCase'));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [formatCase, getStoredTicketId, navigate, t]);

  useEffect(() => {
    loadCaseData();
    loadHandlers();
  }, [loadCaseData, loadHandlers]);

  const handleBack = () => navigate('/handler-dashboard');
  const handleStatusChange = () => setShowStatusModal(true);

  // Status update supports both modal and FlowBar payloads.
  const handleStatusUpdate = async (payload) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      // IMPORTANT: ticketService.updateTicketStatus returns updated ticket (because updateTicketProgress does select().single())
      const updatedTicket = await ticketService.updateTicketStatus(
        ticketId,
        payload?.statusLabel,                 // may be undefined (FlowBar)
        payload?.statusCode,                  // FlowBar sends this
        payload?.currentStage ?? null,
        payload?.note ?? null,
        payload?.workflowType ?? caseData?.workflowType ?? null
      );

      // Update caseData from returned ticket so FlowBar reflects status immediately.
      let statusMeta = resolveStatusMeta(updatedTicket);
      if (!statusMeta) {
        try {
          const wfCode = updatedTicket?.workflowType || updatedTicket?.workflow_type;
          if (wfCode) {
            const res = await ticketService.getWorkflowStatuses(wfCode);
            const statuses = res?.statuses || [];
            if (isMountedRef.current) setWorkflowStatuses(statuses);
            statusMeta = resolveStatusMeta(updatedTicket, statuses);
          }
        } catch (err) {
          console.warn('Error reloading workflow statuses after update:', err);
        }
      }
      setCaseData(formatCase(updatedTicket, statusMeta));

      // Add action in UI immediately.
      pushAction({
        actionType: 'status_update',
        action: t('caseManagement.statusChanged'),
        description: payload?.note
          ? payload.note
          : t('caseManagementDetail.toasts.statusChangedTo', {
              status: updatedTicket?.metadata?.statusLabel || updatedTicket?.status || updatedTicket?.statusCode,
            }),
        timestamp: new Date().toISOString(),
        performedBy: user?.name || user?.email || t('caseManagement.handler'),
      });

      showToast(t('caseManagement.statusUpdated'));
    } catch (err) {
      console.error('Error updating status:', err);
      showToast(t('caseManagement.statusUpdateFailed'));
    }
  };

  const handleAddNote = async (noteContent, authorName, attachments = []) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const result = await ticketService.addInvestigationNote(
        ticketId,
        noteContent,
        authorName,
        attachments,
        { currentHandlerId }
      );
      const created = result?.comment;
      const uploadedAttachments = result?.attachments || [];

      // Update notes list locally.
      setInvestigationNotes((prev) => [
        {
          id: created?.id || `${Date.now()}`,
          author: created?.authorName || authorName || t('caseManagement.handler'),
          role: t('caseManagement.handler'),
          timestamp: created?.createdAt
            ? fmtDateTime(created.createdAt, i18n?.resolvedLanguage || i18n?.language)
            : fmtDateTime(new Date().toISOString(), i18n?.resolvedLanguage || i18n?.language),
          content: created?.comment || noteContent,
          attachments: uploadedAttachments.map((att) => ({
            id: att?.id,
            name: att?.fileName,
            type: att?.mimeType?.includes('pdf') ? 'pdf' : 'image',
            size: att?.sizeBytes,
            uploadedDate: att?.createdAt
              ? fmtDateTime(att.createdAt, i18n?.resolvedLanguage || i18n?.language)
              : fmtDateTime(new Date().toISOString(), i18n?.resolvedLanguage || i18n?.language),
            url: att?.fileUrl,
          })),
        },
        ...(prev || []),
      ]);

      // Update action history.
      pushAction({
        actionType: 'note_added',
        action: t('caseManagement.addNote'),
        description: String(noteContent).slice(0, 160),
        performedBy: authorName || user?.name || user?.email || t('caseManagement.handler'),
      });

      if (uploadedAttachments.length > 0) {
        showToast(t('caseManagementDetail.toasts.noteAndAttachmentsSaved'));
      } else {
        showToast(t('caseManagement.noteSent'));
      }
    } catch (err) {
      console.error('Error adding note:', err);
      showToast(t('caseManagement.noteAddFailed'));
    }
  };

  const handleSendMessage = async (messageContent) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const created = await ticketService.addMessage(ticketId, 'handler', messageContent, false, { currentHandlerId });

      // Get handler name from availableHandlers or current user
      const currentHandlerName = currentHandlerId
        ? (availableHandlers.find(h => h.id === currentHandlerId)?.name || user?.name || user?.email)
        : (user?.name || user?.email);

      setCommunicationMessages((prev) => [
        {
          id: created?.id || `${Date.now()}`,
          sender: 'handler',
          senderName: currentHandlerName || t('caseManagement.handler'),
          timestamp: created?.createdAt
            ? fmtDateTime(created.createdAt, i18n?.resolvedLanguage || i18n?.language)
            : fmtDateTime(new Date().toISOString(), i18n?.resolvedLanguage || i18n?.language),
          content: created?.body || messageContent,
          read: false, // New messages are unread until reporter reads them
        },
        ...(prev || []),
      ]);

      pushAction({
        actionType: 'message_sent',
        action: t('caseManagementDetail.toasts.messageSentAction'),
        description: String(messageContent).slice(0, 160),
        performedBy: user?.name || user?.email || t('caseManagement.handler'),
      });

      showToast(t('caseManagement.messageSent'));
    } catch (err) {
      console.error('Error sending message:', err);
      showToast(t('caseManagement.messageSendFailed'));
    }
  };

  const handleAddAttachment = async () => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx';
    input.multiple = true;

    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      try {
        showToast(t('caseManagementDetail.toasts.uploadingFiles', { count: files.length }));

        for (const file of files) {
          const att = await ticketService.uploadAttachment(ticketId, file, { currentHandlerId, notifyReporter: true });

          // Update attachments list locally.
          setAttachments((prev) => [
            {
              id: att?.id || `${Date.now()}`,
              name: att?.fileName || file.name,
              type: (att?.mimeType || file.type || '').includes('pdf') ? 'pdf' : 'image',
              size: att?.sizeBytes || file.size,
              uploadedDate: att?.createdAt
                ? fmtDateTime(att.createdAt, i18n?.resolvedLanguage || i18n?.language)
                : fmtDateTime(new Date().toISOString(), i18n?.resolvedLanguage || i18n?.language),
              uploadedBy: t('caseManagement.handler'),
              url: att?.fileUrl,
              alt: t('caseManagementDetail.attachments.attachmentAlt', { name: att?.fileName || file.name }),
            },
            ...(prev || []),
          ]);

          pushAction({
            actionType: 'attachment_added',
            action: t('caseManagementDetail.toasts.attachmentAddedAction'),
            description: t('caseManagementDetail.toasts.uploadedFile', { name: file.name }),
            performedBy: user?.name || user?.email || t('caseManagement.handler'),
          });
        }

        showToast(t('caseManagementDetail.toasts.filesUploaded'));
      } catch (err) {
        console.error('Error uploading files:', err);
        showToast(t('caseManagementDetail.toasts.filesUploadError'));
      }
    };

    input.click();
  };

  const handleAssignmentChange = async (newHandlerId) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const updatedTicket = await ticketService.assignHandler(ticketId, newHandlerId, null, { currentHandlerId });

      // Update header and panel assignment immediately.
      setCaseData(formatCase(updatedTicket));

      pushAction({
        actionType: 'assignment',
        action: t('caseManagement.caseReassigned'),
        description: newHandlerId
          ? t('caseManagementDetail.toasts.handlerAssigned')
          : t('caseManagementDetail.toasts.assignmentRemoved'),
        performedBy: user?.name || user?.email || t('caseManagement.handler'),
      });

      showToast(t('caseManagement.assignmentChanged'));
    } catch (err) {
      console.error('Error assigning handler:', err);
      showToast(t('caseManagement.assignmentChangeFailed'));
    }
  };

  const handlePriorityChange = async (newPriority) => {
    const newSeverityCode = String(newPriority || '').toLowerCase();
    if (!newSeverityCode) return;

    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const updatedTicket = await ticketService.updateTicket(ticketId, { severity_code: newSeverityCode });

      // Update priority immediately.
      setCaseData((prev) => ({
        ...prev,
        priorityCode: updatedTicket?.severityCode || newSeverityCode,
        priority: severityToPriorityLabel(updatedTicket?.severityCode || newSeverityCode),
      }));

      pushAction({
        actionType: 'priority_change',
        action: t('caseManagement.priorityChanged'),
        description: t('caseManagement.priorityChangedFrom', {
          from: caseData?.priority || '-',
          to: severityToPriorityLabel(newSeverityCode),
        }),
        performedBy: user?.name || user?.email || t('caseManagement.handler'),
      });

      showToast(t('caseManagement.priorityChanged'));
    } catch (err) {
      console.error('Error updating priority:', err);
      showToast(t('caseManagement.priorityChangeFailed'));
    }
  };

  const handleDetailsUpdate = async (patch) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const backendPayload = {};

      if (patch?.description !== undefined) backendPayload.description = patch.description;
      if (patch?.location !== undefined) backendPayload.location = patch.location;

      if (patch?.reporterDetails) {
        if (patch.reporterDetails.name !== undefined) backendPayload.reporter_name = patch.reporterDetails.name;
        if (patch.reporterDetails.email !== undefined) backendPayload.reporter_email = patch.reporterDetails.email;
        if (patch.reporterDetails.phone !== undefined) backendPayload.reporter_phone = patch.reporterDetails.phone;
      }
      if (patch?.reporter_name !== undefined) backendPayload.reporter_name = patch.reporter_name;
      if (patch?.reporter_email !== undefined) backendPayload.reporter_email = patch.reporter_email;
      if (patch?.reporter_phone !== undefined) backendPayload.reporter_phone = patch.reporter_phone;

      const updatedTicket = await ticketService.updateTicket(ticketId, backendPayload);

      // Update case data immediately.
      setCaseData(formatCase(updatedTicket));

      pushAction({
        actionType: 'details_updated',
        action: t('caseManagementDetail.toasts.caseDetailsChanged'),
        description: t('caseManagementDetail.toasts.changedFields', {
          fields: Object.keys(backendPayload).join(', '),
        }),
        performedBy: user?.name || user?.email || t('caseManagement.handler'),
      });

      showToast(t('caseManagement.detailsUpdated'));
    } catch (err) {
      console.error('Error updating case details:', err);
      showToast(t('caseManagement.detailsUpdateFailed'));
      throw err;
    }
  };

  const handleStatusEmailNotifyChange = async (nextValue) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const updatedTicket = await ticketService.updateTicket(ticketId, {
        status_email_notify: !!nextValue,
      });

      setCaseData((prev) => ({
        ...prev,
        statusEmailNotify:
          updatedTicket?.statusEmailNotify ??
          updatedTicket?.status_email_notify ??
          !!nextValue,
      }));

      pushAction({
        actionType: 'notification_setting',
        action: t('caseManagementDetail.management.statusEmailsLabel'),
        description: nextValue
          ? t('caseManagementDetail.toasts.statusEmailsEnabled')
          : t('caseManagementDetail.toasts.statusEmailsDisabled'),
        performedBy: user?.name || user?.email || t('caseManagement.handler'),
      });

      showToast(t('caseManagementDetail.toasts.statusEmailPreferenceUpdated'));
    } catch (err) {
      console.error('Error updating status email preference:', err);
      showToast(t('caseManagementDetail.toasts.statusEmailPreferenceUpdateError'));
    }
  };

  const isWhistleblower = useMemo(() => {
    const workflowType = caseData?.workflowType || '';
    return workflowType.toLowerCase().includes('whistleblow') || workflowType.toLowerCase().includes('klokkenluider');
  }, [caseData?.workflowType]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="skeleton h-12 w-48 rounded-lg mb-4"></div>
          <p className="text-muted-foreground">{t('caseManagement.loadingCase')}</p>
        </div>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-destructive">{error || t('caseManagement.noCaseData')}</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContextNavigator>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <CaseHeader
            caseData={caseData}
            onBack={handleBack}
            onStatusChange={() => setShowStatusModal(true)}
            isWhistleblower={isWhistleblower}
            onStatusUpdate={handleStatusUpdate} // FlowBar uses this.
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-5 mt-3 md:mt-4 lg:mt-5">
            <div className="lg:col-span-2 space-y-3 md:space-y-4 lg:space-y-5">
              <CaseDetailsPanel caseData={caseData} onUpdate={handleDetailsUpdate} />

              <AttachmentsPanel attachments={attachments} onAddAttachment={handleAddAttachment} />

              <InvestigationNotesPanel notes={investigationNotes} onAddNote={handleAddNote} />

              <CommunicationPanel
                messages={communicationMessages}
                canContact={Boolean(caseData?.reporterDetails?.email)}
                onSendMessage={handleSendMessage}
              />
            </div>

            <div className="space-y-3 md:space-y-4 lg:space-y-5">
              <SLACompactCard
                sla={caseData?.sla}
                statusLabel={caseData?.statusLabel || caseData?.status}
                currentStatusDurationDays={caseData?.sla?.currentStatusDurationDays}
              />

              <CaseManagementPanel
                caseData={caseData}
                onAssignmentChange={handleAssignmentChange}
                onPriorityChange={handlePriorityChange}
                onStatusChange={() => setShowStatusModal(true)}
                onStatusEmailNotifyChange={handleStatusEmailNotifyChange}
                handlers={availableHandlers}
                isWhistleblower={isWhistleblower}
              />

              <ActionHistoryPanel history={actionHistory} />
            </div>
          </div>
        </div>

        {showStatusModal && (
          <StatusUpdateModal
            workflowType={caseData?.workflowType}
            currentStatus={caseData?.status}
            currentStage={caseData?.currentStage}
            onClose={() => setShowStatusModal(false)}
            onUpdate={handleStatusUpdate}
          />
        )}

        {showSuccessToast && (
          <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50 animate-in slide-in-from-bottom-5">
            <div className="bg-success text-success-foreground px-4 md:px-6 py-3 md:py-4 rounded-lg shadow-lg flex items-center gap-3">
              <Icon name="CheckCircle" size={20} />
              <span className="text-sm md:text-base font-medium">{toastMessage}</span>
            </div>
          </div>
        )}
      </div>
    </AuthContextNavigator>
  );
}

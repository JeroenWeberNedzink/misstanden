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
import { supabase } from '../../lib/supabase';
import { getApiAccessToken } from '../../lib/auth0ApiToken';
import { addHours, getFirstResponseAt, getFirstResponseHoursForTicket, toDateSafe } from '../../utils/slaUtils';
import { useSettings } from '../../contexts/SettingsContext';
import { buildAttachmentPolicy, validateAttachmentSelection } from '../../utils/attachmentPolicy';

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

const normalizeEntityId = (value) => String(value || '').trim().toLowerCase();
const idsEqual = (a, b) => {
  const left = normalizeEntityId(a);
  const right = normalizeEntityId(b);
  return left !== '' && right !== '' && left === right;
};

const resolveAssignedHandler = (ticket, handlers = [], fallbackLabel = '-') => {
  const primaryAssignedToId = ticket?.handlerId ?? ticket?.handler_id ?? null;
  const ticketHandlerEntries = Array.isArray(ticket?.ticketHandlers) ? ticket.ticketHandlers : [];

  const map = new Map();
  const put = (handler) => {
    if (!handler) return;
    const id = String(handler?.id || '').trim();
    const name = String(handler?.name || '').trim();
    const email = String(handler?.email || '').trim();
    const key = id || email || name;
    if (!key) return;
    if (!map.has(key)) map.set(key, { id: id || null, name: name || null, email: email || null });
  };

  for (const entry of ticketHandlerEntries) {
    put(entry?.handler);
    if (!entry?.handler && entry?.handlerId) {
      const match = (handlers || []).find((h) => idsEqual(h?.id, entry?.handlerId));
      if (match) put(match);
    }
  }

  put(ticket?.handlers);

  if (map.size === 0 && primaryAssignedToId) {
    const match = (handlers || []).find((h) => idsEqual(h?.id, primaryAssignedToId));
    if (match) {
      put(match);
    } else {
      put({ id: primaryAssignedToId, name: null, email: null });
    }
  }

  const assignedHandlers = Array.from(map.values());
  const assignedToIds = assignedHandlers.map((handler) => handler?.id).filter(Boolean);
  const assignedToNames = assignedHandlers
    .map((handler) => String(handler?.name || '').trim())
    .filter(Boolean);

  const assignedTo =
    assignedToNames.length > 0
      ? assignedToNames.join(', ')
      : assignedToIds.length > 0
        ? `#${String(assignedToIds[0]).slice(0, 8)}`
        : fallbackLabel;

  return {
    assignedToId: primaryAssignedToId || assignedToIds[0] || null,
    assignedToIds,
    assignedHandlers,
    assignedTo,
  };
};

const toHandlerOption = (handler, fallbackRole) => {
  const id = String(handler?.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(handler?.name || handler?.email || '').trim() || id,
    email: String(handler?.email || '').trim().toLowerCase() || null,
    role: handler?.role || fallbackRole,
    active: handler?.active !== false,
  };
};

const mergeHandlerOptions = (baseHandlers = [], extraHandlers = []) => {
  const out = [];
  const byId = new Map();

  const upsert = (handler) => {
    if (!handler?.id) return;
    const id = String(handler.id).trim();
    if (!id) return;
    const existing = byId.get(id);
    if (!existing) {
      const next = { ...handler, id };
      byId.set(id, next);
      out.push(next);
      return;
    }
    existing.name = existing.name || handler.name;
    existing.email = existing.email || handler.email || null;
    existing.role = existing.role || handler.role;
    existing.active = existing.active !== false && handler.active !== false;
  };

  (baseHandlers || []).forEach(upsert);
  (extraHandlers || []).forEach(upsert);
  return out;
};

const isTerminalStatusValue = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_');

  const hints = [
    'closed',
    'resolved',
    'complete',
    'completed',
    'afgesloten',
    'opgelost',
    'gesloten',
    'afgerond',
    'abgeschlossen',
    'geschlossen',
    'erledigt',
    'cloture',
    'resolu',
    'encerrado',
    'resolvido',
    'finalizado',
  ];

  return hints.some((hint) => normalized.includes(hint));
};

const hasAssignedHandlers = (ticketLike) => {
  if (!ticketLike) return false;
  if (Array.isArray(ticketLike?.assignedToIds)) {
    return ticketLike.assignedToIds.filter(Boolean).length > 0;
  }
  if (Array.isArray(ticketLike?.ticketHandlers)) {
    return ticketLike.ticketHandlers.length > 0;
  }
  return Boolean(ticketLike?.assignedToId || ticketLike?.handlerId || ticketLike?.handler_id);
};

const HANDLER_OPTIONS_CACHE_KEY = 'case_detail_handler_options_v1';
const HANDLER_OPTIONS_CACHE_TTL_MS = 5 * 60 * 1000;

export default function CaseManagementDetail() {
  const [caseData, setCaseData] = useState(null);
  const [workflowStatuses, setWorkflowStatuses] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [investigationNotes, setInvestigationNotes] = useState([]);
  const [communicationMessages, setCommunicationMessages] = useState([]);
  const [actionHistory, setActionHistory] = useState([]);
  const [availableHandlers, setAvailableHandlers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRelationsLoading, setIsRelationsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [currentHandlerId, setCurrentHandlerId] = useState(null);

  const navigate = useNavigate();
  const isMountedRef = useRef(true);
  const { t, i18n } = useTranslation();
  const { user, getAccessTokenSilently } = useAuth0();
  const { portal } = useSettings();
  const availableHandlersRef = useRef([]);
  const activeLoadRef = useRef(0);
  const attachmentPolicy = useMemo(() => buildAttachmentPolicy(portal), [portal]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [t]);

  useEffect(() => {
    availableHandlersRef.current = availableHandlers || [];
  }, [availableHandlers]);

  useEffect(() => {
    if (!caseData) return;
    const handlerPool = availableHandlers || [];
    if (handlerPool.length === 0) return;

    const assignedIds = Array.isArray(caseData?.assignedToIds)
      ? caseData.assignedToIds.filter(Boolean)
      : caseData?.assignedToId
        ? [caseData.assignedToId]
        : [];
    if (assignedIds.length === 0) return;

    const resolvedHandlers = assignedIds
      .map((id) => handlerPool.find((handler) => idsEqual(handler?.id, id)))
      .filter(Boolean)
      .map((handler) => ({
        id: handler.id,
        name: handler.name || null,
        email: handler.email || null,
      }));

    const resolvedNames = resolvedHandlers
      .map((handler) => String(handler?.name || '').trim())
      .filter(Boolean);
    if (resolvedNames.length === 0) return;

    const nextAssignedTo = resolvedNames.join(', ');
    if (String(caseData?.assignedTo || '').trim() === nextAssignedTo) return;

    setCaseData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignedTo: nextAssignedTo,
        assignedToId: prev?.assignedToId || assignedIds[0] || null,
        assignedToIds: assignedIds,
        assignedHandlers: resolvedHandlers,
      };
    });
  }, [availableHandlers, caseData]);

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

  const formatCase = useCallback((fullTicket, statusMeta = null, handlers = []) => {
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
    const slaResponseHours = getFirstResponseHoursForTicket(fullTicket);
    const slaResolutionHours =
      fullTicket?.slaResolutionHours ||
      fullTicket?.sla_resolution_hours ||
      fullTicket?.metadata?.sla_resolution_hours ||
      fullTicket?.metadata?.slaResolutionHours ||
      null;
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
    const isClosed =
      Boolean(statusMeta?.isTerminal) ||
      isTerminalStatusValue(statusCodeValue) ||
      isTerminalStatusValue(statusLabel);
    const firstResponseAtDetected = getFirstResponseAt(fullTicket, { strictReceiptStatus: true });
    const firstResponseAt = firstResponseAtDetected || (isClosed ? statusStartAt : null);

    const assignment = resolveAssignedHandler(
      fullTicket,
      handlers,
      t('caseManagement.notAssigned')
    );

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
      assignedTo: assignment.assignedTo,
      assignedToId: assignment.assignedToId,
      assignedToIds: assignment.assignedToIds || [],
      assignedHandlers: assignment.assignedHandlers || [],
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
        isClosed,
        closedAt: isClosed ? statusStartAt : null,
        statusChangedAt: statusStartAt,
        currentStatusDurationDays: statusMeta?.expectedDurationDays ?? null,
        contactPersonName: statusMeta?.contactPersonName || null,
        contactPersonEmail: statusMeta?.contactPersonEmail || null,
        contactPersonPhone: statusMeta?.contactPersonPhone || null,
        contactNotes: statusMeta?.contactNotes || null,
      },

      reporterDetails: {
        name: fullTicket?.reporterName || t('caseManagement.anonymous'),
        email: fullTicket?.reporterEmail || '',
        hasSecureEmail: Boolean(fullTicket?.reporterEmailEncrypted || fullTicket?.reporter_email_encrypted),
        phone: fullTicket?.reporterPhone || null,
        phoneVerified: fullTicket?.reporterPhoneVerified || false,
      },
    };
  }, [i18n?.language, i18n?.resolvedLanguage, severityToPriorityLabel, t]);

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
      if (!user) return;
      try {
        let handler = null;

        try {
          const token = await getApiAccessToken(getAccessTokenSilently);
          const resp = await fetch('/api/me.api.php', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const payload = await resp.json().catch(() => null);
          if (resp.ok && payload?.success && payload?.data?.handler) {
            handler = payload.data.handler;
          }
        } catch (apiErr) {
          console.warn('[CaseManagementDetail] /api/me.api.php lookup failed, fallback to direct handler lookup', apiErr);
        }

        if (!handler && user?.email) {
          const normalizedEmail = String(user?.email || '').trim().toLowerCase();
          const { data: directHandler, error: directHandlerError } = await supabase
            .from('handlers')
            .select('*')
            .ilike('email', normalizedEmail)
            .eq('active', true)
            .maybeSingle();
          if (directHandlerError) {
            console.warn('[CaseManagementDetail] Direct handler fallback lookup failed', directHandlerError);
          } else {
            handler = directHandler || null;
          }
        }

        if (handler?.id) setCurrentHandlerId(handler.id);
        const fallbackRole = t('caseManagement.handler');
        const currentOption = toHandlerOption(handler, fallbackRole);
        if (currentOption && isMountedRef.current) {
          setAvailableHandlers((prev) => mergeHandlerOptions(prev, [currentOption]));
        }
      } catch (err) {
        console.error('Error loading handler profile:', err);
      }
    })();
  }, [user, getAccessTokenSilently, t]);

  const loadHandlers = useCallback(async () => {
    try {
      const cachedRaw = sessionStorage.getItem(HANDLER_OPTIONS_CACHE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        const cachedAt = Number(parsed?.ts || 0);
        const cachedRows = Array.isArray(parsed?.rows) ? parsed.rows : [];
        if (cachedRows.length > 0 && Date.now() - cachedAt < HANDLER_OPTIONS_CACHE_TTL_MS && isMountedRef.current) {
          setAvailableHandlers((prev) => mergeHandlerOptions(prev, cachedRows));
        }
      }
    } catch {
      // Ignore cache read errors and continue with live fetch.
    }

    try {
      const handlers = await ticketService.getAllHandlers({
        includeInactive: true,
        preferApi: true,
        enrichPermissions: false,
      });
      if (!isMountedRef.current) return;
      const fallbackRole = t('caseManagement.handler');
      const mapped = (handlers ?? [])
        .map((h) => toHandlerOption(h, fallbackRole))
        .filter(Boolean);
      setAvailableHandlers((prev) => mergeHandlerOptions(prev, mapped));
      try {
        sessionStorage.setItem(HANDLER_OPTIONS_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: mapped }));
      } catch {
        // Ignore cache write errors.
      }
    } catch (err) {
      console.error('Error loading handlers:', err);
    }
  }, [t]);

  const loadCaseData = useCallback(async () => {
    setError('');
    setIsLoading(true);
    setIsRelationsLoading(true);
    setAttachments([]);
    setInvestigationNotes([]);
    setCommunicationMessages([]);
    setActionHistory([]);

    try {
      const ticketId = getStoredTicketId();
      if (!ticketId) {
        navigate('/handler-dashboard');
        return;
      }

      const loadId = Date.now();
      activeLoadRef.current = loadId;

      const coreTicket = await ticketService.getTicketById(ticketId, { includeRelations: false });
      if (!isMountedRef.current || activeLoadRef.current !== loadId) return;

      const fallbackRole = t('caseManagement.handler');
      const ticketHandlers = [];
      const directHandler = toHandlerOption(coreTicket?.handlers, fallbackRole);
      if (directHandler) ticketHandlers.push(directHandler);
      for (const entry of coreTicket?.ticketHandlers || []) {
        const fromRelation = toHandlerOption(entry?.handler, fallbackRole);
        if (fromRelation) ticketHandlers.push(fromRelation);
      }
      if (ticketHandlers.length > 0) {
        setAvailableHandlers((prev) => mergeHandlerOptions(prev, ticketHandlers));
      }

      const handlersForFormatting = mergeHandlerOptions(availableHandlersRef.current, ticketHandlers);

      let statuses = [];
      try {
        const wfCode = coreTicket?.workflowType || coreTicket?.workflow_type;
        if (wfCode) {
          const res = await ticketService.getWorkflowStatuses(wfCode);
          statuses = res?.statuses || [];
          if (isMountedRef.current) setWorkflowStatuses(statuses);
        }
      } catch (err) {
        console.warn('Error loading workflow statuses for SLA:', err);
      }

      const statusMeta = resolveStatusMeta(coreTicket, statuses);

      // core
      setCaseData(formatCase(coreTicket, statusMeta, handlersForFormatting));

      const baseActions = [{
        id: 'created',
        actionType: 'created',
        action: t('caseManagement.caseCreated'),
        description: t('caseManagement.newReportReceived'),
        timestamp: coreTicket?.submittedAt || new Date().toISOString(),
        performedBy: t('caseManagement.system'),
      }];

      void (async () => {
        try {
          const relations = await ticketService.getTicketRelations(ticketId);
          if (!isMountedRef.current || activeLoadRef.current !== loadId) return;

          const allAttachments = relations?.attachments ?? [];
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
            (relations?.ticketComments ?? []).map((comment) => ({
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
            (relations?.messages ?? []).map((msg) => {
              const reporterDisplayName =
                String(coreTicket?.reporterName || coreTicket?.reporter_name || '').trim()
                || String(coreTicket?.reporterEmail || coreTicket?.reporter_email || '').trim()
                || t('caseManagement.reporter');

              return {
                id: msg?.id,
                sender: msg?.sender,
                senderName: msg?.sender === 'handler'
                  ? (msg?.handlerName || coreTicket?.handlers?.name || user?.name || t('caseManagement.handler'))
                  : reporterDisplayName,
                timestamp: msg?.createdAt ? fmtDateTime(msg.createdAt, i18n?.resolvedLanguage || i18n?.language) : '-',
                content: msg?.body,
                read: msg?.read ?? msg?.isRead ?? false,
              };
            })
          );

          // actions
          const dbActions = (relations?.ticketActions ?? []).map((a) => ({
            id: a?.id,
            actionType: a?.actionType || 'action',
            action: a?.action || t('caseManagementDetail.actionHistory.defaultAction'),
            description: a?.description || '',
            timestamp: a?.createdAt || new Date().toISOString(),
            performedBy: a?.performedBy || t('caseManagement.system'),
          }));
          setActionHistory([...dbActions, ...baseActions]);
        } catch (relationsErr) {
          console.warn('Error loading case relations:', relationsErr);
          if (isMountedRef.current && activeLoadRef.current === loadId) {
            setActionHistory(baseActions);
          }
        } finally {
          if (isMountedRef.current && activeLoadRef.current === loadId) {
            setIsRelationsLoading(false);
          }
        }
      })();
    } catch (err) {
      console.error('Error loading case:', err);
      if (!isMountedRef.current) return;
      setError(t('caseManagement.errorLoadingCase'));
      setIsRelationsLoading(false);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [formatCase, getStoredTicketId, i18n?.language, i18n?.resolvedLanguage, navigate, t, user?.name]);

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
    if (!hasAssignedHandlers(caseData)) {
      showToast(t('caseManagementDetail.management.assignBeforeStatusChange'));
      return;
    }

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
      setCaseData(formatCase(updatedTicket, statusMeta, availableHandlers));

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
      const { validFiles, errors: attachmentErrors } = validateAttachmentSelection(attachments, attachmentPolicy);
      if (attachmentErrors.length > 0) {
        const first = attachmentErrors[0];
        if (first.reason === 'disabled') {
          showToast(t('reportForm.attachmentsDisabled', { defaultValue: 'Attachments are currently disabled' }));
        } else if (first.reason === 'size') {
          showToast(`${first.fileName}: ${t('reportForm.fileTooLarge')}`);
        } else {
          showToast(`${first.fileName}: ${t('reportForm.invalidFileType')}`);
        }
      }

      const result = await ticketService.addInvestigationNote(
        ticketId,
        noteContent,
        authorName,
        validFiles,
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

  const handleSendMessage = async (messageContent, sendOptions = {}) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const discloseHandlerIdentity = sendOptions?.discloseHandlerIdentity === true;
      const created = await ticketService.addMessage(ticketId, 'handler', messageContent, false, {
        currentHandlerId,
        discloseHandlerIdentity,
      });

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
    if (!attachmentPolicy.attachmentsEnabled) {
      showToast(t('reportForm.attachmentsDisabled', { defaultValue: 'Attachments are currently disabled' }));
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = attachmentPolicy.accept;
    input.multiple = true;

    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      const { validFiles, errors: attachmentErrors } = validateAttachmentSelection(files, attachmentPolicy);
      if (attachmentErrors.length > 0) {
        const first = attachmentErrors[0];
        if (first.reason === 'disabled') {
          showToast(t('reportForm.attachmentsDisabled', { defaultValue: 'Attachments are currently disabled' }));
        } else if (first.reason === 'size') {
          showToast(`${first.fileName}: ${t('reportForm.fileTooLarge')}`);
        } else {
          showToast(`${first.fileName}: ${t('reportForm.invalidFileType')}`);
        }
      }
      if (!validFiles.length) return;

      try {
        showToast(t('caseManagementDetail.toasts.uploadingFiles', { count: validFiles.length }));

        for (const file of validFiles) {
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

  const handleAssignmentChange = async (newHandlerIds) => {
    const ticketId = getStoredTicketId();
    if (!ticketId) return navigate('/handler-dashboard');

    try {
      const normalizedHandlerIds = Array.isArray(newHandlerIds)
        ? newHandlerIds
        : newHandlerIds
          ? [newHandlerIds]
          : [];

      const updatedTicket = await ticketService.setTicketHandlers(ticketId, normalizedHandlerIds, null, { currentHandlerId });

      // Update header and panel assignment immediately.
      setCaseData(formatCase(updatedTicket, null, availableHandlers));

      pushAction({
        actionType: 'assignment',
        action: t('caseManagement.caseReassigned'),
        description: normalizedHandlerIds.length > 0
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
      setCaseData(formatCase(updatedTicket, null, availableHandlers));

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
      <div className="min-h-screen app-page-gradient bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <CaseHeader
            caseData={caseData}
            onBack={handleBack}
            onStatusChange={() => setShowStatusModal(true)}
            onStatusUpdate={handleStatusUpdate} // FlowBar uses this.
            canUpdateStatus={hasAssignedHandlers(caseData)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-5 mt-3 md:mt-4 lg:mt-5">
            <div className="lg:col-span-2 space-y-3 md:space-y-4 lg:space-y-5">
              <CaseDetailsPanel caseData={caseData} onUpdate={handleDetailsUpdate} />

              <AttachmentsPanel
                attachments={attachments}
                onAddAttachment={handleAddAttachment}
                isLoading={isRelationsLoading}
                canAdd={attachmentPolicy.attachmentsEnabled}
              />

              <InvestigationNotesPanel
                notes={investigationNotes}
                onAddNote={handleAddNote}
                isLoading={isRelationsLoading}
                attachmentsPolicy={attachmentPolicy}
                onAttachmentValidationError={(message) => showToast(message)}
              />

              <CommunicationPanel
                messages={communicationMessages}
                canContact={Boolean(caseData?.reporterDetails?.email || caseData?.reporterDetails?.hasSecureEmail)}
                onSendMessage={handleSendMessage}
                isLoading={isRelationsLoading}
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

              <ActionHistoryPanel history={actionHistory} isLoading={isRelationsLoading} />
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


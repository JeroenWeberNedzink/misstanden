const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_');

export const toDateSafe = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const addHours = (date, hours) => {
  const hoursNum = toNumber(hours);
  if (!date || !hoursNum) return null;
  const d = new Date(date);
  d.setHours(d.getHours() + hoursNum);
  return d;
};

const normalizeWorkflowType = (value) => normalizeText(value);

const WHISTLEBLOWER_WORKFLOW_HINTS = [
  'whistleblower',
  'klokkenluid',
  'misstand',
  'integrity',
  'fraud',
];

const HR_WORKFLOW_HINTS = [
  'hr',
  'omgangsvorm',
  'conduct',
  'ongewenst',
  'harass',
  'discriminat',
  'pest',
  'bully',
];

const resolveFlowchartFirstResponseHours = (workflowType) => {
  const normalized = normalizeWorkflowType(workflowType);
  if (!normalized) return null;

  if (WHISTLEBLOWER_WORKFLOW_HINTS.some((hint) => normalized.includes(hint))) {
    return 7 * 24;
  }
  if (HR_WORKFLOW_HINTS.some((hint) => normalized.includes(hint))) {
    return 5 * 24;
  }
  return null;
};

export const getFirstResponseHoursForTicket = (ticket) => {
  const configured = toNumber(
    ticket?.slaResponseHours ??
    ticket?.sla_response_hours ??
    ticket?.metadata?.sla_response_hours ??
    ticket?.metadata?.slaResponseHours
  );
  const workflowType =
    ticket?.workflowType ||
    ticket?.workflow_type ||
    ticket?.workflow?.code ||
    ticket?.workflow?.name ||
    '';
  const flowchartHours = resolveFlowchartFirstResponseHours(workflowType);

  // Keep explicit non-default configuration; otherwise use flowchart defaults.
  if (configured && configured !== 24) return configured;
  if (flowchartHours) return flowchartHours;
  return configured || 24;
};

const RECEIPT_STATUS_HINTS = [
  'ontvangst_bevestigd',
  'bevestiging',
  'receipt_confirmed',
  'receipt_confirmation',
  'acknowledged',
  'acknowledgement',
  'acknowledgment',
  'first_response',
  'erste_reaktion',
  'premiere_reponse',
  'eingangsbestatigung',
  'confirm',
  'confirmation',
];

const statusContainsHint = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return RECEIPT_STATUS_HINTS.some((hint) => normalized.includes(hint));
};

export const isReceiptConfirmationStatus = (statusCode, statusLabel = '') =>
  statusContainsHint(statusCode) || statusContainsHint(statusLabel);

const getCurrentStatusRef = (ticket) => {
  const metadata = ticket?.metadata || {};
  return {
    code:
      ticket?.statusCode ||
      ticket?.status_code ||
      metadata?.workflow_status_code ||
      metadata?.workflowStatusCode ||
      ticket?.currentStage ||
      ticket?.current_stage ||
      '',
    label:
      metadata?.status_label ||
      metadata?.statusLabel ||
      ticket?.status ||
      '',
  };
};

const getActionStatusRef = (action) => {
  const metadata = action?.metadata || {};
  return {
    code:
      action?.to_status_code ||
      action?.toStatusCode ||
      action?.new_status_code ||
      action?.newStatusCode ||
      action?.status_code ||
      action?.statusCode ||
      metadata?.to_status_code ||
      metadata?.toStatusCode ||
      metadata?.status_code ||
      metadata?.statusCode ||
      '',
    label:
      action?.to_status_label ||
      action?.toStatusLabel ||
      action?.new_status_label ||
      action?.newStatusLabel ||
      action?.action ||
      action?.description ||
      '',
  };
};

export const getFirstResponseAt = (ticket, options = {}) => {
  const strictReceiptStatus = options?.strictReceiptStatus !== false;
  const metadata = ticket?.metadata || {};
  const explicitFirstResponseAt =
    metadata?.first_response_at ||
    metadata?.firstResponseAt ||
    ticket?.first_response_at ||
    ticket?.firstResponseAt ||
    null;

  const explicitDate = toDateSafe(explicitFirstResponseAt);
  if (explicitDate) return explicitDate;

  const actions = ticket?.ticketActions || ticket?.ticket_actions || [];
  const statusActions = actions
    .filter((a) => {
      const t = String(a?.action_type || a?.actionType || '').toLowerCase();
      return t === 'status_update' || t === 'status_change';
    });

  const receiptStatusActionDates = statusActions
    .filter((a) => {
      const ref = getActionStatusRef(a);
      return isReceiptConfirmationStatus(ref.code, ref.label);
    })
    .map((a) => toDateSafe(a?.created_at || a?.createdAt))
    .filter(Boolean);
  if (receiptStatusActionDates.length > 0) {
    return new Date(Math.min(...receiptStatusActionDates.map((d) => d.getTime())));
  }

  if (strictReceiptStatus) {
    const currentStatus = getCurrentStatusRef(ticket);
    if (isReceiptConfirmationStatus(currentStatus.code, currentStatus.label)) {
      return (
        toDateSafe(ticket?.lastUpdateAt || ticket?.last_update_at) ||
        toDateSafe(ticket?.submittedAt || ticket?.submitted_at || ticket?.createdAt || ticket?.created_at)
      );
    }
    return null;
  }

  const messages = ticket?.messages || [];
  const messageDates = messages
    .filter((m) => {
      const sender = String(m?.sender ?? '').toLowerCase();
      return sender && sender !== 'reporter';
    })
    .map((m) => toDateSafe(m?.created_at || m?.createdAt))
    .filter(Boolean);

  const allStatusActionDates = statusActions
    .map((a) => toDateSafe(a?.created_at || a?.createdAt))
    .filter(Boolean);

  const all = [...allStatusActionDates, ...messageDates].filter(Boolean);
  if (!all.length) return null;
  return new Date(Math.min(...all.map((d) => d.getTime())));
};

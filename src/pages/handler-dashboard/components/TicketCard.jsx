import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const TicketCard = ({
  ticket,
  workflowStatusMap,
  currentHandlerId,
  currentHandlerName,
  isAssigning = false,
  onQuickStatusChange,
  onAssignToMe
}) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const localeByLanguage = {
    en: 'en-GB',
    nl: 'nl-NL',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-PT',
  };
  const activeLanguage = String(i18n?.resolvedLanguage || i18n?.language || 'en')
    .toLowerCase()
    .split('-')[0];
  const activeLocale = localeByLanguage[activeLanguage] || 'en-GB';
  const dateFormatter = React.useMemo(() => new Intl.DateTimeFormat(activeLocale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }), [activeLocale]);
  const timeFormatter = React.useMemo(() => new Intl.DateTimeFormat(activeLocale, {
    hour: '2-digit',
    minute: '2-digit',
  }), [activeLocale]);

  const getStatusMeta = (statusCode, workflowCode) => {
    const inner = workflowStatusMap?.get(workflowCode);
    if (!inner) return null;
    return inner.get(String(statusCode || '').toLowerCase()) || null;
  };

  // Get status info with colors
  const getStatusInfo = (statusCode, workflowCode) => {
    const meta = getStatusMeta(statusCode, workflowCode);
    return {
      label: meta?.label || statusCode || t('handlerDashboard.common.unknown'),
      color: meta?.color || null,
    };
  };

  // Get severity info with colors
  const getSeverityInfo = (code) => {
    const severityStyles = {
      critical: { label: t('handlerDashboard.severity.critical'), bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-300', icon: 'text-sky-700' },
      high: { label: t('handlerDashboard.severity.high'), bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', icon: 'text-sky-700' },
      medium: { label: t('handlerDashboard.severity.medium'), bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', icon: 'text-sky-600' },
      low: { label: t('handlerDashboard.severity.low'), bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200', icon: 'text-sky-600' }
    };
    return severityStyles[code] || severityStyles.medium;
  };

  const statusInfo = getStatusInfo(ticket?.statusCode, ticket?.workflowType);
  const severityInfo = getSeverityInfo(ticket?.severityCode);

  const submittedAt = ticket?.submittedAt ? new Date(ticket.submittedAt) : null;
  const hasSubmittedAt = submittedAt && !Number.isNaN(submittedAt.getTime());
  const submittedDate = hasSubmittedAt
    ? dateFormatter.format(submittedAt)
    : '-';

  const submittedTime = hasSubmittedAt
    ? timeFormatter.format(submittedAt)
    : '';

  const handlerId =
    ticket?.handlerId ||
    ticket?.handler_id ||
    ticket?.assignedTo ||
    ticket?.assigned_to ||
    ticket?.handlers?.id ||
    null;

  const isAssigned = Boolean(handlerId);
  const normalizedHandlerId = String(handlerId || '').trim();
  const normalizedCurrentHandlerId = String(currentHandlerId || '').trim();
  const isAssignedToCurrentHandler =
    normalizedHandlerId !== '' &&
    normalizedCurrentHandlerId !== '' &&
    normalizedHandlerId === normalizedCurrentHandlerId;
  const assignedHandlerName =
    String(ticket?.handlers?.name || ticket?.handlerName || ticket?.handler_name || '').trim() ||
    (isAssignedToCurrentHandler ? String(currentHandlerName || '').trim() : '');
  const assignedLabel = isAssigned
    ? (assignedHandlerName || `#${normalizedHandlerId.slice(0, 8)}`)
    : t('handlerDashboard.table.unassigned');
  const assignmentLabel = isAssigning
    ? `${t('handlerDashboard.actions.assignToMe')}...`
    : assignedLabel;

  const currentStatusMeta = getStatusMeta(ticket?.statusCode, ticket?.workflowType);
  const isClosed = Boolean(currentStatusMeta?.isTerminal);

  const nextStatusCode = currentStatusMeta?.nextCodes?.[0] || null;
  const nextStatusMeta = nextStatusCode ? getStatusMeta(nextStatusCode, ticket?.workflowType) : null;
  const nextStatusLabel = nextStatusMeta?.label || nextStatusCode;

  const handleViewDetails = () => {
    sessionStorage.setItem('current_case', JSON.stringify(ticket));
    navigate('/case-management-detail');
  };

  const handleQuickStatus = (e, newStatus) => {
    e.stopPropagation();
    if (!onQuickStatusChange || !ticket?.id) return;
    onQuickStatusChange(ticket.id, newStatus);
  };

  const handleAssign = (e) => {
    e.stopPropagation();
    if (!onAssignToMe || !ticket?.id) return;
    onAssignToMe(ticket.id);
  };

return (
  <div
    className="bg-white rounded-2xl border border-gray-200 hover:border-sky-600/40 hover:shadow-xl shadow-md transition-all duration-300 overflow-hidden cursor-pointer group border-t-4 border-t-sky-600"
    onClick={handleViewDetails}
  >
    {/* Header */}
    <div className="border-b border-gray-100 px-6 py-4 bg-gradient-to-r from-white via-white to-slate-50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold text-gray-900">
              #{ticket?.ticketNumber || ticket?.id?.slice(0, 8)}
            </h3>
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm bg-sky-50 border-sky-200"
          >
              <div
                className="w-2 h-2 rounded-full animate-pulse bg-sky-600"
              ></div>
              <span className="text-xs font-semibold text-sky-700">
                {statusInfo.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <Icon name="Calendar" size={13} className="text-gray-500" />
              <span className="font-medium">{submittedDate}</span>
            </div>
            {submittedTime && (
              <>
                <span className="text-gray-400">•</span>
                <div className="flex items-center gap-1.5">
                  <Icon name="Clock" size={13} className="text-gray-500" />
                  <span className="font-medium">{submittedTime}</span>
                </div>
              </>
            )}
            <span className="text-gray-400">•</span>
            <div className="flex items-center gap-1.5">
              <Icon name="UserCheck" size={13} className={isAssigned ? 'text-sky-700' : 'text-gray-500'} />
              <span className={`font-medium ${isAssigned ? 'text-sky-700' : ''}`}>{assignmentLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="p-6">
      {/* Workflow and Handler */}
      <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5 text-sm">
          <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
            <Icon name="GitBranch" size={15} className="text-sky-700" />
          </div>
          <span className="font-semibold text-gray-900">{ticket?.workflowName || ticket?.workflowType || '-'}</span>
        </div>
        {ticket?.handlers?.name && (
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
            <Icon name="User" size={14} className="text-gray-500" />
            <span className="font-medium">{ticket.handlers.name}</span>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="flex items-center gap-2 text-sm text-gray-600 mb-4 bg-gray-50 px-3 py-2 rounded-lg">
        {ticket?.description || t('handlerDashboard.table.noDescription')}
      </p>

      {/* Location if available */}
      {ticket?.location && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-4 bg-gray-50 px-3 py-2 rounded-lg">
          <Icon name="MapPin" size={14} className="text-sky-600" />
          <span className="font-medium">{ticket.location}</span>
        </div>
      )}

      {/* Footer - Severity badge and actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100 gap-3">
        <div className={`flex items-center gap-2.5 px-4 py-2 rounded-lg ${severityInfo.bg} ${severityInfo.border} border shadow-sm`}>
          <Icon name="AlertTriangle" size={15} className={severityInfo.icon} />
          <span className={`text-sm font-bold ${severityInfo.text}`}>{severityInfo.label}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {!isAssigned && currentHandlerId && (
            <button
              onClick={handleAssign}
              disabled={isAssigning}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm hover:shadow-md inline-flex items-center gap-2 ${
                isAssigning
                  ? 'bg-sky-700 text-white cursor-wait'
                  : 'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800'
              }`}
            >
              {isAssigning && <Icon name="Loader2" size={14} className="animate-spin" />}
              {isAssigning ? `${t('handlerDashboard.actions.assignToMe')}...` : t('handlerDashboard.actions.assignToMe')}
            </button>
          )}
          {/* {!isClosed && nextStatusCode && (
            <button
              onClick={(e) => handleQuickStatus(e, nextStatusCode)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800 transition-colors shadow-sm hover:shadow-md"
            >
              Naar {nextStatusLabel || 'volgende'}
            </button>
          )} */}
          <span className="text-xs text-gray-500 font-medium hidden md:inline ml-2">{t('handlerDashboard.actions.clickForDetails')}</span>
        </div>
      </div>
    </div>
  </div>
);
};

export default TicketCard;

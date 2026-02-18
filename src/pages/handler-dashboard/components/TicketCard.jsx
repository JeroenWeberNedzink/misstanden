import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import { format } from 'date-fns';
import { de, enUS, fr, nl, pt } from 'date-fns/locale';

const TicketCard = ({ ticket, workflowStatusMap, currentHandlerId, onQuickStatusChange, onAssignToMe }) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dateFnsLocaleByLanguage = {
    en: enUS,
    nl,
    fr,
    de,
    pt,
  };
  const activeLanguage = String(i18n?.resolvedLanguage || i18n?.language || 'en')
    .toLowerCase()
    .split('-')[0];
  const activeLocale = dateFnsLocaleByLanguage[activeLanguage] || enUS;

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
      critical: { label: t('handlerDashboard.severity.critical'), bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-600' },
      high: { label: t('handlerDashboard.severity.high'), bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'text-orange-600' },
      medium: { label: t('handlerDashboard.severity.medium'), bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: 'text-yellow-600' },
      low: { label: t('handlerDashboard.severity.low'), bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'text-emerald-600' }
    };
    return severityStyles[code] || severityStyles.medium;
  };

  const statusInfo = getStatusInfo(ticket?.statusCode, ticket?.workflowType);
  const severityInfo = getSeverityInfo(ticket?.severityCode);
  const statusAccentStyle = statusInfo.color ? { borderTopColor: statusInfo.color } : undefined;

  const submittedDate = ticket?.submittedAt
    ? format(new Date(ticket.submittedAt), 'dd MMM yyyy', { locale: activeLocale })
    : '-';

  const submittedTime = ticket?.submittedAt
    ? format(new Date(ticket.submittedAt), 'HH:mm', { locale: activeLocale })
    : '';

  const handlerId =
    ticket?.handlerId ||
    ticket?.handler_id ||
    ticket?.assignedTo ||
    ticket?.assigned_to ||
    ticket?.handlers?.id ||
    null;

  const isAssigned = Boolean(handlerId);
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
    className="bg-white rounded-2xl border border-gray-200 hover:border-sky-600/40 hover:shadow-xl shadow-md transition-all duration-300 overflow-hidden cursor-pointer group border-t-4"
    style={statusAccentStyle}
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
            className="flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm bg-gray-50 border-gray-200"
            style={statusInfo.color ? { borderColor: statusInfo.color } : undefined}
          >
              <div
                className="w-2 h-2 rounded-full animate-pulse bg-gray-400"
                style={statusInfo.color ? { backgroundColor: statusInfo.color } : undefined}
              ></div>
              <span
                className="text-xs font-semibold text-gray-700"
                style={statusInfo.color ? { color: statusInfo.color } : undefined}
              >
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
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800 transition-colors shadow-sm hover:shadow-md"
            >
              {t('handlerDashboard.actions.assignToMe')}
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

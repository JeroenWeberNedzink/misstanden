import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

const TicketCard = ({ ticket, workflowStatusMap, currentHandlerId, onQuickStatusChange, onAssignToMe }) => {
  const navigate = useNavigate();

  // Get status info with colors
  const getStatusInfo = (statusCode, workflowCode) => {
    const inner = workflowStatusMap?.get(workflowCode);
    const meta = inner?.get(statusCode?.toLowerCase());

    const statusStyles = {
      new: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
      in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
      resolved: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
      closed: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', dot: 'bg-gray-500' }
    };

    const style = statusStyles[statusCode] || statusStyles.new;
    return {
      label: meta?.label || statusCode || 'Onbekend',
      ...style
    };
  };

  // Get severity info with colors
  const getSeverityInfo = (code) => {
    const severityStyles = {
      critical: { label: 'Kritiek', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-600' },
      high: { label: 'Hoog', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'text-orange-600' },
      medium: { label: 'Gemiddeld', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: 'text-yellow-600' },
      low: { label: 'Laag', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'text-emerald-600' }
    };
    return severityStyles[code] || severityStyles.medium;
  };

  const statusInfo = getStatusInfo(ticket?.statusCode, ticket?.workflowType);
  const severityInfo = getSeverityInfo(ticket?.severityCode);

  const submittedDate = ticket?.submittedAt
    ? format(new Date(ticket.submittedAt), 'dd MMM yyyy', { locale: nl })
    : '-';

  const submittedTime = ticket?.submittedAt
    ? format(new Date(ticket.submittedAt), 'HH:mm', { locale: nl })
    : '';

  const handlerId =
    ticket?.handlerId ||
    ticket?.handler_id ||
    ticket?.assignedTo ||
    ticket?.assigned_to ||
    ticket?.handlers?.id ||
    null;

  const isAssigned = Boolean(handlerId);
  const isClosed = ticket?.statusCode === 'resolved' || ticket?.statusCode === 'closed';

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
      className="bg-white rounded-md border border-border hover:border-primary/30 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden cursor-pointer group"
      onClick={handleViewDetails}
    >
      {/* Header with colored background */}
      <div className={`${statusInfo.bg} ${statusInfo.border} border-b px-5 py-3`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-foreground">
                #{ticket?.ticketNumber || ticket?.id?.slice(0, 8)}
              </h3>
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.border} border`}>
                <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`}></div>
                <span className={`text-xs font-medium ${statusInfo.text}`}>{statusInfo.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="Calendar" size={12} />
              <span>{submittedDate}</span>
              {submittedTime && (
                <>
                  <span>-</span>
                  <Icon name="Clock" size={12} />
                  <span>{submittedTime}</span>
                </>
              )}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white/50 flex items-center justify-center group-hover:bg-white transition-colors">
            <Icon name="ArrowRight" size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>

      <div className="p-5">
        {/* Workflow and Handler */}
        <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm">
            <Icon name="GitBranch" size={14} className="text-muted-foreground" />
            <span className="font-medium text-foreground">{ticket?.workflowName || ticket?.workflowType || '-'}</span>
          </div>
          {ticket?.handlers?.name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="User" size={14} />
              <span>{ticket.handlers.name}</span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-foreground line-clamp-3 mb-3">
          {ticket?.description || 'Geen beschrijving beschikbaar'}
        </p>

        {/* Location if available */}
        {ticket?.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Icon name="MapPin" size={14} />
            <span>{ticket.location}</span>
          </div>
        )}

        {/* Footer - Severity badge */}
        <div className="flex items-center justify-between pt-3 border-t border-border gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${severityInfo.bg} ${severityInfo.border} border`}>
            <Icon name="AlertTriangle" size={14} className={severityInfo.icon} />
            <span className={`text-xs font-semibold ${severityInfo.text}`}>{severityInfo.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isAssigned && currentHandlerId && (
              <button
                onClick={handleAssign}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
              >
                Pak op
              </button>
            )}
            {!isClosed && ticket?.statusCode === 'new' && (
              <button
                onClick={(e) => handleQuickStatus(e, 'in_progress')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                Start
              </button>
            )}
            {!isClosed && ticket?.statusCode === 'in_progress' && (
              <button
                onClick={(e) => handleQuickStatus(e, 'resolved')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                Oplossen
              </button>
            )}
            <span className="text-xs text-muted-foreground hidden md:inline">Klik voor details</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketCard;

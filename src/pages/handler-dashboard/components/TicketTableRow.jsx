import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import StatusBadge from './StatusBadge';
import SeverityBadge from './SeverityBadge';
import { usePermissions } from '../../../hooks/usePermissions';
import { PERMISSIONS } from '../../../utils/permissions';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

// purely UI, not DB logic:
const workflowUI = (workflowCode) => {
  const w = safeLower(workflowCode);

  // Give distinct icons/colors per workflow “type”
  // (This does NOT affect statuses/workflow logic, only visuals)
  if (w.includes('whistle') || w.includes('klokken')) {
    return {
      icon: 'Shield',
      chip: 'bg-sky-50 text-sky-700 border-sky-200',
      dot: 'bg-sky-500',
      label: 'Klokkenluider',
    };
  }
  if (w.includes('it') || w.includes('security')) {
    return {
      icon: 'ShieldCheck',
      chip: 'bg-sky-50 text-sky-700 border-sky-200',
      dot: 'bg-sky-500',
      label: 'IT / Security',
    };
  }
  if (w.includes('hr')) {
    return {
      icon: 'Users',
      chip: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-rose-500',
      label: 'HR',
    };
  }
  if (w.includes('safety') || w.includes('hse')) {
    return {
      icon: 'HardHat',
      chip: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500',
      label: 'Safety',
    };
  }
  return {
    icon: 'ClipboardList',
    chip: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-slate-500',
    label: 'Melding',
  };
};

const TicketTableRow = ({
  ticket,
  onStatusChange,
  onAssignHandler,
  handlerOptions,
  userRole,
  viewMode,
  workflowStatusMap, // Map(workflowCode -> Map(statusCodeLower -> meta))
}) => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  const { canEditTickets } = usePermissions();

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '-';
    }
  };

  const handleViewDetails = () => {
    sessionStorage.setItem('current_case', JSON.stringify(ticket));
    navigate('/case-management-detail');
  };

  // Normalize fields (supports camelCase + snake_case)
  const workflowCode = safeTrim(ticket?.workflowType || ticket?.workflow_type);
  const statusCode = safeTrim(ticket?.statusCode || ticket?.status_code); // generic enum-ish code (new/in_progress/...)
  const currentStage = safeTrim(ticket?.currentStage || ticket?.current_stage); // workflow step code (acknowledged/assessment/...)
  const severityCode = safeTrim(ticket?.severityCode || ticket?.severity_code);
  const submittedAt = ticket?.submittedAt || ticket?.submitted_at;
  const ticketNumber = ticket?.ticketNumber || ticket?.ticket_number;
  const reporterEmail = ticket?.reporterEmail || ticket?.reporter_email;
  const reporterName = ticket?.reporterName || ticket?.reporter_name;

  // Check if ticket is anonymous (no reporter email or name)
  const isAnonymous = !reporterEmail && !reporterName;

  // ✅ DB-driven display code:
  // - If a workflow uses detailed steps, you store that in current_stage
  // - So for the dashboard, prefer current_stage, else fallback to status_code
  const displayCode = useMemo(() => currentStage || statusCode, [currentStage, statusCode]);

  // ✅ Resolve workflow-specific meta (label/color/description) by displayCode
  const statusMeta = useMemo(() => {
    if (!workflowCode || !displayCode || !workflowStatusMap) return null;
    const wfMap = workflowStatusMap.get(workflowCode);
    if (!wfMap) return null;
    return wfMap.get(safeLower(displayCode)) || null;
  }, [workflowCode, displayCode, workflowStatusMap]);

  const displayStatusLabel = statusMeta?.label || displayCode || '-';
  const displayStatusColor = statusMeta?.color || null;

  const isUnassigned = !ticket?.handlers?.name;
  const isCritical = safeLower(severityCode) === 'critical';
  const isHigh = safeLower(severityCode) === 'high';
  const isNew = useMemo(() => {
    if (!workflowCode || !workflowStatusMap) return false;
    const wfMap = workflowStatusMap.get(workflowCode);
    if (!wfMap) return false;
    const statusMeta = wfMap.get(safeLower(statusCode));
    if (!statusMeta) return false;
    const orders = Array.from(wfMap.values()).map((s) => Number(s.order ?? 999));
    const minOrder = orders.length ? Math.min(...orders) : null;
    if (minOrder === null) return false;
    return Number(statusMeta.order ?? 999) === minOrder;
  }, [workflowCode, workflowStatusMap, statusCode]);

  const wfUi = useMemo(() => workflowUI(workflowCode), [workflowCode]);

  // Priority “profile” for visuals (UI-only)
  const priorityProfile = useMemo(() => {
    if (isCritical && isUnassigned) return 'critical_unassigned';
    if (isCritical) return 'critical';
    if (isHigh && isUnassigned) return 'high_unassigned';
    if (isUnassigned) return 'unassigned';
    if (isHigh && isNew) return 'high_new';
    return 'normal';
  }, [isCritical, isHigh, isUnassigned, isNew]);

  // ✅ Cleaner styling: mostly bg-*-50, minimal borders
  const rowStyle = useMemo(() => {
    const base = 'border-b border-border transition-smooth';
    const hover = 'hover:bg-muted/40';

    switch (priorityProfile) {
      case 'critical_unassigned':
        return `${base} ${hover} bg-red-50`;
      case 'critical':
        return `${base} ${hover} bg-red-50/60`;
      case 'high_unassigned':
        return `${base} ${hover} bg-amber-50`;
      case 'unassigned':
        return `${base} ${hover} bg-yellow-50/60`;
      case 'high_new':
        return `${base} ${hover} bg-orange-50/60`;
      default:
        return `${base} ${hover}`;
    }
  }, [priorityProfile]);

  // Thin top bar for “at a glance” distinction (less messy than borders)
  const topAccent = useMemo(() => {
    switch (priorityProfile) {
      case 'critical_unassigned':
      case 'critical':
        return 'bg-red-500';
      case 'high_unassigned':
        return 'bg-amber-500';
      case 'unassigned':
        return 'bg-yellow-500';
      case 'high_new':
        return 'bg-orange-500';
      default:
        return wfUi.dot; // workflow color when normal
    }
  }, [priorityProfile, wfUi.dot]);

  const AttentionPills = () => (
    <div className="flex flex-wrap gap-1.5">
      {isAnonymous && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 flex items-center gap-1">
          <Icon name="User" size={10} />
          ANONIEM
        </span>
      )}
      {isUnassigned && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
          UNASSIGNED
        </span>
      )}
      {isCritical && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800">
          CRITICAL
        </span>
      )}
      {!isCritical && isHigh && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
          HIGH
        </span>
      )}
      {isNew && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
          NEW
        </span>
      )}
    </div>
  );

  const StatusCell = () => (
    <StatusBadge
      status={statusCode}            // keep generic status for icon fallback if your badge uses it
      size="sm"
      label={displayStatusLabel}     // ✅ DB-driven label (from workflows.statuses via map)
      color={displayStatusColor}     // ✅ DB-driven color (optional)
    />
  );

  // Desktop view
  if (viewMode === 'desktop') {
    return (
      <>
        <tr className={rowStyle}>
          {/* Expand + top accent */}
          <td className="px-4 py-4 relative">
            <div className={`absolute left-0 top-0 h-1 w-full ${topAccent} opacity-80`} />
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded transition-smooth"
              aria-label={isExpanded ? 'Inklappen' : 'Uitklappen'}
            >
              <Icon name={isExpanded ? 'ChevronDown' : 'ChevronRight'} size={18} />
            </button>
          </td>

          {/* Ticket # + attention pills */}
          <td className="px-4 py-4">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-sm font-medium text-foreground">{ticketNumber}</span>
              <AttentionPills />
            </div>
          </td>

          <td className="px-4 py-4 text-sm text-muted-foreground">
            {formatDate(submittedAt)}
          </td>

          {/* Workflow “type chip” */}
          <td className="px-4 py-4">
            <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${wfUi.chip}`}>
              <Icon name={wfUi.icon} size={14} />
              <span className="truncate max-w-[10rem]">
                {workflowCode || wfUi.label}
              </span>
            </span>
          </td>

          <td className="px-4 py-4">
            <SeverityBadge severity={severityCode} size="sm" />
          </td>

          <td className="px-4 py-4">
            <StatusCell />
          </td>

          {/* Handler */}
          <td className="px-4 py-4">
            {ticket?.handlers?.name ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon name="User" size={16} color="var(--color-primary)" />
                </div>
                <span className="text-sm text-foreground">{ticket?.handlers?.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center">
                  <Icon name="AlertTriangle" size={16} color="var(--color-warning)" />
                </div>
                <span className="text-sm text-warning font-medium">Niet toegewezen</span>
              </div>
            )}
          </td>

          {/* Actions */}
          <td className="px-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" iconName="Eye" onClick={handleViewDetails}>
                Bekijk
              </Button>

              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  iconName="MoreVertical"
                  onClick={() => setShowActions(!showActions)}
                />

                {showActions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
                    <div className="absolute right-0 mt-2 w-52 bg-popover rounded-lg shadow-lg border border-border z-50">
                      <div className="p-2">
                        {/* View Details */}
                        <button
                          onClick={() => {
                            handleViewDetails();
                            setShowActions(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-smooth text-left"
                        >
                          <Icon name="Eye" size={18} />
                          <span className="text-sm">Bekijk Details</span>
                        </button>

                        {/* Assign Handler (requires edit permission) */}
                        {canEditTickets && (
                          <button
                            onClick={() => {
                              setShowActions(false);
                              setShowAssignMenu(true);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-smooth text-left"
                          >
                            <Icon name="UserPlus" size={18} />
                            <span className="text-sm">Wijs Toe</span>
                          </button>
                        )}

                        <div className="border-t border-border my-2" />

                        <p className="px-4 py-2 text-xs text-muted-foreground font-medium">
                          Status wijzigen via "Bekijk Details"
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>

        {/* Assignment Modal */}
        {showAssignMenu && (
          <tr className="border-b border-border bg-muted/30">
            <td colSpan="8" className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Icon name="UserPlus" size={16} />
                  Handler Toewijzen
                </h4>
                <button
                  onClick={() => setShowAssignMenu(false)}
                  className="p-1 hover:bg-muted rounded transition-smooth"
                >
                  <Icon name="X" size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl">
                {handlerOptions?.length > 0 ? (
                  handlerOptions.map((handler) => (
                    <button
                      key={handler.value || 'unassign'}
                      onClick={() => {
                        onAssignHandler(ticket?.id, handler.value);
                        setShowAssignMenu(false);
                      }}
                      className="flex items-center justify-between px-4 py-2.5 bg-card hover:bg-muted rounded-lg border border-border transition-smooth text-left"
                    >
                      <div className="flex items-center gap-3">
                        <Icon name="User" size={16} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{handler.label}</p>
                          {handler.description && (
                            <p className="text-xs text-muted-foreground">{handler.description}</p>
                          )}
                        </div>
                      </div>
                      <Icon name="ChevronRight" size={14} className="text-muted-foreground" />
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Geen handlers beschikbaar</p>
                )}
              </div>
            </td>
          </tr>
        )}

        {/* Expanded row */}
        {isExpanded && (
          <tr className="hidden lg:table-row border-b border-border bg-muted/30">
            <td colSpan="8" className="px-4 py-6">
              <div className="max-w-4xl">
                <h4 className="text-sm font-semibold text-foreground mb-3">Beschrijving</h4>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{ticket?.description}</p>

                {ticket?.location && (
                  <div className="flex items-start gap-2 mb-3">
                    <Icon name="MapPin" size={16} color="var(--color-muted-foreground)" />
                    <span className="text-sm text-muted-foreground">{ticket?.location}</span>
                  </div>
                )}

                {/* Reporter Information (only for non-anonymous) */}
                {!isAnonymous && (reporterName || reporterEmail) && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Icon name="User" size={16} color="var(--color-primary)" />
                      Melder Informatie
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {reporterName && (
                        <div className="flex items-start gap-2">
                          <Icon name="User" size={14} color="var(--color-muted-foreground)" className="mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Naam</p>
                            <p className="text-sm text-foreground font-medium">{reporterName}</p>
                          </div>
                        </div>
                      )}
                      {reporterEmail && (
                        <div className="flex items-start gap-2">
                          <Icon name="Mail" size={14} color="var(--color-muted-foreground)" className="mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Email</p>
                            <p className="text-sm text-foreground font-medium truncate">
                              <a href={`mailto:${reporterEmail}`} className="hover:text-primary transition-smooth">
                                {reporterEmail}
                              </a>
                            </p>
                          </div>
                        </div>
                      )}
                      {ticket?.reporterPhone && (
                        <div className="flex items-start gap-2">
                          <Icon name="Phone" size={14} color="var(--color-muted-foreground)" className="mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">Telefoon</p>
                            <p className="text-sm text-foreground font-medium">
                              <a href={`tel:${ticket?.reporterPhone}`} className="hover:text-primary transition-smooth">
                                {ticket?.reporterPhone}
                              </a>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  // Mobile view (also bg-*-50, no left borders)
  const mobileCardClass = useMemo(() => {
    const base = 'card mb-4 relative overflow-hidden';
    switch (priorityProfile) {
      case 'critical_unassigned':
        return `${base} bg-red-50`;
      case 'critical':
        return `${base} bg-red-50/60`;
      case 'high_unassigned':
        return `${base} bg-amber-50`;
      case 'unassigned':
        return `${base} bg-yellow-50/60`;
      case 'high_new':
        return `${base} bg-orange-50/60`;
      default:
        return base;
    }
  }, [priorityProfile]);

  return (
    <div className={mobileCardClass}>
      <div className={`absolute left-0 top-0 h-1 w-full ${topAccent} opacity-80`} />

      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm font-medium text-foreground">{ticketNumber}</span>
            <AttentionPills />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{formatDate(submittedAt)}</p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
          onClick={() => setIsExpanded(!isExpanded)}
        />
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Workflow:</span>
          <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${wfUi.chip}`}>
            <span className={`w-2 h-2 rounded-full ${wfUi.dot}`} />
            <Icon name={wfUi.icon} size={14} />
            <span className="truncate max-w-[14rem]">{workflowCode || wfUi.label}</span>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Ernst:</span>
          <SeverityBadge severity={severityCode} size="sm" />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status:</span>
          <StatusCell />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Handler:</span>
          {ticket?.handlers?.name ? (
            <span className="text-sm font-medium text-foreground">{ticket?.handlers?.name}</span>
          ) : (
            <div className="flex items-center gap-1">
              <Icon name="AlertTriangle" size={14} color="var(--color-warning)" />
              <span className="text-sm text-warning font-medium">Niet toegewezen</span>
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border pt-4 mb-4">
          <h4 className="text-sm font-semibold text-foreground mb-2">Beschrijving</h4>
          <p className="text-sm text-muted-foreground mb-3">{ticket?.description}</p>

          {ticket?.location && (
            <div className="flex items-start gap-2 mb-2">
              <Icon name="MapPin" size={16} color="var(--color-muted-foreground)" />
              <span className="text-sm text-muted-foreground">{ticket?.location}</span>
            </div>
          )}

          {/* Reporter Information (only for non-anonymous) */}
          {!isAnonymous && (reporterName || reporterEmail) && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Icon name="User" size={16} color="var(--color-primary)" />
                Melder Informatie
              </h4>
              <div className="space-y-3">
                {reporterName && (
                  <div className="flex items-start gap-2">
                    <Icon name="User" size={14} color="var(--color-muted-foreground)" className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Naam</p>
                      <p className="text-sm text-foreground font-medium">{reporterName}</p>
                    </div>
                  </div>
                )}
                {reporterEmail && (
                  <div className="flex items-start gap-2">
                    <Icon name="Mail" size={14} color="var(--color-muted-foreground)" className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm text-foreground font-medium truncate">
                        <a href={`mailto:${reporterEmail}`} className="hover:text-primary transition-smooth">
                          {reporterEmail}
                        </a>
                      </p>
                    </div>
                  </div>
                )}
                {ticket?.reporterPhone && (
                  <div className="flex items-start gap-2">
                    <Icon name="Phone" size={14} color="var(--color-muted-foreground)" className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Telefoon</p>
                      <p className="text-sm text-foreground font-medium">
                        <a href={`tel:${ticket?.reporterPhone}`} className="hover:text-primary transition-smooth">
                          {ticket?.reporterPhone}
                        </a>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" fullWidth iconName="Eye" iconPosition="left" onClick={handleViewDetails}>
          Bekijk Details
        </Button>
        <Button variant="ghost" size="icon" iconName="MoreVertical" onClick={() => setShowActions(!showActions)} />
      </div>
    </div>
  );
};

export default TicketTableRow;

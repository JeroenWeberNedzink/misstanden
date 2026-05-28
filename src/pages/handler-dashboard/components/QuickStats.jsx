import React from 'react';
import Icon from '../../../components/AppIcon';
import { useTranslation } from 'react-i18next';
import { toDateSafe } from '../../../utils/slaUtils';

const StatCard = ({ icon, label, value, color, bgColor }) => (
  <div className={`${bgColor} rounded-xl border border-border p-4 hover:shadow-md transition-shadow`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-lg ${bgColor} flex items-center justify-center`}>
        <Icon name={icon} size={24} className={color} />
      </div>
    </div>
  </div>
);

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

const QuickStats = ({ tickets, currentHandlerId, workflowStatusMap = new Map() }) => {
  const { t } = useTranslation();
  // Simple, accurate stats
  const getTicketHandlerId = (ticket) =>
    ticket?.handlerId ||
    ticket?.handler_id ||
    ticket?.assignedTo ||
    ticket?.assigned_to ||
    ticket?.handlers?.id ||
    null;

  const todayKey = new Date().toDateString();

  const isOpen = (t) => {
    const wfCode = safeTrim(t?.workflowType || t?.workflow_type);
    const statusCode = safeTrim(t?.statusCode || t?.status_code);
    const wfMap = workflowStatusMap.get(wfCode);
    const meta = wfMap?.get(safeLower(statusCode));
    return meta ? !meta.isTerminal : true;
  };

  const stats = {
    total: tickets?.length || 0,
    // Open = not terminal in workflow_statuses
    open: tickets?.filter(isOpen)?.length || 0,
    // Unassigned and open
    unassigned: tickets?.filter(t => !getTicketHandlerId(t) && isOpen(t))?.length || 0,
    // High priority (critical or high severity)
    highPriority: tickets?.filter(t => t?.severityCode === 'critical' || t?.severityCode === 'high')?.length || 0,
    // Mine (open)
    mineOpen: tickets?.filter(t =>
      isOpen(t) &&
      getTicketHandlerId(t) === currentHandlerId
    )?.length || 0,
    // Today
    today: tickets?.filter(t => {
      const submittedAt = toDateSafe(t?.submittedAt || t?.submitted_at);
      return submittedAt ? submittedAt.toDateString() === todayKey : false;
    })?.length || 0,
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatCard
        icon="Inbox"
        label={t('handlerDashboard.quickStats.totalTickets')}
        value={stats.total}
        color="text-primary"
        bgColor="bg-primary/5"
      />
      <StatCard
        icon="FolderOpen"
        label={t('handlerDashboard.summary.open')}
        value={stats.open}
        color="text-sky-600"
        bgColor="bg-sky-50"
      />
      <StatCard
        icon="UserX"
        label={t('handlerDashboard.summary.unassigned')}
        value={stats.unassigned}
        color="text-amber-600"
        bgColor="bg-amber-50"
      />
      <StatCard
        icon="AlertTriangle"
        label={t('handlerDashboard.quickStats.highPriority')}
        value={stats.highPriority}
        color="text-red-600"
        bgColor="bg-red-50"
      />
      <StatCard
        icon="UserCheck"
        label={t('handlerDashboard.summary.mineOpen')}
        value={stats.mineOpen}
        color="text-indigo-600"
        bgColor="bg-indigo-50"
      />
      <StatCard
        icon="Calendar"
        label={t('handlerDashboard.summary.today')}
        value={stats.today}
        color="text-emerald-600"
        bgColor="bg-emerald-50"
      />
    </div>
  );
};

export default QuickStats;

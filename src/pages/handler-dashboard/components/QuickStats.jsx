import React from 'react';
import Icon from '../../../components/AppIcon';

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

const QuickStats = ({ tickets }) => {
  // Simple, accurate stats
  const stats = {
    total: tickets?.length || 0,
    // Open = not resolved and not closed
    open: tickets?.filter(t => t?.statusCode !== 'resolved' && t?.statusCode !== 'closed')?.length || 0,
    // Unassigned or new
    unassigned: tickets?.filter(t => !t?.assignedTo && t?.statusCode !== 'resolved' && t?.statusCode !== 'closed')?.length || 0,
    // High priority (critical or high severity)
    highPriority: tickets?.filter(t => t?.severityCode === 'critical' || t?.severityCode === 'high')?.length || 0,
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon="Inbox"
        label="Totaal Tickets"
        value={stats.total}
        color="text-primary"
        bgColor="bg-primary/5"
      />
      <StatCard
        icon="FolderOpen"
        label="Open"
        value={stats.open}
        color="text-sky-600"
        bgColor="bg-sky-50"
      />
      <StatCard
        icon="UserX"
        label="Onbehandeld"
        value={stats.unassigned}
        color="text-amber-600"
        bgColor="bg-amber-50"
      />
      <StatCard
        icon="AlertTriangle"
        label="Hoge Prioriteit"
        value={stats.highPriority}
        color="text-red-600"
        bgColor="bg-red-50"
      />
    </div>
  );
};

export default QuickStats;

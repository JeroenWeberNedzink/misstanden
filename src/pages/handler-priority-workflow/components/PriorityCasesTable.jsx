import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

import { useNavigate } from 'react-router-dom';

const PriorityCasesTable = ({ cases, isLoading, handlers, onPriorityUpdate, onReassign }) => {
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState({ key: 'priorityScore', direction: 'desc' });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev?.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedCases = [...cases]?.sort((a, b) => {
    const aValue = a?.[sortConfig?.key];
    const bValue = b?.[sortConfig?.key];
    
    if (sortConfig?.direction === 'asc') {
      return aValue > bValue ? 1 : -1;
    }
    return aValue < bValue ? 1 : -1;
  });

  const getSeverityBadge = (severity) => {
    const severityConfig = {
      critical: { color: 'bg-error text-white', icon: 'AlertTriangle', label: 'Critical' },
      high: { color: 'bg-warning text-white', icon: 'AlertCircle', label: 'High' }
    };

    const config = severityConfig?.[severity] || severityConfig?.high;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${config?.color}`}>
        <Icon name={config?.icon} size={14} />
        {config?.label}
      </span>
    );
  };

  const getDeadlineIndicator = (hoursUntilDeadline, isOverdue) => {
    if (isOverdue) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-error/10 text-error">
          <Icon name="AlertTriangle" size={14} />
          Overdue
        </span>
      );
    }

    if (hoursUntilDeadline === null) {
      return <span className="text-xs text-muted-foreground">No deadline</span>;
    }

    if (hoursUntilDeadline < 24) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-warning/10 text-warning">
          <Icon name="Clock" size={14} />
          {Math.round(hoursUntilDeadline)}h left
        </span>
      );
    }

    const daysLeft = Math.round(hoursUntilDeadline / 24);
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
        <Icon name="Calendar" size={14} />
        {daysLeft}d left
      </span>
    );
  };

  const SortableHeader = ({ label, sortKey }) => (
    <th 
      className="px-4 py-4 text-left cursor-pointer hover:bg-muted/50 transition-smooth"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Icon 
          name={sortConfig?.key === sortKey && sortConfig?.direction === 'asc' ? 'ArrowUp' : 'ArrowDown'} 
          size={16}
          color={sortConfig?.key === sortKey ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
        />
      </div>
    </th>
  );

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (cases?.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
          <Icon name="CheckCircle2" size={32} color="var(--color-success)" />
        </div>
        <h3 className="text-lg md:text-xl font-semibold text-foreground mb-2">
          No Priority Cases
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Great work! There are no urgent or high-severity cases requiring immediate attention.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-6 px-4 md:px-0">
        <h2 className="text-xl md:text-2xl font-semibold text-foreground">
          Priority Cases
          <span className="ml-3 text-sm font-normal text-muted-foreground">
            ({cases?.length} {cases?.length === 1 ? 'case' : 'cases'})
          </span>
        </h2>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <SortableHeader label="Priority" sortKey="priorityScore" />
              <SortableHeader label="Ticket #" sortKey="ticketNumber" />
              <SortableHeader label="Severity" sortKey="severityCode" />
              <th className="px-4 py-4 text-left">
                <span className="text-sm font-semibold text-foreground">Workflow</span>
              </th>
              <th className="px-4 py-4 text-left">
                <span className="text-sm font-semibold text-foreground">Handler</span>
              </th>
              <SortableHeader label="Time Assigned" sortKey="hoursSinceAssignment" />
              <th className="px-4 py-4 text-left">
                <span className="text-sm font-semibold text-foreground">Deadline</span>
              </th>
              <th className="px-4 py-4 text-left">
                <span className="text-sm font-semibold text-foreground">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedCases?.map((ticket) => (
              <tr key={ticket?.id} className="border-b border-border hover:bg-muted/30 transition-smooth">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                      ticket?.priorityScore > 120 ? 'bg-error text-white' :
                      ticket?.priorityScore > 80 ? 'bg-warning text-white': 'bg-primary/10 text-primary'
                    }`}>
                      {ticket?.priorityScore}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm font-medium text-primary hover:underline cursor-pointer"
                       onClick={() => navigate(`/case-management-detail?id=${ticket?.id}`)}>
                    {ticket?.ticketNumber}
                  </div>
                </td>
                <td className="px-4 py-4">
                  {getSeverityBadge(ticket?.severityCode)}
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-foreground capitalize">
                    {ticket?.workflowType}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm font-medium text-foreground">
                    {ticket?.handlers?.name || 'Unassigned'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-foreground">
                    {ticket?.hoursSinceAssignment}h ago
                  </div>
                </td>
                <td className="px-4 py-4">
                  {getDeadlineIndicator(ticket?.hoursUntilDeadline, ticket?.isOverdue)}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconName="ExternalLink"
                      onClick={() => navigate(`/case-management-detail?id=${ticket?.id}`)}
                    >
                      View
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {sortedCases?.map((ticket) => (
          <div key={ticket?.id} className="border border-border rounded-lg p-4 hover:shadow-md transition-smooth">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${
                  ticket?.priorityScore > 120 ? 'bg-error text-white' :
                  ticket?.priorityScore > 80 ? 'bg-warning text-white': 'bg-primary/10 text-primary'
                }`}>
                  {ticket?.priorityScore}
                </div>
                <div>
                  <div className="text-sm font-medium text-primary">
                    {ticket?.ticketNumber}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {ticket?.workflowType}
                  </div>
                </div>
              </div>
              {getSeverityBadge(ticket?.severityCode)}
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Handler:</span>
                <span className="font-medium text-foreground">{ticket?.handlers?.name || 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Assigned:</span>
                <span className="text-foreground">{ticket?.hoursSinceAssignment}h ago</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Deadline:</span>
                {getDeadlineIndicator(ticket?.hoursUntilDeadline, ticket?.isOverdue)}
              </div>
            </div>
            <Button
              variant="outline"
              fullWidth
              iconName="ExternalLink"
              iconPosition="left"
              onClick={() => navigate(`/case-management-detail?id=${ticket?.id}`)}
            >
              View Case
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PriorityCasesTable;
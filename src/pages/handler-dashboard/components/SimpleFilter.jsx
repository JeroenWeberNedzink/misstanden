import React from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';

const SimpleFilter = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  severityFilter,
  onSeverityChange,
  scopeFilter,
  onScopeChange,
  statusOptions = [],
}) => {
  const statusButtons = [
    { value: 'all', label: 'Alle', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
    ...statusOptions.map((o) => ({
      value: o.value,
      label: o.label || o.value,
      color: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    })),
  ];

  const severityButtons = [
    { value: 'all', label: 'Alle Ernst', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
    { value: 'critical', label: 'Kritiek', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
    { value: 'high', label: 'Hoog', color: 'bg-orange-50 text-orange-700 hover:bg-orange-100' },
  ];

  const scopeButtons = [
    { value: 'all', label: 'Alles', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200' },
    { value: 'mine', label: 'Mijn', color: 'bg-sky-50 text-sky-700 hover:bg-sky-100' },
    { value: 'unassigned', label: 'Onbehandeld', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
    { value: 'today', label: 'Vandaag', color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  ];

  const hasFilters = search || statusFilter !== 'all' || severityFilter !== 'all' || scopeFilter !== 'all';

  const clearFilters = () => {
    onSearchChange('');
    onStatusChange('all');
    onSeverityChange('all');
    onScopeChange('all');
  };

  return (
    <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
      <div className="space-y-4">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Zoek op ticket nummer of beschrijving..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Icon name="X" size={16} />
              <span className="text-sm font-medium">Reset</span>
            </button>
          )}
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Scope:</span>
            {scopeButtons.map(btn => (
              <button
                key={btn.value}
                onClick={() => onScopeChange(btn.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  scopeFilter === btn.value
                    ? 'ring-2 ring-primary ring-offset-1'
                    : ''
                } ${btn.color}`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-border"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            {statusButtons.map(btn => (
              <button
                key={btn.value}
                onClick={() => onStatusChange(btn.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === btn.value
                    ? 'ring-2 ring-primary ring-offset-1'
                    : ''
                } ${btn.color}`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-border"></div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Ernst:</span>
            {severityButtons.map(btn => (
              <button
                key={btn.value}
                onClick={() => onSeverityChange(btn.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  severityFilter === btn.value
                    ? 'ring-2 ring-primary ring-offset-1'
                    : ''
                } ${btn.color}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleFilter;

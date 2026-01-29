import React from 'react';
import Select from '../../../components/ui/Select';
import Button from '../../../components/ui/Button';

const PriorityFilters = ({ filters, onFilterChange, onClearFilters, handlers }) => {
  const severityOptions = [
    { value: 'all', label: 'All Severities' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' }
  ];

  const workflowOptions = [
    { value: 'all', label: 'All Workflows' },
    { value: 'integriteit', label: 'Integriteit' },
    { value: 'veiligheid', label: 'Veiligheid' },
    { value: 'discriminatie', label: 'Discriminatie' },
    { value: 'milieu', label: 'Milieu' }
  ];

  const handlerOptions = [
    { value: 'all', label: 'All Handlers' },
    ...handlers?.map(h => ({ value: h?.id, label: h?.name }))
  ];

  const hasActiveFilters = filters?.severity !== 'all' || 
                          filters?.workflowType !== 'all' || 
                          filters?.handlerId !== 'all';

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-semibold text-foreground">
          Filters
        </h2>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            iconName="X"
            iconPosition="left"
            onClick={onClearFilters}
          >
            Wis Filters
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Select
          label="Severity Level"
          options={severityOptions}
          value={filters?.severity}
          onChange={(value) => onFilterChange('severity', value)}
          placeholder="Select severity"
        />

        <Select
          label="Workflow Type"
          options={workflowOptions}
          value={filters?.workflowType}
          onChange={(value) => onFilterChange('workflowType', value)}
          placeholder="Select workflow"
        />

        <Select
          label="Assigned Handler"
          options={handlerOptions}
          value={filters?.handlerId}
          onChange={(value) => onFilterChange('handlerId', value)}
          placeholder="Select handler"
        />
      </div>
    </div>
  );
};

export default PriorityFilters;
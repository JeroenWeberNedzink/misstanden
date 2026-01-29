import React from 'react';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Icon from '../../../components/AppIcon';

export default function FilterControls({ filterStatus, setFilterStatus, searchQuery, setSearchQuery }) {
  const statusOptions = [
    { value: 'all', label: 'Alle Statussen' },
    { value: 'active', label: 'Actief' },
    { value: 'inactive', label: 'Inactief' }
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Icon name="Search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Zoek workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e?.target?.value)}
            className="pl-10"
          />
        </div>
        <Select
          options={statusOptions}
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="Filter op status"
        />
      </div>
    </div>
  );
}
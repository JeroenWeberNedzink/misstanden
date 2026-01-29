import React, { useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';

const safeLower = (v) => String(v ?? '').toLowerCase();

export default function WorkflowsTableList({
  workflows,
  selectedWorkflow,
  onSelectWorkflow,
  onToggleStatus,
  onDuplicate,
  isBusy,
}) {
  const [sortField, setSortField] = useState('displayOrder'); // displayOrder | name | active | createdAt | usageCount
  const [sortDirection, setSortDirection] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const fmtDate = (v) => {
    if (!v) return '-';
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '-';
      return d.toLocaleDateString('nl-NL');
    } catch {
      return '-';
    }
  };

  const sortedWorkflows = useMemo(() => {
    const list = [...(workflows || [])];

    return list.sort((a, b) => {
      let aVal = a?.[sortField];
      let bVal = b?.[sortField];

      if (sortField === 'createdAt') {
        aVal = new Date(aVal || 0);
        bVal = new Date(bVal || 0);
      }

      if (sortField === 'name') {
        aVal = safeLower(aVal);
        bVal = safeLower(bVal);
      }

      if (typeof aVal === 'boolean' || typeof bVal === 'boolean') {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
      }

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [workflows, sortField, sortDirection]);

  const SortTh = ({ field, label, className = '' }) => {
    const active = sortField === field;
    return (
      <th
        className={[
          'text-left text-xs font-semibold text-muted-foreground px-3 py-2 select-none',
          'cursor-pointer hover:text-foreground transition-colors whitespace-nowrap',
          className,
        ].join(' ')}
        onClick={() => handleSort(field)}
        role="button"
        aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className="inline-flex items-center gap-1.5">
          {label}
          {active && (
            <Icon
              name={sortDirection === 'asc' ? 'ChevronUp' : 'ChevronDown'}
              size={14}
              className="opacity-80"
            />
          )}
        </span>
      </th>
    );
  };

  const StatusBadge = ({ active }) => (
    <span
      className={[
        'inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-full border whitespace-nowrap',
        active ? 'border-border bg-background text-foreground' : 'border-border bg-muted/30 text-muted-foreground',
      ].join(' ')}
      title={active ? 'Actief' : 'Inactief'}
    >
      <span className={['w-1.5 h-1.5 rounded-full', active ? 'bg-sky-500' : 'bg-muted-foreground'].join(' ')} />
      {active ? 'Actief' : 'Inactief'}
    </span>
  );

  const ToggleButton = ({ active, onClick, disabled }) => {
    // Your rule:
    // - inactive => sky-50 button to activate
    // - active => white button to deactivate
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition text-xs font-semibold',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          active
            ? 'bg-white border-border text-foreground hover:bg-muted/20' // white-ish deactivate
            : 'bg-sky-50 border-sky-200 text-sky-900 hover:bg-sky-100',   // sky-50 activate
        ].join(' ')}
      >
        {/* <Icon name={active ? 'PauseCircle' : 'PlayCircle'} size={14} /> */}
        <span className="hidden sm:inline">{active ? 'Deactiveer' : 'Activeer'}</span>
      </button>
    );
  };

  if (!workflows?.length) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Icon name="Workflow" size={44} className="mx-auto mb-3 opacity-60" />
        <p className="mb-1">Geen workflows gevonden</p>
        <p className="text-sm">Maak een nieuwe workflow aan om te beginnen.</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-background border-b border-border">
            <tr>
              <SortTh field="name" label="Workflow" className="min-w-[240px]" />
              <SortTh field="active" label="Status" />
              <SortTh field="createdAt" label="Aangemaakt" />
              <th className="text-right text-xs font-semibold text-muted-foreground px-3 py-2 whitespace-nowrap">
                Acties
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {sortedWorkflows.map((w) => {
              const isSelected = selectedWorkflow?.id === w?.id;
              const active = Boolean(w?.active);

              return (
                <tr
                  key={w?.id}
                  className={[
                    'transition-colors',
                    isSelected ? 'bg-muted/30' : 'hover:bg-muted/20',
                  ].join(' ')}
                >
                  {/* Workflow */}
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectWorkflow?.(w)}
                      disabled={isBusy}
                      className="w-full text-left disabled:opacity-70"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={[
                            'mt-0.5 h-8 w-8 rounded-lg border flex items-center justify-center shrink-0',
                            isSelected
                              ? 'border-sky-200 bg-sky-50 text-sky-900'
                              : 'border-border bg-muted/20 text-muted-foreground',
                          ].join(' ')}
                        >
                          <Icon name="GitBranch" size={16} />
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate max-w-[420px]">
                            {w?.name || 'Workflow'}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono truncate max-w-[520px]">
                            {w?.code || '-'}
                          </p>
                          {w?.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[620px] mt-0.5">
                              {w.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <StatusBadge active={active} />
                  </td>

                  {/* Created */}
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {fmtDate(w?.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      {/* Optional duplicate, still kept commented if you don't want it */}
                      {/* <button
                        type="button"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/30 transition text-xs"
                        onClick={() => onDuplicate?.(w)}
                        disabled={isBusy}
                        title="Dupliceren"
                      >
                        <Icon name="Copy" size={14} />
                      </button> */}

                      <ToggleButton
                        active={active}
                        onClick={() => onToggleStatus?.(w)}
                        disabled={isBusy}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
        Klik op een rij om te bewerken in het paneel hieronder.
      </div>
    </div>
  );
}
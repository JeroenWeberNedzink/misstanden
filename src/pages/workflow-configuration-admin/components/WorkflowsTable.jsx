import React, { useMemo } from 'react';
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
      const activeScore = Number(Boolean(b?.active)) - Number(Boolean(a?.active));
      if (activeScore !== 0) return activeScore;
      return safeLower(a?.name).localeCompare(safeLower(b?.name));
    });
  }, [workflows]);

  const StatusBadge = ({ active }) => (
    <span
      className={[
        'inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap',
        active
          ? 'border-sky-300 bg-sky-50 text-sky-700'
          : 'border-slate-300 bg-slate-50 text-slate-700',
      ].join(' ')}
      title={active ? 'Actief' : 'Inactief'}
    >
      <span
        className={['w-1.5 h-1.5 rounded-full', active ? 'bg-sky-700' : 'bg-slate-500'].join(' ')}
      />
      {active ? 'Actief' : 'Inactief'}
    </span>
  );

  const ToggleButton = ({ active, onClick, disabled }) => {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition text-xs font-semibold',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          active
            ? 'bg-white border-border text-foreground hover:bg-muted/20'
            : 'bg-sky-50 border-sky-200 text-sky-900 hover:bg-sky-100',
        ].join(' ')}
      >
        {active ? 'Deactiveer' : 'Activeer'}
      </button>
    );
  };

  if (!workflows?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
        <Icon name="Workflow" size={44} className="mx-auto mb-3 opacity-60" />
        <p className="mb-1">Geen workflows gevonden</p>
        <p className="text-sm">Maak een nieuwe workflow aan om te beginnen.</p>
      </div>
    );
  }

  return (
    <div className="bg-transparent">
      <div className="px-0 pb-4 border-b border-sky-100">
        <div className="flex items-start gap-2">
          <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-sm font-bold inline-flex items-center justify-center mt-0.5">
            1
          </span>
          <div>
            <h4 className="text-base font-bold text-sky-700">Stap 1 - Kies een workflow</h4>
            <p className="text-sm text-muted-foreground mt-0.5">
              Selecteer een workflow om de instellingen hieronder te beheren.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border border-y border-border bg-white">
        {sortedWorkflows.map((w) => {
          const isSelected = selectedWorkflow?.id === w?.id;
          const active = Boolean(w?.active);
          const statusCount = Number(w?.statusCount ?? w?.status_count);

          return (
            <div
              key={w?.id}
              className={[
                'p-4 transition-colors',
                isSelected ? 'bg-sky-50 border-l-4 border-l-sky-600' : 'hover:bg-muted/20',
              ].join(' ')}
            >
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                <button
                  type="button"
                  onClick={() => onSelectWorkflow?.(w)}
                  disabled={isBusy}
                  className="min-w-0 text-left disabled:opacity-70"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={[
                        'mt-0.5 h-9 w-9 rounded-lg border flex items-center justify-center shrink-0',
                        isSelected
                          ? 'border-sky-200 bg-sky-50 text-sky-900'
                          : 'border-border bg-muted/20 text-muted-foreground',
                      ].join(' ')}
                    >
                      <Icon name="GitBranch" size={16} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <p className="font-semibold text-foreground truncate max-w-[520px]">
                          {w?.name || 'Workflow'}
                        </p>
                        {isSelected && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">
                            Geselecteerd
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate max-w-[620px]">
                        {w?.code || '-'}
                      </p>
                      {w?.description && (
                        <p className="text-sm text-muted-foreground truncate max-w-[700px] mt-0.5">
                          {w.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge active={active} />
                        <span className="text-xs px-2 py-1 rounded-full border border-border bg-white text-muted-foreground">
                          Aangemaakt: {fmtDate(w?.createdAt)}
                        </span>
                        {Number.isFinite(statusCount) && (
                          <span className="text-xs px-2 py-1 rounded-full border border-border bg-white text-muted-foreground">
                            {statusCount} statussen
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 lg:justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/30 transition text-xs"
                    onClick={() => onDuplicate?.(w)}
                    disabled={isBusy}
                    title="Dupliceren"
                  >
                    <Icon name="Copy" size={14} />
                    Dupliceren
                  </button>

                  <ToggleButton active={active} onClick={() => onToggleStatus?.(w)} disabled={isBusy} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-0 py-2 text-sm text-muted-foreground">
        Tip: begin bij een bestaande workflow.
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';
import Select from '../../../components/ui/Select';
import { useTranslation } from 'react-i18next';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';

const safeTrim = (v) => String(v ?? '').trim();

const parseStatuses = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeStatusesToOptions = (statusesRaw, allStatusesLabel, { includeAll = true } = {}) => {
  const statuses = parseStatuses(statusesRaw);

  const opts = statuses
    .filter((s) => s && safeTrim(s.code) && safeTrim(s.label))
    .map((s) => ({
      value: safeTrim(s.code),
      label: safeTrim(s.label),
      description: safeTrim(s.description) || undefined,
      // keep extra metadata around if your Select supports it later
      color: safeTrim(s.color) || undefined,
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : 999,
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  if (!opts.length) {
    return includeAll ? [{ value: 'all', label: allStatusesLabel }] : [];
  }

  return includeAll
    ? [{ value: 'all', label: allStatusesLabel }, ...opts]
    : opts;
};

const dedupeOptionsByValue = (options) => {
  const seen = new Set();
  const out = [];
  for (const o of options) {
    if (!o?.value) continue;
    if (seen.has(o.value)) continue;
    seen.add(o.value);
    out.push(o);
  }
  return out;
};

const FilterControls = ({
  filters,
  onFilterChange,
  onClearFilters,

  // workflowOptions: should be [{ value:'all', label:'Alle workflows' }, {value: code, label: name, ...maybe statuses}]
  workflowOptions,
  severityOptions,

  /**
   * NEW (recommended): pass the workflow objects you already loaded from DB
   * Example item: { code, name, statuses }
   */
  workflows = [],
}) => {
  const { t } = useTranslation();
  const allStatusesLabel = t('handlerDashboard.filters.allStatuses');
  const hasActiveFilters =
    filters?.workflow !== 'all' ||
    filters?.severity !== 'all' ||
    filters?.status !== 'all' ||
    filters?.dateFrom ||
    filters?.dateTo ||
    filters?.search;

  // Find selected workflow object (from DB list) so we can read its statuses JSON
  const selectedWorkflow = useMemo(() => {
    const code = filters?.workflow;
    if (!code || code === 'all') return null;
    return workflows?.find((w) => safeTrim(w?.code) === safeTrim(code)) || null;
  }, [filters?.workflow, workflows]);

  // Status options:
  // - If a workflow is selected: use that workflow's statuses
  // - Else: build a merged list from all workflows (nice UX)
  const statusOptions = useMemo(() => {
    if (selectedWorkflow?.statuses) {
      return normalizeStatusesToOptions(selectedWorkflow.statuses, allStatusesLabel, { includeAll: true });
    }

    // No workflow selected -> merged list across workflows
    const merged = workflows.flatMap((w) => normalizeStatusesToOptions(w?.statuses, allStatusesLabel, { includeAll: false }));
    const uniqueMerged = dedupeOptionsByValue(
      merged.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    );

    // If still empty: show only "All"
    if (!uniqueMerged.length) {
      return [{ value: 'all', label: allStatusesLabel }];
    }

    return [{ value: 'all', label: allStatusesLabel }, ...uniqueMerged];
  }, [allStatusesLabel, selectedWorkflow, workflows]);

  // If user switches workflow, their current status filter might become invalid.
  // This makes UX smoother: if current selected status isn't in the list -> reset to 'all'.
  const isCurrentStatusValid = useMemo(() => {
    const cur = safeTrim(filters?.status);
    if (!cur || cur === 'all') return true;
    return statusOptions.some((o) => o.value === cur);
  }, [filters?.status, statusOptions]);

  // (Optional) auto-fix invalid status selection
  React.useEffect(() => {
    if (!isCurrentStatusValid) {
      onFilterChange('status', 'all');
    }
  }, [isCurrentStatusValid, onFilterChange]);

  return (
    <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Search bar */}
        <div className="flex-1 w-full">
          <Input
            type="search"
            placeholder={t('handlerDashboard.searchPlaceholder')}
            value={filters?.search}
            onChange={(e) => onFilterChange('search', e?.target?.value)}
            className="w-full"
          />
        </div>

        {/* Quick status filters (DB-driven) */}
        <div className="flex items-center gap-2 flex-wrap">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onFilterChange('status', opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filters?.status === opt.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-muted text-foreground hover:bg-muted/70'
              }`}
            >
              {opt.label}
            </button>
          ))}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              iconName="X"
              onClick={onClearFilters}
            >
              {t('handlerDashboard.actions.reset')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilterControls;

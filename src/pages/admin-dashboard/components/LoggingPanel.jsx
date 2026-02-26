import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { auditLogService } from '../../../services/auditLogService';
import { subDays, format } from 'date-fns';

// ------------------------------
// Small helpers
// ------------------------------
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const toShortString = (v) => {
  if (v === null) return 'null';
  if (v === undefined) return '—';
  if (typeof v === 'string') return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? `[${v.length} items]` : '[]';
  if (isObject(v)) return '{…}';
  return String(v);
};

const normForCompare = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const buildDiffRows = (oldData = {}, newData = {}) => {
  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  const rows = [];

  for (const key of keys) {
    const before = oldData?.[key];
    const after = newData?.[key];

    if (normForCompare(before) === normForCompare(after)) continue;

    const type =
      before === undefined ? 'added' : after === undefined ? 'removed' : 'changed';

    rows.push({ key, before, after, type });
  }

  const rank = { changed: 0, added: 1, removed: 2 };
  rows.sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9) || a.key.localeCompare(b.key));
  return rows;
};

const safe = (v) => (v === undefined || v === null ? '' : String(v));
const pretty = (v) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return safe(v);
  }
};

const diffKeys = (oldData, newData) => {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed = [];
  for (const k of keys) {
    const a = oldData?.[k];
    const b = newData?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(k);
  }
  return changed;
};

// ------------------------------
// Inline Audit Filters
// ------------------------------
function AuditFilters({ filters, onFilterChange, onClearFilters, tableOptions, opOptions }) {
  return (
    <div className="bg-white/60 border border-sky-100 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="Filter" size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Filters</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Input
          label="Van"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onFilterChange('dateFrom', e.target.value)}
        />
        <Input
          label="Tot"
          type="date"
          value={filters.dateTo}
          onChange={(e) => onFilterChange('dateTo', e.target.value)}
        />

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Tabel</label>
          <Select
            options={tableOptions}
            value={filters.tableName}
            onChange={(v) => onFilterChange('tableName', v)}
            placeholder="Alle tabellen"
            searchable
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Operatie</label>
          <Select
            options={opOptions}
            value={filters.operation}
            onChange={(v) => onFilterChange('operation', v)}
            placeholder="Alle operaties"
          />
        </div>

      </div>

      <div className="flex justify-end mt-4">
        <Button variant="outline" iconName="RotateCcw" iconPosition="left" onClick={onClearFilters}>
          Reset filters
        </Button>
      </div>
    </div>
  );
}

// ------------------------------
// Inline Audit Logs Table
// ------------------------------
function AuditLogsTable({ logs, isLoading, onOpen }) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="Loader" size={16} className="animate-spin" />
          Laden…
        </div>
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Icon name="ScrollText" size={44} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground">Geen audit logs gevonden</p>
        <p className="text-xs text-muted-foreground mt-1">
          Pas filters aan of wacht op een wijziging in de database.
        </p>
      </div>
    );
  }

  const opPill = (op) => {
    const o = safe(op).toUpperCase();
    const base = 'text-xs px-2 py-0.5 rounded-full border';
    if (o === 'INSERT') return `${base} bg-success/10 border-success/30 text-success`;
    if (o === 'UPDATE') return `${base} bg-primary/10 border-primary/30 text-primary`;
    if (o === 'DELETE') return `${base} bg-error/10 border-error/30 text-error`;
    return `${base} bg-muted/50 border-border text-muted-foreground`;
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tijd</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tabel</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Operatie</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Row</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Details</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {logs.map((l) => {
              const changed = diffKeys(l.old_data, l.new_data);
              return (
                <tr key={l.event_id} className="hover:bg-sky-50/30 transition-smooth">
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {l.occurred_at ? format(new Date(l.occurred_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-sm text-foreground font-medium">
                      {l.schema_name}.{l.table_name}
                    </div>
                    {changed.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Gewijzigd: {changed.slice(0, 3).join(', ')}
                        {changed.length > 3 ? ` +${changed.length - 3}` : ''}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span className={opPill(l.operation)}>{safe(l.operation).toUpperCase()}</span>
                  </td>

                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono truncate max-w-[260px]">
                    {l.row_id || '—'}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconName="ChevronRight"
                      onClick={() => onOpen(l)}
                    >
                      Bekijk
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------
// Audit Details Drawer
// ------------------------------
function AuditDetailsDrawer({ open, log, onClose }) {
  const [query, setQuery] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const op = safe(log?.operation).toUpperCase();
  const oldData = log?.old_data || {};
  const newData = log?.new_data || {};

  const diffRows = useMemo(() => buildDiffRows(oldData, newData), [oldData, newData]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return diffRows;
    return diffRows.filter((r) => {
      const hay = `${r.key} ${toShortString(r.before)} ${toShortString(r.after)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [diffRows, query]);

  const pill = (text, variant = 'default') => {
    const base = 'text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1.5';
    if (variant === 'insert') return `${base} bg-success/10 border-success/30 text-success`;
    if (variant === 'update') return `${base} bg-primary/10 border-primary/30 text-primary`;
    if (variant === 'delete') return `${base} bg-error/10 border-error/30 text-error`;
    return `${base} bg-muted/40 border-border text-muted-foreground`;
  };

  const typeBadge = (type) => {
    if (type === 'added') return 'bg-success/10 text-success border-success/30';
    if (type === 'removed') return 'bg-error/10 text-error border-error/30';
    return 'bg-primary/10 text-primary border-primary/30';
  };

  if (!open || !log) return null;

  const changedCount = diffRows.length;

  return (
    <>
      <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-[1001] w-full max-w-3xl bg-white border-l border-sky-200 shadow-2xl">
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon name="ScrollText" size={18} className="text-primary" />
                <h2 className="text-base font-semibold text-foreground truncate">
                  Wijzigingsdetails
                </h2>
              </div>

              <p className="text-xs text-muted-foreground mt-1 truncate">
                {log.schema_name}.{log.table_name} · {op} ·{' '}
                {log.occurred_at ? format(new Date(log.occurred_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
              </p>

              <div className="flex flex-wrap gap-2 mt-2">
                <span className={pill(op, op === 'INSERT' ? 'insert' : op === 'DELETE' ? 'delete' : 'update')}>
                  <Icon name="ArrowRightLeft" size={14} />
                  {op}
                </span>

                <span className={pill(`${changedCount} veld${changedCount === 1 ? '' : 'en'} gewijzigd`)}>
                  <Icon name="Sparkles" size={14} />
                  {changedCount}
                </span>

                {log.changed_by && (
                  <span className={pill(`door ${log.changed_by}`)}>
                    <Icon name="User" size={14} />
                    {log.changed_by}
                  </span>
                )}
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={onClose}>
              <Icon name="X" size={20} />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Key info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-sky-100 bg-sky-50/20">
                <div className="text-xs text-muted-foreground">Row ID</div>
                <div className="text-sm font-mono text-foreground break-all">{log.row_id || '—'}</div>
              </div>

              <div className="p-3 rounded-xl border border-sky-100 bg-sky-50/20">
                <div className="text-xs text-muted-foreground">Tabel</div>
                <div className="text-sm font-mono text-foreground break-all">
                  {log.schema_name}.{log.table_name}
                </div>
              </div>
            </div>

            {/* Search changes */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
                  <Icon name="Search" size={16} />
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Zoek in wijzigingen (veld/waarde)…"
                  className="w-full pl-9 pr-9 py-2 rounded-xl bg-white/60 border border-sky-200 text-sm outline-none focus:ring-2 focus:ring-sky-400/30"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                    aria-label="Clear"
                    type="button"
                  >
                    <Icon name="X" size={16} />
                  </button>
                )}
              </div>

              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {filteredRows.length}/{diffRows.length}
              </div>
            </div>

            {/* Changes list */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="bg-sky-50/30 border-b border-sky-100 px-3 py-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">
                  {op === 'INSERT'
                    ? 'Aangemaakte velden'
                    : op === 'DELETE'
                    ? 'Verwijderde velden'
                    : 'Gewijzigde velden'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {filteredRows.length} item{filteredRows.length === 1 ? '' : 's'}
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  Geen wijzigingen gevonden voor deze zoekopdracht.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredRows.map((r) => (
                    <div key={r.key} className="p-3 hover:bg-sky-50/20 transition-smooth">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground font-mono truncate">
                              {r.key}
                            </span>
                            <span
                              className={[
                                'text-[11px] px-2 py-0.5 rounded-full border',
                                typeBadge(r.type),
                              ].join(' ')}
                            >
                              {r.type === 'added' ? 'toegevoegd' : r.type === 'removed' ? 'verwijderd' : 'gewijzigd'}
                            </span>
                          </div>

                          {/* Value diff */}
                          {r.type === 'added' ? (
                            <div className="mt-2 text-sm">
                              <div className="text-xs text-muted-foreground mb-1">Nieuw</div>
                              <div className="rounded-lg border border-sky-100 bg-white/60 px-3 py-2">
                                <div className="text-foreground break-words">{toShortString(r.after)}</div>
                              </div>
                            </div>
                          ) : r.type === 'removed' ? (
                            <div className="mt-2 text-sm">
                              <div className="text-xs text-muted-foreground mb-1">Oud</div>
                              <div className="rounded-lg border border-sky-100 bg-white/60 px-3 py-2">
                                <div className="text-foreground break-words">{toShortString(r.before)}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Oud</div>
                                <div className="rounded-lg border border-sky-100 bg-white/60 px-3 py-2">
                                  <div className="text-foreground break-words">{toShortString(r.before)}</div>
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Nieuw</div>
                                <div className="rounded-lg border border-sky-100 bg-white/60 px-3 py-2">
                                  <div className="text-foreground break-words">{toShortString(r.after)}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Small hint icon */}
                        <div className="pt-1 opacity-70">
                          <Icon name={r.type === 'added' ? 'Plus' : r.type === 'removed' ? 'Minus' : 'ArrowRightLeft'} size={16} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Meta (still readable but not screaming JSON) */}
            {log.meta && (
              <div className="border border-border rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="w-full px-3 py-2 bg-sky-50/30 border-b border-sky-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Icon name="Info" size={16} className="text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">Geavanceerd</span>
                    <span className="text-xs text-muted-foreground">(raw JSON)</span>
                  </div>
                  <Icon name={showRaw ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-muted-foreground" />
                </button>

                {showRaw && (
                  <div className="p-3 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-foreground mb-1">Meta</div>
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        {pretty(log.meta)}
                      </pre>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-semibold text-foreground mb-1">Old data</div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          {pretty(log.old_data)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground mb-1">New data</div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          {pretty(log.new_data)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Sluiten
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------
// MAIN PANEL
// ------------------------------
export default function LoggingPanel({ onShowToast }) {
  const defaultFilters = useMemo(
    () => ({
      schemaName: 'all',
      tableName: 'all',
      operation: 'all',
      dateFrom: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
      dateTo: format(new Date(), 'yyyy-MM-dd'),
    }),
    []
  );

  const [filters, setFilters] = useState(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState([]);

  const [selectedLog, setSelectedLog] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleFilterChange = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const handleClearFilters = () => setFilters(defaultFilters);

  const tableOptions = useMemo(() => {
    const base = [
      { value: 'all', label: 'Alle tabellen' },
      { value: 'tickets', label: 'tickets' },
      { value: 'handlers', label: 'handlers' },
      { value: 'workflow_statuses', label: 'workflow_statuses' },
      { value: 'handler_workflows', label: 'handler_workflows' },
      { value: 'workflows', label: 'workflows' },
    ];
    return base;
  }, []);

  const opOptions = useMemo(
    () => [
      { value: 'all', label: 'Alle operaties' },
      { value: 'INSERT', label: 'INSERT' },
      { value: 'UPDATE', label: 'UPDATE' },
      { value: 'DELETE', label: 'DELETE' },
    ],
    []
  );

  const loadAudit = async () => {
    setIsLoading(true);

    try {
      const data = await auditLogService.getAuditLogs(filters);
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error loading audit logs:', e);
      onShowToast?.(e?.message || 'Fout bij laden audit logs', true);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.tableName, filters.operation, filters.dateFrom, filters.dateTo]);

  const handleExportCSV = () => {
    const csv = auditLogService.exportAuditToCSV(logs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    onShowToast?.('Audit logs geëxporteerd naar CSV');
  };

  const openDetails = (log) => {
    setSelectedLog(log);
    setDrawerOpen(true);
  };

  const closeDetails = () => {
    setDrawerOpen(false);
    setSelectedLog(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Overzicht van database wijzigingen (INSERT/UPDATE/DELETE) met details per event.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            iconName="Download"
            iconPosition="left"
            onClick={handleExportCSV}
            disabled={!logs?.length}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <AuditFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        tableOptions={tableOptions}
        opOptions={opOptions}
      />

      {/* Table */}
      <AuditLogsTable logs={logs} isLoading={isLoading} onOpen={openDetails} />

      {/* Drawer */}
      <AuditDetailsDrawer open={drawerOpen} log={selectedLog} onClose={closeDetails} />
    </div>
  );
}


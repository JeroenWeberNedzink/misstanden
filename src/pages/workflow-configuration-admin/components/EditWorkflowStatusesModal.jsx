import React, { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Icon from '../../../components/AppIcon';
import { workflowService } from '../../../services/workflowService';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();
const STATUS_CODE_FALLBACK = 'stap';
const STATUS_DRAFT_STORAGE_PREFIX = 'workflow-status-draft:v1:';

function newRow(workflowId) {
  return {
    id: `tmp_${Date.now()}_${Math.floor(Math.random() * 1e9)}`,
    workflowId,
    code: '',
    label: '',
    description: '',
    sortOrder: 0,
    isTerminal: false,
    isFirstResponse: false,
    nextCodes: [],
    expectedDurationDays: null,
    _isNew: true,
    _isDeleted: false,
  };
}

function slugifyStatusCode(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  return normalized || STATUS_CODE_FALLBACK;
}

function normalizeStatusRow(row = {}) {
  const rawDuration = row?.expectedDurationDays;
  const expectedDurationDays =
    rawDuration === null || rawDuration === undefined || rawDuration === ''
      ? null
      : Number(rawDuration);

  return {
    id: row?.id ?? null,
    workflowId: row?.workflowId ?? null,
    code: String(row?.code ?? ''),
    label: String(row?.label ?? ''),
    description: String(row?.description ?? ''),
    sortOrder: Number(row?.sortOrder ?? 0),
    isTerminal: !!row?.isTerminal,
    isFirstResponse: !!row?.isFirstResponse,
    nextCodes: Array.isArray(row?.nextCodes) ? row.nextCodes.map((code) => String(code ?? '')) : [],
    expectedDurationDays: Number.isFinite(expectedDurationDays) ? expectedDurationDays : null,
    _isNew: !!row?._isNew,
    _isDeleted: !!row?._isDeleted,
  };
}

function cloneStatusRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => normalizeStatusRow(row));
}

function serializeStatusRows(rows = []) {
  return JSON.stringify(cloneStatusRows(rows));
}

function getDraftStorageKey(workflowId) {
  return workflowId ? `${STATUS_DRAFT_STORAGE_PREFIX}${workflowId}` : '';
}

function readStatusDraft(workflowId) {
  if (typeof window === 'undefined') return null;
  const storageKey = getDraftStorageKey(workflowId);
  if (!storageKey) return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || parsed.workflowId !== workflowId || !Array.isArray(parsed.rows)) {
      return null;
    }

    return {
      ...parsed,
      rows: cloneStatusRows(parsed.rows).map((row) => ({ ...row, workflowId })),
      selectedId: parsed?.selectedId ?? null,
      tab: parsed?.tab === 'sla' ? 'sla' : 'basics',
    };
  } catch {
    return null;
  }
}

function writeStatusDraft(workflowId, draft) {
  if (typeof window === 'undefined') return;
  const storageKey = getDraftStorageKey(workflowId);
  if (!storageKey) return;

  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 1,
        workflowId,
        savedAt: Date.now(),
        rows: cloneStatusRows(draft?.rows || []).map((row) => ({ ...row, workflowId })),
        selectedId: draft?.selectedId ?? null,
        tab: draft?.tab === 'sla' ? 'sla' : 'basics',
      })
    );
  } catch {
    // Ignore storage failures and keep the in-memory state alive.
  }
}

function clearStatusDraft(workflowId) {
  if (typeof window === 'undefined') return;
  const storageKey = getDraftStorageKey(workflowId);
  if (!storageKey) return;

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function mapStatusRowFromApi(status = {}) {
  return normalizeStatusRow({
    id: status.id,
    workflowId: status.workflow_id ?? status.workflowId,
    code: status.code ?? '',
    label: status.label ?? '',
    description: status.description ?? '',
    sortOrder: Number(status.sort_order ?? status.sortOrder ?? 0),
    isTerminal: !!(status.is_terminal ?? status.isTerminal),
    isFirstResponse: !!(status.is_first_response ?? status.isFirstResponse),
    nextCodes: Array.isArray(status.next_codes ?? status.nextCodes) ? (status.next_codes ?? status.nextCodes) : [],
    expectedDurationDays:
      (status.expected_duration_days ?? status.expectedDurationDays) === null ||
      (status.expected_duration_days ?? status.expectedDurationDays) === undefined ||
      (status.expected_duration_days ?? status.expectedDurationDays) === ''
        ? null
        : Number(status.expected_duration_days ?? status.expectedDurationDays),
    _isNew: false,
    _isDeleted: false,
  });
}

function withResolvedCodes(rows = []) {
  const seen = new Set();

  return rows.map((row) => {
    const preserveExistingCode = !row?._isNew && /^[a-z0-9_]+$/.test(safeTrim(row?.code));
    const baseCode = preserveExistingCode ? safeTrim(row.code) : slugifyStatusCode(row?.label);
    let nextCode = baseCode;
    let suffix = 2;

    while (seen.has(safeLower(nextCode))) {
      nextCode = `${baseCode}_${suffix}`;
      suffix += 1;
    }

    seen.add(safeLower(nextCode));
    return { ...row, code: nextCode };
  });
}

function getBlueShade(index, total) {
  const shades = [
    { bg: 'bg-blue-100', border: 'border-blue-200', text: 'text-blue-700' },
    { bg: 'bg-blue-200', border: 'border-blue-300', text: 'text-blue-800' },
    { bg: 'bg-blue-300', border: 'border-blue-400', text: 'text-blue-900' },
    { bg: 'bg-blue-400', border: 'border-blue-500', text: 'text-white' },
    { bg: 'bg-blue-500', border: 'border-blue-600', text: 'text-white' },
    { bg: 'bg-blue-600', border: 'border-blue-700', text: 'text-white' },
    { bg: 'bg-blue-700', border: 'border-blue-800', text: 'text-white' },
    { bg: 'bg-blue-800', border: 'border-blue-900', text: 'text-white' },
  ];
  const shadeIndex = Math.min(
    Math.floor((index / Math.max(total - 1, 1)) * (shades.length - 1)),
    shades.length - 1
  );
  return shades[shadeIndex];
}

function TabButton({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-2 rounded-xl text-xs font-medium border transition',
        active
          ? 'bg-primary/10 text-primary border-primary/25'
          : 'bg-card text-muted-foreground border-border hover:bg-muted/40',
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-2">
        <Icon name={icon} size={14} />
        {label}
      </span>
    </button>
  );
}

function Node({ index, total, isSelected, label, code, isTerminal, isFirstResponse, onClick }) {
  const shade = getBlueShade(index, total);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center min-w-[92px]"
      title={code || label}
    >
      <div
        className={[
          'w-10 h-10 rounded-full border-2 flex items-center justify-center transition',
          isSelected
            ? `ring-4 ring-blue-500/20 ${shade.border} bg-background`
            : `${shade.bg} ${shade.border}`,
        ].join(' ')}
      >
        {isTerminal ? (
          <Icon name="Flag" size={18} className={shade.text} />
        ) : isFirstResponse ? (
          <Icon name="MessageCircle" size={16} className={shade.text} />
        ) : (
          <div className={`w-3 h-3 rounded-full ${shade.bg}`} />
        )}
      </div>
      <div className="mt-2 text-center max-w-[110px]">
        <div className={['text-xs truncate', isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>
          {label || '—'}
        </div>
        {code ? <div className="text-[10px] text-muted-foreground font-mono truncate">{code}</div> : null}
      </div>
    </button>
  );
}

export default function EditWorkflowStatusesModal({
  open = true,
  workflow,
  onClose,
  onSaved,
}) {
  const workflowId = workflow?.id;

  const [rows, setRows] = useState([]);
  const [initialRows, setInitialRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('basics'); // basics | sla

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [hasServerSnapshot, setHasServerSnapshot] = useState(false);
  const [hasInitializedDraftState, setHasInitializedDraftState] = useState(false);

  const isDirty = useMemo(
    () => serializeStatusRows(rows) !== serializeStatusRows(initialRows),
    [rows, initialRows]
  );

  // Load from DB
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!open || !workflowId) return;

      setError('');
      setDraftNotice('');
      setLoading(true);
      setRows([]);
      setInitialRows([]);
      setSelectedId(null);
      setTab('basics');
      setHasServerSnapshot(false);
      setHasInitializedDraftState(false);

      try {
        const data = await workflowService.getWorkflowStatusesAdmin(workflowId);
        const mapped = (data || []).map((status) => mapStatusRowFromApi(status));
        const restoredDraft = readStatusDraft(workflowId);
        const nextRows = restoredDraft ? cloneStatusRows(restoredDraft.rows) : mapped;
        const nextSelectedId = restoredDraft?.selectedId ?? nextRows?.[0]?.id ?? null;
        const nextTab = restoredDraft?.tab === 'sla' ? 'sla' : 'basics';

        if (cancelled) return;

        setRows(nextRows);
        setInitialRows(mapped);
        setSelectedId(nextSelectedId);
        setTab(nextTab);
        setHasServerSnapshot(true);
        setHasInitializedDraftState(true);

        if (restoredDraft) {
          setDraftNotice('Lokale conceptversie hersteld. Je wijzigingen staan nog klaar om op te slaan.');
        }
      } catch (e) {
        if (cancelled) return;

        const restoredDraft = readStatusDraft(workflowId);
        if (restoredDraft) {
          const restoredRows = cloneStatusRows(restoredDraft.rows);
          setRows(restoredRows);
          setInitialRows([]);
          setSelectedId(restoredDraft?.selectedId ?? restoredRows?.[0]?.id ?? null);
          setTab(restoredDraft?.tab === 'sla' ? 'sla' : 'basics');
          setHasServerSnapshot(false);
          setHasInitializedDraftState(true);
          setDraftNotice('Lokale conceptversie hersteld. Opslaan kan weer zodra je beheersessie terug is.');
          setError(e?.message || 'Kon workflow statussen niet laden.');
        } else {
          setError(e?.message || 'Kon workflow statussen niet laden.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, workflowId]);

  const activeRows = useMemo(
    () =>
      withResolvedCodes(
        rows
          .filter((r) => !r._isDeleted)
          .slice()
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      ),
    [rows]
  );

  const selected = useMemo(
    () => activeRows.find((r) => r.id === selectedId) || null,
    [activeRows, selectedId]
  );

  const missingDurationLabels = useMemo(() => {
    return activeRows
      .filter((r) => !Number.isFinite(Number(r.expectedDurationDays)))
      .map((r) => r.label || r.code)
      .filter(Boolean);
  }, [activeRows]);

  const firstResponseLabels = useMemo(
    () =>
      activeRows
        .filter((r) => !!r.isFirstResponse)
        .map((r) => r.label || r.code)
        .filter(Boolean),
    [activeRows]
  );

  useEffect(() => {
    // If selected gets deleted, auto-select first
    if (selectedId && !selected && activeRows.length) {
      setSelectedId(activeRows[0].id);
    }
    if (selectedId && !selected && activeRows.length === 0) {
      setSelectedId(null);
    }
    if (!selectedId && activeRows.length) {
      setSelectedId(activeRows[0].id);
    }
  }, [selectedId, selected, activeRows]);

  useEffect(() => {
    if (!open || !workflowId || !hasInitializedDraftState) return;

    if (!isDirty) {
      clearStatusDraft(workflowId);
      return;
    }

    writeStatusDraft(workflowId, {
      rows,
      selectedId,
      tab,
    });
  }, [hasInitializedDraftState, isDirty, open, rows, selectedId, tab, workflowId]);

  useEffect(() => {
    if (!open || !isDirty) return;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, open]);

  const requestClose = () => {
    if (saving) return;
    if (!isDirty) {
      onClose?.();
      return;
    }

    const confirmed = window.confirm(
      'Je hebt niet-opgeslagen wijzigingen. Deze blijven lokaal bewaard in deze browser. Venster sluiten?'
    );
    if (confirmed) {
      onClose?.();
    }
  };

  const handleRestoreServerVersion = () => {
    if (!hasServerSnapshot) return;
    setRows(cloneStatusRows(initialRows));
    setSelectedId(initialRows?.[0]?.id ?? null);
    setTab('basics');
    setDraftNotice('');
    setError('');
    clearStatusDraft(workflowId);
  };

  const patchRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addStatus = () => {
    if (!workflowId) return;
    const nextSort = activeRows.length ? activeRows[activeRows.length - 1].sortOrder + 10 : 10;
    const row = { ...newRow(workflowId), sortOrder: nextSort };
    setRows((prev) => [...prev, row]);
    setSelectedId(row.id);
    setTab('basics');
  };

  const softDeleteRow = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, _isDeleted: true } : r)));
  };

  const moveRow = (id, dir) => {
    setRows((prev) => {
      const active = prev
        .filter((r) => !r._isDeleted)
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const idx = active.findIndex((r) => r.id === id);
      if (idx < 0) return prev;

      const swapWith = dir === 'up' ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= active.length) return prev;

      const reordered = active.slice();
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(swapWith, 0, moved);

      const nextSortOrderById = new Map(
        reordered.map((row, index) => [row.id, (index + 1) * 10])
      );

      return prev.map((row) =>
        row._isDeleted || !nextSortOrderById.has(row.id)
          ? row
          : { ...row, sortOrder: nextSortOrderById.get(row.id) }
      );
    });
  };

  const validate = () => {
    if (activeRows.length === 0) {
      return 'Een workflow moet minimaal 1 stap hebben.';
    }

    const seen = new Set();
    for (const r of activeRows) {
      const code = safeTrim(r.code);
      const label = safeTrim(r.label);

      if (!label) return 'Elke status moet een label hebben.';
      if (!/^[a-z0-9_]+$/.test(code)) return `Ongeldige code "${code}". Alleen a-z, 0-9 en _.`;
      const key = safeLower(code);
      if (seen.has(key)) return `Dubbele status code: "${code}".`;
      seen.add(key);
    }
    return '';
  };

  const handleSave = async () => {
    setError('');
    setDraftNotice('');
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setSaving(true);
    try {
      const toDelete = rows.filter((r) => r._isDeleted && !r._isNew).map((r) => r.id);
      const upsertPayload = activeRows.map((r, index) => ({
        id: r._isNew ? null : r.id,
        code: safeTrim(r.code),
        label: safeTrim(r.label),
        description: safeTrim(r.description) || null,
        color: null,
        sort_order: Number(r.sortOrder ?? 0),
        is_terminal: !!r.isTerminal,
        is_first_response: !!r.isFirstResponse,
        next_codes: index < activeRows.length - 1 ? [safeTrim(activeRows[index + 1]?.code)].filter(Boolean) : [],
        expected_duration_days: r.expectedDurationDays ? Number(r.expectedDurationDays) : null,
        contact_person_name: null,
        contact_person_email: null,
        contact_person_phone: null,
        contact_notes: null,
      }));

      const persisted = await workflowService.saveWorkflowStatuses(workflowId, upsertPayload, toDelete);
      const persistedRows = (persisted || []).map((row) => mapStatusRowFromApi(row));

      clearStatusDraft(workflowId);
      setInitialRows(persistedRows);
      setRows(persistedRows);
      setSelectedId(persistedRows?.[0]?.id ?? null);
      setHasServerSnapshot(true);
      setHasInitializedDraftState(true);

      onSaved?.();
      onClose?.();
    } catch (e) {
      const message = e?.message || 'Opslaan mislukt.';
      setError(`${message} Je wijzigingen blijven lokaal bewaard.`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onClick={requestClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex items-start justify-center p-3 md:p-4 pt-16 md:pt-20 overflow-y-auto">
        <div
          className="bg-card rounded-2xl border border-border w-full max-w-6xl shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 p-4 md:p-6 border-b border-border">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon name="Workflow" size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg md:text-xl font-semibold text-foreground truncate">Workflow stappen</h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {workflow?.name} · <span className="font-mono">{workflow?.code}</span>
                  </p>
                </div>
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={requestClose} disabled={saving}>
              <Icon name="X" size={22} />
            </Button>
          </div>

          {/* Top: Flow overview */}
          <div className="border-b border-border bg-muted/10">
            <div className="p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {loading ? 'Laden…' : `${activeRows.length} stap(pen)`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="Plus"
                    iconPosition="left"
                    onClick={addStatus}
                    disabled={loading || saving}
                  >
                    Stap toevoegen
                  </Button>
                </div>
              </div>

              {/* Flow bar */}
              <div className="w-full overflow-x-auto mt-3">
                <div className="w-max min-w-full mx-auto px-2 py-2">
                  <div className="relative flex items-center justify-center gap-3">
                    {activeRows.map((r, index) => {
                      const isLast = index === activeRows.length - 1;
                      return (
                        <div key={r.id} className="flex items-center">
                          <Node
                            index={index}
                            total={activeRows.length}
                            isSelected={selectedId === r.id}
                            label={r.label}
                            code={r.code}
                            isTerminal={!!r.isTerminal}
                            isFirstResponse={!!r.isFirstResponse}
                            onClick={() => {
                              setSelectedId(r.id);
                              setTab('basics');
                            }}
                          />
                          {!isLast && <div className="w-10 h-0.5 bg-blue-200 mx-2 rounded" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-3 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-sm text-destructive">
                  {error}
                </div>
              )}

              {draftNotice && (
                <div className="mt-3 p-3 rounded-xl border border-blue-200/60 bg-blue-50/80 text-sm text-blue-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-semibold">
                        <Icon name="Save" size={16} />
                        Concept bewaard
                      </div>
                      <div className="text-xs text-blue-900/80 mt-1">{draftNotice}</div>
                    </div>

                    {hasServerSnapshot ? (
                      <Button variant="outline" size="xs" onClick={handleRestoreServerVersion} disabled={saving || loading}>
                        Herstel serverversie
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}

              {/* SLA duration warning */}
              {missingDurationLabels.length > 0 && (
                <div className="mt-3 p-3 rounded-xl border border-amber-200/60 bg-amber-50/80 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon name="AlertTriangle" size={16} />
                    SLA ontbreekt voor {missingDurationLabels.length} stap(pen)
                  </div>
                  <div className="text-xs text-amber-800/80 mt-1">
                    Zet <span className="font-mono">Doel doorlooptijd (dagen)</span> in de tab “SLA” om “SLA: niet ingesteld” te voorkomen.
                  </div>
                  <div className="text-xs text-amber-900 mt-2">
                    {missingDurationLabels.slice(0, 6).join(', ')}
                    {missingDurationLabels.length > 6 ? '…' : ''}
                  </div>
                </div>
              )}

              {firstResponseLabels.length === 0 && (
                <div className="mt-3 p-3 rounded-xl border border-blue-200/60 bg-blue-50/80 text-sm text-blue-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon name="Info" size={16} />
                    Eerste reactie is nog niet ingesteld
                  </div>
                  <div className="text-xs text-blue-900/80 mt-1">
                    Vink bij minimaal 1 stap <span className="font-mono">Eerste reactie (SLA)</span> aan.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Body: 2-column responsive */}
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: compact list */}
              <div className="lg:col-span-4">
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">Stappen</div>
                    <div className="text-xs text-muted-foreground">{activeRows.length}</div>
                  </div>

                  <div className="divide-y divide-border">
                    {activeRows.map((r, idx) => {
                      const selected = r.id === selectedId;
                      return (
                        <div
                          key={r.id}
                          className={[
                            'p-3 flex items-center gap-3',
                            selected ? 'bg-primary/5' : 'hover:bg-muted/30',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedId(r.id)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-card text-muted-foreground">
                                #{idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground truncate">
                                  {r.label || '—'}
                                  {r.isTerminal ? (
                                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                      Eindoplossing
                                    </span>
                                  ) : null}
                                  {r.isFirstResponse ? (
                                    <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                      Eerste reactie
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono truncate">
                                  {r.code || 'code…'}
                                </div>
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="p-2 rounded-lg hover:bg-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveRow(r.id, 'up');
                              }}
                              disabled={idx === 0 || saving}
                              title="Omhoog"
                            >
                              <Icon name="ChevronUp" size={16} />
                            </button>
                            <button
                              type="button"
                              className="p-2 rounded-lg hover:bg-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveRow(r.id, 'down');
                              }}
                              disabled={idx === activeRows.length - 1 || saving}
                              title="Omlaag"
                            >
                              <Icon name="ChevronDown" size={16} />
                            </button>

                            <button
                              type="button"
                              className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                              onClick={() => softDeleteRow(r.id)}
                              disabled={saving}
                              title="Verwijder"
                            >
                              <Icon name="Trash2" size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {!loading && activeRows.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground">
                        Nog geen statussen. Klik “Stap toevoegen”.
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2 border-t border-border bg-muted/10 text-xs text-muted-foreground">
                    De volgende status volgt altijd de volgorde van deze lijst. Gebruik de pijlen om stappen te verplaatsen.
                  </div>
                </div>
              </div>

              {/* Right: selected details */}
              <div className="lg:col-span-8">
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="p-4 border-b border-border flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {selected?.label || 'Selecteer een stap'}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {selected?.code || ''}
                      </div>
                    </div>

                    {selected ? (
                      <div className="flex flex-col items-start gap-1.5 text-xs text-muted-foreground">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!selected.isFirstResponse}
                            onChange={(e) => patchRow(selected.id, { isFirstResponse: e.target.checked })}
                            disabled={saving}
                          />
                          Eerste reactie (SLA)
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!selected.isTerminal}
                            onChange={(e) => patchRow(selected.id, { isTerminal: e.target.checked })}
                            disabled={saving}
                          />
                          Eindoplossing (ticket afgerond)
                        </label>
                      </div>
                    ) : null}
                  </div>

                  {/* Tabs */}
                  <div className="p-3 border-b border-border bg-muted/10 flex flex-wrap gap-2">
                    <TabButton active={tab === 'basics'} icon="Pencil" label="Basis" onClick={() => setTab('basics')} />
                    <TabButton active={tab === 'sla'} icon="Clock" label="SLA" onClick={() => setTab('sla')} />
                  </div>

                  <div className="p-4 md:p-5">
                    {!selected ? (
                      <div className="p-6 rounded-xl border border-border bg-muted/10 text-sm text-muted-foreground">
                        Selecteer links een stap om details te bewerken.
                      </div>
                    ) : (
                      <>
                        {tab === 'basics' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                              label="Label"
                              value={selected.label}
                              onChange={(e) => patchRow(selected.id, { label: e.target.value })}
                              disabled={saving}
                              description="De code wordt automatisch gemaakt op basis van deze naam."
                            />
                            <div className="rounded-xl border border-border bg-muted/10 px-3 py-3">
                              <div className="text-xs font-medium text-foreground">Code</div>
                              <div className="mt-1 font-mono text-sm text-muted-foreground">
                                {selected.code || STATUS_CODE_FALLBACK}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Automatisch gegenereerd. Alleen a-z, 0-9 en _.
                              </div>
                            </div>
                            <div className="md:col-span-2">
                              <Input
                                label="Omschrijving"
                                value={selected.description}
                                onChange={(e) => patchRow(selected.id, { description: e.target.value })}
                                disabled={saving}
                              />
                            </div>
                          </div>
                        )}

                        {tab === 'sla' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                              type="number"
                              label="Doel doorlooptijd (dagen)"
                              placeholder="Bijv. 7, 14, 56"
                              value={selected.expectedDurationDays || ''}
                              onChange={(e) =>
                                patchRow(selected.id, {
                                  expectedDurationDays: e.target.value ? parseInt(e.target.value, 10) : null,
                                })
                              }
                              disabled={saving}
                              description="Gebruik dit voor monitoring in dashboard"
                            />
                            <div className="rounded-xl border border-border bg-muted/10 p-3 text-xs text-muted-foreground">
                              <div className="font-semibold text-foreground mb-1">Tip</div>
                              Stel per stap een maximum in. In je dashboard kun je dan tonen:
                              <div className="mt-2">
                                <span className="px-2 py-0.5 rounded bg-success/10 text-success mr-2">Binnen SLA</span>
                                <span className="px-2 py-0.5 rounded bg-warning/10 text-warning mr-2">Nadert</span>
                                <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive">Over SLA</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 md:p-6 border-t border-border flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {isDirty ? (
                'Niet-opgeslagen wijzigingen blijven tijdelijk in deze browser bewaard.'
              ) : (
                <>
                  Opslaan schrijft naar <span className="font-mono">workflow_statuses</span>.
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={requestClose} disabled={saving}>
                Annuleren
              </Button>
              <Button variant="default" iconName="Save" iconPosition="left" onClick={handleSave} disabled={saving || loading}>
                {saving ? 'Opslaan…' : 'Opslaan'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

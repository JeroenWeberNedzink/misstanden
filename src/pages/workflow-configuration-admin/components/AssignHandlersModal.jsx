import React, { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';
import { workflowService } from '../../../services/workflowService';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

const getInitials = (nameOrEmail) => {
  const s = safeTrim(nameOrEmail);
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

function HandlerChip({ handler, onRemove, disabled }) {
  const name = handler?.name || 'Onbekend';
  const email = handler?.email || '';
  const initials = getInitials(name || email);

  return (
    <div className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 hover:bg-muted/40 transition">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{name}</div>
          {email && <div className="text-xs text-muted-foreground truncate">{email}</div>}
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 transition rounded-lg p-2 hover:bg-destructive/10 text-destructive disabled:opacity-50"
        title="Verwijderen"
      >
        <Icon name="X" size={16} />
      </button>
    </div>
  );
}

function HandlerPickCard({ handler, selected, onToggle, disabled }) {
  const name = handler?.name || 'Onbekend';
  const email = handler?.email || '';
  const initials = getInitials(name || email);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={[
        'w-full text-left rounded-xl border px-3 py-2 transition flex items-center justify-between gap-2',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{name}</div>
          {email && <div className="text-xs text-muted-foreground truncate">{email}</div>}
        </div>
      </div>

      <div
        className={[
          'w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0',
          selected ? 'bg-primary border-primary text-white' : 'border-border text-muted-foreground',
        ].join(' ')}
      >
        {selected ? <Icon name="Check" size={14} /> : <Icon name="Plus" size={14} />}
      </div>
    </button>
  );
}

/**
 * AssignHandlersModal (overview-first)
 */
export default function AssignHandlersModal({ workflow, onClose, onSaved }) {
  const [routingRules, setRoutingRules] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [pick, setPick] = useState([]); // handlerIds selected to add
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');

  // Lock background scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Close on ESC
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const refreshRules = async () => {
    const rulesData = await workflowService.getRoutingRules(workflow?.id);
    setRoutingRules(rulesData || []);
  };

  const load = async () => {
    setError('');
    setIsLoading(true);
    try {
      const [rulesData, handlersData] = await Promise.all([
        workflowService.getRoutingRules(workflow?.id),
        workflowService.getActiveHandlers(),
      ]);
      setRoutingRules(rulesData || []);
      setHandlers(handlersData || []);
    } catch (e) {
      console.error('AssignHandlersModal load error:', e);
      setError('Fout bij laden van handlers/routing regels');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow?.id]);

  const assigned = useMemo(() => {
    return (routingRules || [])
      .map((r) => ({
        ruleId: r.id,
        handler: r?.handlers || r?.handler || null,
      }))
      .filter((x) => x?.handler?.id);
  }, [routingRules]);

  const assignedHandlerIds = useMemo(() => {
    return assigned.map((x) => x.handler.id);
  }, [assigned]);

  const availableHandlers = useMemo(() => {
    const base = (handlers || []).filter((h) => h?.id && !assignedHandlerIds.includes(h.id));

    const q = safeLower(search);
    if (!q) return base;

    return base.filter((h) => {
      const name = safeLower(h?.name);
      const email = safeLower(h?.email);
      return name.includes(q) || email.includes(q);
    });
  }, [handlers, assignedHandlerIds, search]);

  const busy = isLoading || isApplying;

  const togglePick = (handlerId) => {
    setPick((prev) => {
      const s = new Set(prev);
      if (s.has(handlerId)) s.delete(handlerId);
      else s.add(handlerId);
      return Array.from(s);
    });
  };

  const clearPick = () => setPick([]);

  const addPicked = async () => {
    if (!workflow?.id) return;
    if (!pick.length) return;

    setIsApplying(true);
    setError('');
    try {
      // You can optimize later with bulk insert in workflowService
      for (const handlerId of pick) {
        await workflowService.addRoutingRule(workflow.id, handlerId);
      }
      clearPick();
      setSearch('');
      await refreshRules();
      onSaved?.();
    } catch (e) {
      console.error('Error adding routing rules:', e);
      setError('Fout bij toewijzen van handlers');
    } finally {
      setIsApplying(false);
    }
  };

  const removeRule = async (ruleId) => {
    if (!workflow?.id || !ruleId) return;

    setIsApplying(true);
    setError('');
    try {
      await workflowService.removeRoutingRule(ruleId);
      await refreshRules();
      onSaved?.();
    } catch (e) {
      console.error('Error removing routing rule:', e);
      setError('Fout bij verwijderen van handler');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onMouseDown={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex justify-center px-4 py-6 sm:py-10 h-min-100 overflow-auto">
        <div
          className="w-full max-w-5xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col"
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
            <div className="p-4 md:p-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon name="Users" size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-foreground truncate">Handlers toewijzen</h2>
                    <p className="text-xs text-muted-foreground truncate">
                      <span className="font-medium text-foreground">{workflow?.name}</span> ·{' '}
                      <span className="font-mono">{workflow?.code}</span>
                    </p>
                  </div>
                </div>
              </div>

              <Button variant="ghost" size="icon" onClick={onClose} disabled={isApplying}>
                <Icon name="X" size={20} />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 md:p-6 flex-1 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-sm text-destructive flex items-start gap-2">
                <Icon name="AlertCircle" size={16} className="mt-0.5" />
                <div className="min-w-0">{error}</div>
              </div>
            )}

            {/* Layout: Assigned left, Picker right */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Assigned */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon name="GitBranch" size={14} className="text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Toegewezen handlers
                      <span className="ml-2 text-xs font-normal text-muted-foreground">({assigned.length})</span>
                    </h3>
                  </div>
                </div>

                {isLoading ? (
                  <div className="rounded-xl border border-border bg-muted/10 p-6 flex items-center justify-center">
                    <Icon name="Loader" size={16} className="animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Laden…</span>
                  </div>
                ) : assigned.length === 0 ? (
                  <div className="rounded-xl border border-border bg-muted/10 p-8 text-center">
                    <Icon name="Users" size={36} className="mx-auto mb-3 text-muted-foreground" />
                    <div className="text-sm font-medium text-foreground">Nog geen handlers</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Voeg rechts handlers toe om tickets in deze workflow te laten behandelen.
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {assigned.map(({ ruleId, handler }) => (
                      <HandlerChip
                        key={ruleId}
                        handler={handler}
                        disabled={isApplying}
                        onRemove={() => removeRule(ruleId)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Picker */}
              <div className="lg:col-span-1">
                <div className="rounded-2xl border border-border bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Icon name="UserPlus" size={14} className="text-muted-foreground" />
                      <div className="text-sm font-semibold text-foreground">Toevoegen</div>
                    </div>
                    <span className="text-xs text-muted-foreground">Beschikbaar: {availableHandlers.length}</span>
                  </div>

                  {/* Search */}
                  <div className="relative mb-2">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Icon name="Search" size={14} />
                    </div>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Zoek op naam of email…"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/15"
                      disabled={busy}
                    />
                  </div>

                  {/* Pick list */}
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {!busy && availableHandlers.length === 0 ? (
                      <div className="text-xs text-muted-foreground p-3 rounded-xl border border-border bg-card">
                        Geen beschikbare handlers meer.
                      </div>
                    ) : (
                      availableHandlers.map((h) => (
                        <HandlerPickCard
                          key={h.id}
                          handler={h}
                          selected={pick.includes(h.id)}
                          onToggle={() => togglePick(h.id)}
                          disabled={busy}
                        />
                      ))
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      onClick={addPicked}
                      disabled={busy || pick.length === 0}
                      loading={isApplying}
                      iconName="Plus"
                      iconPosition="left"
                      fullWidth
                    >
                      Voeg toe ({pick.length || 0})
                    </Button>
                  </div>

                  {pick.length > 0 && (
                    <button
                      type="button"
                      className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground transition"
                      onClick={clearPick}
                      disabled={busy}
                    >
                      Selectie wissen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 z-10 bg-card/95 backdrop-blur border-t border-border">
            <div className="p-4 md:p-6 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isApplying}>
                Sluiten
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
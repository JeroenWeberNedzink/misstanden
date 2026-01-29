import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { workflowService } from '../../../services/workflowService';
import { useSettings } from '../../../contexts/SettingsContext';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

function colorDotClass(color) {
  const c = safeLower(color);
  if (c === 'green') return 'bg-success';
  if (c === 'yellow') return 'bg-warning';
  if (c === 'red') return 'bg-destructive';
  if (c === 'gray' || c === 'grey') return 'bg-muted-foreground';
  if (c === 'blue') return 'bg-primary';
  if (c === 'indigo') return 'bg-indigo-500';
  if (c === 'purple') return 'bg-purple-500';
  if (c === 'cyan') return 'bg-cyan-500';
  if (c === 'orange') return 'bg-orange-500';
  if (c === 'teal') return 'bg-teal-500';
  if (c === 'slate') return 'bg-slate-500';
  return 'bg-primary';
}

export default function StatusUpdateModal({
  workflowType,      // workflow code
  currentStatus,     // could be code or label (or enum label)
  currentStage,      // could be stage code; we treat both the same (DB decides)
  onClose,
  onUpdate,
}) {
  const { settings } = useSettings();
  const [workflow, setWorkflow] = useState(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [updateNote, setUpdateNote] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError('');
      setWorkflow(null);

      const code = safeTrim(workflowType);
      if (!code) return;

      setIsLoadingWorkflow(true);
      try {
        const wf = await workflowService.getWorkflowByCode(code);
        if (!wf?.id) throw new Error('Workflow not found');

        const statuses = await workflowService.getWorkflowStatuses(wf.id, { useCache: true });
        if (!cancelled) {
          setWorkflow({ ...wf, statusesArray: statuses });
        }
      } catch (e) {
        console.error('[StatusUpdateModal] Error loading workflow:', e);
        if (!cancelled) setLoadError('Kon workflow statussen niet laden.');
      } finally {
        if (!cancelled) setIsLoadingWorkflow(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [workflowType]);

  const options = useMemo(() => {
    const statuses = workflow?.statusesArray || [];
    return statuses.map(s => ({
      value: s.code,
      label: s.label,
      description: s.description || '',
      color: s.color || null,
      order: s.sortOrder ?? 999,
      expectedDurationDays: s.expectedDurationDays || null,
      contactPersonName: s.contactPersonName || '',
      contactPersonEmail: s.contactPersonEmail || '',
      contactPersonPhone: s.contactPersonPhone || '',
      contactNotes: s.contactNotes || '',
    })).sort((a, b) => a.order - b.order);
  }, [workflow?.statusesArray]);

  const [selectedValue, setSelectedValue] = useState(null);

  // pick initial selection from currentStage/currentStatus if possible, else first option
  useEffect(() => {
    if (!options.length) return;

    const findByCode = (val) => options.find(o => safeLower(o.value) === safeLower(val))?.value;
    const findByLabel = (val) => options.find(o => safeLower(o.label) === safeLower(val))?.value;

    const cur = findByCode(currentStage) || findByLabel(currentStage) || findByCode(currentStatus) || findByLabel(currentStatus);
    setSelectedValue(cur || options[0].value);
  }, [options, currentStage, currentStatus]);

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === selectedValue),
    [options, selectedValue]
  );

  const selectedOption = useMemo(
    () => options.find((o) => o.value === selectedValue) || null,
    [options, selectedValue]
  );

  const nextOption = useMemo(() => {
    if (selectedIndex < 0) return null;
    return options[selectedIndex + 1] || null;
  }, [options, selectedIndex]);

  const currentComparable = useMemo(() => {
    const findByCode = (val) => options.find(o => safeLower(o.value) === safeLower(val))?.value;
    const findByLabel = (val) => options.find(o => safeLower(o.label) === safeLower(val))?.value;

    return findByCode(currentStage) || findByLabel(currentStage) || findByCode(currentStatus) || findByLabel(currentStatus) || null;
  }, [options, currentStage, currentStatus]);

  const isUnchanged = useMemo(() => {
    if (!selectedValue) return true;
    if (!currentComparable) return false;
    return safeLower(selectedValue) === safeLower(currentComparable);
  }, [selectedValue, currentComparable]);

  const handleUpdate = () => {
    if (!selectedValue || isUnchanged) return;

    // Note is required
    if (!safeTrim(updateNote)) {
      alert('Notitie is verplicht. Voeg een uitleg toe voor deze statuswijziging.');
      return;
    }

    // Check for status rollback (moving to a previous status in the workflow)
    const currentIdx = options.findIndex(o => safeLower(o.value) === safeLower(currentComparable));
    const newIdx = options.findIndex(o => o.value === selectedValue);

    if (currentIdx >= 0 && newIdx >= 0 && newIdx < currentIdx) {
      // This is a rollback (moving to an earlier status)
      if (!settings?.workflow?.allowStatusRollback) {
        alert('Status terugdraaien is niet toegestaan. Deze instelling is uitgeschakeld door de beheerder.');
        return;
      }
    }

    // DB-driven: we send ONLY the selected workflow status code.
    // TicketService resolves it against workflows.statuses and updates status_code/current_stage.
    onUpdate?.({
      workflowType: safeTrim(workflowType) || null,
      statusCode: selectedValue,
      note: safeTrim(updateNote),
    });

    onClose?.();
  };

  const currentDisplay = currentStage || currentStatus || '-';

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-[10001] flex items-start justify-center p-4 pt-24 overflow-y-auto">
        <div
          className="bg-card rounded-2xl border border-border w-full max-w-5xl shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon name="RefreshCw" size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-semibold text-foreground truncate">
                  Status / fase wijzigen
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {workflow?.name ? workflow.name : (workflowType || 'workflow')}
                  {isLoadingWorkflow ? ' · laden…' : ''}
                </p>
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={onClose}>
              <Icon name="X" size={24} />
            </Button>
          </div>

          <div className="p-4 md:p-6">
            {loadError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
                {loadError}
              </div>
            )}

            {!options.length ? (
              <div className="p-4 bg-muted rounded-xl text-sm text-muted-foreground">
                Geen statussen geconfigureerd in deze workflow.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="p-3 mb-4 bg-muted rounded-xl">
                    <div className="text-xs text-muted-foreground">Huidige status/fase</div>
                    <div className="text-base font-semibold text-foreground">{currentDisplay}</div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Processtappen</h3>
                    <div className="text-xs text-muted-foreground">Klik om te selecteren</div>
                  </div>

                  <div className="space-y-2">
                    {options.map((opt, idx) => {
                      const isSelected = opt.value === selectedValue;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelectedValue(opt.value)}
                          className={[
                            'w-full text-left rounded-xl border p-4 transition-smooth',
                            isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                          ].join(' ')}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center pt-1">
                              <div className={`w-3 h-3 rounded-full ${colorDotClass(opt.color)}`} />
                              {idx < options.length - 1 && (
                                <div className="w-px flex-1 bg-border mt-2" style={{ minHeight: 18 }} />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold text-foreground truncate">{opt.label}</div>
                                {isSelected && (
                                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    Geselecteerd
                                  </span>
                                )}
                              </div>

                              {opt.description && (
                                <div className="text-sm text-muted-foreground mt-1">{opt.description}</div>
                              )}

                              {/* Timeline information */}
                              {opt.expectedDurationDays && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                  <Icon name="Clock" size={12} />
                                  <span>Doorlooptijd: <span className="font-medium text-foreground">{opt.expectedDurationDays} dagen</span></span>
                                </div>
                              )}

                              {/* Contact information */}
                              {(opt.contactPersonName || opt.contactPersonEmail || opt.contactPersonPhone) && (
                                <div className="mt-2 p-2 bg-muted/40 rounded-lg border border-border/50">
                                  <div className="text-xs font-medium text-foreground mb-1">Contact:</div>
                                  {opt.contactPersonName && (
                                    <div className="text-xs text-foreground">{opt.contactPersonName}</div>
                                  )}
                                  {opt.contactPersonEmail && (
                                    <div className="text-xs text-primary mt-0.5">
                                      <Icon name="Mail" size={10} className="inline mr-1" />
                                      {opt.contactPersonEmail}
                                    </div>
                                  )}
                                  {opt.contactPersonPhone && (
                                    <div className="text-xs text-primary mt-0.5">
                                      <Icon name="Phone" size={10} className="inline mr-1" />
                                      {opt.contactPersonPhone}
                                    </div>
                                  )}
                                  {opt.contactNotes && (
                                    <div className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border/30">
                                      {opt.contactNotes}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-1 space-y-4">
                  <div className="p-4 border border-border rounded-xl bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Wat gebeurt er hierna?</div>
                    {selectedOption ? (
                      <>
                        <div className="text-sm font-semibold text-foreground">{selectedOption.label}</div>
                        {selectedOption.description && (
                          <div className="text-sm text-muted-foreground mt-1">{selectedOption.description}</div>
                        )}

                        {/* Timeline for selected status */}
                        {selectedOption.expectedDurationDays && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="text-xs text-muted-foreground mb-1">Verwachte doorlooptijd</div>
                            <div className="flex items-center gap-1">
                              <Icon name="Clock" size={14} className="text-primary" />
                              <span className="text-sm font-semibold text-foreground">{selectedOption.expectedDurationDays} dagen</span>
                            </div>
                          </div>
                        )}

                        {/* Contact for selected status */}
                        {(selectedOption.contactPersonName || selectedOption.contactPersonEmail || selectedOption.contactPersonPhone) && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="text-xs text-muted-foreground mb-2">Contactpersoon</div>
                            {selectedOption.contactPersonName && (
                              <div className="text-sm font-medium text-foreground mb-1">{selectedOption.contactPersonName}</div>
                            )}
                            {selectedOption.contactPersonEmail && (
                              <a href={`mailto:${selectedOption.contactPersonEmail}`} className="text-xs text-primary hover:underline flex items-center gap-1 mb-1">
                                <Icon name="Mail" size={12} />
                                {selectedOption.contactPersonEmail}
                              </a>
                            )}
                            {selectedOption.contactPersonPhone && (
                              <a href={`tel:${selectedOption.contactPersonPhone}`} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <Icon name="Phone" size={12} />
                                {selectedOption.contactPersonPhone}
                              </a>
                            )}
                            {selectedOption.contactNotes && (
                              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                                {selectedOption.contactNotes}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="text-xs text-muted-foreground mb-1">Volgende stap (indicatie)</div>
                          {nextOption ? (
                            <div className="text-sm font-semibold text-foreground">{nextOption.label}</div>
                          ) : (
                            <div className="text-sm text-muted-foreground">Laatste stap in deze workflow.</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">Selecteer een stap.</div>
                    )}
                  </div>

                  <Input
                    label="Notitie (verplicht)"
                    type="text"
                    placeholder="Bijv. 'Melder geïnformeerd, wacht op reactie'"
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e?.target?.value)}
                    description="Verplicht: leg uit waarom deze status wordt gewijzigd"
                    required
                  />

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="default"
                      iconName="Save"
                      iconPosition="left"
                      onClick={handleUpdate}
                      disabled={isUnchanged || !selectedValue || !safeTrim(updateNote)}
                    >
                      Bijwerken
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 md:px-6 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Gebaseerd op workflow_statuses tabel.</span>
            <span className="font-mono">{workflowType || ''}</span>
          </div>
        </div>
      </div>
    </>
  );
}
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { workflowService } from '../../../services/workflowService';
import { ticketService } from '../../../services/ticketService';

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
  workflowType,
  currentStatus,
  currentStage,
  onClose,
  onUpdate,
}) {
  const { t } = useTranslation();
  const [workflow, setWorkflow] = useState(null);
  const [workflowRuntimeSettings, setWorkflowRuntimeSettings] = useState({
    allowStatusRollback: false,
    requireCommentOnStatusChange: true,
  });
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const [selectedValue, setSelectedValue] = useState(null);

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
        const runtime = await ticketService.getWorkflowRuntimeSettings(code);
        if (!cancelled) setWorkflow({ ...wf, statusesArray: statuses });
        if (!cancelled) {
          setWorkflowRuntimeSettings({
            allowStatusRollback: runtime?.allowStatusRollback === true,
            requireCommentOnStatusChange: runtime?.requireCommentOnStatusChange !== false,
          });
        }
      } catch (e) {
        console.error('[StatusUpdateModal] Error loading workflow:', e);
        if (!cancelled) setLoadError(t('caseManagementDetail.statusFlow.workflowLoadError'));
      } finally {
        if (!cancelled) setIsLoadingWorkflow(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [workflowType, t]);

  const options = useMemo(() => {
    const statuses = workflow?.statusesArray || [];
    return statuses
      .map((s) => ({
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
      }))
      .sort((a, b) => a.order - b.order);
  }, [workflow?.statusesArray]);

  useEffect(() => {
    if (!options.length) return;

    const findByCode = (val) => options.find((o) => safeLower(o.value) === safeLower(val))?.value;
    const findByLabel = (val) => options.find((o) => safeLower(o.label) === safeLower(val))?.value;
    const cur =
      findByCode(currentStage) ||
      findByLabel(currentStage) ||
      findByCode(currentStatus) ||
      findByLabel(currentStatus);

    setSelectedValue(cur || options[0].value);
  }, [options, currentStage, currentStatus]);

  const selectedIndex = useMemo(() => options.findIndex((o) => o.value === selectedValue), [options, selectedValue]);
  const selectedOption = useMemo(() => options.find((o) => o.value === selectedValue) || null, [options, selectedValue]);
  const nextOption = useMemo(() => (selectedIndex < 0 ? null : options[selectedIndex + 1] || null), [options, selectedIndex]);

  const currentComparable = useMemo(() => {
    const findByCode = (val) => options.find((o) => safeLower(o.value) === safeLower(val))?.value;
    const findByLabel = (val) => options.find((o) => safeLower(o.label) === safeLower(val))?.value;
    return (
      findByCode(currentStage) ||
      findByLabel(currentStage) ||
      findByCode(currentStatus) ||
      findByLabel(currentStatus) ||
      null
    );
  }, [options, currentStage, currentStatus]);

  const isUnchanged = useMemo(() => {
    if (!selectedValue) return true;
    if (!currentComparable) return false;
    return safeLower(selectedValue) === safeLower(currentComparable);
  }, [selectedValue, currentComparable]);

  const handleUpdate = () => {
    if (!selectedValue || isUnchanged) return;

    const requiresNote = workflowRuntimeSettings?.requireCommentOnStatusChange !== false;
    if (requiresNote && !safeTrim(updateNote)) {
      alert(t('caseManagementDetail.statusModal.noteRequiredAlert'));
      return;
    }

    const currentIdx = options.findIndex((o) => safeLower(o.value) === safeLower(currentComparable));
    const newIdx = options.findIndex((o) => o.value === selectedValue);
    if (currentIdx >= 0 && newIdx >= 0 && newIdx < currentIdx && !workflowRuntimeSettings?.allowStatusRollback) {
      alert(t('caseManagementDetail.statusModal.rollbackNotAllowedAlert'));
      return;
    }

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
                  {t('caseManagementDetail.statusModal.title')}
                </h2>
                <p className="text-xs text-muted-foreground truncate">
                  {workflow?.name ? workflow.name : workflowType || t('caseManagementDetail.statusModal.workflowFallback')}
                  {isLoadingWorkflow ? ` - ${t('caseManagementDetail.statusModal.loading')}` : ''}
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
                {t('caseManagementDetail.statusFlow.noStatusesConfigured')}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <div className="p-3 mb-4 bg-muted rounded-xl">
                    <div className="text-xs text-muted-foreground">{t('caseManagementDetail.statusModal.currentStatus')}</div>
                    <div className="text-base font-semibold text-foreground">{currentDisplay}</div>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">{t('caseManagementDetail.statusModal.processSteps')}</h3>
                    <div className="text-xs text-muted-foreground">{t('caseManagementDetail.statusModal.clickToSelect')}</div>
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
                              {idx < options.length - 1 && <div className="w-px flex-1 bg-border mt-2" style={{ minHeight: 18 }} />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold text-foreground truncate">{opt.label}</div>
                                {isSelected && (
                                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    {t('caseManagementDetail.statusModal.selected')}
                                  </span>
                                )}
                              </div>

                              {opt.description && <div className="text-sm text-muted-foreground mt-1">{opt.description}</div>}

                              {opt.expectedDurationDays && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                                  <Icon name="Clock" size={12} />
                                  <span>
                                    {t('caseManagementDetail.statusModal.leadTime')}:{' '}
                                    <span className="font-medium text-foreground">
                                      {opt.expectedDurationDays} {t('caseManagementDetail.sla.days')}
                                    </span>
                                  </span>
                                </div>
                              )}

                              {(opt.contactPersonName || opt.contactPersonEmail || opt.contactPersonPhone) && (
                                <div className="mt-2 p-2 bg-muted/40 rounded-lg border border-border/50">
                                  <div className="text-xs font-medium text-foreground mb-1">{t('caseManagementDetail.sla.contact')}:</div>
                                  {opt.contactPersonName && <div className="text-xs text-foreground">{opt.contactPersonName}</div>}
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
                                  {opt.contactNotes && <div className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border/30">{opt.contactNotes}</div>}
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
                    <div className="text-xs text-muted-foreground mb-1">{t('caseManagementDetail.statusModal.whatNext')}</div>
                    {selectedOption ? (
                      <>
                        <div className="text-sm font-semibold text-foreground">{selectedOption.label}</div>
                        {selectedOption.description && <div className="text-sm text-muted-foreground mt-1">{selectedOption.description}</div>}

                        {selectedOption.expectedDurationDays && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="text-xs text-muted-foreground mb-1">{t('caseManagementDetail.statusModal.expectedLeadTime')}</div>
                            <div className="flex items-center gap-1">
                              <Icon name="Clock" size={14} className="text-primary" />
                              <span className="text-sm font-semibold text-foreground">
                                {selectedOption.expectedDurationDays} {t('caseManagementDetail.sla.days')}
                              </span>
                            </div>
                          </div>
                        )}

                        {(selectedOption.contactPersonName || selectedOption.contactPersonEmail || selectedOption.contactPersonPhone) && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <div className="text-xs text-muted-foreground mb-2">{t('caseManagementDetail.sla.contactPerson')}</div>
                            {selectedOption.contactPersonName && <div className="text-sm font-medium text-foreground mb-1">{selectedOption.contactPersonName}</div>}
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
                          <div className="text-xs text-muted-foreground mb-1">{t('caseManagementDetail.statusModal.nextStep')}</div>
                          {nextOption ? (
                            <div className="text-sm font-semibold text-foreground">{nextOption.label}</div>
                          ) : (
                            <div className="text-sm text-muted-foreground">{t('caseManagementDetail.statusModal.lastStep')}</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">{t('caseManagementDetail.statusModal.selectStep')}</div>
                    )}
                  </div>

                  <Input
                    label={t('caseManagementDetail.statusModal.noteLabel')}
                    type="text"
                    placeholder={t('caseManagementDetail.statusModal.notePlaceholder')}
                    value={updateNote}
                    onChange={(e) => setUpdateNote(e?.target?.value)}
                    description={t('caseManagementDetail.statusModal.noteDescription')}
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
                      {t('caseManagementDetail.common.update')}
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 md:px-6 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('caseManagementDetail.statusModal.footer')}</span>
            <span className="font-mono">{workflowType || ''}</span>
          </div>
        </div>
      </div>
    </>
  );
}

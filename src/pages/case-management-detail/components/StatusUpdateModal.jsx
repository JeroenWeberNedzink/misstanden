import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { workflowService } from '../../../services/workflowService';
import { ticketService } from '../../../services/ticketService';
import { toDateSafe } from '../../../utils/slaUtils';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();
const STATUS_ROLLBACK_WINDOW_MS = 60 * 60 * 1000;

const isRollbackWindowOpen = (value) => {
  if (!value) return false;
  const date = toDateSafe(value);
  if (!date) return false;
  return Date.now() - date.getTime() <= STATUS_ROLLBACK_WINDOW_MS;
};

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
  statusChangedAt = null,
  onClose,
  onUpdate,
  isUpdating = false,
}) {
  const { t } = useTranslation();
  const [workflow, setWorkflow] = useState(null);
  const [workflowRuntimeSettings, setWorkflowRuntimeSettings] = useState({
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
  const rollbackWindowOpen = useMemo(() => isRollbackWindowOpen(statusChangedAt), [statusChangedAt]);
  const requiresNote = workflowRuntimeSettings?.requireCommentOnStatusChange !== false;

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
  const currentComparableIndex = useMemo(
    () => options.findIndex((o) => safeLower(o.value) === safeLower(currentComparable)),
    [options, currentComparable]
  );

  const isUnchanged = useMemo(() => {
    if (!selectedValue) return true;
    if (!currentComparable) return false;
    return safeLower(selectedValue) === safeLower(currentComparable);
  }, [selectedValue, currentComparable]);

  const handleClose = () => {
    if (isUpdating) return;
    onClose?.();
  };

  const handleUpdate = async () => {
    if (isUpdating || !selectedValue || isUnchanged) return;

    if (requiresNote && !safeTrim(updateNote)) {
      alert(t('caseManagementDetail.statusModal.noteRequiredAlert'));
      return;
    }

    const currentIdx = currentComparableIndex;
    const newIdx = options.findIndex((o) => o.value === selectedValue);
    if (currentIdx >= 0 && newIdx >= 0 && newIdx < currentIdx && !rollbackWindowOpen) {
      alert(t('caseManagementDetail.statusModal.rollbackNotAllowedAlert'));
      return;
    }

    try {
      await onUpdate?.({
        workflowType: safeTrim(workflowType) || null,
        statusCode: selectedValue,
        note: safeTrim(updateNote),
      });
      onClose?.();
    } catch {
      // Parent handles the toast and keeps the modal open for retry.
    }
  };

  const currentDisplay = currentStage || currentStatus || '-';

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm" onClick={handleClose} />

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

            <Button variant="ghost" size="icon" onClick={handleClose} disabled={isUpdating}>
              <Icon name="X" size={24} />
            </Button>
          </div>

          <div className="p-4 md:p-6">
            {isUpdating && (
              <div
                className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"
                aria-live="polite"
                aria-busy="true"
              >
                <Icon name="Loader2" size={18} className="text-primary" />
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{t('caseManagementDetail.statusModal.updating')}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('caseManagementDetail.statusModal.updatingDescription')}
                  </div>
                </div>
              </div>
            )}

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
                      const isRollbackLocked = currentComparableIndex >= 0 && idx < currentComparableIndex && !rollbackWindowOpen;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => !isUpdating && !isRollbackLocked && setSelectedValue(opt.value)}
                          disabled={isUpdating || isRollbackLocked}
                          className={[
                            'w-full text-left rounded-xl border p-4 transition-smooth',
                            isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                            isUpdating || isRollbackLocked ? 'opacity-60 cursor-not-allowed' : '',
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
                    disabled={isUpdating}
                  />

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="default"
                      iconName="Save"
                      iconPosition="left"
                      onClick={handleUpdate}
                      loading={isUpdating}
                      disabled={isUpdating || isUnchanged || !selectedValue || (requiresNote && !safeTrim(updateNote))}
                    >
                      {isUpdating ? t('caseManagementDetail.statusModal.updating') : t('caseManagementDetail.common.update')}
                    </Button>
                    <Button variant="outline" onClick={handleClose} disabled={isUpdating}>
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

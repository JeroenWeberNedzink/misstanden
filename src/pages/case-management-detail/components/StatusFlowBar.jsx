import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import Icon from '../../../components/AppIcon';
import { workflowService } from '../../../services/workflowService';
import StatusFlowNoteDialog from './StatusFlowNoteDialog';
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

export default function StatusFlowBar({
  workflowType,
  currentStatus,
  currentStage,
  statusChangedAt = null,
  onStatusUpdate,
  disabled = false,
  isUpdating = false,
}) {
  const { t } = useTranslation();
  const [workflow, setWorkflow] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [hovered, setHovered] = useState(null);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError('');
      setWorkflow(null);

      const code = safeTrim(workflowType);
      if (!code) return;

      setIsLoading(true);
      try {
        const wf = await workflowService.getWorkflowByCode(code);
        if (!wf?.id) throw new Error('Workflow not found');

        const statuses = await workflowService.getWorkflowStatuses(wf.id, { useCache: true });
        if (!cancelled) {
          setWorkflow({ ...wf, statusesArray: statuses });
        }
      } catch (e) {
        console.error('[StatusFlowBar] Error loading workflow:', e);
        if (!cancelled) setLoadError(t('caseManagementDetail.statusFlow.workflowLoadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [workflowType, t]);

  const statuses = useMemo(() => {
    const statusesArray = workflow?.statusesArray || [];
    return statusesArray
      .map((s) => ({
        code: s.code,
        label: s.label,
        description: s.description || '',
        color: s.color || null,
        sortOrder: s.sortOrder ?? 999,
        isTerminal: Boolean(s.isTerminal ?? s.is_terminal ?? false),
        isFirstResponse: Boolean(s.isFirstResponse ?? s.is_first_response ?? false),
        expectedDurationDays: s.expectedDurationDays || null,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [workflow?.statusesArray]);

  const currentStatusCode = useMemo(() => {
    const findByCode = (val) => statuses.find((s) => safeLower(s.code) === safeLower(val))?.code;
    const findByLabel = (val) => statuses.find((s) => safeLower(s.label) === safeLower(val))?.code;

    return (
      findByCode(currentStage) ||
      findByLabel(currentStage) ||
      findByCode(currentStatus) ||
      findByLabel(currentStatus) ||
      null
    );
  }, [statuses, currentStage, currentStatus]);

  const currentIndex = useMemo(() => statuses.findIndex((s) => s.code === currentStatusCode), [statuses, currentStatusCode]);
  const rollbackWindowOpen = useMemo(() => isRollbackWindowOpen(statusChangedAt), [statusChangedAt]);

  const firstResponseStatuses = useMemo(
    () => statuses.filter((status) => status.isFirstResponse),
    [statuses]
  );

  const completedStatuses = useMemo(() => {
    const terminals = statuses.filter((status) => status.isTerminal);
    if (terminals.length > 0) return terminals;
    return statuses.length > 0 ? [statuses[statuses.length - 1]] : [];
  }, [statuses]);

  const firstResponseLabel = useMemo(() => {
    if (firstResponseStatuses.length === 0) {
      return t('caseManagementDetail.statusFlow.notConfigured', { defaultValue: 'Not configured' });
    }
    return firstResponseStatuses
      .map((status) => status.label || status.code)
      .filter(Boolean)
      .join(', ');
  }, [firstResponseStatuses, t]);

  const completedLabel = useMemo(() => {
    if (completedStatuses.length === 0) {
      return t('caseManagementDetail.statusFlow.notConfigured', { defaultValue: 'Not configured' });
    }
    return completedStatuses
      .map((status) => status.label || status.code)
      .filter(Boolean)
      .join(', ');
  }, [completedStatuses, t]);

  const getStatusState = (index) => {
    if (currentIndex < 0) return 'pending';
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'pending';
  };

  const handleStatusClick = (status, index) => {
    if (disabled || isUpdating) return;
    const state = getStatusState(index);
    if (state === 'current') return;
    if (currentIndex >= 0 && index < currentIndex && !rollbackWindowOpen) {
      window.alert(
        t('caseManagementDetail.statusModal.rollbackNotAllowedAlert', {
          defaultValue: 'Terugzetten is alleen binnen 1 uur na de laatste statuswijziging toegestaan.',
        })
      );
      return;
    }
    setSelectedStatus(status);
    setShowNoteDialog(true);
  };

  const handleNoteConfirm = async ({ statusCode, note }) => {
    setShowNoteDialog(false);
    setSelectedStatus(null);
    try {
      await onStatusUpdate?.({
        workflowType: safeTrim(workflowType) || null,
        statusCode,
        note: safeTrim(note),
      });
    } catch {
      // The parent shows the error toast; keep this flow from surfacing an unhandled promise.
    }
  };

  const handleNoteClose = () => {
    setShowNoteDialog(false);
    setSelectedStatus(null);
  };

  useEffect(() => {
    if (!hovered?.code) return;

    const update = () => {
      const el = document.querySelector(`[data-status-anchor="${hovered.code}"]`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setHovered((prev) => (prev ? { ...prev, rect } : prev));
    };

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [hovered?.code]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="Loader" size={16} className="animate-spin" />
          <span>{t('caseManagementDetail.statusFlow.loading')}</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  if (!statuses.length) {
    return (
      <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
        {t('caseManagementDetail.statusFlow.noStatusesConfigured')}
      </div>
    );
  }

  const tooltipPortal = hovered?.rect
    ? createPortal(
        (() => {
          const { rect, status, state } = hovered;
          const maxWidth = 280;
          const offset = 12;
          const scrollX = window.scrollX;
          const scrollY = window.scrollY;
          const centerX = rect.left + rect.width / 2 + scrollX;
          const top = rect.top + scrollY - offset;
          const margin = 12;
          const minLeft = scrollX + margin + maxWidth / 2;
          const maxLeft = scrollX + window.innerWidth - margin - maxWidth / 2;
          const left = Math.max(minLeft, Math.min(centerX, maxLeft));

          return (
            <div className="fixed z-[999999] pointer-events-none" style={{ top, left, transform: 'translate(-50%, -100%)' }}>
              <div className="w-[280px] p-3 bg-white border border-gray-300 rounded-lg shadow-2xl">
                <div className="text-sm font-semibold text-gray-900 mb-2">{status.label || t('caseManagementDetail.common.status')}</div>

                <div className="text-xs mb-2 text-gray-700">
                  {state === 'current' && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                      <span className="w-2 h-2 bg-blue-500 rounded-full" />
                      {t('caseManagementDetail.statusFlow.currentStatus')}
                    </div>
                  )}
                  {state === 'completed' && (
                    <div className="text-sky-600">
                      <Icon name="Check" size={12} className="inline mr-1" />
                      {t('caseManagementDetail.statusFlow.completedHint')}
                    </div>
                  )}
                  {state === 'pending' && <div className="text-gray-600">{t('caseManagementDetail.statusFlow.pendingHint')}</div>}
                </div>

                {status.description && (
                  <div className="text-xs text-gray-600 mb-2 leading-relaxed border-t border-gray-200 pt-2">{status.description}</div>
                )}

                {status.expectedDurationDays && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-2">
                    <Icon name="Clock" size={12} />
                    <span>
                      {t('caseManagementDetail.statusFlow.expected')} {status.expectedDurationDays} {t('caseManagementDetail.sla.days')}
                    </span>
                  </div>
                )}

              </div>
            </div>
          );
        })(),
        document.body
      )
    : null;

  const isInteractionDisabled = disabled || isUpdating;

  return (
    <div className="relative">
      {isUpdating && (
        <div
          className="absolute inset-0 z-20 flex min-h-[8rem] items-center justify-center rounded-xl bg-card/85 px-4 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-background px-4 py-3 shadow-sm">
            <Icon name="Loader2" size={18} className="text-primary" />
            <span className="text-sm font-medium text-foreground">
              {t('caseManagementDetail.statusFlow.updating')}
            </span>
          </div>
        </div>
      )}

      <div className={isUpdating ? 'pointer-events-none' : ''}>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-foreground">
          <Icon name="Timer" size={13} className="text-primary" />
          <span className="font-medium">
            {t('caseManagementDetail.statusFlow.firstResponseCountsAt', { defaultValue: 'First response counts at' })}:
          </span>
          <span className="text-muted-foreground">{firstResponseLabel}</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-foreground">
          <Icon name="Flag" size={13} className="text-primary" />
          <span className="font-medium">
            {t('caseManagementDetail.statusFlow.caseCompletedAt', { defaultValue: 'Case completed at' })}:
          </span>
          <span className="text-muted-foreground">{completedLabel}</span>
        </div>
      </div>

      <div className={`w-full overflow-x-auto mt-5 ${isInteractionDisabled ? 'opacity-60' : ''}`}>
        {disabled && !isUpdating && (
          <div className="px-4 pb-2 text-xs text-muted-foreground text-center">
            {t('caseManagementDetail.management.assignBeforeStatusChange')}
          </div>
        )}
        <div className="min-w-max px-4 py-6">
          <div className="relative w-fit mx-auto flex items-center gap-2">
            {statuses.map((status, index) => {
              const state = getStatusState(index);
              const isCompleted = state === 'completed';
              const isCurrent = state === 'current';
              const isPending = state === 'pending';
              const isRollbackLocked = currentIndex >= 0 && index < currentIndex && !rollbackWindowOpen;
              const isLast = index === statuses.length - 1;
              const blueShade = getBlueShade(index, statuses.length);

              return (
                <div key={status.code} className="flex items-center flex-1">
                  <div
                    className="relative flex flex-col items-center"
                    data-status-anchor={status.code}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHovered({ code: status.code, rect, status, state });
                    }}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <button
                      type="button"
                      onClick={() => handleStatusClick(status, index)}
                      disabled={isInteractionDisabled || isCurrent || isRollbackLocked}
                      className={
                        isInteractionDisabled || isRollbackLocked
                          ? 'relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all border-blue-200 bg-background cursor-not-allowed'
                          : [
                              'relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                              isCompleted && `${blueShade.bg} ${blueShade.border} ${blueShade.text} hover:opacity-80 cursor-pointer`,
                              isCurrent && `${blueShade.border} bg-background ring-4 ring-blue-500/20 cursor-default`,
                              isPending && 'border-blue-200 bg-background hover:bg-blue-50 hover:border-blue-300 cursor-pointer',
                            ].join(' ')
                      }
                    >
                      {isCompleted && <Icon name="Check" size={20} />}
                      {isCurrent && <div className={`w-4 h-4 rounded-full ${blueShade.bg}`} />}
                      {isPending && <div className="w-3 h-3 rounded-full border-2 border-blue-200" />}
                    </button>

                    <div className="mt-2 text-center min-w-0 max-w-[120px]">
                      <div
                        className={[
                          'text-xs truncate',
                          isCurrent && 'font-semibold text-foreground',
                          isCompleted && 'font-medium text-muted-foreground',
                          isPending && 'font-normal text-muted-foreground',
                        ].join(' ')}
                      >
                        {status.label}
                      </div>
                      {isCurrent && <div className="text-[10px] text-primary mt-0.5">{t('caseManagementDetail.statusFlow.currentShort')}</div>}
                    </div>
                  </div>

                  {!isLast && (
                    <div className="flex-1 h-0.5 mx-2 min-w-[40px]">
                      {isCompleted ? (
                        <div className={`h-full ${blueShade.bg}`} />
                      ) : (
                        <div className="h-full border-t-2 border-dashed border-blue-200" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {tooltipPortal}

      {showNoteDialog && selectedStatus && !isUpdating && (
        <StatusFlowNoteDialog
          isOpen={showNoteDialog}
          onClose={handleNoteClose}
          selectedStatus={selectedStatus}
          currentStatus={currentStatus}
          onConfirm={handleNoteConfirm}
        />
      )}
    </div>
  );
}

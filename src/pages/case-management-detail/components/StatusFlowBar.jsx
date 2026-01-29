import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/AppIcon';
import { workflowService } from '../../../services/workflowService';
import StatusFlowNoteDialog from './StatusFlowNoteDialog';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

// Get blue shade based on position in workflow (gradient from light to dark)
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
  onStatusUpdate,
}) {
  const [workflow, setWorkflow] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Hover state now stores: { code, rect, index, state }
  const [hovered, setHovered] = useState(null);

  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);

  // Load workflow statuses
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
        if (!cancelled) setLoadError('Kon workflow statussen niet laden.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [workflowType]);

  // Parse statuses into sorted array
  const statuses = useMemo(() => {
    const statusesArray = workflow?.statusesArray || [];
    return statusesArray
      .map(s => ({
        code: s.code,
        label: s.label,
        description: s.description || '',
        color: s.color || null,
        sortOrder: s.sortOrder ?? 999,
        expectedDurationDays: s.expectedDurationDays || null,
        contactPersonName: s.contactPersonName || '',
        contactPersonEmail: s.contactPersonEmail || '',
        contactPersonPhone: s.contactPersonPhone || '',
        contactNotes: s.contactNotes || '',
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [workflow?.statusesArray]);

  // Find current status index
  const currentStatusCode = useMemo(() => {
    const findByCode = (val) => statuses.find(s => safeLower(s.code) === safeLower(val))?.code;
    const findByLabel = (val) => statuses.find(s => safeLower(s.label) === safeLower(val))?.code;

    return (
      findByCode(currentStage) ||
      findByLabel(currentStage) ||
      findByCode(currentStatus) ||
      findByLabel(currentStatus) ||
      null
    );
  }, [statuses, currentStage, currentStatus]);

  const currentIndex = useMemo(() => {
    return statuses.findIndex(s => s.code === currentStatusCode);
  }, [statuses, currentStatusCode]);

  // Determine state for each status
  const getStatusState = (index) => {
    if (currentIndex < 0) return 'pending';
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'pending';
  };

  // Handle status click
  const handleStatusClick = (status, index) => {
    const state = getStatusState(index);
    if (state === 'current') return;

    setSelectedStatus(status);
    setShowNoteDialog(true);
  };

  // Handle note dialog confirm
  const handleNoteConfirm = ({ statusCode, note }) => {
    onStatusUpdate?.({
      workflowType: safeTrim(workflowType) || null,
      statusCode,
      note: safeTrim(note),
    });
    setShowNoteDialog(false);
    setSelectedStatus(null);
  };

  // Handle note dialog close
  const handleNoteClose = () => {
    setShowNoteDialog(false);
    setSelectedStatus(null);
  };

  // Keep tooltip positioned on scroll/resize
  useEffect(() => {
    if (!hovered?.code) return;

    const update = () => {
      // If we still have an anchor element stored, recompute rect
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
          <span>Statussen laden...</span>
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
        Geen statussen geconfigureerd in deze workflow.
      </div>
    );
  }

  // Render tooltip into body
  const tooltipPortal = hovered?.rect
    ? createPortal(
        (() => {
          const { rect, status, state } = hovered;

          // place above centered
          const maxWidth = 280;
          const offset = 12;
          const scrollX = window.scrollX;
          const scrollY = window.scrollY;

          const centerX = rect.left + rect.width / 2 + scrollX;
          const top = rect.top + scrollY - offset; // anchor point

          // clamp horizontally
          const margin = 12;
          const minLeft = scrollX + margin + maxWidth / 2;
          const maxLeft = scrollX + window.innerWidth - margin - maxWidth / 2;
          const left = Math.max(minLeft, Math.min(centerX, maxLeft));

          return (
            <div
              className="fixed z-[999999] pointer-events-none"
              style={{
                top,
                left,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="w-[280px] p-3 bg-white border border-gray-300 rounded-lg shadow-2xl">
                {/* Title */}
                <div className="text-sm font-semibold text-gray-900 mb-2">
                  {status.label || 'Status'}
                </div>

                {/* State indicator */}
                <div className="text-xs mb-2 text-gray-700">
                  {state === 'current' && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                      <span className="w-2 h-2 bg-blue-500 rounded-full" />
                      Huidige status
                    </div>
                  )}
                  {state === 'completed' && (
                    <div className="text-sky-600">✓ Voltooid - Klik om terug te gaan</div>
                  )}
                  {state === 'pending' && (
                    <div className="text-gray-600">Klik om naar deze status te gaan</div>
                  )}
                </div>

                {/* Description */}
                {status.description && (
                  <div className="text-xs text-gray-600 mb-2 leading-relaxed border-t border-gray-200 pt-2">
                    {status.description}
                  </div>
                )}

                {/* Duration */}
                {status.expectedDurationDays && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-2">
                    <Icon name="Clock" size={12} />
                    <span>Verwacht: {status.expectedDurationDays} dagen</span>
                  </div>
                )}

                {/* Contact Info */}
                {status.contactPersonName && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="text-xs font-medium text-gray-900">{status.contactPersonName}</div>
                    {status.contactPersonEmail && (
                      <div className="text-blue-600 text-[11px] mt-0.5">{status.contactPersonEmail}</div>
                    )}
                    {status.contactPersonPhone && (
                      <div className="text-blue-600 text-[11px] mt-0.5">{status.contactPersonPhone}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })(),
        document.body
      )
    : null;

  return (
    <>
      <div className="w-full overflow-x-auto mt-5">
        <div className="min-w-max px-4 py-6">
          {/* NOTE: removed pt-20 padding hack */}
          <div className="relative flex items-center justify-between gap-2">
            {statuses.map((status, index) => {
              const state = getStatusState(index);
              const isCompleted = state === 'completed';
              const isCurrent = state === 'current';
              const isPending = state === 'pending';
              const isLast = index === statuses.length - 1;
              const blueShade = getBlueShade(index, statuses.length);

              return (
                <div key={status.code} className="flex items-center flex-1">
                  {/* Status Node */}
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
                      disabled={isCurrent}
                      className={[
                        'relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                        isCompleted && `${blueShade.bg} ${blueShade.border} ${blueShade.text} hover:opacity-80 cursor-pointer`,
                        isCurrent && `${blueShade.border} bg-background ring-4 ring-blue-500/20 cursor-default`,
                        isPending && 'border-blue-200 bg-background hover:bg-blue-50 hover:border-blue-300 cursor-pointer',
                      ].join(' ')}
                    >
                      {isCompleted && <Icon name="Check" size={20} />}
                      {isCurrent && <div className={`w-4 h-4 rounded-full ${blueShade.bg}`} />}
                      {isPending && <div className="w-3 h-3 rounded-full border-2 border-blue-200" />}
                    </button>

                    {/* Label */}
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
                      {isCurrent && <div className="text-[10px] text-primary mt-0.5">Huidig</div>}
                    </div>
                  </div>

                  {/* Connector Line */}
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

      {/* Tooltip rendered above everything */}
      {tooltipPortal}

      {/* Note Dialog */}
      {showNoteDialog && selectedStatus && (
        <StatusFlowNoteDialog
          isOpen={showNoteDialog}
          onClose={handleNoteClose}
          selectedStatus={selectedStatus}
          currentStatus={currentStatus}
          onConfirm={handleNoteConfirm}
        />
      )}
    </>
  );
}
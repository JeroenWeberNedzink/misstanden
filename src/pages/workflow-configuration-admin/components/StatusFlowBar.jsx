import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { t } from 'i18next';
import StatusFlowBar from './StatusFlowBar';
import { createPortal } from 'react-dom';

/* ================================
   PORTAL TOOLTIP (inline, no extra file)
================================ */
function PortalTooltip({
  content,
  children,
  preferred = 'top',
  offset = 10,
  maxWidth = 360,
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: preferred });

  const compute = () => {
    const el = anchorRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const centerX = rect.left + rect.width / 2 + scrollX;
    const topY = rect.top + scrollY - offset;
    const bottomY = rect.bottom + scrollY + offset;

    const enoughTopSpace = rect.top > 120;
    const placement =
      preferred === 'top'
        ? (enoughTopSpace ? 'top' : 'bottom')
        : (!enoughTopSpace ? 'bottom' : 'top');

    const rawTop = placement === 'top' ? topY : bottomY;

    const margin = 12;
    const minLeft = scrollX + margin + maxWidth / 2;
    const maxLeft = scrollX + window.innerWidth - margin - maxWidth / 2;
    const left = Math.max(minLeft, Math.min(centerX, maxLeft));

    setPos({ top: rawTop, left, placement });
  };

  useEffect(() => {
    if (!open) return;

    compute();
    const onScroll = () => compute();
    const onResize = () => compute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex items-center"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            className="fixed z-[999999] pointer-events-none"
            style={{
              top: pos.top,
              left: pos.left,
              transform:
                pos.placement === 'top'
                  ? 'translate(-50%, -100%)'
                  : 'translate(-50%, 0)',
            }}
          >
            <div
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground shadow-xl"
              style={{ maxWidth }}
            >
              {content}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/* ================================
   CASE HEADER
================================ */
const CaseHeader = ({ caseData, onBack, onStatusChange, isWhistleblower, onStatusUpdate }) => {
  const getPriorityStyles = (priority) => {
    const map = {
      Hoog: 'bg-error/10 text-error border-error/20',
      Gemiddeld: 'bg-warning/10 text-warning border-warning/20',
      Laag: 'bg-muted text-muted-foreground border-border',
    };
    return map?.[priority] || 'bg-muted text-muted-foreground border-border';
  };

  const getStatusStyles = (status) => {
    const map = {
      Nieuw: 'bg-accent/10 text-accent border-accent/20',
      'In behandeling': 'bg-warning/10 text-warning border-warning/20',
      Gesloten: 'bg-muted text-muted-foreground border-border',
    };
    return map?.[status] || 'bg-muted text-muted-foreground border-border';
  };

  const accessCodeTooltip = (
    <div className="space-y-1">
      <div className="font-semibold">Access code</div>
      <div className="text-muted-foreground">
        Dit is de unieke toegangscode voor deze case.
      </div>
      <div className="text-muted-foreground">
        Deel deze alleen met bevoegde personen.
      </div>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-4 md:px-6 md:py-5 overflow-visible">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        
        {/* LEFT: Case identity */}
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="mt-1"
          >
            <Icon name="ArrowLeft" size={20} />
          </Button>

          <div className="min-w-0">
            {/* Title + badges */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold text-foreground min-w-0">
                {t('caseManagement.title')} #{caseData?.ticketNumber}
              </h1>

              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusStyles(caseData?.status)}`}
              >
                {caseData?.status}
              </span>

              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getPriorityStyles(caseData?.priority)}`}
              >
                <Icon name="AlertCircle" size={14} className="mr-1" />
                {caseData?.priority}
              </span>
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Icon name="Calendar" size={15} />
                <span>{caseData?.submittedDate}</span>
              </div>

              <div className="flex items-center gap-2">
                <Icon name="User" size={15} />
                <span>{caseData?.assignedTo || 'Niet toegewezen'}</span>
              </div>

              <div className="flex items-center gap-2">
                <Icon name="Key" size={15} />
                <PortalTooltip content={accessCodeTooltip}>
                  <span className="font-mono cursor-help px-2 py-0.5 rounded-md border border-border bg-muted/30">
                    {caseData?.accessCode}
                  </span>
                </PortalTooltip>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="flex gap-2 lg:items-center">
          <Button
            variant="outline"
            size="sm"
            iconName="Share2"
            iconPosition="left"
          >
            Delen
          </Button>
        </div>
      </div>

      {/* Status Flow Bar */}
      {isWhistleblower && (
        <div className="mt-4 pt-4 border-t border-border overflow-visible">
          <StatusFlowBar
            workflowType={caseData?.workflowType}
            currentStatus={caseData?.status}
            currentStage={caseData?.currentStage}
            onStatusUpdate={onStatusUpdate}
          />
        </div>
      )}
    </div>
  );
};

export default CaseHeader;
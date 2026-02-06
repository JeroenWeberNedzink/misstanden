import React from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { t } from 'i18next';
import StatusFlowBar from './StatusFlowBar';

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

  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-4 md:px-6 md:py-5">
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
                <span className="font-mono">{caseData?.accessCode}</span>
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

      {/* Status Flow Bar for Whistleblower Cases */}
      {isWhistleblower && (
        <div className="mt-4 pt-4 border-t border-border">
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

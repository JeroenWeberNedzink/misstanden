import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import StatusFlowBar from './StatusFlowBar';
import AccessCodeRecoveryModal from './AccessCodeRecoveryModal';

const CaseHeader = ({
  caseData,
  onBack,
  onStatusUpdate,
  canUpdateStatus = true,
  isStatusUpdating = false,
  onGenerateReport,
  generatingReport = false,
  onShare,
  sharing = false,
  onRecoverAccessCode,
}) => {
  const { t } = useTranslation();
  const [showAccessCodeRecovery, setShowAccessCodeRecovery] = useState(false);

  const getPriorityStyles = (priorityCode) => {
    const map = {
      critical: 'bg-error/10 text-error border-error/20',
      high: 'bg-warning/10 text-warning border-warning/20',
      medium: 'bg-muted text-muted-foreground border-border',
      low: 'bg-muted text-muted-foreground border-border',
    };
    return map?.[priorityCode] || 'bg-muted text-muted-foreground border-border';
  };

  return (
    <div className="bg-card border border-border rounded-2xl px-5 py-4 md:px-6 md:py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="mt-1">
            <Icon name="ArrowLeft" size={20} />
          </Button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-semibold text-foreground min-w-0">
                {t('caseManagement.title')} #{caseData?.ticketNumber}
              </h1>

              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-muted text-muted-foreground border-border">
                {caseData?.status || t('caseManagementDetail.common.unknown')}
              </span>

              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getPriorityStyles(
                  caseData?.priorityCode
                )}`}
              >
                <Icon name="AlertCircle" size={14} className="mr-1" />
                {caseData?.priority}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Icon name="Calendar" size={15} />
                <span>{caseData?.submittedDate}</span>
              </div>

              <div className="flex items-center gap-2">
                <Icon name="User" size={15} />
                <span>{caseData?.assignedTo || t('caseManagement.notAssigned')}</span>
              </div>

              <div className="flex items-center gap-2">
                <Icon name="ShieldCheck" size={15} className="text-success" />
                <div
                  className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
                  title={t('caseManagementDetail.header.accessCodeProtectedExplanation')}
                >
                  <span className="font-medium text-foreground">
                    {t('caseManagementDetail.header.accessCodeProtected')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    — {t('caseManagementDetail.header.accessCodeHiddenFromHandlers')}
                  </span>
                  {onRecoverAccessCode && (
                    <button
                      type="button"
                      className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                      onClick={() => setShowAccessCodeRecovery(true)}
                    >
                      {t('caseManagementDetail.header.recoverAccessCode')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 lg:items-center">
          {onGenerateReport && (
            <Button
              variant="outline"
              size="sm"
              iconName="FileDown"
              iconPosition="left"
              onClick={onGenerateReport}
              loading={generatingReport}
            >
              {t('caseManagementDetail.header.generateReport', { defaultValue: 'Generate report' })}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            iconName="Share2"
            iconPosition="left"
            onClick={onShare}
            loading={sharing}
          >
            {t('caseManagementDetail.header.share')}
          </Button>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <StatusFlowBar
          workflowType={caseData?.workflowType}
          currentStatus={caseData?.status}
          currentStage={caseData?.currentStage}
          statusChangedAt={caseData?.sla?.statusChangedAt}
          onStatusUpdate={onStatusUpdate}
          disabled={!canUpdateStatus}
          isUpdating={isStatusUpdating}
        />
      </div>

      <AccessCodeRecoveryModal
        isOpen={showAccessCodeRecovery}
        onClose={() => setShowAccessCodeRecovery(false)}
        onGenerate={onRecoverAccessCode}
      />
    </div>
  );
};

export default CaseHeader;

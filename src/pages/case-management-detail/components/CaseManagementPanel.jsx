import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import { Checkbox } from '../../../components/ui/Checkbox';
import PermissionGuard from '../../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../../utils/permissions';

const CaseManagementPanel = ({
  caseData,
  onAssignmentChange,
  onPriorityChange,
  onStatusChange,
  onEscalate,
  onStatusEmailNotifyChange,
  handlers,
  isWhistleblower,
}) => {
  const { t } = useTranslation();
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingStatusEmail, setSavingStatusEmail] = useState(false);

  const priorityOptions = useMemo(
    () => [
      { value: 'low', label: t('caseManagement.low'), description: t('caseManagementDetail.management.priorityLowDesc') },
      { value: 'medium', label: t('caseManagement.medium'), description: t('caseManagementDetail.management.priorityMediumDesc') },
      { value: 'high', label: t('caseManagement.high'), description: t('caseManagementDetail.management.priorityHighDesc') },
      { value: 'critical', label: t('caseManagement.critical'), description: t('caseManagementDetail.management.priorityCriticalDesc') },
    ],
    [t]
  );

  const handlerOptions = useMemo(() => {
    const inactiveLabel = t('common.inactive', { defaultValue: 'Inactive' });
    const list = (handlers || [])
      .filter((handler) => Boolean(handler?.id))
      .map((handler) => {
        const isActive = handler?.active !== false;
        return {
          value: handler?.id,
          label: isActive ? handler?.name : `${handler?.name} (${inactiveLabel})`,
          description: isActive ? handler?.role : inactiveLabel,
          disabled: !isActive,
        };
      });

    return [
      {
        value: '',
        label: t('caseManagement.notAssigned'),
        description: t('caseManagementDetail.management.notAssignedDescription'),
      },
      ...list,
    ];
  }, [handlers, t]);

  const isBusy = savingAssignment || savingPriority || savingStatusEmail;
  const statusEmailChecked = caseData?.statusEmailNotify !== false;

  const handleAssignmentSelect = useCallback(
    async (value) => {
      const nextHandlerId = value || '';
      if ((caseData?.assignedToId || '') === nextHandlerId) return;

      try {
        setSavingAssignment(true);
        await onAssignmentChange?.(nextHandlerId || null);
      } finally {
        setSavingAssignment(false);
      }
    },
    [caseData?.assignedToId, onAssignmentChange]
  );

  const handlePrioritySelect = useCallback(
    async (value) => {
      const nextPriorityCode = value;
      if (!nextPriorityCode || caseData?.priorityCode === nextPriorityCode) return;

      try {
        setSavingPriority(true);
        await onPriorityChange?.(nextPriorityCode);
      } finally {
        setSavingPriority(false);
      }
    },
    [caseData?.priorityCode, onPriorityChange]
  );

  const handleStatusEmailToggle = useCallback(
    async (checked) => {
      try {
        setSavingStatusEmail(true);
        await onStatusEmailNotifyChange?.(checked);
      } finally {
        setSavingStatusEmail(false);
      }
    },
    [onStatusEmailNotifyChange]
  );

  return (
    <div className="bg-card rounded-xl border border-border overflow-visible isolate">
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {!isWhistleblower && (
            <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground block">{t('caseManagement.updateStatus')}</label>
                <Button variant="outline" fullWidth iconName="Edit" iconPosition="left" onClick={onStatusChange} disabled={isBusy}>
                  {t('caseManagementDetail.management.changeStatusCta', {
                    status: caseData?.status || t('caseManagementDetail.common.unknown'),
                  })}
                </Button>
              </div>
            </PermissionGuard>
          )}

          <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
            <div className="relative z-[80]">
              <Select
                label={t('caseManagement.assignTo')}
                description={t('caseManagementDetail.management.assignDescription')}
                options={handlerOptions}
                value={caseData?.assignedToId || ''}
                onChange={handleAssignmentSelect}
                searchable
                disabled={savingAssignment}
              />
            </div>
          </PermissionGuard>

          <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
            <div className="relative z-[70]">
              <Select
                label={t('caseManagementDetail.management.priorityLevel')}
                description={t('caseManagementDetail.management.priorityDescription')}
                options={priorityOptions}
                value={caseData?.priorityCode || ''}
                onChange={handlePrioritySelect}
                disabled={savingPriority}
              />
            </div>
          </PermissionGuard>

          <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <Checkbox
                label={t('caseManagementDetail.management.statusEmailsLabel')}
                description={t('caseManagementDetail.management.statusEmailsDescription')}
                checked={statusEmailChecked}
                onChange={(e) => handleStatusEmailToggle(e?.target?.checked)}
                disabled={savingStatusEmail}
              />
            </div>
          </PermissionGuard>
        </div>

        {isBusy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-accent" />
            <span>{t('caseManagementDetail.management.savingChange')}</span>
          </div>
        )}

        {onEscalate && (
          <div className="pt-1">
            <Button
              variant="outline"
              fullWidth
              iconName="AlertTriangle"
              iconPosition="left"
              onClick={() => onEscalate?.('management')}
              disabled={isBusy}
            >
              {t('caseManagementDetail.management.escalateToManagement')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CaseManagementPanel;

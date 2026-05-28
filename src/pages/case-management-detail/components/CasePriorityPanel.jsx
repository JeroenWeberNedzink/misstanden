import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../../components/ui/Select';
import PermissionGuard from '../../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../../utils/permissions';

const CasePriorityPanel = ({ caseData, onPriorityChange }) => {
  const { t } = useTranslation();
  const [savingPriority, setSavingPriority] = useState(false);

  const priorityOptions = useMemo(
    () => [
      { value: 'low', label: t('caseManagement.low'), description: t('caseManagementDetail.management.priorityLowDesc') },
      { value: 'medium', label: t('caseManagement.medium'), description: t('caseManagementDetail.management.priorityMediumDesc') },
      { value: 'high', label: t('caseManagement.high'), description: t('caseManagementDetail.management.priorityHighDesc') },
      { value: 'critical', label: t('caseManagement.critical'), description: t('caseManagementDetail.management.priorityCriticalDesc') },
    ],
    [t]
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

  return (
    <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
      <div className="bg-card rounded-xl border border-border p-4 md:p-5">
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
  );
};

export default CasePriorityPanel;

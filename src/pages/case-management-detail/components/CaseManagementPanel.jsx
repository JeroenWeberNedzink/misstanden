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
  onAssignmentRoleChange,
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
  const assignmentRoleOptions = useMemo(
    () => [
      { value: 'primary', label: t('caseManagementDetail.management.rolePrimary', { defaultValue: 'Primary' }) },
      { value: 'secondary', label: t('caseManagementDetail.management.roleSecondary', { defaultValue: 'Secondary' }) },
      { value: 'legal', label: t('caseManagementDetail.management.roleLegal', { defaultValue: 'Legal' }) },
      { value: 'observer', label: t('caseManagementDetail.management.roleObserver', { defaultValue: 'Observer' }) },
    ],
    [t]
  );

  const handlerOptions = useMemo(() => {
    const inactiveLabel = t('common.inactive', { defaultValue: 'Inactive' });
    return (handlers || [])
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
  }, [handlers, t]);

  const assignedToIds = useMemo(() => {
    if (Array.isArray(caseData?.assignedToIds)) {
      return caseData.assignedToIds.filter(Boolean);
    }
    return caseData?.assignedToId ? [caseData.assignedToId] : [];
  }, [caseData?.assignedToId, caseData?.assignedToIds]);

  const assignedHandlers = useMemo(() => {
    const pool = Array.isArray(caseData?.assignedHandlers) ? caseData.assignedHandlers : [];
    const byId = new Map((handlers || []).map((handler) => [String(handler?.id || ''), handler]));
    return assignedToIds.map((handlerId, index) => {
      const assigned = pool.find((item) => String(item?.id || '') === String(handlerId));
      const fallback = byId.get(String(handlerId)) || {};
      return {
        id: handlerId,
        name: assigned?.name || fallback?.name || `#${String(handlerId).slice(0, 8)}`,
        email: assigned?.email || fallback?.email || '',
        role: assigned?.role || (index === 0 ? 'primary' : 'secondary'),
      };
    });
  }, [assignedToIds, caseData?.assignedHandlers, handlers]);

  const isBusy = savingAssignment || savingPriority || savingStatusEmail;
  const hasAssignedHandlers = assignedToIds.length > 0;
  const statusChangeDisabled = isBusy || !hasAssignedHandlers;
  const statusEmailChecked = caseData?.statusEmailNotify !== false;

  const handleAssignmentSelect = useCallback(
    async (value) => {
      const nextIds = Array.isArray(value)
        ? value.filter(Boolean)
        : value
          ? [value]
          : [];
      const prevIds = assignedToIds;
      const sameSelection =
        prevIds.length === nextIds.length &&
        prevIds.every((id) => nextIds.includes(id));
      if (sameSelection) return;

      try {
        setSavingAssignment(true);
        await onAssignmentChange?.(nextIds);
      } finally {
        setSavingAssignment(false);
      }
    },
    [assignedToIds, onAssignmentChange]
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

  const handleRoleSelect = useCallback(
    async (handlerId, role) => {
      if (!handlerId || !role) return;
      try {
        setSavingAssignment(true);
        await onAssignmentRoleChange?.(handlerId, role);
      } finally {
        setSavingAssignment(false);
      }
    },
    [onAssignmentRoleChange]
  );

  const handleRemoveAssignedHandler = useCallback(
    async (handlerId) => {
      if (!handlerId) return;
      const nextIds = assignedToIds.filter((id) => id !== handlerId);
      try {
        setSavingAssignment(true);
        await onAssignmentChange?.(nextIds);
      } finally {
        setSavingAssignment(false);
      }
    },
    [assignedToIds, onAssignmentChange]
  );

  return (
    <div className="bg-card rounded-xl border border-border overflow-visible isolate">
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {!isWhistleblower && (
            <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground block">{t('caseManagement.updateStatus')}</label>
                <Button
                  variant="outline"
                  fullWidth
                  iconName="Edit"
                  iconPosition="left"
                  onClick={onStatusChange}
                  disabled={statusChangeDisabled}
                  title={
                    !hasAssignedHandlers
                      ? t('caseManagementDetail.management.assignBeforeStatusChange')
                      : undefined
                  }
                >
                  {t('caseManagementDetail.management.changeStatusCta', {
                    status: caseData?.status || t('caseManagementDetail.common.unknown'),
                  })}
                </Button>
                {!hasAssignedHandlers && (
                  <p className="text-xs text-muted-foreground">
                    {t('caseManagementDetail.management.assignBeforeStatusChange')}
                  </p>
                )}
              </div>
            </PermissionGuard>
          )}

          <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
            <div className="relative z-[80]">
              <Select
                label={t('caseManagement.assignTo')}
                description={t('caseManagementDetail.management.assignDescription')}
                options={handlerOptions}
                value={assignedToIds}
                onChange={handleAssignmentSelect}
                placeholder={t('caseManagement.notAssigned')}
                searchable
                multiple
                disabled={savingAssignment}
              />
            </div>
          </PermissionGuard>

          {assignedHandlers.length > 0 && (
            <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t('caseManagementDetail.management.assignedHandlersRoles', { defaultValue: 'Assigned handlers and roles' })}
                </p>
                {assignedHandlers.map((handler) => (
                  <div key={handler.id} className="rounded-md border border-border bg-card p-2">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{handler.name}</p>
                        {handler.email && (
                          <p className="text-xs text-muted-foreground truncate">{handler.email}</p>
                        )}
                      </div>
                      <Button
                        size="xs"
                        variant="ghost"
                        iconName="Trash2"
                        onClick={() => handleRemoveAssignedHandler(handler.id)}
                        disabled={savingAssignment}
                      >
                        {t('common.remove', { defaultValue: 'Remove' })}
                      </Button>
                    </div>
                    <Select
                      options={assignmentRoleOptions}
                      value={handler.role}
                      onChange={(value) => handleRoleSelect(handler.id, value)}
                      disabled={savingAssignment}
                    />
                  </div>
                ))}
              </div>
            </PermissionGuard>
          )}

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

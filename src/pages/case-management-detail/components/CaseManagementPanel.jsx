import React, { useMemo, useState, useCallback } from 'react';
import Button from '../../../components/ui/Button';
import Select from '../../../components/ui/Select';
import PermissionGuard from '../../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../../utils/permissions';

const CaseManagementPanel = ({
  caseData,
  onAssignmentChange,
  onPriorityChange,
  onStatusChange,
  onEscalate,
  handlers,
  isWhistleblower,
}) => {
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);

  const priorityOptions = useMemo(
    () => [
      { value: 'Laag', label: 'Laag', description: 'Routine behandeling' },
      { value: 'Gemiddeld', label: 'Gemiddeld', description: 'Standaard prioriteit' },
      { value: 'Hoog', label: 'Hoog', description: 'Urgente behandeling vereist' },
      { value: 'Kritiek', label: 'Kritiek', description: 'Directe actie vereist' },
    ],
    []
  );

  const handlerOptions = useMemo(() => {
    const list = (handlers || []).map((handler) => ({
      value: handler?.id,
      label: handler?.name,
      description: handler?.role,
    }));

    return [
      { value: '', label: 'Niet toegewezen', description: 'Geen handler gekoppeld' },
      ...list,
    ];
  }, [handlers]);

  const isBusy = savingAssignment || savingPriority;

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
      const nextPriority = value;
      if (!nextPriority) return;
      if (caseData?.priority === nextPriority) return;

      try {
        setSavingPriority(true);
        await onPriorityChange?.(nextPriority);
      } finally {
        setSavingPriority(false);
      }
    },
    [caseData?.priority, onPriorityChange]
  );

  /**
   * Z-INDEX / DROPDOWN FIX STRATEGY
   * 1) Ensure panel does NOT clip menus: overflow-visible
   * 2) Create a stacking context that we control: isolate
   * 3) Wrap each Select in a relative + high z-index so the menu can sit above neighbors
   *
   * If your Select still gets clipped somewhere higher up the tree, the real fix is
   * portaling the menu to document.body inside the Select component.
   */
  return (
    <div className="bg-card rounded-xl border border-border overflow-visible isolate">
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {/* Status */}
          {!isWhistleblower && (
            <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground block">Status</label>
                <Button
                  variant="outline"
                  fullWidth
                  iconName="Edit"
                  iconPosition="left"
                  onClick={onStatusChange}
                  disabled={isBusy}
                >
                  Status wijzigen: {caseData?.status || 'Onbekend'}
                </Button>
              </div>
            </PermissionGuard>
          )}

          {/* Assignment (higher z-index) */}
          <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
            <div className="relative z-[80]">
              <Select
                label="Toegewezen aan"
                description="Selecteer de handler die verantwoordelijk is voor deze zaak"
                options={handlerOptions}
                value={caseData?.assignedToId || ''}
                onChange={handleAssignmentSelect}
                searchable
                disabled={savingAssignment}
                // If your Select supports className or menuClassName props, these help:
                // className="relative"
                // menuClassName="z-[9999]"
                // portal  // (if supported)
              />
            </div>
          </PermissionGuard>

          {/* Priority (slightly lower z, still above most UI) */}
          <PermissionGuard permission={PERMISSIONS.EDIT_TICKETS}>
            <div className="relative z-[70]">
              <Select
                label="Prioriteitsniveau"
                description="Stel de urgentie van deze zaak in"
                options={priorityOptions}
                value={caseData?.priority}
                onChange={handlePrioritySelect}
                disabled={savingPriority}
                // menuClassName="z-[9999]"
                // portal
              />
            </div>
          </PermissionGuard>
        </div>

        {/* Saving indicator */}
        {isBusy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-accent" />
            <span>Wijziging opslaan…</span>
          </div>
        )}

        {/* Optional: Escalation actions (kept, compact) */}
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
              Escaleren naar management
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CaseManagementPanel;
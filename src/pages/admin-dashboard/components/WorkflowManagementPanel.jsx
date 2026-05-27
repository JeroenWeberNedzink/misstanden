import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { workflowService } from '../../../services/workflowService';
import { settingsService } from '../../../services/SettingsService';
import PermissionGuard from '../../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../../utils/permissions';

import WorkflowsTable from '../../../pages/workflow-configuration-admin/components/WorkflowsTable';
import WorkflowFormModal from '../../../pages/workflow-configuration-admin/components/WorkflowFormModal';
import WorkflowEditorPanel from '../../../pages/workflow-configuration-admin/components/WorkflowEditorPanel';
import AssignHandlersModal from '../../../pages/workflow-configuration-admin/components/AssignHandlersModal';
import EditWorkflowStatusesModal from '../../../pages/workflow-configuration-admin/components/EditWorkflowStatusesModal';
import WorkflowRuntimeSettingsPanel, {
  WORKFLOW_RUNTIME_SETTING_DEFS,
  getWorkflowRuntimeDefaultValues,
  normalizeWorkflowRuntimeValue,
} from '../../../pages/workflow-configuration-admin/components/WorkflowRuntimeSettingsPanel';

const defaultWorkflowRuntimeValues = getWorkflowRuntimeDefaultValues();

const normalizeWorkflowCodeForSetting = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

const getWorkflowScopedSettingKey = (workflowCode, globalWorkflowKey) => {
  const normalizedWorkflowCode = normalizeWorkflowCodeForSetting(workflowCode);
  const normalizedGlobal = String(globalWorkflowKey || '').trim();
  if (!normalizedWorkflowCode || !normalizedGlobal.startsWith('workflow.')) return null;
  const suffix = normalizedGlobal.slice('workflow.'.length);
  return suffix ? `workflow.${normalizedWorkflowCode}.${suffix}` : null;
};

const readSettingRowValue = (row, fallback = false) => {
  const raw = row?.setting_value;
  return normalizeWorkflowRuntimeValue(raw, fallback);
};

const mergeAsBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  return Boolean(fallback);
};

const WorkflowManagementPanel = ({ workflows: initialWorkflows, users, onRefresh, onShowToast }) => {
  const [workflows, setWorkflows] = useState(initialWorkflows || []);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [showStatusesModal, setShowStatusesModal] = useState(false);
  const [statusesWorkflow, setStatusesWorkflow] = useState(null);
  const [workflowSettingRowsByKey, setWorkflowSettingRowsByKey] = useState({});
  const [workflowRuntimeDraft, setWorkflowRuntimeDraft] = useState(defaultWorkflowRuntimeValues);
  const [workflowRuntimeOriginal, setWorkflowRuntimeOriginal] = useState(defaultWorkflowRuntimeValues);
  const [isLoadingWorkflowRuntimeSettings, setIsLoadingWorkflowRuntimeSettings] = useState(true);
  const [isSavingWorkflowRuntimeSettings, setIsSavingWorkflowRuntimeSettings] = useState(false);
  const [workflowRuntimeError, setWorkflowRuntimeError] = useState('');
  const [workflowRuntimeSuccess, setWorkflowRuntimeSuccess] = useState('');

  const editorRef = useRef(null);

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w?.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId]
  );
  const selectedWorkflowCode = useMemo(
    () => normalizeWorkflowCodeForSetting(selectedWorkflow?.code),
    [selectedWorkflow?.code]
  );

  useEffect(() => {
    if (initialWorkflows) {
      setWorkflows(initialWorkflows);
      if (!selectedWorkflowId && initialWorkflows.length > 0) {
        setSelectedWorkflowId(initialWorkflows[0]?.id);
      }
    }
  }, [initialWorkflows, selectedWorkflowId]);

  const loadWorkflowRuntimeSettings = useCallback(async () => {
    setWorkflowRuntimeError('');
    setIsLoadingWorkflowRuntimeSettings(true);
    try {
      const { rows = [] } = await settingsService.getSettings({ category: 'workflow', includeSensitive: false });
      const rowsByKey = {};
      for (const row of rows) {
        const key = String(row?.setting_key || '').trim();
        if (!key) continue;
        rowsByKey[key] = row;
      }

      setWorkflowSettingRowsByKey(rowsByKey);
    } catch (err) {
      console.error('Error loading workflow runtime settings:', err);
      setWorkflowRuntimeError('Workflow instellingen konden niet geladen worden.');
    } finally {
      setIsLoadingWorkflowRuntimeSettings(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedWorkflowCode) {
      setWorkflowRuntimeDraft({ ...defaultWorkflowRuntimeValues });
      setWorkflowRuntimeOriginal({ ...defaultWorkflowRuntimeValues });
      return;
    }

    const nextValues = { ...defaultWorkflowRuntimeValues };
    for (const item of WORKFLOW_RUNTIME_SETTING_DEFS) {
      const scopedKey = getWorkflowScopedSettingKey(selectedWorkflowCode, item.key);
      const scopedRow = scopedKey ? workflowSettingRowsByKey?.[scopedKey] : null;
      const globalRow = workflowSettingRowsByKey?.[item.key] || null;
      if (scopedRow) {
        nextValues[item.key] = readSettingRowValue(scopedRow, item.defaultValue);
      } else if (globalRow) {
        nextValues[item.key] = readSettingRowValue(globalRow, item.defaultValue);
      } else {
        nextValues[item.key] = Boolean(item.defaultValue);
      }
    }

    setWorkflowRuntimeDraft(nextValues);
    setWorkflowRuntimeOriginal(nextValues);
    setWorkflowRuntimeSuccess('');
    setWorkflowRuntimeError('');
  }, [selectedWorkflowCode, workflowSettingRowsByKey]);

  useEffect(() => {
    loadWorkflowRuntimeSettings();
  }, [loadWorkflowRuntimeSettings]);

  const loadWorkflows = useCallback(
    async ({ keepSelection = true, force = false } = {}) => {
      setError('');
      setIsLoading(true);

      try {
        const data = await workflowService.getWorkflowsWithStats({ force });
        const list = (data || []).slice();
        setWorkflows(list);

        setSelectedWorkflowId((prevId) => {
          if (keepSelection && list.some((w) => w?.id === prevId)) return prevId;
          return list?.[0]?.id ?? null;
        });

        onRefresh?.();
      } catch (err) {
        console.error('Error loading workflows:', err);
        setError('Fout bij laden van workflows');
        onShowToast?.('Fout bij laden van workflows', true);
      } finally {
        setIsLoading(false);
      }
    },
    [onRefresh, onShowToast]
  );

  const openAssignHandlers = useCallback((e, source = 'unknown') => {
    const isTrusted = Boolean(e?.nativeEvent?.isTrusted);
    if (!isTrusted) {
      console.warn('[WorkflowPanel] Blocked non-user openAssignHandlers from:', source);
      return;
    }
    setShowAssignModal(true);
  }, []);

  const handleSelectWorkflow = useCallback((workflow) => {
    setSelectedWorkflowId(workflow?.id ?? null);

    setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, []);

  const handleCreateWorkflow = async (workflowData) => {
    setIsBusy(true);
    try {
      const created = await workflowService.createWorkflow(workflowData);
      await loadWorkflows({ keepSelection: true });
      if (created?.id) {
        setSelectedWorkflowId(created.id);
        setTimeout(() => {
          editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      }
      setShowCreateModal(false);
      onShowToast?.('Workflow aangemaakt');
    } catch (err) {
      console.error('Error creating workflow:', err);
      onShowToast?.('Fout bij aanmaken workflow', true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateWorkflow = async (id, workflowData) => {
    if (!id) return;
    setIsBusy(true);
    setError('');
    try {
      await workflowService.updateWorkflow(id, workflowData);
      await loadWorkflows({ keepSelection: true });
      onShowToast?.('Workflow bijgewerkt');
    } catch (err) {
      console.error('Error updating workflow:', err);
      setError('Fout bij bijwerken workflow');
      onShowToast?.('Fout bij bijwerken workflow', true);
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleStatus = async (id, active) => {
    if (!id) return;
    setIsBusy(true);
    setError('');
    try {
      await workflowService.toggleWorkflowStatus(id, active);
      await loadWorkflows({ keepSelection: true });
      onShowToast?.(`Workflow ${active ? 'geactiveerd' : 'gedeactiveerd'}`);
    } catch (err) {
      console.error('Error toggling workflow status:', err);
      setError('Fout bij wijzigen status');
      onShowToast?.('Fout bij wijzigen status', true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDuplicateWorkflow = async (id) => {
    if (!id) return;
    setIsBusy(true);
    setError('');
    try {
      const dup = await workflowService.duplicateWorkflow(id);
      await loadWorkflows({ keepSelection: true });
      if (dup?.id) {
        setSelectedWorkflowId(dup.id);
        setTimeout(() => {
          editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      }
      onShowToast?.('Workflow gedupliceerd');
    } catch (err) {
      console.error('Error duplicating workflow:', err);
      setError('Fout bij dupliceren workflow');
      onShowToast?.('Fout bij dupliceren workflow', true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteWorkflow = async (workflow) => {
    if (!workflow?.id) return;

    const confirmText = `VERWIJDER ${workflow.code}`;
    const input = window.prompt(
      `Waarschuwing: dit verwijdert de workflow en gekoppelde tickets/toewijzingen.\n\nTyp exact:\n${confirmText}\n\nom te bevestigen:`
    );
    if (input !== confirmText) return;

    setIsBusy(true);
    setError('');
    try {
      await workflowService.deleteWorkflowForce(workflow.id);
      await loadWorkflows({ keepSelection: false });
      onShowToast?.('Workflow verwijderd');
    } catch (err) {
      console.error('Error deleting workflow:', err);
      setError('Fout bij verwijderen workflow');
      onShowToast?.('Fout bij verwijderen workflow', true);
    } finally {
      setIsBusy(false);
    }
  };

  const hasWorkflowRuntimeChanges = useMemo(
    () =>
      WORKFLOW_RUNTIME_SETTING_DEFS.some((item) => {
        const current = mergeAsBoolean(workflowRuntimeDraft?.[item.key], item.defaultValue);
        const original = mergeAsBoolean(workflowRuntimeOriginal?.[item.key], item.defaultValue);
        return current !== original;
      }),
    [workflowRuntimeDraft, workflowRuntimeOriginal]
  );

  const handleToggleWorkflowRuntimeSetting = useCallback((settingKey) => {
    setWorkflowRuntimeSuccess('');
    setWorkflowRuntimeDraft((prev) => ({
      ...prev,
      [settingKey]: !mergeAsBoolean(prev?.[settingKey], defaultWorkflowRuntimeValues?.[settingKey]),
    }));
  }, []);

  const handleResetWorkflowRuntimeSettings = useCallback(() => {
    setWorkflowRuntimeDraft({ ...workflowRuntimeOriginal });
    setWorkflowRuntimeSuccess('');
    setWorkflowRuntimeError('');
  }, [workflowRuntimeOriginal]);

  const handleSaveWorkflowRuntimeSettings = useCallback(async () => {
    if (!selectedWorkflowCode) {
      setWorkflowRuntimeError('Selecteer eerst een workflow.');
      return;
    }
    if (!hasWorkflowRuntimeChanges) return;
    setWorkflowRuntimeSuccess('');
    setWorkflowRuntimeError('');
    setIsSavingWorkflowRuntimeSettings(true);

    try {
      const items = WORKFLOW_RUNTIME_SETTING_DEFS.filter((item) => {
        const current = mergeAsBoolean(workflowRuntimeDraft?.[item.key], item.defaultValue);
        const original = mergeAsBoolean(workflowRuntimeOriginal?.[item.key], item.defaultValue);
        return current !== original;
      }).map((item) => {
        const scopedKey = getWorkflowScopedSettingKey(selectedWorkflowCode, item.key);
        const existing = (scopedKey && workflowSettingRowsByKey?.[scopedKey]) || null;
        const current = mergeAsBoolean(workflowRuntimeDraft?.[item.key], item.defaultValue);
        const existingValue = existing?.setting_value;

        const wrappedValue =
          existingValue &&
          typeof existingValue === 'object' &&
          !Array.isArray(existingValue) &&
          Object.prototype.hasOwnProperty.call(existingValue, 'value');

        return {
          settingKey: scopedKey || item.key,
          value: wrappedValue ? { ...existingValue, value: current } : current,
          category: existing?.category || 'workflow',
          description: existing?.description || `${item.description} (workflow: ${selectedWorkflowCode})`,
          isSensitive: Boolean(existing?.is_sensitive),
        };
      });

      if (!items.length) return;
      await settingsService.upsertSettings(items);
      await loadWorkflowRuntimeSettings();
      setWorkflowRuntimeSuccess(`Workflow instellingen opgeslagen voor "${selectedWorkflow?.name || selectedWorkflowCode}".`);
      onShowToast?.(`Workflow instellingen opgeslagen (${selectedWorkflow?.name || selectedWorkflowCode})`);
    } catch (err) {
      console.error('Error saving workflow runtime settings:', err);
      setWorkflowRuntimeError('Workflow instellingen opslaan is mislukt.');
      onShowToast?.('Workflow instellingen opslaan is mislukt', true);
    } finally {
      setIsSavingWorkflowRuntimeSettings(false);
    }
  }, [
    hasWorkflowRuntimeChanges,
    loadWorkflowRuntimeSettings,
    onShowToast,
    selectedWorkflow?.name,
    selectedWorkflowCode,
    workflowRuntimeDraft,
    workflowRuntimeOriginal,
    workflowSettingRowsByKey,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <PermissionGuard permission={PERMISSIONS.MANAGE_WORKFLOWS}>
            <Button
              onClick={() => setShowCreateModal(true)}
              iconName="Plus"
              iconPosition="left"
              size="md"
              disabled={isLoading || isBusy}
            >
              Nieuwe workflow
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-error">
          <Icon name="AlertCircle" size={18} className="text-error" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <WorkflowsTable
            workflows={workflows}
            selectedWorkflow={selectedWorkflow}
            onSelectWorkflow={handleSelectWorkflow}
            onToggleStatus={(workflow) => handleToggleStatus(workflow?.id, !workflow?.active)}
            onDuplicate={(workflow) => handleDuplicateWorkflow(workflow?.id)}
            isLoading={isLoading}
            isBusy={isBusy}
          />
        </div>

        <div ref={editorRef} className="space-y-3">
          <WorkflowRuntimeSettingsPanel
            values={workflowRuntimeDraft}
            initialValues={workflowRuntimeOriginal}
            isLoading={isLoadingWorkflowRuntimeSettings}
            isSaving={isSavingWorkflowRuntimeSettings}
            error={workflowRuntimeError}
            successMessage={workflowRuntimeSuccess}
            onToggle={handleToggleWorkflowRuntimeSetting}
            onSave={handleSaveWorkflowRuntimeSettings}
            onReset={handleResetWorkflowRuntimeSettings}
            title={selectedWorkflow ? `Workflow instellingen: ${selectedWorkflow.name}` : 'Workflow instellingen'}
            description={
              selectedWorkflow
                ? 'Deze instellingen gelden alleen voor de geselecteerde workflow.'
                : 'Selecteer eerst een workflow om instellingen te beheren.'
            }
            disabled={!selectedWorkflow}
            emptyStateMessage="Kies eerst een workflow in stap 1."
          />

          {selectedWorkflow ? (
            <WorkflowEditorPanel
              workflow={selectedWorkflow}
              onSave={(patch) => handleUpdateWorkflow(selectedWorkflow?.id, patch)}
              onToggleActive={(active) => handleToggleStatus(selectedWorkflow?.id, active)}
              onOpenHandlerAssign={(e) => openAssignHandlers(e, 'editor-panel')}
              onDelete={() => handleDeleteWorkflow(selectedWorkflow)}
              onEditStatuses={(workflow) => {
                setStatusesWorkflow(workflow);
                setShowStatusesModal(true);
              }}
              isBusy={isBusy}
            />
          ) : (
            <div className="text-center text-muted-foreground py-10 border border-sky-100 rounded-xl bg-white">
              <Icon name="ArrowUp" size={36} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Kies eerst een workflow in stap 1 om instellingen te beheren.</p>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <WorkflowFormModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateWorkflow}
          isSaving={isBusy}
        />
      )}

      {showAssignModal && selectedWorkflow && (
        <AssignHandlersModal
          workflow={selectedWorkflow}
          onClose={() => setShowAssignModal(false)}
          onSaved={() => loadWorkflows({ keepSelection: true })}
        />
      )}

      {showStatusesModal && statusesWorkflow && (
        <EditWorkflowStatusesModal
          workflow={statusesWorkflow}
          onClose={() => {
            setShowStatusesModal(false);
            setStatusesWorkflow(null);
          }}
          onSaved={() => loadWorkflows({ keepSelection: true })}
        />
      )}
    </div>
  );
};

export default WorkflowManagementPanel;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';

import WorkflowsTable from './components/WorkflowsTable';
import WorkflowFormModal from './components/WorkflowFormModal';
import WorkflowEditorPanel from './components/WorkflowEditorPanel';
import AssignHandlersModal from './components/AssignHandlersModal';
import EditWorkflowStatusesModal from './components/EditWorkflowStatusesModal'; // keep your filename as-is
import WorkflowRuntimeSettingsPanel, {
  WORKFLOW_RUNTIME_SETTING_DEFS,
  getWorkflowRuntimeDefaultValues,
  normalizeWorkflowRuntimeValue,
} from './components/WorkflowRuntimeSettingsPanel';

import { workflowService } from '../../services/workflowService'; // ✅ default import (fixes "binding not found")

import { settingsService } from '../../services/SettingsService';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import FilterControls from './components/FilterControls';
import PermissionGuard from '../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../utils/permissions';

const safeLower = (v) => String(v ?? '').toLowerCase();
const defaultWorkflowRuntimeValues = getWorkflowRuntimeDefaultValues();

const mergeAsBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  return Boolean(fallback);
};

export default function WorkflowConfigurationAdmin() {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ✅ Status editor modal state
  const [showStatusesModal, setShowStatusesModal] = useState(false);
  const [statusesWorkflow, setStatusesWorkflow] = useState(null);
  const [workflowSettingRowsByKey, setWorkflowSettingRowsByKey] = useState({});
  const [workflowRuntimeDraft, setWorkflowRuntimeDraft] = useState(defaultWorkflowRuntimeValues);
  const [workflowRuntimeOriginal, setWorkflowRuntimeOriginal] = useState(defaultWorkflowRuntimeValues);
  const [isLoadingWorkflowRuntimeSettings, setIsLoadingWorkflowRuntimeSettings] = useState(true);
  const [isSavingWorkflowRuntimeSettings, setIsSavingWorkflowRuntimeSettings] = useState(false);
  const [workflowRuntimeError, setWorkflowRuntimeError] = useState('');
  const [workflowRuntimeSuccess, setWorkflowRuntimeSuccess] = useState('');

  const { t } = useTranslation();

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w?.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId]
  );

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
      } catch (err) {
        console.error('Error loading workflows:', err);
        setError(t('workflowConfig.errorLoadingWorkflows'));
      } finally {
        setIsLoading(false);
      }
    },
    [t]
  );

  const loadWorkflowRuntimeSettings = useCallback(async () => {
    setWorkflowRuntimeError('');
    setIsLoadingWorkflowRuntimeSettings(true);
    try {
      const { rows = [] } = await settingsService.getSettings({ category: 'workflow', includeSensitive: false });
      const rowsByKey = {};
      const nextValues = { ...defaultWorkflowRuntimeValues };

      for (const item of WORKFLOW_RUNTIME_SETTING_DEFS) {
        const row = rows.find((x) => x?.setting_key === item.key) || null;
        if (row) rowsByKey[item.key] = row;
        nextValues[item.key] = normalizeWorkflowRuntimeValue(row?.setting_value, item.defaultValue);
      }

      setWorkflowSettingRowsByKey(rowsByKey);
      setWorkflowRuntimeDraft(nextValues);
      setWorkflowRuntimeOriginal(nextValues);
    } catch (err) {
      console.error('Error loading workflow runtime settings:', err);
      setWorkflowRuntimeError(
        t('workflowConfig.errorLoadingRuntimeSettings', {
          defaultValue: 'Workflow instellingen konden niet geladen worden.',
        })
      );
    } finally {
      setIsLoadingWorkflowRuntimeSettings(false);
    }
  }, [t]);

  // Close modals on first mount (prevents persisted state weirdness)
  useEffect(() => {
    setShowCreateModal(false);
    setShowAssignModal(false);
    setShowStatusesModal(false);
    setStatusesWorkflow(null);
  }, []);

  // Load workflows on mount only
  useEffect(() => {
    loadWorkflows({ keepSelection: false });
    loadWorkflowRuntimeSettings();
  }, [loadWorkflows, loadWorkflowRuntimeSettings]);

  // If selection disappears, force close assign modal
  useEffect(() => {
    if (!selectedWorkflow) setShowAssignModal(false);
  }, [selectedWorkflow]);

  // Debug
  useEffect(() => {
    console.log('[WorkflowAdmin] showAssignModal changed:', showAssignModal);
  }, [showAssignModal]);

  const openAssignHandlers = useCallback((e, source = 'unknown') => {
    const isTrusted = Boolean(e?.nativeEvent?.isTrusted);
    if (!isTrusted) {
      console.warn('[WorkflowAdmin] Blocked non-user openAssignHandlers from:', source);
      return;
    }
    console.log('[WorkflowAdmin] openAssignHandlers allowed from:', source);
    setShowAssignModal(true);
  }, []);

  const handleSelectWorkflow = (workflow) => {
    setSelectedWorkflowId(workflow?.id ?? null);
  };

  const handleCreateWorkflow = async (workflowData) => {
    setIsBusy(true);
    try {
      const created = await workflowService.createWorkflow(workflowData);
      await loadWorkflows({ keepSelection: true });
      if (created?.id) setSelectedWorkflowId(created.id);
      setShowCreateModal(false);
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
    } catch (err) {
      console.error('Error updating workflow:', err);
      setError(t('workflowConfig.errorUpdatingWorkflow'));
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
    } catch (err) {
      console.error('Error toggling workflow status:', err);
      setError(t('workflowConfig.errorTogglingStatus'));
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
      if (dup?.id) setSelectedWorkflowId(dup.id);
    } catch (err) {
      console.error('Error duplicating workflow:', err);
      setError(t('workflowConfig.errorDuplicatingWorkflow'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteWorkflow = async (workflow) => {
    if (!workflow?.id) return;

    const confirmText = `VERWIJDER ${workflow.code}`;
    const input = window.prompt(
      `⚠️ Dit verwijdert de workflow EN alle tickets + toewijzingen.\n\nTyp exact:\n${confirmText}\n\nom te bevestigen:`
    );

    if (input !== confirmText) return;

    setIsBusy(true);
    setError('');
    try {
      await workflowService.deleteWorkflowForce(workflow.id);
      await loadWorkflows({ keepSelection: false });
    } catch (err) {
      console.error('Error deleting workflow:', err);
      setError('Fout bij het verwijderen van workflow');
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleWorkflowRuntimeSetting = useCallback((settingKey) => {
    setWorkflowRuntimeSuccess('');
    setWorkflowRuntimeDraft((prev) => ({
      ...prev,
      [settingKey]: !mergeAsBoolean(prev?.[settingKey], defaultWorkflowRuntimeValues?.[settingKey]),
    }));
  }, []);

  const hasWorkflowRuntimeChanges = useMemo(
    () =>
      WORKFLOW_RUNTIME_SETTING_DEFS.some((item) => {
        const current = mergeAsBoolean(workflowRuntimeDraft?.[item.key], item.defaultValue);
        const original = mergeAsBoolean(workflowRuntimeOriginal?.[item.key], item.defaultValue);
        return current !== original;
      }),
    [workflowRuntimeDraft, workflowRuntimeOriginal]
  );

  const handleResetWorkflowRuntimeSettings = useCallback(() => {
    setWorkflowRuntimeDraft({ ...workflowRuntimeOriginal });
    setWorkflowRuntimeSuccess('');
    setWorkflowRuntimeError('');
  }, [workflowRuntimeOriginal]);

  const handleSaveWorkflowRuntimeSettings = useCallback(async () => {
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
        const existing = workflowSettingRowsByKey?.[item.key];
        const current = mergeAsBoolean(workflowRuntimeDraft?.[item.key], item.defaultValue);
        const existingValue = existing?.setting_value;

        const wrappedValue =
          existingValue &&
          typeof existingValue === 'object' &&
          !Array.isArray(existingValue) &&
          Object.prototype.hasOwnProperty.call(existingValue, 'value');

        return {
          settingKey: item.key,
          value: wrappedValue ? { ...existingValue, value: current } : current,
          category: existing?.category || 'workflow',
          description: existing?.description || item.description,
          isSensitive: Boolean(existing?.is_sensitive),
        };
      });

      if (!items.length) return;
      await settingsService.upsertSettings(items);
      await loadWorkflowRuntimeSettings();
      setWorkflowRuntimeSuccess(
        t('workflowConfig.runtimeSettingsSaved', {
          defaultValue: 'Workflow instellingen opgeslagen.',
        })
      );
    } catch (err) {
      console.error('Error saving workflow runtime settings:', err);
      setWorkflowRuntimeError(
        t('workflowConfig.errorSavingRuntimeSettings', {
          defaultValue: 'Workflow instellingen opslaan is mislukt.',
        })
      );
    } finally {
      setIsSavingWorkflowRuntimeSettings(false);
    }
  }, [
    hasWorkflowRuntimeChanges,
    loadWorkflowRuntimeSettings,
    t,
    workflowRuntimeDraft,
    workflowRuntimeOriginal,
    workflowSettingRowsByKey,
  ]);

  const filteredWorkflows = useMemo(() => {
    const q = safeLower(searchQuery).trim();

    return (workflows || []).filter((workflow) => {
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && workflow?.active) ||
        (filterStatus === 'inactive' && !workflow?.active);

      if (!matchesStatus) return false;
      if (!q) return true;

      const haystack = `${safeLower(workflow?.name)} ${safeLower(workflow?.description)} ${safeLower(
        workflow?.code
      )}`;
      return haystack.includes(q);
    });
  }, [workflows, filterStatus, searchQuery]);

  return (
    <>
      <Helmet>
        <title>Workflow Configuratie - Admin - Misstanden Portal</title>
        <meta name="description" content="Beheer misstand workflow types en routing regels" />
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen app-page-gradient bg-background">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-10">
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 text-primary">
                  {t('workflowConfig.title')}
                </h1>
                <p className="text-sm md:text-base text-muted-foreground">{t('workflowConfig.subtitle')}</p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  iconName="RefreshCcw"
                  iconPosition="left"
                  onClick={() => {
                    loadWorkflows({ keepSelection: true, force: true });
                    loadWorkflowRuntimeSettings();
                  }}
                  disabled={isLoading || isBusy}
                >
                  {t('common.refresh')}
                </Button>

                <PermissionGuard permission={PERMISSIONS.MANAGE_WORKFLOWS}>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    iconName="Plus"
                    iconPosition="left"
                    size="lg"
                    disabled={isLoading || isBusy}
                  >
                    {t('workflowConfig.createWorkflow')}
                  </Button>
                </PermissionGuard>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-3">
                <Icon name="AlertCircle" size={20} className="text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-destructive">{error}</p>
                  <div className="mt-2">
                    <Button variant="outline" size="sm" onClick={() => setError('')}>
                      {t('common.close')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-14">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  <p className="text-muted-foreground">{t('workflowConfig.loadingWorkflows')}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <FilterControls
                    filterStatus={filterStatus}
                    setFilterStatus={setFilterStatus}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                  />

                  <WorkflowsTable
                    workflows={filteredWorkflows}
                    selectedWorkflow={selectedWorkflow}
                    onSelectWorkflow={handleSelectWorkflow}
                    onToggleStatus={handleToggleStatus}
                    onDuplicate={handleDuplicateWorkflow}
                    isBusy={isBusy}
                  />
                </div>

                <div className="lg:sticky lg:top-24 h-fit">
                  <div className="space-y-4">
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
                    />

                    {selectedWorkflow ? (
                      <WorkflowEditorPanel
                        workflow={selectedWorkflow}
                        isBusy={isBusy}
                        onSave={(patch) => handleUpdateWorkflow(selectedWorkflow.id, patch)}
                        onToggleActive={(active) => handleToggleStatus(selectedWorkflow.id, active)}
                        onOpenHandlerAssign={(e) => openAssignHandlers(e, 'right-panel')}
                        onDelete={() => handleDeleteWorkflow(selectedWorkflow)}
                        onEditStatuses={(wf) => {
                          setStatusesWorkflow(wf);
                          setShowStatusesModal(true);
                        }}
                      />
                    ) : (
                      <div className="bg-card border border-border rounded-lg p-8 text-center">
                        <Icon name="Workflow" size={48} className="mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">{t('workflowConfig.selectWorkflow')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ✅ Statuses modal */}
          {showStatusesModal && statusesWorkflow && (
            <EditWorkflowStatusesModal
              open={showStatusesModal}
              workflow={statusesWorkflow}
              onClose={() => {
                setShowStatusesModal(false);
                setStatusesWorkflow(null);
              }}
              onSaved={async () => {
                setShowStatusesModal(false);
                setStatusesWorkflow(null);
                await loadWorkflows({ keepSelection: true });
              }}
            />
          )}

          {/* Create workflow */}
          {showCreateModal && (
            <WorkflowFormModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreateWorkflow} />
          )}

          {/* Assign handlers */}
          {showAssignModal && selectedWorkflow && (
            <AssignHandlersModal
              workflow={selectedWorkflow}
              onClose={() => setShowAssignModal(false)}
              onSaved={async () => {
                setShowAssignModal(false);
                await loadWorkflows({ keepSelection: true });
              }}
            />
          )}
        </div>
      </AuthContextNavigator>
    </>
  );
}

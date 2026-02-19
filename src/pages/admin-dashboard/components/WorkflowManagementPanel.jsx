import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { workflowService } from '../../../services/workflowService';
import PermissionGuard from '../../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../../utils/permissions';

import WorkflowsTable from '../../../pages/workflow-configuration-admin/components/WorkflowsTable';
import WorkflowFormModal from '../../../pages/workflow-configuration-admin/components/WorkflowFormModal';
import WorkflowEditorPanel from '../../../pages/workflow-configuration-admin/components/WorkflowEditorPanel';
import AssignHandlersModal from '../../../pages/workflow-configuration-admin/components/AssignHandlersModal';
import EditWorkflowStatusesModal from '../../../pages/workflow-configuration-admin/components/EditWorkflowStatusesModal';

const safeLower = (v) => String(v ?? '').toLowerCase();

const WorkflowManagementPanel = ({ workflows: initialWorkflows, users, onRefresh, onShowToast }) => {
  const [workflows, setWorkflows] = useState(initialWorkflows || []);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [showStatusesModal, setShowStatusesModal] = useState(false);
  const [statusesWorkflow, setStatusesWorkflow] = useState(null);

  const editorRef = useRef(null);

  const selectedWorkflow = useMemo(
    () => workflows.find((w) => w?.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId]
  );

  useEffect(() => {
    if (initialWorkflows) {
      setWorkflows(initialWorkflows);
      if (!selectedWorkflowId && initialWorkflows.length > 0) {
        setSelectedWorkflowId(initialWorkflows[0]?.id);
      }
    }
  }, [initialWorkflows, selectedWorkflowId]);

  const loadWorkflows = useCallback(
    async ({ keepSelection = true } = {}) => {
      setError('');
      setIsLoading(true);

      try {
        const data = await workflowService.getWorkflowsWithStats();
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

  const totalWorkflows = workflows?.length || 0;
  const activeWorkflows = (workflows || []).filter((w) => w?.active).length;
  const inactiveWorkflows = totalWorkflows - activeWorkflows;

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-sky-700">Workflows beheren in 4 stappen</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 font-semibold">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs inline-flex items-center justify-center">
                1
              </span>
              Kies workflow
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border border-border bg-white text-foreground font-medium">
              <span className="w-5 h-5 rounded-full bg-slate-600 text-white text-xs inline-flex items-center justify-center">
                2
              </span>
              Basisgegevens
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border border-border bg-white text-foreground font-medium">
              <span className="w-5 h-5 rounded-full bg-slate-600 text-white text-xs inline-flex items-center justify-center">
                3
              </span>
              Beheer stappen
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border border-border bg-white text-foreground font-medium">
              <span className="w-5 h-5 rounded-full bg-slate-600 text-white text-xs inline-flex items-center justify-center">
                4
              </span>
              Koppel handlers
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-white text-muted-foreground">
            {totalWorkflows} totaal
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-sky-300 bg-sky-50 text-sky-700">
            {activeWorkflows} actief
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-700">
            {inactiveWorkflows} inactief
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="inline-flex bg-white border border-sky-100 rounded-xl p-1">
            {[
              { id: 'all', label: 'Alles' },
              { id: 'active', label: 'Actief' },
              { id: 'inactive', label: 'Inactief' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFilterStatus(opt.id)}
                className={[
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  filterStatus === opt.id
                    ? 'bg-sky-100 text-sky-700'
                    : 'text-muted-foreground hover:text-foreground hover:bg-sky-50',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-[360px]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
              <Icon name="Search" size={16} />
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek workflow (naam/code)..."
              className="w-full pl-9 pr-9 py-2 rounded-xl bg-white border border-sky-200 text-sm outline-none focus:ring-2 focus:ring-sky-300/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                aria-label="Clear"
              >
                <Icon name="X" size={16} />
              </button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            {filteredWorkflows.length}/{workflows.length}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="outline"
            size="md"
            iconName="RefreshCcw"
            iconPosition="left"
            onClick={() => loadWorkflows({ keepSelection: true })}
            disabled={isLoading || isBusy}
          >
            Vernieuwen
          </Button>

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
            workflows={filteredWorkflows}
            selectedWorkflow={selectedWorkflow}
            onSelectWorkflow={handleSelectWorkflow}
            onToggleStatus={(workflow) => handleToggleStatus(workflow?.id, !workflow?.active)}
            onDuplicate={(workflow) => handleDuplicateWorkflow(workflow?.id)}
            isLoading={isLoading}
            isBusy={isBusy}
          />
        </div>

        <div ref={editorRef}>
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

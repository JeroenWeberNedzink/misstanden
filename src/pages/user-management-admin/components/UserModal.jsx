import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';

import { ticketService } from '../../../services/ticketService';
import { supabase } from '../../../lib/supabase';

const UserModal = ({ user, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'handler',
    isActive: true,
  });

  // Workflow assignment
  const [workflows, setWorkflows] = useState([]);
  const [assignedWorkflowIds, setAssignedWorkflowIds] = useState([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Lock background scroll while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Close on ESC
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Prefill form when editing
  useEffect(() => {
    if (user) {
      // Determine role from roles array (supports both old 'role' and new 'roles' fields)
      let role = 'handler';
      if (user.roles && Array.isArray(user.roles)) {
        role = user.roles.includes('ADMIN') ? 'admin' : 'handler';
      } else if (user.role) {
        role = user.role; // fallback during migration
      }

      setFormData({
        name: user.name || '',
        email: user.email || '',
        role,
        isActive: user.isActive !== undefined ? user.isActive : true,
      });
    } else {
      setFormData({
        name: '',
        email: '',
        role: 'handler',
        isActive: true,
      });
      setAssignedWorkflowIds([]);
    }
  }, [user]);

  // Load workflows + existing assignments (edit mode)
  useEffect(() => {
    const loadWorkflows = async () => {
      setIsLoadingWorkflows(true);
      try {
        const wf = await ticketService.getWorkflows();
        const activeWf = (wf || []).filter((w) => w?.active);
        setWorkflows(activeWf);

        if (user?.id) {
          const { data, error } = await supabase
            .from('handler_workflows')
            .select('workflow_id')
            .eq('handler_id', user.id);

          if (error) throw error;
          setAssignedWorkflowIds((data || []).map((r) => r.workflow_id));
        } else {
          setAssignedWorkflowIds([]);
        }
      } catch (e) {
        console.error('Error loading workflows:', e);
      } finally {
        setIsLoadingWorkflows(false);
      }
    };

    loadWorkflows();
  }, [user?.id]);

  const roleOptions = useMemo(
    () => [
      { value: 'handler', label: 'Handler', description: 'Kan tickets behandelen binnen toegewezen workflows' },
      { value: 'admin', label: 'Administrator', description: 'Beheert gebruikers, rollen en workflows' },
    ],
    []
  );

  const statusOptions = useMemo(
    () => [
      { value: true, label: 'Actief', description: 'Gebruiker kan inloggen' },
      { value: false, label: 'Inactief', description: 'Toegang geblokkeerd' },
    ],
    []
  );

  const toggleWorkflow = (workflowId) => {
    setAssignedWorkflowIds((prev) => {
      const s = new Set(prev);
      if (s.has(workflowId)) s.delete(workflowId);
      else s.add(workflowId);
      return Array.from(s);
    });

    setErrors((prev) => ({ ...prev, workflows: null }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name?.trim()) newErrors.name = 'Naam is verplicht';

    if (!formData.email?.trim()) {
      newErrors.email = 'Email is verplicht';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Ongeldig email formaat';
    }

    // Require at least 1 workflow for all users
    if (assignedWorkflowIds.length === 0) {
      newErrors.workflows =
        'Kies minimaal 1 workflow - gebruikers kunnen alleen tickets zien van toegewezen workflows';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).filter((k) => Boolean(newErrors[k])).length === 0;
  };

  // Replace all assignments in handler_workflows
  const persistHandlerWorkflows = async (handlerId, workflowIds) => {
    const safeIds = Array.isArray(workflowIds) ? workflowIds.filter(Boolean) : [];

    const { data: current, error: curErr } = await supabase
      .from('handler_workflows')
      .select('id, workflow_id')
      .eq('handler_id', handlerId);

    if (curErr) throw curErr;

    const currentIds = new Set((current || []).map((r) => r.workflow_id));
    const nextIds = new Set(safeIds);

    const toDeleteIds = (current || [])
      .filter((r) => !nextIds.has(r.workflow_id))
      .map((r) => r.id);

    const toInsert = safeIds
      .filter((id) => !currentIds.has(id))
      .map((workflow_id) => ({ handler_id: handlerId, workflow_id }));

    if (toDeleteIds.length > 0) {
      const { error: delErr } = await supabase.from('handler_workflows').delete().in('id', toDeleteIds);
      if (delErr) throw delErr;
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from('handler_workflows').insert(toInsert);
      if (insErr) throw insErr;
    }

    return true;
  };

  const handleRoleChange = (role) => {
    setFormData((prev) => ({ ...prev, role }));
    // Workflows stay as-is; validation happens on submit
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!validateForm()) return;

    setIsSaving(true);
    setErrors((prev) => ({ ...prev, general: null }));

    try {
      // Save user record (NO permissions here)
      const payload = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        isActive: formData.isActive,
      };

      // onSave must return saved user (with id) or fallback to existing user.id
      const saved = await onSave(payload);
      const handlerId = saved?.id || user?.id;

      // Save workflow assignments for all users in background
      if (handlerId) {
        persistHandlerWorkflows(handlerId, assignedWorkflowIds).catch(err => {
          console.error('Error persisting workflows:', err);
          // Don't block the modal close, workflows can be edited later
        });
      }

      // Modal will be closed by parent's onSave handler
    } catch (err) {
      console.error('Error saving user:', err);

      if (err?.code === 'DUPLICATE_EMAIL') {
        setErrors((prev) => ({ ...prev, email: err.message }));
      } else {
        setErrors((prev) => ({ ...prev, general: err?.message || 'Fout bij opslaan gebruiker' }));
      }
      setIsSaving(false);
    }
    // Don't set isSaving to false here if successful - let modal close
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal shell */}
      <div className="fixed inset-0 z-[10000] flex justify-center px-4 py-6 sm:py-10 overflow-y-auto">
        <div
          className="
            w-full max-w-4xl
            bg-card border border-border
            rounded-2xl shadow-2xl
            overflow-hidden
            min-h-[calc(100vh-3rem)]
            sm:min-h-0
            sm:max-h-[calc(100vh-5rem)]
            flex flex-col
          "
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
            <div className="flex items-center justify-between p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon name={user ? 'Edit' : 'UserPlus'} size={20} color="var(--color-primary)" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-semibold text-foreground">
                    {user ? 'Gebruiker Bewerken' : 'Nieuwe Gebruiker'}
                  </h2>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {user ? 'Wijzig gebruikersgegevens en workflow toegang' : 'Maak een nieuwe gebruiker aan'}
                  </p>
                </div>
              </div>

              <Button variant="ghost" size="icon" onClick={onClose} disabled={isSaving}>
                <Icon name="X" size={22} />
              </Button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); }} className="p-4 md:p-6 space-y-6 md:space-y-8">
              {/* General Error */}
              {errors.general && (
                <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-3">
                  <Icon name="AlertCircle" size={18} color="var(--color-error)" />
                  <p className="text-sm text-error">{errors.general}</p>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-7">
                {/* Left */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Basisgegevens</h3>

                    <Input
                      label="Naam"
                      type="text"
                      placeholder="Volledige naam"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      error={errors.name}
                      required
                      disabled={isSaving}
                    />

                    <Input
                      label="Email"
                      type="email"
                      placeholder="gebruiker@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      error={errors.email}
                      required
                      disabled={isSaving}
                      description="Wordt gebruikt voor inloggen en notificaties"
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground">Rol en Status</h3>

                    <Select
                      label="Rol"
                      options={roleOptions}
                      value={formData.role}
                      onChange={handleRoleChange}
                      required
                      disabled={isSaving}
                    />

                    <Select
                      label="Status"
                      options={statusOptions}
                      value={formData.isActive}
                      onChange={(value) => setFormData({ ...formData, isActive: value })}
                      required
                      disabled={isSaving}
                    />
                  </div>
                </div>

                {/* Right: Workflow assignment */}
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-foreground">Workflow Toewijzing</h3>
                    <span className="text-xs text-muted-foreground">
                      Gebruikers kunnen alleen tickets zien van toegewezen workflows.
                    </span>
                  </div>

                  {errors.workflows && (
                    <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-3">
                      <Icon name="AlertCircle" size={18} color="var(--color-error)" />
                      <p className="text-sm text-error">{errors.workflows}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {isLoadingWorkflows ? (
                      <div className="p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
                        Workflows laden...
                      </div>
                    ) : workflows.length === 0 ? (
                      <div className="p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground">
                        Geen actieve workflows gevonden.
                      </div>
                    ) : (
                      workflows.map((w) => {
                        const checked = assignedWorkflowIds.includes(w.id);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => toggleWorkflow(w.id)}
                            disabled={isSaving}
                            className={`w-full text-left p-3 rounded-xl border transition-smooth flex items-center justify-between
                              ${checked ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}
                            `}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-5 h-5 rounded border flex items-center justify-center
                                  ${checked ? 'bg-primary border-primary' : 'bg-transparent border-border'}
                                `}
                              >
                                {checked && <Icon name="Check" size={14} color="white" />}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground truncate">{w.name}</div>
                                <div className="text-xs text-muted-foreground font-mono truncate">{w.code}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="h-2" />
            </form>
          </div>

          {/* Sticky Footer */}
          <div className="sticky bottom-0 z-10 bg-card/95 backdrop-blur border-t border-border">
            <div className="p-4 md:p-6 flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Annuleren
              </Button>
              <Button
                type="button"
                variant="default"
                iconName="Save"
                iconPosition="left"
                disabled={isSaving}
                onClick={handleSubmit}
              >
                {isSaving ? 'Opslaan...' : user ? 'Bijwerken' : 'Aanmaken'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default UserModal;
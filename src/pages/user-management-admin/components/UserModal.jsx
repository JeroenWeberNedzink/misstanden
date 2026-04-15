import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';

import { ticketService } from '../../../services/ticketService';
import { workflowService } from '../../../services/workflowService';
import {
  buildRoleCapabilityMap,
  computeAccessCapabilities,
  findMatchingAccessProfile,
  getAccessProfiles,
  getRoleMeta,
  requiresWorkflowSelectionForRoles,
  summarizeCapabilities,
} from '../../../utils/accessMatrix';

const UserModal = ({ user, roles, roleDetailsByCode = {}, workflows: workflowOptions = [], onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    roles: ['HANDLER'],
    isActive: true,
  });

  // Workflow assignment
  const [workflows, setWorkflows] = useState([]);
  const [assignedWorkflowIds, setAssignedWorkflowIds] = useState([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);

  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const availableRoles = useMemo(() => {
    const roleList = Array.isArray(roles) ? roles : [];
    if (roleList.length > 0) {
      return roleList;
    }
    return [
      { id: 'system-handler', code: 'HANDLER', name: 'Behandelaar', description: 'Kan tickets behandelen binnen toegewezen workflows' },
      { id: 'system-admin', code: 'ADMIN', name: 'Administrator', description: 'Beheert gebruikers, workflows en instellingen met ticketinzage' },
      { id: 'system-super-admin', code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Technische noodrol met volledige toegang' },
    ];
  }, [roles]);

  const mergedRoleDetailsByCode = useMemo(() => {
    const fallback = {};
    availableRoles.forEach((role) => {
      const code = String(role?.code || '').trim().toUpperCase();
      if (!code) return;
      fallback[code] = roleDetailsByCode[code] || role;
    });
    return fallback;
  }, [availableRoles, roleDetailsByCode]);

  const roleCapabilityMap = useMemo(
    () => buildRoleCapabilityMap(mergedRoleDetailsByCode),
    [mergedRoleDetailsByCode]
  );

  const accessProfiles = useMemo(
    () => getAccessProfiles({ availableRoles, roleDetailsByCode: mergedRoleDetailsByCode }).filter((profile) => profile.selectable),
    [availableRoles, mergedRoleDetailsByCode]
  );

  const selectedRoles = useMemo(
    () => (Array.isArray(formData.roles) ? formData.roles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean) : []),
    [formData.roles]
  );

  const selectedCapabilities = useMemo(
    () => computeAccessCapabilities({ roles: selectedRoles, roleCapabilityMap }),
    [selectedRoles, roleCapabilityMap]
  );

  const matchingProfile = useMemo(
    () => findMatchingAccessProfile(selectedRoles, accessProfiles),
    [selectedRoles, accessProfiles]
  );

  const needsWorkflowSelection = useMemo(
    () => requiresWorkflowSelectionForRoles({ roles: selectedRoles, roleCapabilityMap }),
    [selectedRoles, roleCapabilityMap]
  );

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
      const normalizedRoles = Array.isArray(user.roles)
        ? user.roles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean)
        : user.role
          ? [String(user.role).trim().toUpperCase()]
          : ['HANDLER'];

      setFormData({
        name: user.name || '',
        email: user.email || '',
        roles: normalizedRoles.length > 0 ? normalizedRoles : ['HANDLER'],
        isActive: user.isActive !== undefined ? user.isActive : true,
      });
    } else {
      setFormData({
        name: '',
        email: '',
        roles: ['HANDLER'],
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
        const providedWorkflows = Array.isArray(workflowOptions) ? workflowOptions : [];
        const wf = providedWorkflows.length > 0 ? providedWorkflows : await ticketService.getWorkflows();
        const activeWf = (wf || []).filter((w) => w?.active);
        setWorkflows(activeWf);

        if (user?.id) {
          const workflowIds = await workflowService.getHandlerWorkflowIds(user.id);
          setAssignedWorkflowIds(workflowIds || []);
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
  }, [user?.id, workflowOptions]);

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

  const toggleRole = (roleCode) => {
    const normalizedRole = String(roleCode || '').trim().toUpperCase();
    if (!normalizedRole) return;

    setFormData((prev) => {
      const currentRoles = Array.isArray(prev.roles)
        ? prev.roles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean)
        : [];
      const nextRoles = currentRoles.includes(normalizedRole)
        ? currentRoles.filter((role) => role !== normalizedRole)
        : [...currentRoles, normalizedRole];

      return {
        ...prev,
        roles: nextRoles,
      };
    });

    setErrors((prev) => ({ ...prev, roles: null, workflows: null }));
  };

  const applyAccessProfile = (profileRoles) => {
    const normalizedRoles = Array.isArray(profileRoles)
      ? profileRoles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean)
      : [];

    setFormData((prev) => ({
      ...prev,
      roles: normalizedRoles.length > 0 ? normalizedRoles : ['HANDLER'],
    }));

    setErrors((prev) => ({ ...prev, roles: null, workflows: null }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name?.trim()) newErrors.name = 'Naam is verplicht';

    if (!formData.email?.trim()) {
      newErrors.email = 'Email is verplicht';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Ongeldig email formaat';
    }

    if (selectedRoles.length === 0) {
      newErrors.roles = 'Kies minimaal 1 rol of gebruik een toegangsprofiel.';
    }

    if (needsWorkflowSelection && assignedWorkflowIds.length === 0) {
      newErrors.workflows =
        'Kies minimaal 1 workflow - gebruikers kunnen alleen tickets zien van toegewezen workflows';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).filter((k) => Boolean(newErrors[k])).length === 0;
  };

  // Replace all assignments in handler_workflows
  const persistHandlerWorkflows = async (handlerId, workflowIds) => {
    const safeIds = Array.isArray(workflowIds) ? workflowIds.filter(Boolean) : [];
    await workflowService.setHandlerWorkflows(handlerId, safeIds);
    return true;
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
        roles: selectedRoles,
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
                    <h3 className="text-sm font-semibold text-foreground">Toegang en Status</h3>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Aanbevolen profielen
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                          {accessProfiles.map((profile) => {
                            const selected = matchingProfile?.code === profile.code;
                            return (
                              <button
                                key={`profile-${profile.code}`}
                                type="button"
                                onClick={() => applyAccessProfile(profile.roles)}
                                disabled={isSaving}
                                className={[
                                  'rounded-xl border p-3 text-left transition-smooth',
                                  selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
                                ].join(' ')}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">{profile.label}</div>
                                    <div className="text-xs text-muted-foreground mt-1">{profile.description}</div>
                                  </div>
                                  {selected && <Icon name="CheckCircle2" size={16} className="text-primary mt-0.5" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-col gap-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Onderliggende rollen
                          </p>
                          <span className="text-xs text-muted-foreground">
                            Combineer rollen alleen bewust. `Portaalbeheerder` geeft beheer zonder ticketinzage.
                          </span>
                        </div>

                        {errors.roles && (
                          <div className="p-3 bg-error/10 border border-error/30 rounded-lg flex items-center gap-3">
                            <Icon name="AlertCircle" size={18} color="var(--color-error)" />
                            <p className="text-sm text-error">{errors.roles}</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          {availableRoles.map((role) => {
                            const code = String(role?.code || '').trim().toUpperCase();
                            const meta = getRoleMeta(code, mergedRoleDetailsByCode);
                            const checked = selectedRoles.includes(code);
                            const roleCapabilities = summarizeCapabilities(
                              computeAccessCapabilities({ roles: [code], roleCapabilityMap })
                            );

                            return (
                              <button
                                key={`role-${code}`}
                                type="button"
                                onClick={() => toggleRole(code)}
                                disabled={isSaving}
                                className={[
                                  'w-full text-left p-3 rounded-xl border transition-smooth',
                                  checked ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
                                ].join(' ')}
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={[
                                      'w-5 h-5 mt-0.5 rounded border flex items-center justify-center',
                                      checked ? 'bg-primary border-primary' : 'bg-transparent border-border',
                                    ].join(' ')}
                                  >
                                    {checked && <Icon name="Check" size={14} color="white" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium text-foreground">{meta.label}</span>
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.tone}`}>
                                        {code}
                                      </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{meta.description}</p>
                                    {roleCapabilities.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {roleCapabilities.map((label) => (
                                          <span
                                            key={`${code}-${label}`}
                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-emerald-200 bg-emerald-50 text-emerald-800"
                                          >
                                            {label}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {matchingProfile ? `Profiel: ${matchingProfile.label}` : 'Maatwerk rolcombinatie'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {matchingProfile?.recommendation || 'Deze combinatie wijkt af van de standaardprofielen.'}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {selectedRoles.length} {selectedRoles.length === 1 ? 'rol' : 'rollen'}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {selectedRoles.map((roleCode) => {
                            const meta = getRoleMeta(roleCode, mergedRoleDetailsByCode);
                            return (
                              <span
                                key={`selected-${roleCode}`}
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.tone}`}
                              >
                                {meta.label}
                              </span>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {summarizeCapabilities(selectedCapabilities).map((label) => (
                            <span
                              key={`selected-cap-${label}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-sky-200 bg-sky-50 text-sky-800"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

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
                      {needsWorkflowSelection
                        ? 'Gebruikers met ticketinzage kunnen alleen tickets zien van toegewezen workflows.'
                        : 'Niet verplicht voor rollen zonder ticketinzage, maar wel alvast instelbaar.'}
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

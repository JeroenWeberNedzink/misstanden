import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { permissionService } from '../../../services/permissionService';
import RoleModal from './RoleModal';

const SystemPill = ({ children }) => (
  <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
    {children}
  </span>
);

const Toggle = ({ checked, onChange }) => (
  <button
    onClick={onChange}
    className={`w-11 h-6 rounded-full transition-smooth relative ${checked ? 'bg-sky-600' : 'bg-border'}`}
    aria-pressed={checked}
    type="button"
  >
    <div
      className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${
        checked ? 'translate-x-5' : 'translate-x-0.5'
      }`}
    />
  </button>
);

const PermissionsManagementPanel = ({ permissions, roles, users, onRefresh, onShowToast }) => {
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [roleQuery, setRoleQuery] = useState('');
  const [permQuery, setPermQuery] = useState('');

  const [expandedCategories, setExpandedCategories] = useState({});
  const [saving, setSaving] = useState(false);

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  useEffect(() => {
    if (roles?.length > 0 && !selectedRole) {
      setSelectedRole(roles[0]);
    }
  }, [roles, selectedRole]);

  useEffect(() => {
    if (selectedRole?.id) {
      loadRolePermissions(selectedRole.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole?.id]);

  const loadRolePermissions = async (roleId) => {
    try {
      const roleData = await permissionService.getRoleWithPermissions(roleId);
      setRolePermissions(roleData?.permissions || []);
    } catch (err) {
      console.error('Error loading role permissions:', err);
      onShowToast?.('Fout bij laden rolrechten', true);
    }
  };

  const rolePermissionIds = useMemo(() => new Set(rolePermissions.map((p) => p.id)), [rolePermissions]);

  const permissionsByCategory = useMemo(() => {
    const q = permQuery.trim().toLowerCase();

    return (permissions || []).reduce((acc, perm) => {
      const category = perm.category || 'general';
      const haystack = [perm.name, perm.code, perm.description, perm.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (q && !haystack.includes(q)) return acc;

      if (!acc[category]) acc[category] = [];
      acc[category].push(perm);
      return acc;
    }, {});
  }, [permissions, permQuery]);

  const categories = useMemo(() => Object.keys(permissionsByCategory).sort(), [permissionsByCategory]);

  useEffect(() => {
    if (categories.length && Object.keys(expandedCategories).length === 0) {
      const initial = {};
      categories.slice(0, 3).forEach((c) => {
        initial[c] = true;
      });
      setExpandedCategories(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join('|')]);

  const getUserCountForRole = (roleCode) => {
    return (users || []).filter((u) => u.roles?.includes(roleCode)).length;
  };

  const filteredRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    if (!q) return roles || [];
    return (roles || []).filter((r) =>
      [r.name, r.code, r.description].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [roles, roleQuery]);

  const totalPermsVisible = useMemo(() => {
    return Object.values(permissionsByCategory).reduce((sum, arr) => sum + arr.length, 0);
  }, [permissionsByCategory]);

  const selectedCountVisible = useMemo(() => {
    let count = 0;
    for (const perms of Object.values(permissionsByCategory)) {
      for (const p of perms) {
        if (rolePermissionIds.has(p.id)) count += 1;
      }
    }
    return count;
  }, [permissionsByCategory, rolePermissionIds]);

  const updateRolePermissions = async (newIds) => {
    if (!selectedRole) return;

    try {
      setSaving(true);
      await permissionService.setRolePermissions(selectedRole.id, newIds);
      await loadRolePermissions(selectedRole.id);
      onShowToast?.('Rechten bijgewerkt');
    } catch (err) {
      console.error('Error updating role permissions:', err);
      onShowToast?.('Fout bij bijwerken rechten', true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRolePermission = async (permissionId) => {
    if (!selectedRole) return;

    const current = Array.from(rolePermissionIds);
    const next = rolePermissionIds.has(permissionId)
      ? current.filter((id) => id !== permissionId)
      : [...current, permissionId];

    await updateRolePermissions(next);
  };

  const handleCategorySelectAll = async (category) => {
    if (!selectedRole) return;

    const perms = permissionsByCategory[category] || [];
    const current = new Set(rolePermissionIds);
    perms.forEach((p) => current.add(p.id));
    await updateRolePermissions(Array.from(current));
  };

  const handleCategoryClear = async (category) => {
    if (!selectedRole) return;

    const perms = permissionsByCategory[category] || [];
    const remove = new Set(perms.map((p) => p.id));
    const next = Array.from(rolePermissionIds).filter((id) => !remove.has(id));
    await updateRolePermissions(next);
  };

  const handleSelectAllVisible = async () => {
    if (!selectedRole) return;

    const current = new Set(rolePermissionIds);
    for (const perms of Object.values(permissionsByCategory)) {
      perms.forEach((p) => current.add(p.id));
    }
    await updateRolePermissions(Array.from(current));
  };

  const handleClearAllVisible = async () => {
    if (!selectedRole) return;

    const visibleIds = new Set(Object.values(permissionsByCategory).flat().map((p) => p.id));
    const next = Array.from(rolePermissionIds).filter((id) => !visibleIds.has(id));
    await updateRolePermissions(next);
  };

  const handleCreateRole = () => {
    setEditingRole(null);
    setShowRoleModal(true);
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setShowRoleModal(true);
  };

  const handleSaveRole = async (roleData) => {
    try {
      setSaving(true);

      if (editingRole) {
        await permissionService.updateRole(editingRole.id, roleData);
        onShowToast?.('Rol bijgewerkt');
      } else {
        await permissionService.createRole(roleData);
        onShowToast?.('Rol aangemaakt');
      }

      setShowRoleModal(false);
      setEditingRole(null);
      await onRefresh?.();
    } catch (err) {
      console.error('Error saving role:', err);
      onShowToast?.(err?.message || 'Fout bij opslaan van rol', true);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Weet u zeker dat u deze rol wilt verwijderen?')) return;

    try {
      await permissionService.deleteRole(roleId);
      onShowToast?.('Rol verwijderd');
      await onRefresh?.();

      const remaining = (roles || []).filter((r) => r.id !== roleId);
      setSelectedRole(remaining[0] || null);
    } catch (err) {
      console.error('Error deleting role:', err);
      onShowToast?.('Fout bij verwijderen rol. Mogelijk is het een systeemrol.', true);
    }
  };

  const handleDeletePermission = async (permissionId) => {
    if (!window.confirm('Weet u zeker dat u deze permission wilt verwijderen?')) return;

    try {
      await permissionService.deletePermission(permissionId);
      onShowToast?.('Permission verwijderd');
      await onRefresh?.();
    } catch (err) {
      console.error('Error deleting permission:', err);
      onShowToast?.('Fout bij verwijderen permission. Mogelijk is het een systeempermission.', true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 flex items-start gap-2">
        <Icon name="Info" size={16} className="text-sky-700 mt-0.5" />
        <p className="text-sm text-sky-800">
          Gebruikerrollen beheer je in de <span className="font-semibold">Gebruikers</span> tab.
          Hier beheer je alleen rollen en permissies.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <aside className="lg:col-span-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Rollen</h3>
              <Button variant="outline" size="sm" iconName="Plus" onClick={handleCreateRole}>
                Nieuw
              </Button>
            </div>

            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
                <Icon name="Search" size={16} />
              </div>
              <input
                value={roleQuery}
                onChange={(e) => setRoleQuery(e.target.value)}
                placeholder="Zoek rol..."
                className="w-full pl-9 pr-9 py-2 rounded-xl bg-white border border-border text-sm outline-none focus:ring-2 focus:ring-sky-300/30"
              />
              {roleQuery && (
                <button
                  onClick={() => setRoleQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                  aria-label="Clear"
                  type="button"
                >
                  <Icon name="X" size={16} />
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredRoles.map((role) => {
                const isActive = selectedRole?.id === role.id;
                const userCount = getUserCountForRole(role.code);

                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={[
                      'w-full text-left p-3 rounded-xl border transition-colors',
                      isActive ? 'bg-sky-50 border-sky-300' : 'bg-white border-border hover:bg-sky-50/50',
                    ].join(' ')}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold truncate ${isActive ? 'text-sky-700' : 'text-foreground'}`}>
                            {role.name}
                          </p>
                          {role.isSystem && <SystemPill>Systeem</SystemPill>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{role.description || role.code}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {userCount} gebruiker{userCount !== 1 ? 's' : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        {!role.isSystem && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditRole(role);
                            }}
                            className="p-1.5 rounded-lg hover:bg-sky-100"
                            title="Bewerk rol"
                            type="button"
                          >
                            <Icon name="Pencil" size={14} className="text-muted-foreground hover:text-sky-700" />
                          </button>
                        )}
                        {!role.isSystem && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-error/10"
                            title="Verwijder rol"
                            type="button"
                          >
                            <Icon name="Trash2" size={14} className="text-error" />
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredRoles.length === 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">Geen rollen gevonden.</div>
              )}
            </div>
          </div>
        </aside>

        <main className="lg:col-span-8 space-y-3">
          {!selectedRole ? (
            <div className="text-center py-12 text-muted-foreground border border-border rounded-xl bg-white">
              <Icon name="ArrowLeft" size={44} className="mx-auto mb-3 opacity-50" />
              <p>Selecteer links een rol om rechten te beheren.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border border-border rounded-xl bg-white p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Icon name="Key" size={16} className="text-sky-700" />
                    <h3 className="text-sm font-semibold text-foreground">{selectedRole.name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Geselecteerd: {selectedCountVisible}/{totalPermsVisible}
                    {saving ? ' - opslaan...' : ''}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="relative w-full sm:w-[260px]">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
                      <Icon name="Search" size={16} />
                    </div>
                    <input
                      value={permQuery}
                      onChange={(e) => setPermQuery(e.target.value)}
                      placeholder="Zoek permission..."
                      className="w-full pl-9 pr-9 py-2 rounded-xl bg-white border border-border text-sm outline-none focus:ring-2 focus:ring-sky-300/30"
                    />
                    {permQuery && (
                      <button
                        onClick={() => setPermQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                        aria-label="Clear"
                        type="button"
                      >
                        <Icon name="X" size={16} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="CheckCheck"
                      onClick={handleSelectAllVisible}
                      disabled={!selectedRole || saving || totalPermsVisible === 0}
                    >
                      Alles aan
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      iconName="Eraser"
                      onClick={handleClearAllVisible}
                      disabled={!selectedRole || saving || totalPermsVisible === 0}
                    >
                      Alles uit
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {categories.map((category) => {
                  const perms = permissionsByCategory[category] || [];
                  const isOpen = Boolean(expandedCategories[category]);
                  const selectedInCategory = perms.filter((p) => rolePermissionIds.has(p.id)).length;

                  return (
                    <div key={category} className="border border-border rounded-xl overflow-hidden bg-white">
                      <div className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">
                        <button
                          type="button"
                          onClick={() => setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }))}
                          className="flex items-center gap-2 min-w-0 text-left"
                        >
                          <Icon name={isOpen ? 'ChevronDown' : 'ChevronRight'} size={16} className="opacity-70" />
                          <p className="font-semibold text-foreground capitalize truncate">{category}</p>
                          <span className="text-xs px-2 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700">
                            {selectedInCategory}/{perms.length}
                          </span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCategorySelectAll(category)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40"
                            disabled={saving}
                          >
                            Alles aan
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCategoryClear(category)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40"
                            disabled={saving}
                          >
                            Alles uit
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="divide-y divide-border">
                          {perms.map((perm) => {
                            const checked = rolePermissionIds.has(perm.id);

                            return (
                              <div
                                key={perm.id}
                                className="px-4 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors group"
                              >
                                <div className="pt-0.5">
                                  <Toggle checked={checked} onChange={() => handleToggleRolePermission(perm.id)} />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-foreground truncate">{perm.name}</p>
                                    {perm.isSystem && <SystemPill>Systeem</SystemPill>}
                                  </div>
                                  {perm.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{perm.description}</p>
                                  )}
                                  <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">{perm.code}</p>
                                </div>

                                {!perm.isSystem && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeletePermission(perm.id);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Verwijder permission"
                                    type="button"
                                  >
                                    <Icon name="Trash2" size={14} className="text-error" />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {perms.length === 0 && (
                            <div className="px-4 py-6 text-sm text-muted-foreground">
                              Geen permissies in deze categorie.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {categories.length === 0 && (
                  <div className="px-4 py-10 text-center text-muted-foreground border border-border rounded-xl bg-white">
                    Geen permissies gevonden.
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {showRoleModal && (
        <RoleModal
          role={editingRole}
          onClose={() => {
            setShowRoleModal(false);
            setEditingRole(null);
          }}
          onSave={handleSaveRole}
        />
      )}
    </div>
  );
};

export default PermissionsManagementPanel;

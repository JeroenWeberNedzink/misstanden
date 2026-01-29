import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { permissionService } from '../../services/permissionService';
import PermissionGuard from '../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../utils/permissions';

const PermissionsAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('roles'); // 'roles' or 'permissions'

  // Modal states
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingPermission, setEditingPermission] = useState(null);
  const [editingRole, setEditingRole] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [permsData, rolesData] = await Promise.all([
        permissionService.getAllPermissions(),
        permissionService.getAllRoles(),
      ]);

      setPermissions(permsData || []);
      setRoles(rolesData || []);
    } catch (err) {
      console.error('Error loading permissions/roles:', err);
      setError('Fout bij laden van gegevens');
    } finally {
      setLoading(false);
    }
  };

  const loadRolePermissions = async (roleId) => {
    try {
      const roleData = await permissionService.getRoleWithPermissions(roleId);
      setRolePermissions(roleData.permissions || []);
    } catch (err) {
      console.error('Error loading role permissions:', err);
    }
  };

  const handleSelectRole = async (role) => {
    setSelectedRole(role);
    await loadRolePermissions(role.id);
  };

  const handleToggleRolePermission = async (permissionId) => {
    if (!selectedRole) return;

    try {
      const currentPermissionIds = rolePermissions.map(p => p.id);
      const newPermissionIds = currentPermissionIds.includes(permissionId)
        ? currentPermissionIds.filter(id => id !== permissionId)
        : [...currentPermissionIds, permissionId];

      await permissionService.setRolePermissions(selectedRole.id, newPermissionIds);
      await loadRolePermissions(selectedRole.id);
      setSuccess('Rechten bijgewerkt');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating role permissions:', err);
      setError('Fout bij bijwerken rechten');
    }
  };

  const showToast = (message, isError = false) => {
    if (isError) {
      setError(message);
      setTimeout(() => setError(''), 3000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  if (loading) {
    return (
      <AuthContextNavigator>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Icon name="Loader2" size={48} className="animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Gegevens laden...</p>
          </div>
        </div>
      </AuthContextNavigator>
    );
  }

  return (
    <>
      <Helmet>
        <title>Rechten Beheer - Misstanden Portal</title>
        <meta name="description" content="Beheer rollen en rechten in het systeem" />
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2">
                    Rechten Beheer
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Beheer dynamisch rollen, rechten en hun toewijzingen
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  iconName="RefreshCw"
                  iconPosition="left"
                  onClick={loadData}
                >
                  Vernieuwen
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 border-b border-border">
                <button
                  onClick={() => setActiveTab('roles')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'roles'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon name="Shield" size={16} />
                    Rollen ({roles.length})
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('permissions')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'permissions'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon name="Key" size={16} />
                    Rechten ({permissions.length})
                  </div>
                </button>
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-lg flex items-center gap-3">
                <Icon name="AlertCircle" size={20} color="var(--color-error)" />
                <p className="text-sm text-error">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-success/10 border border-success/30 rounded-lg flex items-center gap-3">
                <Icon name="CheckCircle" size={20} color="var(--color-success)" />
                <p className="text-sm text-success">{success}</p>
              </div>
            )}

            {/* Content */}
            {activeTab === 'roles' && (
              <RolesManagement
                roles={roles}
                permissions={permissions}
                selectedRole={selectedRole}
                rolePermissions={rolePermissions}
                onSelectRole={handleSelectRole}
                onTogglePermission={handleToggleRolePermission}
                onRefresh={loadData}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'permissions' && (
              <PermissionsManagement
                permissions={permissions}
                onRefresh={loadData}
                onShowToast={showToast}
              />
            )}
          </div>
        </div>
      </AuthContextNavigator>
    </>
  );
};

// ==================== Roles Management Component ====================

const RolesManagement = ({
  roles,
  permissions,
  selectedRole,
  rolePermissions,
  onSelectRole,
  onTogglePermission,
  onRefresh,
  onShowToast,
}) => {
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);

  const handleCreateRole = () => {
    setEditingRole(null);
    setShowRoleModal(true);
  };

  const handleEditRole = (role) => {
    setEditingRole(role);
    setShowRoleModal(true);
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Weet u zeker dat u deze rol wilt verwijderen?')) return;

    try {
      await permissionService.deleteRole(roleId);
      onShowToast('Rol verwijderd');
      onRefresh();
    } catch (err) {
      console.error('Error deleting role:', err);
      onShowToast('Fout bij verwijderen rol. Mogelijk is het een systeem rol.', true);
    }
  };

  const rolePermissionIds = rolePermissions.map(p => p.id);

  // Group permissions by category
  const permissionsByCategory = permissions.reduce((acc, perm) => {
    const category = perm.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Roles List */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Icon name="Shield" size={20} />
            Rollen
          </h2>
          <Button
            variant="outline"
            size="sm"
            iconName="Plus"
            onClick={handleCreateRole}
          >
            Nieuwe Rol
          </Button>
        </div>

        <div className="space-y-2">
          {roles.map(role => (
            <div
              key={role.id}
              onClick={() => onSelectRole(role)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedRole?.id === role.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/30'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{role.name}</h3>
                    {role.isSystem && (
                      <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        Systeem
                      </span>
                    )}
                    {role.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                        Standaard
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{role.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">Code: {role.code}</p>
                </div>

                {!role.isSystem && (
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditRole(role);
                      }}
                      className="p-1 hover:bg-muted rounded"
                    >
                      <Icon name="Edit" size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRole(role.id);
                      }}
                      className="p-1 hover:bg-error/10 rounded"
                    >
                      <Icon name="Trash" size={14} className="text-error" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Role Permissions */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
          <Icon name="Key" size={20} />
          {selectedRole ? `Rechten voor ${selectedRole.name}` : 'Selecteer een rol'}
        </h2>

        {selectedRole ? (
          <div className="space-y-4">
            {Object.entries(permissionsByCategory).map(([category, perms]) => (
              <div key={category} className="border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 capitalize">
                  {category}
                </h3>
                <div className="space-y-2">
                  {perms.map(perm => {
                    const isChecked = rolePermissionIds.includes(perm.id);
                    return (
                      <div
                        key={perm.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted/30"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{perm.name}</p>
                          <p className="text-xs text-muted-foreground">{perm.description}</p>
                        </div>
                        <button
                          onClick={() => onTogglePermission(perm.id)}
                          className={`w-11 h-6 rounded-full transition-smooth relative ${
                            isChecked ? 'bg-success' : 'bg-border'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${
                              isChecked ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Icon name="ArrowLeft" size={48} className="mx-auto mb-4 opacity-50" />
            <p>Selecteer een rol om rechten te beheren</p>
          </div>
        )}
      </div>

      {/* Role Modal */}
      {showRoleModal && (
        <RoleModal
          role={editingRole}
          onClose={() => setShowRoleModal(false)}
          onSave={async (roleData) => {
            try {
              if (editingRole) {
                await permissionService.updateRole(editingRole.id, roleData);
                onShowToast('Rol bijgewerkt');
              } else {
                await permissionService.createRole(roleData);
                onShowToast('Rol aangemaakt');
              }
              setShowRoleModal(false);
              onRefresh();
            } catch (err) {
              console.error('Error saving role:', err);
              onShowToast('Fout bij opslaan rol', true);
            }
          }}
        />
      )}
    </div>
  );
};

// ==================== Permissions Management Component ====================

const PermissionsManagement = ({ permissions, onRefresh, onShowToast }) => {
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [editingPermission, setEditingPermission] = useState(null);

  const handleCreatePermission = () => {
    setEditingPermission(null);
    setShowPermissionModal(true);
  };

  const handleEditPermission = (permission) => {
    setEditingPermission(permission);
    setShowPermissionModal(true);
  };

  const handleDeletePermission = async (permissionId) => {
    if (!window.confirm('Weet u zeker dat u dit recht wilt verwijderen?')) return;

    try {
      await permissionService.deletePermission(permissionId);
      onShowToast('Recht verwijderd');
      onRefresh();
    } catch (err) {
      console.error('Error deleting permission:', err);
      onShowToast('Fout bij verwijderen recht. Mogelijk is het een systeem recht.', true);
    }
  };

  // Group by category
  const permissionsByCategory = permissions.reduce((acc, perm) => {
    const category = perm.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(perm);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button
          variant="default"
          size="md"
          iconName="Plus"
          iconPosition="left"
          onClick={handleCreatePermission}
        >
          Nieuw Recht
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(permissionsByCategory).map(([category, perms]) => (
          <div key={category} className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-lg font-semibold text-foreground mb-3 capitalize flex items-center gap-2">
              <Icon name="FolderOpen" size={18} />
              {category}
            </h3>
            <div className="space-y-2">
              {perms.map(perm => (
                <div
                  key={perm.id}
                  className="p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{perm.name}</p>
                        {perm.isSystem && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            Systeem
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{perm.description}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{perm.code}</p>
                    </div>

                    {!perm.isSystem && (
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => handleEditPermission(perm)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <Icon name="Edit" size={14} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDeletePermission(perm.id)}
                          className="p-1 hover:bg-error/10 rounded"
                        >
                          <Icon name="Trash" size={14} className="text-error" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Permission Modal */}
      {showPermissionModal && (
        <PermissionModal
          permission={editingPermission}
          onClose={() => setShowPermissionModal(false)}
          onSave={async (permissionData) => {
            try {
              if (editingPermission) {
                await permissionService.updatePermission(editingPermission.id, permissionData);
                onShowToast('Recht bijgewerkt');
              } else {
                await permissionService.createPermission(permissionData);
                onShowToast('Recht aangemaakt');
              }
              setShowPermissionModal(false);
              onRefresh();
            } catch (err) {
              console.error('Error saving permission:', err);
              onShowToast('Fout bij opslaan recht', true);
            }
          }}
        />
      )}
    </div>
  );
};

// ==================== Role Modal ====================

const RoleModal = ({ role, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    code: role?.code || '',
    name: role?.name || '',
    description: role?.description || '',
    isDefault: role?.isDefault || false,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <>
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[10000] flex justify-center items-center p-4">
        <div
          className="bg-card border border-border rounded-xl p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {role ? 'Rol Bewerken' : 'Nieuwe Rol'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Code"
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
              disabled={!!role?.isSystem}
              placeholder="CUSTOM_ROLE"
            />

            <Input
              label="Naam"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Mijn Custom Rol"
            />

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Beschrijving</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-2 border border-border rounded-lg bg-background text-foreground"
                rows={3}
                placeholder="Beschrijving van de rol..."
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="isDefault" className="text-sm text-foreground">
                Standaard rol voor nieuwe gebruikers
              </label>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuleren
              </Button>
              <Button type="submit" variant="default">
                {role ? 'Bijwerken' : 'Aanmaken'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

// ==================== Permission Modal ====================

const PermissionModal = ({ permission, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    code: permission?.code || '',
    name: permission?.name || '',
    description: permission?.description || '',
    category: permission?.category || 'general',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <>
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[10000] flex justify-center items-center p-4">
        <div
          className="bg-card border border-border rounded-xl p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {permission ? 'Recht Bewerken' : 'Nieuw Recht'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Code"
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
              disabled={!!permission?.isSystem}
              placeholder="canDoSomething"
            />

            <Input
              label="Naam"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Kan Iets Doen"
            />

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Beschrijving</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-2 border border-border rounded-lg bg-background text-foreground"
                rows={3}
                placeholder="Beschrijving van het recht..."
              />
            </div>

            <Input
              label="Categorie"
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
              placeholder="general"
            />

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuleren
              </Button>
              <Button type="submit" variant="default">
                {permission ? 'Bijwerken' : 'Aanmaken'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default PermissionsAdmin;

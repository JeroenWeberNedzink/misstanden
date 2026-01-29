import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import UserTable from './components/UserCards';
import UserModal from './components/UserModal';
import { ticketService } from '../../services/ticketService';
import { workflowService } from '../../services/workflowService';
import PermissionGuard from '../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../utils/permissions';

// --- Helpers: align UI with API payload shape ---
const normalizeRoles = (roles) =>
  Array.isArray(roles)
    ? roles.map((r) => String(r).toUpperCase().trim()).filter(Boolean)
    : [];

const hasRole = (user, role) => {
  const roles = normalizeRoles(user?.roles);
  return roles.includes(String(role).toUpperCase().trim());
};

const computePrimaryRole = (user) => {
  if (hasRole(user, 'ADMIN')) return 'admin';
  if (hasRole(user, 'HANDLER')) return 'handler';
  if (hasRole(user, 'USER')) return 'user';
  return null;
};

const normalizeUser = (u) => ({
  ...u,
  isActive: Boolean(u?.active),
  role: computePrimaryRole(u),
  roles: normalizeRoles(u?.roles),
});

const getRoleBadgeStyle = (role) => {
  const styles = {
    admin: 'bg-primary/10 text-primary border border-primary/20',
    handler: 'bg-accent/10 text-accent border border-accent/20',
  };
  return styles[role] || 'bg-muted text-muted-foreground border border-border';
};

const getRoleLabel = (role) => {
  const labels = { admin: 'Admin', handler: 'Handler' };
  return labels[role] || role;
};

export default function UserManagementAdmin() {
  const [users, setUsers] = useState([]);
  const [workflows, setWorkflows] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const { t } = useTranslation();

  const showToast = useCallback((message) => {
    setToastMessage(message);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  }, []);

  const loadPageData = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      const [usersData, workflowsData] = await Promise.all([
        ticketService.getAllHandlers(),
        workflowService.getWorkflowsWithStats(),
      ]);

      setUsers((usersData || []).map(normalizeUser));

      // Keep a clean, predictable shape
      const wf = (workflowsData || []).map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
        active: Boolean(w.active),
        displayOrder: w.displayOrder ?? 0,
        ticketCount: w?.tickets?.[0]?.count ?? 0,
        handlerCount: w?.handlerWorkflows?.[0]?.count ?? 0,
      }));

      // Sort by display order, then name
      wf.sort((a, b) => (a.displayOrder - b.displayOrder) || a.name.localeCompare(b.name));

      setWorkflows(wf);
    } catch (err) {
      console.error('Error loading admin data:', err);
      setError(t('userManagement.errorLoadingData'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const handleCreateUser = () => {
    setSelectedUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm(t('userManagement.confirmDelete'))) return;

    try {
      await ticketService.deleteHandler(userId);
      showToast(t('userManagement.userDeleted'));
      await loadPageData();
    } catch (err) {
      console.error('Error deleting user:', err);
      showToast(t('userManagement.userDeleteFailed'));
    }
  };

  const handleSaveUser = async (userData) => {
    try {
      let savedUser;
      if (selectedUser) {
        savedUser = await ticketService.updateHandler(selectedUser.id, userData);
        showToast(t('userManagement.userUpdated'));
      } else {
        savedUser = await ticketService.createHandler(userData);
        showToast(t('userManagement.userCreated'));
      }

      setShowUserModal(false);
      await loadPageData();

      // Return the saved user so UserModal can get the ID
      return savedUser;
    } catch (err) {
      console.error('Error saving user:', err);
      throw err;
    }
  };

  // --- Metrics computed against normalized data ---
  const metrics = useMemo(() => {
    const totalUsers = users.length;
    const admins = users.filter((u) => hasRole(u, 'ADMIN')).length;
    const handlers = users.filter((u) => hasRole(u, 'HANDLER')).length;
    const activeUsers = users.filter((u) => u.isActive).length;

    const totalWorkflows = workflows.length;
    const activeWorkflows = workflows.filter((w) => w.active).length;
    const totalWorkflowTickets = workflows.reduce((sum, w) => sum + (w.ticketCount || 0), 0);

    return {
      totalUsers,
      admins,
      handlers,
      activeUsers,
      totalWorkflows,
      activeWorkflows,
      totalWorkflowTickets,
    };
  }, [users, workflows]);

  const topWorkflows = useMemo(() => {
    // show top 6 by ticket volume
    const copy = [...workflows];
    copy.sort((a, b) => (b.ticketCount || 0) - (a.ticketCount || 0));
    return copy.slice(0, 6);
  }, [workflows]);

  if (isLoading) {
    return (
      <AuthContextNavigator>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="skeleton h-12 w-48 rounded-lg mb-4"></div>
            <p className="text-muted-foreground">{t('userManagement.loadingData')}</p>
          </div>
        </div>
      </AuthContextNavigator>
    );
  }

  return (
    <>
      <Helmet>
        <title>Admin Portal - Misstanden Portal</title>
        <meta name="description" content="Beheer gebruikers, workflows en rechten" />
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen bg-background">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 lg:py-12">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2">
                  {t('userManagement.title')}
                </h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  {t('userManagement.subtitle')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  iconName="RefreshCw"
                  iconPosition="left"
                  onClick={loadPageData}
                >
                </Button>

                <PermissionGuard permission={PERMISSIONS.MANAGE_USERS}>
                  <Button
                    variant="default"
                    size="lg"
                    iconName="UserPlus"
                    iconPosition="left"
                    onClick={handleCreateUser}
                  >
                    {t('userManagement.newUser')}
                  </Button>
                </PermissionGuard>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-lg flex items-center gap-3">
                <Icon name="AlertCircle" size={20} color="var(--color-error)" />
                <p className="text-sm text-error">{error}</p>
              </div>
            )}
            {/* Users Table */}
            <UserTable users={users} onEdit={handleEditUser} onDelete={handleDeleteUser} />

          </div>

          {/* User Modal */}
          {showUserModal && (
            <UserModal
              user={selectedUser}
              onClose={() => setShowUserModal(false)}
              onSave={handleSaveUser}
            />
          )}

          {/* Success Toast */}
          {showSuccessToast && (
            <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-50 animate-in slide-in-from-bottom-5">
              <div className="bg-success text-success-foreground px-4 md:px-6 py-3 md:py-4 rounded-lg shadow-lg flex items-center gap-3">
                <Icon name="CheckCircle" size={20} />
                <span className="text-sm md:text-base font-medium">{toastMessage}</span>
              </div>
            </div>
          )}
        </div>
      </AuthContextNavigator>
    </>
  );
}
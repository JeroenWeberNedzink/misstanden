import React, { useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import UserModal from '../../../pages/user-management-admin/components/UserModal';
import { ticketService } from '../../../services/ticketService';

const RoleBadge = ({ roles = [] }) => {
  const normalized = roles.map(r => String(r).toUpperCase());
  const isAdmin = normalized.includes('ADMIN');
  const isHandler = normalized.includes('HANDLER');
  const isUser = normalized.includes('USER');

  const label = isAdmin ? 'Admin' : isHandler ? 'Handler' : isUser ? 'User' : 'Onbekend';
  const tone = isAdmin
    ? 'bg-error/10 text-error border-error/20'
    : isHandler
      ? 'bg-accent/10 text-accent border-accent/20'
      : 'bg-muted text-muted-foreground border-border';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${tone}`}>
      {label}
    </span>
  );
};

const StatusBadge = ({ active }) => {
  const tone = active
    ? 'bg-success/10 text-success border-success/20'
    : 'bg-muted text-muted-foreground border-border';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${tone}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-success' : 'bg-muted-foreground'}`} />
      {active ? 'Actief' : 'Inactief'}
    </span>
  );
};

const UserCard = ({ user, onEdit, onDelete, disabled = false }) => {
  const name = user.name || user.fullName || user.username || `User #${user.id}`;
  const email = user.email || user.mail || '-';
  const active = Boolean(user.isActive ?? user.active);

  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Extra styling for inactive users
  const inactiveStyles = !active ? 'opacity-60 grayscale' : '';
  const cardBorder = !active ? 'border-border/70' : 'border-border';

  return (
    <div
      className={`bg-white/60 border ${cardBorder} rounded-2xl p-5 transition-all group ${
        active ? 'hover:shadow-lg hover:border-blue-300' : ''
      } ${inactiveStyles}`}
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-xl bg-sky-100 flex items-center justify-center font-bold text-lg shrink-0 text-sky-700">
          {initials}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate text-base">{name}</h3>
              <p className="text-sm text-muted-foreground truncate mt-0.5">{email}</p>

              {/* Full ID always visible */}
              <p className="text-xs text-muted-foreground mt-1 break-all">
                ID: {String(user.id ?? '-')}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge active={active} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              {/* Role always visible */}
              <RoleBadge roles={user.roles || []} />
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit(user)}
                disabled={disabled}
                className="p-2 hover:bg-primary/10 rounded-lg transition-colors group/edit"
                title="Bewerk gebruiker"
              >
                <Icon name="Pencil" size={16} className="text-muted-foreground group-hover/edit:text-primary" />
              </button>
              <button
                onClick={() => onDelete(user)}
                disabled={disabled}
                className="p-2 hover:bg-error/10 rounded-lg transition-colors group/delete"
                title="Verwijder gebruiker"
              >
                <Icon name="Trash2" size={16} className="text-muted-foreground group-hover/delete:text-error" />
              </button>
            </div>
          </div>

          {/* Inactive strip below */}
          {!active && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground" />
                <span className="font-medium text-foreground/80">Inactief</span>
                <span>Deze gebruiker heeft geen toegang.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const UserManagementPanel = ({ users, roles, workflows, onRefresh, onShowToast }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleteRetry, setDeleteRetry] = useState(null);

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const name = (user.name || user.fullName || user.username || '').toLowerCase();
      const email = (user.email || user.mail || '').toLowerCase();
      const query = searchQuery.toLowerCase();

      // Search filter
      const matchesSearch = !query || name.includes(query) || email.includes(query);

      // Role filter
      const userRoles = (user.roles || []).map(r => String(r).toUpperCase());
      const matchesRole = filterRole === 'all' ||
        (filterRole === 'admin' && userRoles.includes('ADMIN')) ||
        (filterRole === 'handler' && userRoles.includes('HANDLER')) ||
        (filterRole === 'user' && userRoles.includes('USER'));

      // Status filter
      const active = Boolean(user.isActive ?? user.active);
      const matchesStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && active) ||
        (filterStatus === 'inactive' && !active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, filterRole, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    const activeUsers = users.filter(u => Boolean(u.isActive ?? u.active)).length;
    const adminUsers = users.filter(u => {
      const roles = (u.roles || []).map(r => String(r).toUpperCase());
      return roles.includes('ADMIN');
    }).length;
    const handlerUsers = users.filter(u => {
      const roles = (u.roles || []).map(r => String(r).toUpperCase());
      return roles.includes('HANDLER');
    }).length;

    return { total: users.length, active: activeUsers, admins: adminUsers, handlers: handlerUsers };
  }, [users]);

  const handleCreateUser = () => {
    setSelectedUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handleDeleteUser = async (user) => {
    const userId = user?.id;
    const userName = user?.name || user?.fullName || user?.username || 'Deze gebruiker';
    if (!userId) return;

    // Use window.confirm to ensure it works
    const confirmed = window.confirm(`Weet je zeker dat je ${userName} permanent wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`);
    if (!confirmed) {
      console.log('Delete cancelled by user');
      return;
    }

    console.log('Permanently deleting user:', userId);

    try {
      setIsBusy(true);
      const result = await ticketService.deleteHandler(userId, { hard: true, forceDetach: true });
      console.log('Delete result:', result);
      setDeleteRetry(null);
      const count = Number(result?.autoUnassignedTickets || 0);
      onShowToast?.(`Gebruiker permanent verwijderd. ${count} ticket(s) automatisch ontkoppeld.`);

      // Refresh in background
      onRefresh?.().catch(err => {
        console.error('Refresh error after delete:', err);
      });
    } catch (err) {
      console.error('Delete error:', err);
      if (err?.code === 'FK_HAS_RELATIONS') {
        const assignedTickets = Number(err?.assignedTickets || 0);
        setDeleteRetry({
          userId,
          userName,
          assignedTickets,
          message: err?.message || 'Verwijderen geblokkeerd door gekoppelde gegevens.',
        });
        onShowToast?.(
          `${userName} kon niet direct worden verwijderd. Gebruik "Opnieuw proberen" om eerst ${assignedTickets} ticket(s) los te koppelen.`,
          true
        );
      } else {
        onShowToast?.(`Fout bij verwijderen: ${err.message || 'Onbekende fout'}`, true);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleRetryDelete = async () => {
    if (!deleteRetry?.userId) return;

    const { userId, userName } = deleteRetry;

    try {
      setIsBusy(true);
      const result = await ticketService.deleteHandler(userId, { hard: true, forceDetach: true });
      const count = Number(result?.autoUnassignedTickets || 0);

      setDeleteRetry(null);
      onShowToast?.(
        `${userName} verwijderd. ${count} ticket(s) automatisch ontkoppeld.`,
        false
      );
      onRefresh?.().catch(err => {
        console.error('Refresh error after retry delete:', err);
      });
    } catch (err) {
      console.error('Retry delete error:', err);
      onShowToast?.(`Opnieuw verwijderen mislukt: ${err.message || 'Onbekende fout'}`, true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveUser = async (userData) => {
    try {
      setIsBusy(true);

      let savedUser;
      if (selectedUser) {
        savedUser = await ticketService.updateHandler(selectedUser.id, userData);
        onShowToast?.('Gebruiker succesvol bijgewerkt');
      } else {
        savedUser = await ticketService.createHandler(userData);
        onShowToast?.('Gebruiker succesvol aangemaakt');
      }

      // Close modal immediately for better UX
      setShowUserModal(false);
      setSelectedUser(null);

      // Refresh in background (non-blocking)
      onRefresh?.().catch(err => {
        console.error('Refresh error:', err);
      });

      return savedUser;
    } catch (err) {
      console.error('Save error:', err);
      onShowToast?.(err.message || 'Fout bij opslaan van gebruiker', true);
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {/* <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <Icon name="Users" size={24} className="opacity-80" />
            <div className="text-3xl font-bold">{stats.total}</div>
          </div>
          <p className="text-sm opacity-90">Totaal Gebruikers</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <Icon name="CheckCircle" size={24} className="opacity-80" />
            <div className="text-3xl font-bold">{stats.active}</div>
          </div>
          <p className="text-sm opacity-90">Actieve Gebruikers</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <Icon name="ShieldCheck" size={24} className="opacity-80" />
            <div className="text-3xl font-bold">{stats.admins}</div>
          </div>
          <p className="text-sm opacity-90">Administrators</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <Icon name="UserCheck" size={24} className="opacity-80" />
            <div className="text-3xl font-bold">{stats.handlers}</div>
          </div>
          <p className="text-sm opacity-90">Handlers</p>
        </div>
      </div> */}

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex flex-wrap gap-3 flex-1">
          <Input
            type="search"
            placeholder="Zoek op naam of email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:w-80"
          />

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-blue-200 rounded-xl bg-white/60 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20"
          >
            <option value="all">Alle rollen</option>
            <option value="admin">Admin</option>
            <option value="handler">Handler</option>
            <option value="user">User</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-blue-200 rounded-xl bg-white/60 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20"
          >
            <option value="all">Alle statussen</option>
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
          </select>
        </div>

        <Button
          variant="primary"
          iconName="UserPlus"
          onClick={handleCreateUser}
          disabled={isBusy}
        >
          Nieuwe Gebruiker
        </Button>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredUsers.length} {filteredUsers.length === 1 ? 'gebruiker' : 'gebruikers'} gevonden
        </p>
      </div>

      {deleteRetry && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Verwijderen geblokkeerd voor {deleteRetry.userName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {deleteRetry.assignedTickets} ticket(s) zijn nog gekoppeld. Klik op opnieuw proberen om deze eerst automatisch los te koppelen en daarna de handler te verwijderen.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteRetry(null)}
                disabled={isBusy}
              >
                Sluiten
              </Button>
              <Button
                variant="warning"
                size="sm"
                iconName="RefreshCw"
                iconPosition="left"
                onClick={handleRetryDelete}
                loading={isBusy}
              >
                Opnieuw proberen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* User Grid */}
      {filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-white/40 border border-blue-100 rounded-2xl">
          <Icon name="Search" size={48} className="mx-auto mb-4 text-blue-400 opacity-50" />
          <p className="text-lg font-medium text-foreground">Geen gebruikers gevonden</p>
          <p className="text-sm text-muted-foreground mt-2">
            Pas je zoek- of filterinstellingen aan
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredUsers.map(user => (
            <UserCard
              key={user.id}
              user={user}
              onEdit={handleEditUser}
              onDelete={handleDeleteUser}
              disabled={isBusy}
            />
          ))}
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <UserModal
          user={selectedUser}
          roles={roles}
          workflows={workflows}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
          }}
          onSave={handleSaveUser}
        />
      )}
    </div>
  );
};

export default UserManagementPanel;

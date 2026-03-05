import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import UserModal from '../../../pages/user-management-admin/components/UserModal';
import { ticketService } from '../../../services/ticketService';
import { accessRequestService } from '../../../services/accessRequestService';

const toUpperRoles = (roles = []) => (Array.isArray(roles) ? roles.map((r) => String(r).toUpperCase()) : []);

const roleTone = (role) => {
  if (role === 'ADMIN') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (role === 'HANDLER') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (role === 'USER') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-border bg-muted/40 text-muted-foreground';
};

const StatusBadge = ({ active }) => (
  <span
    className={[
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
      active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600',
    ].join(' ')}
  >
    <span className={['w-1.5 h-1.5 rounded-full', active ? 'bg-emerald-600' : 'bg-slate-500'].join(' ')} />
    {active ? 'Actief' : 'Inactief'}
  </span>
);

const ProviderBadge = ({ userId }) => {
  const raw = String(userId || '');
  const provider = raw.includes('|') ? raw.split('|')[0] : raw;
  const label = provider || 'onbekend';

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-sky-200 bg-sky-50 text-sky-700">
      <Icon name="ShieldCheck" size={12} />
      OAuth: {label}
    </span>
  );
};

const formatLastLogin = (value) => {
  if (!value) return 'Nooit';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Onbekend';
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const countEnabledPermissions = (permissions) => {
  if (!permissions || typeof permissions !== 'object') return 0;
  return Object.values(permissions).filter(Boolean).length;
};

const AccessRequestCard = ({ request, onApprove, onApproveAdmin, onReject, disabled = false }) => {
  const requestId = String(request?.id || '');
  const name = String(request?.name || '').trim() || 'Onbekende naam';
  const email = String(request?.email || '').trim() || '-';
  const userId = String(request?.userId || request?.user_id || '').trim() || '-';
  const message = String(request?.requestMessage || request?.request_message || '').trim();
  const requestedAt = request?.createdAt || request?.created_at || null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{name}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">
              PENDING
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 break-all">{email}</p>
          <p className="text-xs text-muted-foreground mt-1 break-all">user_id: {userId}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Aangevraagd op: {formatDateTime(requestedAt)}
          </p>
          {message && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-white px-3 py-2">
              <p className="text-xs text-foreground whitespace-pre-wrap">{message}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            variant="success"
            size="sm"
            iconName="UserCheck"
            iconPosition="left"
            onClick={() => onApprove(request)}
            disabled={disabled || !requestId}
          >
            Goedkeuren
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconName="ShieldCheck"
            iconPosition="left"
            onClick={() => onApproveAdmin(request)}
            disabled={disabled || !requestId}
          >
            Als admin
          </Button>
          <Button
            variant="danger"
            size="sm"
            iconName="X"
            iconPosition="left"
            onClick={() => onReject(request)}
            disabled={disabled || !requestId}
          >
            Afwijzen
          </Button>
        </div>
      </div>
    </div>
  );
};

const UserCard = ({ user, onEdit, onDelete, disabled = false }) => {
  const name = user?.name || user?.fullName || user?.username || `User #${user?.id}`;
  const email = user?.email || user?.mail || '-';
  const phone = user?.phone || '-';
  const active = Boolean(user?.isActive ?? user?.active);
  const roles = toUpperRoles(user?.roles || []);
  const permissionsCount = countEnabledPermissions(user?.permissions);

  const initials = String(name)
    .split(' ')
    .map((n) => n?.[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={[
        'rounded-2xl border bg-white p-4 transition-all',
        active ? 'border-sky-100 hover:border-sky-200 hover:shadow-sm' : 'border-border opacity-80',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {user?.picture ? (
          <img
            src={user.picture}
            alt={name}
            className="w-12 h-12 rounded-xl object-cover border border-border"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 font-bold flex items-center justify-center">
            {initials || 'H'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground truncate">{name}</h3>
              <p className="text-sm text-muted-foreground truncate">{email}</p>
            </div>
            <StatusBadge active={active} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ProviderBadge userId={user?.userId || user?.user_id} />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border bg-slate-50 text-slate-700">
              <Icon name="Clock3" size={12} />
              Laatste login: {formatLastLogin(user?.lastLogin || user?.last_login)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-muted-foreground">
              <span className="font-medium text-foreground">Telefoon:</span> {phone}
            </div>
            <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-muted-foreground">
              <span className="font-medium text-foreground">Permissies:</span> {permissionsCount}
            </div>
            <div className="sm:col-span-2 rounded-lg border border-border bg-background px-2.5 py-2 text-muted-foreground break-all">
              <span className="font-medium text-foreground">user_id:</span> {user?.userId || user?.user_id || '-'}
            </div>
            <div className="sm:col-span-2 rounded-lg border border-border bg-background px-2.5 py-2 text-muted-foreground break-all">
              <span className="font-medium text-foreground">handler_id:</span> {String(user?.id || '-')}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {roles.length > 0 ? (
                roles.map((role) => (
                  <span
                    key={`${user?.id}-${role}`}
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${roleTone(role)}`}
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-slate-50 text-slate-700">
                  GEEN ROL
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(user)}
                disabled={disabled}
                className="p-2 rounded-lg hover:bg-sky-50 transition-colors"
                title="Bewerk handler"
              >
                <Icon name="Pencil" size={16} className="text-sky-700" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(user)}
                disabled={disabled}
                className="p-2 rounded-lg hover:bg-rose-50 transition-colors"
                title="Verwijder handler"
              >
                <Icon name="Trash2" size={16} className="text-rose-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const UserManagementPanel = ({ users, roles, workflows, onRefresh, onShowToast }) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isRequestActionBusy, setIsRequestActionBusy] = useState(false);
  const [accessRequests, setAccessRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleteRetry, setDeleteRetry] = useState(null);

  const loadAccessRequests = async () => {
    try {
      setIsLoadingRequests(true);
      const result = await accessRequestService.listRequests({ status: 'pending', limit: 200 });
      setAccessRequests(Array.isArray(result?.rows) ? result.rows : []);
    } catch (err) {
      console.error('Access requests load error:', err);
      onShowToast?.(err?.message || 'Fout bij laden van toegangsaanvragen', true);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    loadAccessRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    return (users || []).filter((user) => {
      const name = String(user?.name || user?.fullName || user?.username || '').toLowerCase();
      const email = String(user?.email || user?.mail || '').toLowerCase();
      const phone = String(user?.phone || '').toLowerCase();
      const userId = String(user?.userId || user?.user_id || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();

      const matchesSearch = !query || name.includes(query) || email.includes(query) || phone.includes(query) || userId.includes(query);

      const userRoles = toUpperRoles(user?.roles || []);
      const matchesRole =
        filterRole === 'all' ||
        (filterRole === 'admin' && userRoles.includes('ADMIN')) ||
        (filterRole === 'handler' && userRoles.includes('HANDLER')) ||
        (filterRole === 'user' && userRoles.includes('USER'));

      const active = Boolean(user?.isActive ?? user?.active);
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && active) ||
        (filterStatus === 'inactive' && !active);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, filterRole, filterStatus]);

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handleDeleteUser = async (user) => {
    const userId = user?.id;
    const userName = user?.name || user?.fullName || user?.username || 'Deze gebruiker';
    if (!userId) return;

    const confirmed = window.confirm(
      `Weet je zeker dat je ${userName} permanent wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`
    );
    if (!confirmed) return;

    try {
      setIsBusy(true);
      const result = await ticketService.deleteHandler(userId, { hard: true, forceDetach: true });
      setDeleteRetry(null);
      const count = Number(result?.autoUnassignedTickets || 0);
      onShowToast?.(`Gebruiker permanent verwijderd. ${count} ticket(s) automatisch ontkoppeld.`);
      onRefresh?.().catch((err) => {
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
        onShowToast?.(`Fout bij verwijderen: ${err?.message || 'Onbekende fout'}`, true);
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
      onShowToast?.(`${userName} verwijderd. ${count} ticket(s) automatisch ontkoppeld.`, false);
      onRefresh?.().catch((err) => {
        console.error('Refresh error after retry delete:', err);
      });
    } catch (err) {
      console.error('Retry delete error:', err);
      onShowToast?.(`Opnieuw verwijderen mislukt: ${err?.message || 'Onbekende fout'}`, true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveUser = async (userData) => {
    if (!selectedUser?.id) {
      throw new Error('Handmatige gebruiker-aanmaak is uitgeschakeld. Gebruikers komen via OAuth login.');
    }

    try {
      setIsBusy(true);
      const savedUser = await ticketService.updateHandler(selectedUser.id, userData);
      onShowToast?.('Gebruiker succesvol bijgewerkt');

      setShowUserModal(false);
      setSelectedUser(null);

      onRefresh?.().catch((err) => {
        console.error('Refresh error:', err);
      });

      return savedUser;
    } catch (err) {
      console.error('Save error:', err);
      onShowToast?.(err?.message || 'Fout bij opslaan van gebruiker', true);
      throw err;
    } finally {
      setIsBusy(false);
    }
  };

  const handleApproveRequest = async (request, asAdmin = false) => {
    const requestId = String(request?.id || '');
    if (!requestId) return;

    try {
      setIsRequestActionBusy(true);
      const result = await accessRequestService.approveRequest(requestId, {
        roles: asAdmin ? ['HANDLER', 'ADMIN'] : ['HANDLER'],
      });

      setAccessRequests((prev) => prev.filter((item) => String(item?.id || '') !== requestId));
      const warningText = Array.isArray(result?.warnings) && result.warnings.length > 0
        ? ` Let op: ${result.warnings.join(' ')}`
        : '';
      onShowToast?.(
        `Toegang goedgekeurd voor ${request?.email || request?.name || 'gebruiker'}.${warningText}`,
        false
      );

      onRefresh?.().catch((err) => {
        console.error('Refresh error after access approval:', err);
      });
    } catch (err) {
      console.error('Approve access request error:', err);
      onShowToast?.(err?.message || 'Goedkeuren van aanvraag mislukt', true);
    } finally {
      setIsRequestActionBusy(false);
    }
  };

  const handleRejectRequest = async (request) => {
    const requestId = String(request?.id || '');
    if (!requestId) return;

    const note = window.prompt('Optionele reden voor afwijzing (zichtbaar voor admins):', '') ?? '';

    try {
      setIsRequestActionBusy(true);
      const result = await accessRequestService.rejectRequest(requestId, { note });
      setAccessRequests((prev) => prev.filter((item) => String(item?.id || '') !== requestId));
      const warningText = Array.isArray(result?.warnings) && result.warnings.length > 0
        ? ` Let op: ${result.warnings.join(' ')}`
        : '';
      onShowToast?.(`Aanvraag afgewezen voor ${request?.email || request?.name || 'gebruiker'}.${warningText}`, false);
    } catch (err) {
      console.error('Reject access request error:', err);
      onShowToast?.(err?.message || 'Afwijzen van aanvraag mislukt', true);
    } finally {
      setIsRequestActionBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 flex items-start gap-2">
        <Icon name="Info" size={16} className="text-sky-700 mt-0.5" />
        <p className="text-sm text-sky-800">
          OAuth-login geeft niet automatisch toegang. Gebruikers zonder handler-account kunnen toegang aanvragen.
          Keur aanvragen hieronder goed of wijs ze af. Gebruik dit scherm ook voor beheer van status, rollen en
          workflowtoegang.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="UserPlus" size={16} className="text-amber-700" />
            <p className="text-sm font-semibold text-amber-900">
              Toegangsaanvragen ({accessRequests.length})
            </p>
          </div>
          {isLoadingRequests && (
            <span className="text-xs text-amber-800">Laden...</span>
          )}
        </div>

        {accessRequests.length === 0 ? (
          <p className="text-xs text-amber-800">Geen openstaande aanvragen.</p>
        ) : (
          <div className="space-y-3">
            {accessRequests.map((request) => (
              <AccessRequestCard
                key={request?.id}
                request={request}
                onApprove={(item) => handleApproveRequest(item, false)}
                onApproveAdmin={(item) => handleApproveRequest(item, true)}
                onReject={handleRejectRequest}
                disabled={isBusy || isRequestActionBusy}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
        <div className="flex flex-wrap gap-3 flex-1">
          <Input
            type="search"
            placeholder="Zoek op naam, email, telefoon of user_id..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:w-[360px]"
          />

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-border rounded-xl bg-white text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sky-300/30"
          >
            <option value="all">Alle rollen</option>
            <option value="admin">Admin</option>
            <option value="handler">Handler</option>
            <option value="user">User</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-border rounded-xl bg-white text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sky-300/30"
          >
            <option value="all">Alle statussen</option>
            <option value="active">Actief</option>
            <option value="inactive">Inactief</option>
          </select>
        </div>

        <Button
          variant="outline"
          iconName="RefreshCw"
          iconPosition="left"
          onClick={async () => {
            await Promise.allSettled([
              onRefresh?.(),
              loadAccessRequests(),
            ]);
          }}
          disabled={isBusy || isRequestActionBusy}
        >
          Synchroniseer
        </Button>
      </div>

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
                {deleteRetry.assignedTickets} ticket(s) zijn nog gekoppeld. Klik op opnieuw proberen om deze eerst
                automatisch los te koppelen en daarna de handler te verwijderen.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteRetry(null)} disabled={isBusy}>
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

      {filteredUsers.length === 0 ? (
        <div className="text-center py-16 bg-white border border-border rounded-2xl">
          <Icon name="Search" size={48} className="mx-auto mb-4 text-sky-500/50" />
          <p className="text-lg font-medium text-foreground">Geen gebruikers gevonden</p>
          <p className="text-sm text-muted-foreground mt-2">Pas je zoek- of filterinstellingen aan</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredUsers.map((user) => (
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

      {showUserModal && selectedUser && (
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

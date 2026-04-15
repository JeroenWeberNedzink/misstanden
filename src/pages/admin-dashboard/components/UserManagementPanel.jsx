import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import UserModal from '../../../pages/user-management-admin/components/UserModal';
import { ticketService } from '../../../services/ticketService';
import { accessRequestService } from '../../../services/accessRequestService';
import { permissionService } from '../../../services/permissionService';
import {
  ACCESS_CAPABILITY_LABELS,
  buildRoleCapabilityMap,
  computeAccessCapabilities,
  findMatchingAccessProfile,
  getAccessProfiles,
  getRoleMeta,
  summarizeCapabilities,
} from '../../../utils/accessMatrix';

const toUpperRoles = (roles = []) => (Array.isArray(roles) ? roles.map((r) => String(r).toUpperCase()) : []);

const roleTone = (role) => getRoleMeta(role).tone;

const SECTION_CARD_CLASS = 'rounded-2xl border border-border bg-card shadow-sm';

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
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-background text-muted-foreground">
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

const SectionCard = ({ title, description, icon, action = null, children }) => (
  <section className={SECTION_CARD_CLASS}>
    <div className="flex flex-col gap-4 p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted/40">
              <Icon name={icon} size={16} className="text-foreground" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  </section>
);

const MatrixCapability = ({ enabled, label }) => (
  <div className="inline-flex items-center gap-2 text-xs text-foreground">
    <span
      className={[
        'inline-flex h-5 w-5 items-center justify-center rounded-full border',
        enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-muted/40 text-muted-foreground',
      ].join(' ')}
    >
      <Icon name={enabled ? 'Check' : 'Minus'} size={12} />
    </span>
    <span className={enabled ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
  </div>
);

const AccessMatrix = ({ profiles = [], isLoading = false }) => {
  const orderedCapabilities = Object.keys(ACCESS_CAPABILITY_LABELS);

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="hidden lg:grid lg:grid-cols-[minmax(220px,1.15fr)_minmax(220px,1fr)_minmax(320px,1.1fr)] border-b border-border bg-muted/30 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Profiel</span>
        <span>Onderliggende rollen</span>
        <span>Toegang</span>
      </div>

      <div className="divide-y divide-border">
        {profiles.map((profile) => (
          <div key={profile.code} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(220px,1.15fr)_minmax(220px,1fr)_minmax(320px,1.1fr)] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{profile.label}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${profile?.meta?.tone || roleTone(profile?.code)}`}>
                  {profile.shortLabel}
                </span>
                {!profile.selectable && (
                  <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                    Nog niet geactiveerd
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">{profile.recommendation}</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(profile.roles || []).map((roleCode) => {
                const meta = getRoleMeta(roleCode);
                return (
                  <span
                    key={`${profile.code}-${roleCode}`}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${meta.tone}`}
                  >
                    {meta.label}
                  </span>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {orderedCapabilities.map((capabilityKey) => (
                <MatrixCapability
                  key={`${profile.code}-${capabilityKey}`}
                  enabled={Boolean(profile?.capabilities?.[capabilityKey])}
                  label={ACCESS_CAPABILITY_LABELS[capabilityKey]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Rollen en permissies laden...
        </div>
      )}
    </div>
  );
};

const AccessRequestCard = ({ request, approvalProfiles, onApproveProfile, onReject, disabled = false }) => {
  const requestId = String(request?.id || '');
  const name = String(request?.name || '').trim() || 'Onbekende naam';
  const email = String(request?.email || '').trim() || '-';
  const userId = String(request?.userId || request?.user_id || '').trim() || '-';
  const message = String(request?.requestMessage || request?.request_message || '').trim();
  const requestedAt = request?.createdAt || request?.created_at || null;

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{name}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 text-muted-foreground px-2 py-0.5 text-[11px] font-semibold">
              PENDING
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 break-all">{email}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1">
              <Icon name="Fingerprint" size={12} />
              user_id: {userId}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1">
              <Icon name="Clock3" size={12} />
              Aangevraagd op: {formatDateTime(requestedAt)}
            </span>
          </div>
          {message && (
            <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <p className="text-xs font-medium text-foreground">Bericht</p>
              <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{message}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:max-w-[320px] lg:justify-end">
          {(approvalProfiles || []).map((profile) => (
            <Button
              key={`${requestId}-${profile.code}`}
              variant="outline"
              size="sm"
              iconName={profile.code === 'PORTAL_ADMIN' ? 'Shield' : 'UserCheck'}
              iconPosition="left"
              onClick={() => onApproveProfile(request, profile.code)}
              disabled={disabled || !requestId}
            >
              {profile.label}
            </Button>
          ))}
          <Button
            variant="ghost"
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

const UserCard = ({ user, roleCapabilityMap, accessProfiles, onEdit, onDelete, disabled = false }) => {
  const name = user?.name || user?.fullName || user?.username || `User #${user?.id}`;
  const email = user?.email || user?.mail || '-';
  const phone = user?.phone || '-';
  const active = Boolean(user?.isActive ?? user?.active);
  const roles = toUpperRoles(user?.roles || []);
  const permissionsCount = countEnabledPermissions(user?.permissions);
  const capabilities = computeAccessCapabilities({
    roles,
    permissions: user?.permissions,
    roleCapabilityMap,
  });
  const accessProfile = findMatchingAccessProfile(roles, accessProfiles);
  const capabilityLabels = summarizeCapabilities(capabilities).slice(0, 4);

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
        'rounded-2xl border bg-white p-5 transition-all',
        active ? 'border-border hover:shadow-sm' : 'border-border opacity-80',
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
            {accessProfile && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border bg-background text-foreground">
                <Icon name="Shield" size={12} />
                Profiel: {accessProfile.label}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-border bg-background text-muted-foreground">
              <Icon name="Clock3" size={12} />
              Laatste login: {formatLastLogin(user?.lastLogin || user?.last_login)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Telefoon:</span> {phone}
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Permissies:</span> {permissionsCount}
            </div>
            <div className="sm:col-span-2 text-muted-foreground break-all">
              <span className="font-medium text-foreground">user_id:</span> {user?.userId || user?.user_id || '-'}
            </div>
            <div className="sm:col-span-2 text-muted-foreground break-all">
              <span className="font-medium text-foreground">handler_id:</span> {String(user?.id || '-')}
            </div>
          </div>

          {capabilityLabels.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {capabilityLabels.map((label) => (
                <span
                  key={`${user?.id}-${label}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-muted/30 text-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

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
  const [isLoadingRoleMatrix, setIsLoadingRoleMatrix] = useState(false);
  const [isRequestActionBusy, setIsRequestActionBusy] = useState(false);
  const [isGrantBusy, setIsGrantBusy] = useState(false);
  const [accessRequests, setAccessRequests] = useState([]);
  const [roleDetailsByCode, setRoleDetailsByCode] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleteRetry, setDeleteRetry] = useState(null);
  const [grantForm, setGrantForm] = useState({
    email: '',
    name: '',
    accessLevel: 'HANDLER',
    note: '',
  });

  useEffect(() => {
    let cancelled = false;

    const loadRoleDetails = async () => {
      const roleList = Array.isArray(roles) ? roles : [];
      if (roleList.length === 0) {
        setRoleDetailsByCode({});
        return;
      }

      try {
        setIsLoadingRoleMatrix(true);
        const entries = await Promise.all(
          roleList.map(async (role) => {
            const code = String(role?.code || '').trim().toUpperCase();
            if (!code || !role?.id) {
              return [code, role];
            }

            try {
              const details = await permissionService.getRoleWithPermissions(role.id);
              return [code, { ...role, ...details }];
            } catch (error) {
              console.warn(`[UserManagementPanel] Failed to load permissions for role ${code}:`, error);
              return [code, role];
            }
          })
        );

        if (!cancelled) {
          const nextByCode = {};
          entries.forEach(([code, role]) => {
            if (code) {
              nextByCode[code] = role;
            }
          });
          setRoleDetailsByCode(nextByCode);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRoleMatrix(false);
        }
      }
    };

    loadRoleDetails().catch((error) => {
      console.error('[UserManagementPanel] Error loading role matrix:', error);
      if (!cancelled) {
        setRoleDetailsByCode({});
        setIsLoadingRoleMatrix(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [roles]);

  const roleCapabilityMap = useMemo(
    () => buildRoleCapabilityMap(roleDetailsByCode),
    [roleDetailsByCode]
  );

  const accessProfiles = useMemo(
    () => getAccessProfiles({ availableRoles: roles, roleDetailsByCode }),
    [roles, roleDetailsByCode]
  );

  const accessProfileByCode = useMemo(
    () =>
      accessProfiles.reduce((acc, profile) => {
        acc[profile.code] = profile;
        return acc;
      }, {}),
    [accessProfiles]
  );

  const approvalProfiles = useMemo(
    () =>
      accessProfiles.filter(
        (profile) => profile.selectable && ['HANDLER', 'PORTAL_ADMIN', 'ADMIN'].includes(profile.code)
      ),
    [accessProfiles]
  );

  const selectedGrantProfile = useMemo(
    () =>
      accessProfileByCode[grantForm.accessLevel]
      || approvalProfiles[0]
      || accessProfiles.find((profile) => profile.selectable)
      || null,
    [grantForm.accessLevel, accessProfileByCode, approvalProfiles, accessProfiles]
  );

  useEffect(() => {
    if (selectedGrantProfile?.code && selectedGrantProfile.code !== grantForm.accessLevel) {
      setGrantForm((prev) => ({ ...prev, accessLevel: selectedGrantProfile.code }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGrantProfile?.code]);

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
        (filterRole === 'portal_admin' && userRoles.includes('PORTAL_ADMIN')) ||
        (filterRole === 'super_admin' && userRoles.includes('SUPER_ADMIN')) ||
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

  const handleApproveRequest = async (request, profileCode = 'HANDLER') => {
    const requestId = String(request?.id || '');
    if (!requestId) return;
    const selectedProfile = accessProfileByCode[profileCode] || accessProfileByCode.HANDLER || null;
    const profileRoles = Array.isArray(selectedProfile?.roles) && selectedProfile.roles.length > 0
      ? selectedProfile.roles
      : ['HANDLER'];

    try {
      setIsRequestActionBusy(true);
      const result = await accessRequestService.approveRequest(requestId, {
        roles: profileRoles,
      });

      setAccessRequests((prev) => prev.filter((item) => String(item?.id || '') !== requestId));
      const warningText = Array.isArray(result?.warnings) && result.warnings.length > 0
        ? ` Let op: ${result.warnings.join(' ')}`
        : '';
      onShowToast?.(
        `${selectedProfile?.label || 'Toegang'} toegekend aan ${request?.email || request?.name || 'gebruiker'}.${warningText}`,
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

  const handleGrantFormChange = (field, value) => {
    setGrantForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDirectGrant = async () => {
    const email = String(grantForm?.email || '').trim();
    const name = String(grantForm?.name || '').trim();
    const note = String(grantForm?.note || '').trim();

    if (!email) {
      onShowToast?.('E-mailadres is verplicht om direct toegang te verlenen.', true);
      return;
    }

    try {
      setIsGrantBusy(true);
      const result = await accessRequestService.grantAccess({
        email,
        name,
        note,
        roles: Array.isArray(selectedGrantProfile?.roles) && selectedGrantProfile.roles.length > 0
          ? selectedGrantProfile.roles
          : ['HANDLER'],
      });

      setGrantForm({
        email: '',
        name: '',
        accessLevel: accessProfileByCode.HANDLER?.code || 'HANDLER',
        note: '',
      });

      const warningText = Array.isArray(result?.warnings) && result.warnings.length > 0
        ? ` Let op: ${result.warnings.join(' ')}`
        : '';
      onShowToast?.(
        `${selectedGrantProfile?.label || 'Toegang'} verleend voor ${email}. De gebruiker kan nu opnieuw inloggen.${warningText}`,
        false
      );

      const refreshTasks = [loadAccessRequests()];
      if (typeof onRefresh === 'function') {
        refreshTasks.push(onRefresh());
      }
      await Promise.allSettled(refreshTasks);
    } catch (err) {
      console.error('Direct grant error:', err);
      onShowToast?.(err?.message || 'Direct toegang verlenen mislukt', true);
    } finally {
      setIsGrantBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card">
          <Icon name="Info" size={16} className="text-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          OAuth-login geeft niet automatisch toegang. Gebruik dit scherm om open aanvragen te beoordelen of direct
          toegang te verlenen op basis van het OAuth e-mailadres van de gebruiker. Kies bij voorkeur
          `Portaalbeheerder` als iemand wel mag beheren maar geen vertrouwelijke tickets mag inzien.
        </p>
      </div>

      <SectionCard
        icon="ShieldCheck"
        title="Rollenmatrix"
        description="Compact overzicht van de bestaande toegangsprofielen. Gebruik bij voorkeur Portaalbeheerder als iemand wel mag beheren maar geen tickets mag lezen."
        action={isLoadingRoleMatrix ? <span className="text-xs text-muted-foreground">Rollen laden...</span> : null}
      >
        <AccessMatrix profiles={accessProfiles} isLoading={isLoadingRoleMatrix} />
      </SectionCard>

      <SectionCard
        icon="UserCheck"
        title="Direct toegang verlenen"
        description="Koppel toegang direct aan het OAuth e-mailadres van de gebruiker. Het gekozen profiel bepaalt of iemand tickets mag zien of alleen portaalbeheer krijgt."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type="email"
            label="OAuth e-mailadres"
            placeholder="naam@nedzink.nl"
            value={grantForm.email}
            onChange={(e) => handleGrantFormChange('email', e.target.value)}
            disabled={isBusy || isRequestActionBusy || isGrantBusy}
          />
          <Input
            type="text"
            label="Naam"
            placeholder="Optioneel"
            value={grantForm.name}
            onChange={(e) => handleGrantFormChange('name', e.target.value)}
            disabled={isBusy || isRequestActionBusy || isGrantBusy}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Toegangsniveau</label>
            <select
              value={grantForm.accessLevel}
              onChange={(e) => handleGrantFormChange('accessLevel', e.target.value)}
              disabled={isBusy || isRequestActionBusy || isGrantBusy}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {accessProfiles
                .filter((profile) => profile.selectable)
                .map((profile) => (
                  <option key={profile.code} value={profile.code}>
                    {profile.label}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Notitie</label>
            <textarea
              value={grantForm.note}
              onChange={(e) => handleGrantFormChange('note', e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Optioneel: interne notitie of bericht voor de gebruiker"
              disabled={isBusy || isRequestActionBusy || isGrantBusy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Onderliggende rollen
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(selectedGrantProfile?.roles || ['HANDLER']).map((roleCode) => {
                const meta = getRoleMeta(roleCode);
                return (
                  <span
                    key={`grant-role-${roleCode}`}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${meta.tone}`}
                  >
                    {meta.label}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {summarizeCapabilities(selectedGrantProfile?.capabilities || {}).map((label) => (
                <span
                  key={`grant-cap-${label}`}
                  className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            iconName="UserCheck"
            iconPosition="left"
            onClick={handleDirectGrant}
            disabled={isBusy || isRequestActionBusy || isGrantBusy || !String(grantForm.email || '').trim()}
          >
            {isGrantBusy ? 'Toegang verlenen...' : 'Toegang verlenen'}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        icon="UserPlus"
        title={`Toegangsaanvragen (${accessRequests.length})`}
        description="Openstaande verzoeken van gebruikers die succesvol via OAuth zijn ingelogd, maar nog geen portaaltoegang hebben."
        action={isLoadingRequests ? <span className="text-xs text-muted-foreground">Laden...</span> : null}
      >
        {accessRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Geen openstaande aanvragen. Gebruik hierboven direct toegang verlenen als je nu al toegang wilt geven.
          </div>
        ) : (
          <div className="space-y-3">
            {accessRequests.map((request) => (
              <AccessRequestCard
                key={request?.id}
                request={request}
                approvalProfiles={approvalProfiles}
                onApproveProfile={handleApproveRequest}
                onReject={handleRejectRequest}
                disabled={isBusy || isRequestActionBusy || isGrantBusy}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <div className={SECTION_CARD_CLASS}>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-3 flex-1">
              <Input
                type="search"
                placeholder="Zoek op naam, email, telefoon of user_id..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full xl:w-[360px]"
              />

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="px-4 py-2 border border-border rounded-xl bg-white text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-sky-300/30"
              >
                <option value="all">Alle rollen</option>
                <option value="portal_admin">Portaalbeheerder</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
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

          <p className="text-sm text-muted-foreground">
            {filteredUsers.length} {filteredUsers.length === 1 ? 'gebruiker' : 'gebruikers'} gevonden
          </p>
        </div>
      </div>

      {deleteRetry && (
        <div className={`${SECTION_CARD_CLASS} border-warning/30`}>
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
                variant="outline"
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
        <div className={`${SECTION_CARD_CLASS} text-center py-16`}>
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
              roleCapabilityMap={roleCapabilityMap}
              accessProfiles={accessProfiles}
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
          roleDetailsByCode={roleDetailsByCode}
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

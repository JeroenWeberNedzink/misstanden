import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { supabase } from '../../../lib/supabase';
import PermissionGuard from '../../../components/auth/PermissionGuard';
import { PERMISSIONS } from '../../../utils/permissions';

const UserTable = ({ users, onEdit, onDelete }) => {
  const [sortKey, setSortKey] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const [ticketCounts, setTicketCounts] = useState({});
  const [workflowCounts, setWorkflowCounts] = useState({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  useEffect(() => {
    const loadCounts = async () => {
      if (!users?.length) return;

      setIsLoadingCounts(true);
      try {
        const handlerIds = users.map((u) => u.id).filter(Boolean);

        const { data: ticketAgg, error: ticketErr } = await supabase
          .rpc('get_ticket_counts_by_handler', { handler_ids: handlerIds });
        if (ticketErr) throw ticketErr;

        const ticketMap = {};
        (ticketAgg || []).forEach((row) => {
          ticketMap[row.handler_id] = Number(row.ticket_count ?? 0);
        });
        setTicketCounts(ticketMap);

        const { data: wfAgg, error: wfErr } = await supabase
          .rpc('get_workflow_counts_by_handler', { handler_ids: handlerIds });
        if (wfErr) throw wfErr;

        const wfMap = {};
        (wfAgg || []).forEach((row) => {
          wfMap[row.handler_id] = Number(row.workflow_count ?? 0);
        });
        setWorkflowCounts(wfMap);
      } catch (e) {
        console.error('Error loading handler stats:', e);
        setTicketCounts({});
        setWorkflowCounts({});
      } finally {
        setIsLoadingCounts(false);
      }
    };

    loadCounts();
  }, [users]);

  const handleSort = (key) => {
    if (sortKey === key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const enrichedUsers = useMemo(() => {
    const base = [...(users || [])].map((u) => ({
      ...u,
      ticketCount: ticketCounts?.[u.id] ?? 0,
      workflowCount: workflowCounts?.[u.id] ?? 0,
    }));

    base.sort((a, b) => {
      const aVal = a?.[sortKey] ?? '';
      const bVal = b?.[sortKey] ?? '';

      if (sortKey === 'ticketCount' || sortKey === 'workflowCount') {
        const aNum = Number(aVal) || 0;
        const bNum = Number(bVal) || 0;
        return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr === bStr) return 0;
      if (sortOrder === 'asc') return aStr > bStr ? 1 : -1;
      return aStr < bStr ? 1 : -1;
    });

    return base;
  }, [users, ticketCounts, workflowCounts, sortKey, sortOrder]);

  const roleLabel = (role) => {
    const labels = { admin: 'Administrator', handler: 'Handler' };
    return labels[role] || (role || '-');
  };

  const permissionTags = (permissions) => {
    const p = permissions || {};
    const tags = [];
    if (p.canViewTickets) tags.push('View');
    if (p.canEditTickets) tags.push('Edit');
    if (p.canDeleteTickets) tags.push('Delete');
    if (p.canManageUsers) tags.push('Users');
    if (p.canExportData) tags.push('Export');
    if (p.canManageWorkflows) tags.push('Workflows');
    return tags;
  };

  const ThButton = ({ k, icon, children, alignRight = false }) => {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => handleSort(k)}
        className={[
          'group inline-flex items-center gap-2 text-xs font-medium',
          'text-muted-foreground hover:text-foreground transition',
          alignRight ? 'justify-end w-full' : '',
        ].join(' ')}
      >
        <Icon name={icon} size={14} className={active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'} />
        <span>{children}</span>
        {active && <Icon name={sortOrder === 'asc' ? 'ChevronUp' : 'ChevronDown'} size={14} />}
      </button>
    );
  };

  if (!users?.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Icon name="Users" size={44} className="mx-auto mb-4 text-muted-foreground opacity-70" />
        <p className="text-muted-foreground mb-1">Geen gebruikers gevonden</p>
        <p className="text-sm text-muted-foreground">Maak een gebruiker aan om te beginnen</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon name="ArrowUpDown" size={14} className="opacity-70" />
          <span>Sorteren: klik op een kolom</span>
          {isLoadingCounts && (
            <span className="ml-2 inline-flex items-center gap-2">
              <Icon name="Loader" size={14} className="animate-spin" />
              Statistieken laden…
            </span>
          )}
        </div>
      </div>

      {/* Table container */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50 border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3">
                  <ThButton k="name" icon="Type">Naam</ThButton>
                </th>
                <th className="px-4 py-3">
                  <ThButton k="email" icon="Mail">Email</ThButton>
                </th>
                <th className="px-4 py-3">
                  <ThButton k="role" icon="Shield">Rol</ThButton>
                </th>
                <th className="px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                </th>
                <th className="px-4 py-3 text-right">
                  <ThButton k="ticketCount" icon="Ticket" alignRight>Tickets</ThButton>
                </th>
                <th className="px-4 py-3 text-right">
                  <ThButton k="workflowCount" icon="GitBranch" alignRight>Workflows</ThButton>
                </th>
                <th className="px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground">Rechten</span>
                </th>
                <th className="px-4 py-3 text-right">
                  <span className="text-xs font-medium text-muted-foreground">Acties</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {enrichedUsers.map((user) => {
                const tags = permissionTags(user.permissions);
                const isActive = Boolean(user.isActive);

                return (
                  <tr
                    key={user.id}
                    className={[
                      'hover:bg-muted/20 transition',
                      !isActive ? 'opacity-70' : '',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="h-9 w-9 rounded-lg border border-border bg-background flex items-center justify-center shrink-0">
                          <Icon name="User" size={16} className="text-muted-foreground" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">
                            {user.name || 'Onbekend'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            ID: {user.id || '-'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-foreground truncate">{user.email || '-'}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs border border-border bg-background text-foreground">
                        {roleLabel(user.role)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-xs">
                        <span
                          className={[
                            'h-1.5 w-1.5 rounded-full',
                            isActive ? 'bg-foreground' : 'bg-muted-foreground',
                          ].join(' ')}
                        />
                        <span className="text-muted-foreground">{isActive ? 'Actief' : 'Inactief'}</span>
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-2 w-full">
                        <Icon name="Ticket" size={14} className="text-muted-foreground opacity-70" />
                        <span className="font-semibold text-foreground">
                          {isLoadingCounts ? '…' : user.ticketCount}
                        </span>
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center justify-end gap-2 w-full">
                        <Icon name="GitBranch" size={14} className="text-muted-foreground opacity-70" />
                        <span className="font-semibold text-foreground">
                          {isLoadingCounts ? '…' : user.workflowCount}
                        </span>
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {tags.length === 0 ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs border border-border bg-background text-muted-foreground">
                          Geen
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-w-[360px]">
                          {tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center px-2 py-1 rounded-md text-xs border border-border bg-background text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                          {tags.length > 4 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs border border-border bg-muted/30 text-muted-foreground">
                              +{tags.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <PermissionGuard permission={PERMISSIONS.MANAGE_USERS}>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            iconName="Edit"
                            iconPosition="left"
                            onClick={() => onEdit(user)}
                          >
                            Bewerk
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            iconName="X"
                            iconPosition="left"
                            onClick={() => onDelete(user.id)}
                            className="border-border text-muted-foreground hover:text-foreground"
                          >
                            Verwijder
                          </Button>
                        </div>
                      </PermissionGuard>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Tiny footer hint */}
        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground bg-background/30">
          Tip: minder “grijs blok” krijg je door je page wrapper op <span className="font-mono">bg-background</span> te houden, en alleen je table container <span className="font-mono">bg-card</span> te geven.
        </div>
      </div>
    </div>
  );
};

export default UserTable;
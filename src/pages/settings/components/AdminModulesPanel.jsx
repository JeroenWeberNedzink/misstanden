import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

import UserManagementPanel from '../../admin-dashboard/components/UserManagementPanel';
import PermissionsManagementPanel from '../../admin-dashboard/components/PermissionsManagementPanel';
import WorkflowManagementPanel from '../../admin-dashboard/components/WorkflowManagementPanel';
import TranslationManagementPanel from '../../admin-dashboard/components/TranslationManagementPanel';
import LoggingPanel from '../../admin-dashboard/components/LoggingPanel';
import SlaBackfillPanel from '../../admin-dashboard/components/SlaBackfillPanel';

import { ticketService } from '../../../services/ticketService';
import { workflowService } from '../../../services/workflowService';
import { permissionService } from '../../../services/permissionService';

const getModuleMeta = (usersCount, rolesCount, workflowsCount) => ({
  users: {
    label: 'Gebruikers',
    icon: 'Users',
    priority: 1,
    description: 'Beheer gebruikersaccounts, rollen en toegangsrechten',
    meta: `${usersCount} gebruikers`,
    color: 'from-sky-500 to-sky-700',
    bgColor: 'bg-card',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700'
  },
  permissions: {
    label: 'Rechten & Rollen',
    icon: 'Key',
    priority: 2,
    description: 'Configureer permissies en beheer rol-gebaseerde toegang',
    meta: `${rolesCount} rollen`,
    color: 'from-sky-500 to-sky-700',
    bgColor: 'bg-card',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700'
  },
  workflows: {
    label: 'Workflows',
    icon: 'GitBranch',
    priority: 3,
    description: 'Bekijk en beheer ticket workflows en processtatistieken',
    meta: `${workflowsCount} workflows`,
    color: 'from-sky-500 to-sky-700',
    bgColor: 'bg-card',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700'
  },
  translations: {
    label: 'Vertalingen',
    icon: 'Languages',
    priority: 4,
    description: 'Beheer meertalige content en i18n vertalingen',
    meta: '4 talen',
    color: 'from-cyan-500 to-blue-600',
    bgColor: 'bg-gradient-to-br from-cyan-50 to-blue-50',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600'
  },
  logging: {
    label: 'Audit Logs',
    icon: 'ScrollText',
    priority: 5,
    description: 'Bekijk database wijzigingen en audit trails',
    meta: 'Database logs',
    color: 'from-orange-500 to-red-600',
    bgColor: 'bg-gradient-to-br from-orange-50 to-red-50',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600'
  },
  slaTools: {
    label: 'SLA Tools',
    icon: 'Clock',
    priority: 6,
    description: 'Eenmalige SLA acties en onderhoud',
    meta: 'Backfill next_step_due',
    color: 'from-sky-500 to-cyan-600',
    bgColor: 'bg-gradient-to-br from-sky-50 to-cyan-50',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600'
  },
});

const AdminModulesPanel = () => {
  const [activeModule, setActiveModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');

  const [users, setUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [workflows, setWorkflows] = useState([]);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const [usersData, permsData, rolesData, workflowsData] = await Promise.all([
        ticketService.getAllHandlers(),
        permissionService.getAllPermissions(),
        permissionService.getAllRoles(),
        workflowService.getWorkflowsWithStats(),
      ]);

      setUsers(usersData || []);
      setPermissions(permsData || []);
      setRoles(rolesData || []);
      setWorkflows(workflowsData || []);
    } catch (err) {
      console.error('Error loading admin data:', err);
      setError('Fout bij laden van gegevens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const showToast = useCallback((message, isError = false) => {
    if (isError) {
      setError(message);
      setTimeout(() => setError(''), 3000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(''), 3000);
    }
  }, []);

  const moduleMeta = useMemo(
    () => getModuleMeta(users.length, roles.length, workflows.length),
    [users.length, roles.length, workflows.length]
  );

  const modules = useMemo(
    () => Object.keys(moduleMeta).sort((a, b) => moduleMeta[a].priority - moduleMeta[b].priority),
    [moduleMeta]
  );

  const activeModuleMeta = activeModule ? moduleMeta[activeModule] : null;

  const filteredUsers = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter(u =>
      [u.name, u.email, u.username, ...(u.roles || [])].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [users, query]);

  const filteredRoles = useMemo(() => {
    if (!query.trim()) return roles;
    const q = query.toLowerCase();
    return roles.filter(r =>
      [r.name, r.code, r.description].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [roles, query]);

  const filteredPermissions = useMemo(() => {
    if (!query.trim()) return permissions;
    const q = query.toLowerCase();
    return permissions.filter(p =>
      [p.name, p.code, p.description, p.category].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [permissions, query]);

  const filteredWorkflows = useMemo(() => {
    if (!query.trim()) return workflows;
    const q = query.toLowerCase();
    return workflows.filter(w =>
      [w.name, w.code, w.description].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [workflows, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-end">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative w-full sm:w-[360px]">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-70">
              <Icon name="Search" size={18} />
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek in admin (naam, rol, permission, workflow)..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-card border border-border text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                aria-label="Clear"
              >
                <Icon name="X" size={18} />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="lg"
            iconName="RefreshCw"
            iconPosition="left"
            onClick={loadAllData}
          >
            Vernieuwen
          </Button>
        </div>
      </div>

      {(error || success) && (
        <div className="space-y-3">
          {error && (
            <div className="p-4 bg-error/10 border border-error/30 rounded-xl flex items-center gap-3">
              <Icon name="AlertCircle" size={20} className="text-error" />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-4 bg-success/10 border border-success/30 rounded-xl flex items-center gap-3">
              <Icon name="CheckCircle" size={20} className="text-success" />
              <p className="text-sm text-success">{success}</p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-8 md:p-10 animate-pulse">
          <div className="h-6 w-48 bg-muted rounded mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={`admin-mod-loading-${idx}`} className="rounded-xl border border-border p-5 bg-background/60">
                <div className="h-5 w-2/3 bg-muted rounded mb-3"></div>
                <div className="h-3 w-full bg-muted/70 rounded mb-2"></div>
                <div className="h-3 w-4/5 bg-muted/70 rounded"></div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-muted-foreground">Admin gegevens laden...</p>
        </div>
      ) : activeModule ? (
        <div className="space-y-4">
          <Button
            variant="outline"
            iconName="ArrowLeft"
            iconPosition="left"
            onClick={() => setActiveModule(null)}
            size="sm"
          >
            Terug naar Modules
          </Button>

          <div className={`rounded-2xl border border-border ${activeModuleMeta?.bgColor || 'bg-card'} shadow-sm`}>
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-16 h-16 rounded-2xl ${activeModuleMeta?.iconBg} flex items-center justify-center shadow-md`}>
                  <Icon name={activeModuleMeta?.icon} size={32} className={activeModuleMeta?.iconColor} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{activeModuleMeta?.label}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{activeModuleMeta?.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-sm text-muted-foreground">{activeModuleMeta?.meta}</span>
                    {query && (
                      <>
                        <span className="text-sm text-muted-foreground">•</span>
                        <span className={`text-sm font-semibold ${activeModuleMeta?.iconColor} bg-white/80 px-2 py-0.5 rounded-full`}>
                          Zoekfilter actief
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={activeModule === 'workflows' ? 'p-4 md:p-5' : 'p-6'}>
              {activeModule === 'users' && (
                <UserManagementPanel
                  users={filteredUsers}
                  roles={roles}
                  workflows={workflows}
                  onRefresh={loadAllData}
                  onShowToast={showToast}
                />
              )}

              {activeModule === 'permissions' && (
                <PermissionsManagementPanel
                  permissions={filteredPermissions}
                  roles={filteredRoles}
                  users={users}
                  onRefresh={loadAllData}
                  onShowToast={showToast}
                />
              )}

              {activeModule === 'workflows' && (
                <WorkflowManagementPanel
                  workflows={filteredWorkflows}
                  users={users}
                  onRefresh={loadAllData}
                  onShowToast={showToast}
                />
              )}

              {activeModule === 'translations' && (
                <TranslationManagementPanel onRefresh={loadAllData} onShowToast={showToast} />
              )}

              {activeModule === 'logging' && (
                <LoggingPanel onShowToast={showToast} />
              )}

              {activeModule === 'slaTools' && (
                <SlaBackfillPanel onShowToast={showToast} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((moduleId) => {
              const meta = moduleMeta[moduleId];

              return (
                <button
                  key={moduleId}
                  onClick={() => setActiveModule(moduleId)}
                  className={`rounded-2xl border border-border hover:border-transparent hover:shadow-xl transition-all duration-300 p-6 text-left group relative overflow-hidden ${meta.bgColor || 'bg-card'}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${meta.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>

                  <div className="flex flex-col gap-4 relative z-10">
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-xl ${meta.iconBg} group-hover:scale-110 flex items-center justify-center transition-transform duration-300 flex-shrink-0 shadow-sm`}>
                        <Icon name={meta.icon} size={28} className={meta.iconColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-lg font-bold text-foreground mb-1 group-hover:${meta.iconColor} transition-colors`}>
                          {meta.label}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {meta.description}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {meta.meta}
                          </span>
                        </div>
                      </div>
                      <Icon name="ChevronRight" size={20} className={`text-muted-foreground group-hover:${meta.iconColor} group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 mt-2`} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {modules.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-16 flex flex-col items-center justify-center gap-3">
              <Icon name="Search" size={48} className="text-muted-foreground/30" />
              <div className="text-sm font-medium text-foreground">Geen modules gevonden</div>
              <div className="text-xs text-muted-foreground">
                Probeer de zoekfilter aan te passen
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminModulesPanel;


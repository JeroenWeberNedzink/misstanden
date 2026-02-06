import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';

// Panels
import UserManagementPanel from './components/UserManagementPanel';
import PermissionsManagementPanel from './components/PermissionsManagementPanel';
import WorkflowManagementPanel from './components/WorkflowManagementPanel';
import TranslationManagementPanel from './components/TranslationManagementPanel';
import LoggingPanel from './components/LoggingPanel';
import SlaBackfillPanel from './components/SlaBackfillPanel';

// Services
import { ticketService } from '../../services/ticketService';
import { workflowService } from '../../services/workflowService';
import { permissionService } from '../../services/permissionService';

const StatCard = ({ label, value, icon, toneClass = 'bg-primary/10 text-primary' }) => (
  <div className="bg-card border border-border rounded-2xl p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-1 truncate">{value}</p>
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${toneClass}`}>
        <Icon name={icon} size={20} />
      </div>
    </div>
  </div>
);

const Pill = ({ children }) => (
  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-muted border border-border text-muted-foreground">
    {children}
  </span>
);

const getModuleMeta = (usersCount, rolesCount, workflowsCount) => ({
  users: {
    label: 'Gebruikers',
    icon: 'Users',
    priority: 1,
    description: 'Beheer gebruikersaccounts, rollen en toegangsrechten',
    meta: `${usersCount} gebruikers`,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600'
  },
  permissions: {
    label: 'Rechten & Rollen',
    icon: 'Key',
    priority: 2,
    description: 'Configureer permissies en beheer rol-gebaseerde toegang',
    meta: `${rolesCount} rollen`,
    color: 'from-purple-500 to-pink-600',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-50',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600'
  },
  workflows: {
    label: 'Workflows',
    icon: 'GitBranch',
    priority: 3,
    description: 'Bekijk en beheer ticket workflows en processtatistieken',
    meta: `${workflowsCount} workflows`,
    color: 'from-green-500 to-emerald-600',
    bgColor: 'bg-gradient-to-br from-green-50 to-emerald-50',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600'
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

const AdminDashboard = () => {
  const [activeModule, setActiveModule] = useState(null); // null shows grid, or 'users' | 'permissions' | 'workflows' | 'translations' | 'logging'
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [query, setQuery] = useState('');

  // Data state
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

  // A few global KPIs so the admin always has “where am I” context
  const activeUsers = users.filter(u => u.isActive || u.active).length;
  const systemPerms = permissions.filter(p => p.isSystem).length;

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

  if (loading) {
    return (
      <AuthContextNavigator>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Icon name="Loader2" size={48} className="animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Admin gegevens laden...</p>
          </div>
        </div>
      </AuthContextNavigator>
    );
  }

  return (
    <>
      <Helmet>
        <title>Admin Dashboard - Misstanden Portal</title>
        <meta name="description" content="Beheer gebruikers, rechten, rollen en workflows" />
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen bg-background">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
            {/* Top Header */}
            <div className="mb-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-3xl md:text-4xl font-bold text-sky-600">
                      Admin Center
                    </h1>
                  </div>
                  <p className="mt-2 text-sm md:text-base text-muted-foreground">
                    Eén plek voor beheer van accounts, toegang en workflows.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  {/* Search */}
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
            </div>

            {/* Global KPI Strip */}
            {/* <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <StatCard label="Gebruikers" value={users.length} icon="Users" />
              <StatCard
                label="Actief"
                value={activeUsers}
                icon="CheckCircle"
                toneClass="bg-success/10 text-success"
              />
              <StatCard
                label="Rollen"
                value={roles.length}
                icon="Shield"
                toneClass="bg-accent/10 text-accent"
              />
              <StatCard
                label="Permissies"
                value={`${permissions.length} (${systemPerms} systeem)`}
                icon="Key"
                toneClass="bg-warning/10 text-warning"
              />
            </div> */}

            {/* Messages */}
            {(error || success) && (
              <div className="mb-6 space-y-3">
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

            {/* Content */}
            {activeModule ? (
              // Show selected module's content
              <div className="space-y-4">
                {/* Back button */}
                <Button
                  variant="outline"
                  iconName="ArrowLeft"
                  iconPosition="left"
                  onClick={() => setActiveModule(null)}
                  size="sm"
                >
                  Terug naar Modules
                </Button>

                {/* Module Content Card */}
                <div className={`rounded-2xl border border-border ${activeModuleMeta?.bgColor || 'bg-card'} shadow-sm`}>
                  {/* Module Header */}
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

                  {/* Module Content Body */}
                  <div className="p-6">
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
                      <TranslationManagementPanel
                        onRefresh={loadAllData}
                        onShowToast={showToast}
                      />
                    )}

                    {activeModule === 'logging' && (
                      <LoggingPanel
                        onShowToast={showToast}
                      />
                    )}

                    {activeModule === 'slaTools' && (
                      <SlaBackfillPanel
                        onShowToast={showToast}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // Show module selection grid
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
                        {/* Gradient overlay on hover */}
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
        </div>
      </AuthContextNavigator>
    </>
  );
};

export default AdminDashboard;

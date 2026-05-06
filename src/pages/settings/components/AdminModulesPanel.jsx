import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const UserManagementPanel = lazy(() => import('../../admin-dashboard/components/UserManagementPanel'));
const WorkflowManagementPanel = lazy(() => import('../../admin-dashboard/components/WorkflowManagementPanel'));
const TranslationManagementPanel = lazy(() => import('../../admin-dashboard/components/TranslationManagementPanel'));
const LoggingPanel = lazy(() => import('../../admin-dashboard/components/LoggingPanel'));
const LocationManagementPanel = lazy(() => import('./LocationManagementPanel'));

import { ticketService } from '../../../services/ticketService';
import { workflowService } from '../../../services/workflowService';
import { permissionService } from '../../../services/permissionService';
import { translationService } from '../../../services/translationService';

const MODULE_ACCENT_STYLES = {
  color: 'from-sky-600 to-sky-700',
  bgColor: 'bg-card',
  iconBg: 'bg-sky-100',
  iconColor: 'text-sky-700',
};

const withModuleAccent = (meta) => ({
  ...meta,
  ...MODULE_ACCENT_STYLES,
});

const metaCount = (count) => (Number.isFinite(count) ? count : '...');

const getModuleMeta = (t, { usersCount, workflowsCount, languagesCount }) => ({
  users: withModuleAccent({
    label: t('settings.adminModules.modules.users.title'),
    icon: 'Users',
    priority: 1,
    description: t('settings.adminModules.modules.users.description'),
    meta: t('settings.adminModules.modules.users.meta', { count: metaCount(usersCount) }),
  }),
  workflows: withModuleAccent({
    label: t('settings.adminModules.modules.workflows.title'),
    icon: 'GitBranch',
    priority: 2,
    description: t('settings.adminModules.modules.workflows.description'),
    meta: t('settings.adminModules.modules.workflows.meta', { count: metaCount(workflowsCount) }),
  }),
  translations: withModuleAccent({
    label: t('settings.adminModules.modules.translations.title'),
    icon: 'Languages',
    priority: 3,
    description: t('settings.adminModules.modules.translations.description'),
    meta: t('settings.adminModules.modules.translations.meta', { count: metaCount(languagesCount) }),
  }),
  locations: withModuleAccent({
    label: t('settings.adminModules.modules.locations.title'),
    icon: 'MapPin',
    priority: 4,
    description: t('settings.adminModules.modules.locations.description'),
    meta: t('settings.adminModules.modules.locations.meta'),
  }),
  logging: withModuleAccent({
    label: t('settings.adminModules.modules.logging.title'),
    icon: 'ScrollText',
    priority: 5,
    description: t('settings.adminModules.modules.logging.description'),
    meta: t('settings.adminModules.modules.logging.meta'),
  }),
});

const AdminModulesPanel = () => {
  const { t } = useTranslation();
  const [activeModule, setActiveModule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [overviewStats, setOverviewStats] = useState({
    users: null,
    workflows: null,
    languages: null,
  });
  const [loadedDatasets, setLoadedDatasets] = useState({
    users: false,
    roles: false,
    workflows: false,
    languages: false,
  });
  const inflightRequestsRef = useRef({
    users: null,
    roles: null,
    workflows: null,
    languages: null,
  });

  const runDatasetRequest = useCallback(async (key, loader, onSuccess, { force = false } = {}) => {
    if (!force && loadedDatasets[key]) {
      return null;
    }
    if (!force && inflightRequestsRef.current[key]) {
      return inflightRequestsRef.current[key];
    }

    const request = (async () => {
      const value = await loader();
      onSuccess(Array.isArray(value) ? value : []);
      setLoadedDatasets((prev) => ({ ...prev, [key]: true }));
      return value;
    })().finally(() => {
      inflightRequestsRef.current[key] = null;
    });

    inflightRequestsRef.current[key] = request;
    return request;
  }, [loadedDatasets]);

  const loadUsers = useCallback(
    (options = {}) =>
      runDatasetRequest(
        'users',
        () => ticketService.getAllHandlers({ enrichPermissions: false, preferApi: true }),
        (value) => {
          const items = Array.isArray(value) ? value : [];
          setUsers(items);
          setOverviewStats((prev) => ({ ...prev, users: items.length }));
        },
        options
      ),
    [runDatasetRequest]
  );

  const loadRoles = useCallback(
    (options = {}) =>
      runDatasetRequest('roles', () => permissionService.getAllRoles(), setRoles, options),
    [runDatasetRequest]
  );

  const loadWorkflows = useCallback(
    (options = {}) =>
      runDatasetRequest(
        'workflows',
        () => workflowService.getWorkflowsWithStats(),
        (value) => {
          const items = Array.isArray(value) ? value : [];
          setWorkflows(items);
          setOverviewStats((prev) => ({ ...prev, workflows: items.length }));
        },
        options
      ),
    [runDatasetRequest]
  );

  const loadLanguages = useCallback(
    (options = {}) =>
      runDatasetRequest(
        'languages',
        () => translationService.getSupportedLanguages(),
        (value) => {
          const items = Array.isArray(value) ? value : [];
          setOverviewStats((prev) => ({ ...prev, languages: items.length }));
        },
        options
      ),
    [runDatasetRequest]
  );

  const loadModuleData = useCallback(async (moduleId, options = {}) => {
    const force = options.force === true;
    const tasks = [];

    if (moduleId === 'users') {
      tasks.push(loadUsers({ force }), loadRoles({ force }), loadWorkflows({ force }));
    } else if (moduleId === 'workflows') {
      tasks.push(loadUsers({ force }), loadWorkflows({ force }));
    }

    if (tasks.length === 0) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      const results = await Promise.allSettled(tasks);
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) {
        setError(t('settings.adminModules.messages.partialLoad', { failed: failed.length, total: results.length }));
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
      setError(t('settings.adminModules.messages.loadError'));
    } finally {
      setLoading(false);
    }
  }, [loadRoles, loadUsers, loadWorkflows, t]);

  const refreshUsersModule = useCallback(() => loadModuleData('users', { force: true }), [loadModuleData]);
  const refreshWorkflowsModule = useCallback(() => loadModuleData('workflows', { force: true }), [loadModuleData]);
  const noopRefresh = useCallback(async () => {}, []);

  useEffect(() => {
    const preloadOverviewData = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const results = await Promise.allSettled([
          loadUsers(),
          loadWorkflows(),
          loadLanguages(),
        ]);

        const failed = results.filter((result) => result.status === 'rejected');
        if (failed.length === 0) {
          return;
        }

        if (attempt === 2) {
          console.error('Failed to preload admin overview stats:', failed);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    };

    preloadOverviewData();
  }, [loadLanguages, loadUsers, loadWorkflows]);

  useEffect(() => {
    if (!activeModule) return;
    loadModuleData(activeModule);
  }, [activeModule, loadModuleData]);

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
    () => getModuleMeta(t, {
      usersCount: overviewStats.users,
      workflowsCount: overviewStats.workflows,
      languagesCount: overviewStats.languages,
    }),
    [overviewStats.languages, overviewStats.users, overviewStats.workflows, t]
  );

  const modules = useMemo(
    () => Object.keys(moduleMeta).sort((a, b) => moduleMeta[a].priority - moduleMeta[b].priority),
    [moduleMeta]
  );

  const activeModuleMeta = activeModule ? moduleMeta[activeModule] : null;

  return (
    <div className="space-y-6">
      {(error || success) && (
        <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-[70] space-y-3 pointer-events-none">
          {error && (
            <div className="bg-destructive text-destructive-foreground px-4 md:px-6 py-3 md:py-4 rounded-lg shadow-xl border border-destructive/40 flex items-center gap-3 animate-in slide-in-from-bottom-5 pointer-events-auto max-w-[min(92vw,560px)]">
              <Icon name="AlertCircle" size={20} />
              <p className="text-sm md:text-base font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-success text-success-foreground px-4 md:px-6 py-3 md:py-4 rounded-lg shadow-xl border border-success/30 flex items-center gap-3 animate-in slide-in-from-bottom-5 pointer-events-auto max-w-[min(92vw,560px)]">
              <Icon name="CheckCircle" size={20} />
              <p className="text-sm md:text-base font-medium">{success}</p>
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
          <p className="mt-6 text-muted-foreground">{t('settings.adminModules.loading')}</p>
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
            {t('settings.adminModules.actions.backToOverview')}
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
                    
                  </div>
                </div>
              </div>
            </div>

            <div className={activeModule === 'workflows' ? 'p-4 md:p-5' : 'p-6'}>
              <Suspense
                fallback={
                  <div className="rounded-xl border border-border bg-background/70 p-5 animate-pulse">
                    <div className="h-4 w-48 bg-muted rounded mb-3"></div>
                    <div className="h-3 w-full bg-muted/70 rounded mb-2"></div>
                    <div className="h-3 w-4/5 bg-muted/70 rounded"></div>
                  </div>
                }
              >
                {activeModule === 'users' && (
                  <UserManagementPanel
                    users={users}
                    roles={roles}
                    workflows={workflows}
                    onRefresh={refreshUsersModule}
                    onShowToast={showToast}
                  />
                )}

                {activeModule === 'workflows' && (
                  <WorkflowManagementPanel
                    workflows={workflows}
                    users={users}
                    onRefresh={refreshWorkflowsModule}
                    onShowToast={showToast}
                  />
                )}

                {activeModule === 'translations' && (
                  <TranslationManagementPanel onRefresh={noopRefresh} onShowToast={showToast} />
                )}

                {activeModule === 'locations' && (
                  <LocationManagementPanel />
                )}

                {activeModule === 'logging' && (
                  <LoggingPanel onShowToast={showToast} />
                )}
              </Suspense>
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
                        <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-sky-700 transition-colors">
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
                      <Icon name="ChevronRight" size={20} className="text-muted-foreground group-hover:text-sky-700 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 mt-2" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {modules.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-16 flex flex-col items-center justify-center gap-3">
              <Icon name="Search" size={48} className="text-muted-foreground/30" />
              <div className="text-sm font-medium text-foreground">{t('settings.adminModules.empty.noModulesFound')}</div>
              <div className="text-xs text-muted-foreground">
                {t('settings.adminModules.empty.tryAdjustFilter')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminModulesPanel;




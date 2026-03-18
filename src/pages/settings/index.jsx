import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { settingsService } from '../../services/SettingsService';
import { useSettings } from '../../contexts/SettingsContext';
import { usePermissions } from '../../hooks/usePermissions';
import { isSuperAdminIdentity } from '../../utils/superAdmin';
import EmailNotificationSettings from './components/EmailNotificationSettings';
import SettingCard from './components/SettingCard';
import AdminModulesPanel from './components/AdminModulesPanel';

const isEqualJson = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
};

const formatCategoryLabel = (category) => {
  return String(category || '')
    .split(/[_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const SETTINGS_ACCENT_STYLES = {
  color: 'from-sky-600 to-sky-700',
  bgColor: 'bg-card',
  iconBg: 'bg-sky-100',
  iconColor: 'text-sky-700',
};

const HIDDEN_SETTING_KEYS = new Set([
  'general.business_hours',
  'general.company_name',
  'portal.enable_registration',
  'portal.enable_public_submissions',
  'compliance.gdpr_compliant',
  // Notifications settings hidden by request.
  'notifications.rate_limit_per_user',
  'notifications.enable_in_app',
  'notifications.batch_digest',
  'notifications.digest_time',
  // Security setting hidden by request.
  'security.api_rate_limit_per_minute',
  // Workflow behaviour is now managed in Admin Center > Workflows.
  'workflow.allow_status_rollback',
  'workflow.auto_assign',
  'workflow.notify_on_assignment',
  'workflow.require_comment_on_status_change',
  // Legacy global SLA defaults: SLA is managed per workflow status now.
  'sla.default_response_hours',
  'sla.default_resolution_hours',
  'tickets.sla_response_time_hours',
  'tickets.sla_resolution_time_hours',
  // Maintenance is managed via dedicated maintenance modal.
  'danger.maintenance_mode',
  'danger.maintenance_message',
  'danger.maintenance_reason',
  'danger.maintenance_window_start',
  'danger.maintenance_window_end',
  'danger.maintenance_eta_minutes',
  'danger.maintenance_contact_note',
]);
const SETTINGS_ONLY_HIDDEN_CATEGORIES = new Set(['locations', 'branding', 'audit']);

const MAINTENANCE_SETTING_DEFS = [
  {
    key: 'danger.maintenance_mode',
    category: 'danger',
    description: 'Enable maintenance mode (blocks non-admin access)',
    defaultValue: false,
  },
  {
    key: 'danger.maintenance_message',
    category: 'danger',
    description: 'Message shown during maintenance',
    defaultValue: 'De portal is tijdelijk niet beschikbaar voor onderhoud.',
  },
  {
    key: 'danger.maintenance_reason',
    category: 'danger',
    description: 'Reason for maintenance window',
    defaultValue: '',
  },
  {
    key: 'danger.maintenance_window_start',
    category: 'danger',
    description: 'Planned maintenance start time',
    defaultValue: '',
  },
  {
    key: 'danger.maintenance_window_end',
    category: 'danger',
    description: 'Planned maintenance end time',
    defaultValue: '',
  },
  {
    key: 'danger.maintenance_eta_minutes',
    category: 'danger',
    description: 'Expected maintenance duration in minutes',
    defaultValue: 0,
  },
  {
    key: 'danger.maintenance_contact_note',
    category: 'danger',
    description: 'Additional maintenance contact details',
    defaultValue: '',
  },
];

const MAINTENANCE_META_BY_KEY = MAINTENANCE_SETTING_DEFS.reduce((acc, def) => {
  acc[def.key] = def;
  return acc;
}, {});

const isVisibleSettingRow = (row) => {
  const key = String(row?.setting_key || '').trim();
  if (!key) return false;
  return !HIDDEN_SETTING_KEYS.has(key);
};

const withSettingsAccent = (meta) => ({
  ...meta,
  ...SETTINGS_ACCENT_STYLES,
});

const getCategoryDisplayMeta = (category, categoryMeta) => {
  if (categoryMeta[category]) return categoryMeta[category];
  return withSettingsAccent({
    label: formatCategoryLabel(category) || category,
    icon: 'Folder',
    priority: 900,
    description: '',
  });
};

const getCategoryMeta = (t) => ({
  general: withSettingsAccent({
    label: t('settings.categories.general'),
    icon: 'Settings',
    priority: 1,
    description: t('settings.categories.generalDescription'),
  }),
  portal: withSettingsAccent({
    label: t('settings.categories.portal'),
    icon: 'Paperclip',
    priority: 2,
    description: t('settings.categories.portalDescription'),
  }),
  workflow: withSettingsAccent({
    label: t('settings.categories.workflow'),
    icon: 'GitBranch',
    priority: 3,
    description: t('settings.categories.workflowDescription'),
  }),
  tickets: withSettingsAccent({
    label: t('settings.categories.tickets', { defaultValue: 'Tickets' }),
    icon: 'FileText',
    priority: 4,
    description: t('settings.categories.ticketsDescription', { defaultValue: 'Ticket intake and handling defaults' }),
  }),
  compliance: withSettingsAccent({
    label: t('settings.categories.compliance', { defaultValue: 'Compliance' }),
    icon: 'ShieldCheck',
    priority: 5,
    description: t('settings.categories.complianceDescription', { defaultValue: 'Audit, retention and privacy compliance settings' }),
  }),
  sla: withSettingsAccent({
    label: t('settings.categories.sla'),
    icon: 'Clock',
    priority: 6,
    description: t('settings.categories.slaDescription'),
  }),
  email_notifications: withSettingsAccent({
    label: t('settings.categories.email_notifications'),
    icon: 'Mail',
    isSpecial: true,
    priority: 7,
    description: t('settings.categories.emailNotificationsDescription'),
  }),
  notifications: withSettingsAccent({
    label: t('settings.categories.notifications'),
    icon: 'Bell',
    priority: 8,
    description: t('settings.categories.notificationsDescription'),
  }),
  security: withSettingsAccent({
    label: t('settings.categories.security'),
    icon: 'ShieldCheck',
    isSpecial: true,
    priority: 9,
    description: t('settings.categories.securityDescription'),
  }),
  audit: withSettingsAccent({
    label: t('settings.categories.audit'),
    icon: 'FileSearch',
    priority: 10,
    description: t('settings.categories.auditDescription'),
  }),
  retention: withSettingsAccent({
    label: t('settings.categories.retention'),
    icon: 'Archive',
    priority: 11,
    description: t('settings.categories.retentionDescription'),
  }),
  danger: withSettingsAccent({
    label: t('settings.categories.danger'),
    icon: 'Zap',
    priority: 12,
    description: t('settings.categories.dangerDescription'),
  }),
  security_bundle: withSettingsAccent({
    label: t('settings.categories.security'),
    icon: 'ShieldCheck',
    isBundle: true,
    priority: 9,
    description: `${t('settings.categories.securityDescription')} · ${t('settings.categories.slaDescription')} · ${t('settings.categories.dangerDescription')} · ${t('settings.categories.retentionDescription')}`,
  }),
  notifications_bundle: withSettingsAccent({
    label: t('settings.categories.notifications'),
    icon: 'Bell',
    isBundle: true,
    priority: 8,
    description: `${t('settings.categories.notificationsDescription')} · ${t('settings.categories.emailNotificationsDescription')}`,
  }),
});

export default function SystemSettingsAdmin() {
  const { t } = useTranslation();
  const location = useLocation();
  const { handlerProfile, roles, loading: permissionsLoading } = usePermissions();
  const currentHandler = handlerProfile || null;
  const { reload: reloadGlobalSettings } = useSettings();
  const canAccessAdvancedSettings = useMemo(
    () =>
      isSuperAdminIdentity({
        roles: handlerProfile?.roles || roles,
        email: handlerProfile?.email,
        sub: handlerProfile?.userId || handlerProfile?.user_id,
      }),
    [handlerProfile?.email, handlerProfile?.roles, handlerProfile?.userId, handlerProfile?.user_id, roles]
  );
  const categoryMeta = useMemo(() => getCategoryMeta(t), [t]);
  const categoryBundles = useMemo(
  () => ([
    { id: 'notifications_bundle', categories: ['email_notifications', 'notifications'] },
    { id: 'security_bundle', categories: ['security', 'sla', 'danger', 'retention'] },
  ]),
  []
);

  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({});
  const [original, setOriginal] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('all'); // 'all', 'security', 'email_notifications'
  const [pageMode, setPageMode] = useState('admin'); // 'settings' | 'admin'
  const [selectedCategory, setSelectedCategory] = useState(null); // For focused category view
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const byCategory = useMemo(() => {
    const map = {};
    for (const r of rows) {
      if (!map[r.category]) map[r.category] = [];
      map[r.category].push(r);
    }
    return map;
  }, [rows]);

  const categories = useMemo(() => {
    const found = Object.keys(byCategory).filter(Boolean);
    const nonBundleMetaKeys = Object.keys(categoryMeta).filter((k) => !categoryMeta[k]?.isBundle);

    const knownFound = nonBundleMetaKeys
      .filter((k) => found.includes(k))
      .sort((a, b) => (categoryMeta[a]?.priority || 999) - (categoryMeta[b]?.priority || 999));

    const unknownFound = found
      .filter((k) => !nonBundleMetaKeys.includes(k))
      .sort((a, b) => a.localeCompare(b));

    const specialWithoutRows = nonBundleMetaKeys
      .filter((k) => categoryMeta[k]?.isSpecial && !found.includes(k))
      .sort((a, b) => (categoryMeta[a]?.priority || 999) - (categoryMeta[b]?.priority || 999));

    const allCategories = [...knownFound, ...unknownFound, ...specialWithoutRows];
    return allCategories.filter((category) => !SETTINGS_ONLY_HIDDEN_CATEGORIES.has(category));
  }, [byCategory, categoryMeta]);

  const bundledCategoryIds = useMemo(() => {
    const ids = new Set();
    categoryBundles.forEach((b) => b.categories.forEach((c) => ids.add(c)));
    return ids;
  }, [categoryBundles]);

  const bundleMetaMap = useMemo(() => {
    const map = new Map();
    categoryBundles.forEach((b) => {
      map.set(b.id, { ...b, meta: categoryMeta[b.id] });
    });
    return map;
  }, [categoryBundles, categoryMeta]);

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;

    const query = searchQuery.toLowerCase();
    return rows.filter(row =>
      row.setting_key.toLowerCase().includes(query) ||
      row.description?.toLowerCase().includes(query) ||
      row.category?.toLowerCase().includes(query)
    );
  }, [rows, searchQuery]);

  const filteredCategories = useMemo(() => {
    if (viewMode === 'security' || viewMode === 'email_notifications') {
      return [viewMode];
    }

    if (!searchQuery.trim()) return categories;

    const categoriesWithResults = new Set(filteredRows.map(r => r.category));
    return categories.filter(cat => categoriesWithResults.has(cat));
  }, [categories, searchQuery, filteredRows, viewMode]);

  const displayCategories = useMemo(() => {
    const base = filteredCategories.filter((c) => !bundledCategoryIds.has(c));
    const categoriesWithResults = new Set(filteredRows.map((r) => r.category));
    const bundlesToShow = categoryBundles.filter((b) => {
      if (!searchQuery.trim()) return true;
      return b.categories.some((c) => categoriesWithResults.has(c));
    }).map((b) => b.id);
    return [...bundlesToShow, ...base];
  }, [filteredCategories, bundledCategoryIds, categoryBundles, filteredRows, searchQuery]);

  const dirtyKeys = useMemo(() => {
    const keys = Object.keys(draft);
    return keys.filter((k) => !isEqualJson(draft[k], original[k]));
  }, [draft, original]);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { rows: dataRows, warning } = await settingsService.getSettings({
        includeSensitive: true,
        requireSuperAdmin: true,
      });
      const allRows = dataRows || [];
      const visibleRows = allRows.filter(isVisibleSettingRow);
      setRows(visibleRows);

      const o = {};
      const d = {};
      for (const r of visibleRows) {
        o[r.setting_key] = r.setting_value;
        d[r.setting_key] = r.setting_value;
      }

      // Keep maintenance values available in draft/original even when hidden from generic cards.
      for (const def of MAINTENANCE_SETTING_DEFS) {
        const fromRow = allRows.find((r) => r.setting_key === def.key);
        const initialValue = fromRow ? fromRow.setting_value : def.defaultValue;
        o[def.key] = initialValue;
        d[def.key] = initialValue;
      }

      setOriginal(o);
      setDraft(d);
      if (warning) {
        setError(`Settings API warning: ${warning}`);
      }
      setHasLoadedSettings(true);
    } catch (e) {
      console.error(e);
      setError(e?.message || t('settings.messages.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const modeParam = new URLSearchParams(location.search).get('mode');
    if (modeParam === 'settings' && canAccessAdvancedSettings) {
      setPageMode('settings');
      return;
    }
    setPageMode('admin');
  }, [canAccessAdvancedSettings, location.search]);

  useEffect(() => {
    if (!canAccessAdvancedSettings || pageMode !== 'settings' || hasLoadedSettings) return;
    load();
  }, [canAccessAdvancedSettings, pageMode, hasLoadedSettings]);

  useEffect(() => {
    if (canAccessAdvancedSettings || pageMode !== 'settings') return;
    setPageMode('admin');
    setSelectedCategory(null);
  }, [canAccessAdvancedSettings, pageMode]);

  const save = async () => {
    if (!dirtyKeys.length) return;
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const changedItems = dirtyKeys.map((key) => {
        const row = rows.find((r) => r.setting_key === key);
        const fallbackMeta = MAINTENANCE_META_BY_KEY[key];
        return {
          settingKey: key,
          value: draft[key],
          category: row?.category || fallbackMeta?.category || 'general',
          description: row?.description ?? fallbackMeta?.description ?? null,
          isSensitive: !!row?.is_sensitive || false,
        };
      });

      await settingsService.upsertSettings(changedItems, {
        updatedBy: currentHandler?.id || currentHandler?.email || currentHandler?.name || null,
        requireSuperAdmin: true,
      });

      await load();
      await reloadGlobalSettings();

      setSuccessMessage(t('settings.messages.saveSuccess'));
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (e) {
      console.error(e);
      setError(e?.message || t('settings.messages.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const resetAll = () => {
    setDraft({ ...original });
  };

  const getDraftPrimitive = (settingKey, fallbackValue) => {
    const value = draft?.[settingKey];
    if (value === undefined || value === null) return fallbackValue;
    if (typeof value === 'object' && !Array.isArray(value) && value && Object.prototype.hasOwnProperty.call(value, 'value')) {
      return value.value;
    }
    return value;
  };

  const setDraftPreserveShape = (settingKey, nextValue) => {
    setDraft((prev) => {
      const current = prev?.[settingKey];
      if (current && typeof current === 'object' && !Array.isArray(current) && Object.prototype.hasOwnProperty.call(current, 'value')) {
        return { ...prev, [settingKey]: { ...current, value: nextValue } };
      }
      return { ...prev, [settingKey]: nextValue };
    });
  };

  const formatMaintenanceDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString('nl-NL');
  };

  const maintenanceModeEnabled = !!getDraftPrimitive('danger.maintenance_mode', false);
  const maintenanceMessage = String(
    getDraftPrimitive('danger.maintenance_message', 'De portal is tijdelijk niet beschikbaar voor onderhoud.') || ''
  );
  const maintenanceReason = String(getDraftPrimitive('danger.maintenance_reason', '') || '');
  const maintenanceWindowStart = String(getDraftPrimitive('danger.maintenance_window_start', '') || '');
  const maintenanceWindowEnd = String(getDraftPrimitive('danger.maintenance_window_end', '') || '');
  const maintenanceEtaMinutes = Number(getDraftPrimitive('danger.maintenance_eta_minutes', 0) || 0);
  const maintenanceContactNote = String(getDraftPrimitive('danger.maintenance_contact_note', '') || '');

  const maintenanceDirtyCount = MAINTENANCE_SETTING_DEFS.filter((def) => {
    try {
      return JSON.stringify(draft[def.key]) !== JSON.stringify(original[def.key]);
    } catch {
      return draft[def.key] !== original[def.key];
    }
  }).length;

  const openMaintenanceModal = () => setMaintenanceModalOpen(true);
  const closeMaintenanceModal = () => setMaintenanceModalOpen(false);

  const handleMaintenanceSave = async () => {
    if (!maintenanceModeEnabled) {
      await save();
      closeMaintenanceModal();
      return;
    }
    const confirmed = window.confirm(
      'Onderhoudsmodus inschakelen blokkeert niet-admin gebruikers. Weet je zeker dat je dit nu wilt activeren?'
    );
    if (!confirmed) return;
    await save();
    closeMaintenanceModal();
  };

  const renderMaintenanceControl = () => (
    <div className="mb-6 rounded-2xl border-2 border-amber-300/70 bg-gradient-to-r from-amber-50 to-red-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <Icon name="AlertTriangle" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Onderhoudsmodus (kritiek)</h3>
            <p className="text-sm text-muted-foreground">
              Beheer waarom, wanneer en hoe lang de portal in onderhoud staat. Dit blokkeert niet-admin gebruikers.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              maintenanceModeEnabled
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}
          >
            {maintenanceModeEnabled ? 'Actief' : 'Uitgeschakeld'}
          </span>
          <Button
            variant={maintenanceModeEnabled ? 'warning' : 'primary'}
            iconName="Settings2"
            iconPosition="left"
            size="sm"
            onClick={openMaintenanceModal}
          >
            Configureer
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-lg border border-amber-200/70 bg-white/80 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Reden</div>
          <div className="mt-1 text-sm text-foreground">{maintenanceReason || '-'}</div>
        </div>
        <div className="rounded-lg border border-amber-200/70 bg-white/80 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Start</div>
          <div className="mt-1 text-sm text-foreground">{formatMaintenanceDate(maintenanceWindowStart)}</div>
        </div>
        <div className="rounded-lg border border-amber-200/70 bg-white/80 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Einde</div>
          <div className="mt-1 text-sm text-foreground">{formatMaintenanceDate(maintenanceWindowEnd)}</div>
        </div>
        <div className="rounded-lg border border-amber-200/70 bg-white/80 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Verwachte duur</div>
          <div className="mt-1 text-sm text-foreground">
            {Number.isFinite(maintenanceEtaMinutes) && maintenanceEtaMinutes > 0 ? `${maintenanceEtaMinutes} min` : '-'}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>{t('settings.pageTitle')}</title>
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen app-page-gradient bg-background -mt-20 pt-24 pb-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2">
                    {t('settings.title')}
                  </h1>
                  <p className="text-muted-foreground">
                    {t('settings.subtitle')}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1">
                  <button
                    onClick={() => setPageMode('admin')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                      pageMode === 'admin' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('settings.tabs.adminCenter')}
                  </button>
                  {canAccessAdvancedSettings && (
                    <button
                      onClick={() => setPageMode('settings')}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                        pageMode === 'settings' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('settings.tabs.settings')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Stats & Actions Bar
            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              Total Settings
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon name="Settings" size={20} className="text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">{rows.length}</div>
                    <div className="text-xs text-muted-foreground">Total Settings</div>
                  </div>
                </div>
              </div>

              Pending Changes
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    dirtyKeys.length > 0 ? 'bg-warning/10' : 'bg-success/10'
                  }`}>
                    <Icon
                      name={dirtyKeys.length > 0 ? 'AlertCircle' : 'CheckCircle'}
                      size={20}
                      className={dirtyKeys.length > 0 ? 'text-warning' : 'text-success'}
                    />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">{dirtyKeys.length}</div>
                    <div className="text-xs text-muted-foreground">Pending Changes</div>
                  </div>
                </div>
              </div>

              Categories
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon name="Folder" size={20} className="text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-foreground">{categories.length}</div>
                    <div className="text-xs text-muted-foreground">Categories</div>
                  </div>
                </div>
              </div>
            </div> */}

            {(!canAccessAdvancedSettings && !permissionsLoading) || pageMode === 'admin' ? (
              <AdminModulesPanel />
            ) : (
              <div>
            {/* Action Bar */}
            <div className="mb-6 flex flex-col md:flex-row gap-3">
              {/* Action Buttons */}
              <div className="flex gap-2 md:ml-auto">
                <Button
                  variant="outline"
                  iconName="RotateCcw"
                  iconPosition="left"
                  onClick={resetAll}
                  disabled={isLoading || isSaving || dirtyKeys.length === 0}
                  size="sm"
                >
                  <span className="hidden sm:inline">{t('settings.actions.resetAll')}</span>
                  <span className="sm:hidden">{t('settings.actions.reset')}</span>
                </Button>

                <Button
                  variant="primary"
                  iconName="Save"
                  iconPosition="left"
                  onClick={save}
                  disabled={isLoading || isSaving || dirtyKeys.length === 0}
                  size="sm"
                  className={dirtyKeys.length > 0 ? 'bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 shadow-md' : ''}
                >
                  {isSaving ? t('settings.saving') : `${t('common.save')} (${dirtyKeys.length})`}
                </Button>
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div className="mb-5 p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3">
                <Icon name="AlertCircle" size={18} />
                <div className="flex-1 text-sm">{error}</div>
                <Button variant="ghost" size="sm" iconName="X" onClick={() => setError('')} />
              </div>
            )}

            {successMessage && (
              <div className="mb-5 p-4 rounded-xl border border-success/30 bg-success/10 text-success flex items-start gap-3">
                <Icon name="CheckCircle" size={18} />
                <div className="flex-1 text-sm">{successMessage}</div>
                <Button variant="ghost" size="sm" iconName="X" onClick={() => setSuccessMessage('')} />
              </div>
            )}

            {/* Content */}
            {isLoading ? (
              <div className="rounded-2xl border border-border bg-card p-8 md:p-10 animate-pulse">
                <div className="h-6 w-56 bg-muted rounded mb-6"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={`settings-loading-${idx}`} className="rounded-xl border border-border p-4 bg-background/60">
                      <div className="h-4 w-2/3 bg-muted rounded mb-3"></div>
                      <div className="h-3 w-full bg-muted/70 rounded mb-2"></div>
                      <div className="h-3 w-4/5 bg-muted/70 rounded"></div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 text-sm text-muted-foreground">{t('settings.messages.loading')}</div>
              </div>
            ) : selectedCategory ? (
              // Show selected category's settings
              <div className="space-y-4">
                {/* Back button */}
                <Button
                  variant="outline"
                  iconName="ArrowLeft"
                  iconPosition="left"
                  onClick={() => setSelectedCategory(null)}
                  size="sm"
                >
                  {t('settings.navigation.backToCategories')}
                </Button>

                {/* Category Header */}
                {(() => {
                  const bundle = bundleMetaMap.get(selectedCategory);
                  if (bundle) {
                    const meta = bundle.meta || { label: selectedCategory, icon: 'Folder' };
                    const allRows = bundle.categories.flatMap((c) => byCategory[c] || []);
                    const changedInBundle = allRows.filter(row => {
                      try {
                        return JSON.stringify(draft[row.setting_key]) !== JSON.stringify(original[row.setting_key]);
                      } catch {
                        return draft[row.setting_key] !== original[row.setting_key];
                      }
                    }).length;

                    return (
                      <div className="space-y-4">
                        <div className={`rounded-2xl border border-border ${meta.bgColor || 'bg-card'} p-6 shadow-sm`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-16 h-16 rounded-2xl ${meta.iconBg} flex items-center justify-center shadow-md`}>
                              <Icon name={meta.icon} size={32} className={meta.iconColor} />
                            </div>
                            <div>
                              <h2 className="text-2xl font-bold text-foreground">{meta.label}</h2>
                              <p className="text-sm text-muted-foreground mb-2">{meta.description}</p>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">
                                  {allRows.length} {allRows.length === 1 ? t('settings.navigation.setting') : t('settings.navigation.settings')}
                                </span>
                                {changedInBundle > 0 && (
                                  <>
                                    <span className="text-sm text-muted-foreground">•</span>
                                    <span className={`text-sm font-semibold ${meta.iconColor} bg-white/80 px-2 py-0.5 rounded-full`}>
                                      {changedInBundle} {t('settings.navigation.modified')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {bundle.categories.map((category) => {
                          const categoryMetaItem = getCategoryDisplayMeta(category, categoryMeta);
                          const categoryRows = (byCategory[category] || []).filter((row) => !MAINTENANCE_META_BY_KEY[row.setting_key]);

                          return (
                            <div key={category} className={`rounded-2xl border border-border ${categoryMetaItem.bgColor || 'bg-card'} p-6 shadow-sm`}>
                              <div className="flex items-center gap-3 mb-4">
                                <div className={`w-12 h-12 rounded-xl ${categoryMetaItem.iconBg} flex items-center justify-center shadow-sm`}>
                                  <Icon name={categoryMetaItem.icon} size={24} className={categoryMetaItem.iconColor} />
                                </div>
                                <h3 className="text-lg font-bold text-foreground">{categoryMetaItem.label}</h3>
                              </div>

                              {category === 'danger' && renderMaintenanceControl()}

                              {category === 'email_notifications' ? (
                                <EmailNotificationSettings />
                              ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {categoryRows.map((row) => (
                                    <SettingCard
                                      key={row.setting_key}
                                      row={row}
                                      draftValue={draft[row.setting_key]}
                                      onChangeDraft={(nextVal) => setDraft((prev) => ({ ...prev, [row.setting_key]: nextVal }))}
                                      isChanged={dirtyKeys.includes(row.setting_key)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  const meta = getCategoryDisplayMeta(selectedCategory, categoryMeta);
                  const categoryRows = (byCategory[selectedCategory] || []).filter((row) => !MAINTENANCE_META_BY_KEY[row.setting_key]);
                  const changedInCategory = categoryRows.filter(row => {
                    try {
                      return JSON.stringify(draft[row.setting_key]) !== JSON.stringify(original[row.setting_key]);
                    } catch {
                      return draft[row.setting_key] !== original[row.setting_key];
                    }
                  }).length;

                  return (
                    <div className={`rounded-2xl border border-border ${meta.bgColor || 'bg-card'} p-6 shadow-sm`}>
                      <div className="flex items-center gap-4 mb-6">
                        <div className={`w-16 h-16 rounded-2xl ${meta.iconBg} flex items-center justify-center shadow-md`}>
                          <Icon name={meta.icon} size={32} className={meta.iconColor} />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-foreground">{meta.label}</h2>
                          <p className="text-sm text-muted-foreground mb-2">{meta.description}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">
                              {categoryRows.length} {categoryRows.length === 1 ? t('settings.navigation.setting') : t('settings.navigation.settings')}
                            </span>
                            {changedInCategory > 0 && (
                              <>
                                <span className="text-sm text-muted-foreground">•</span>
                                <span className={`text-sm font-semibold ${meta.iconColor} bg-white/80 px-2 py-0.5 rounded-full`}>
                                  {changedInCategory} {t('settings.navigation.modified')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Settings Grid */}
                      {selectedCategory === 'danger' && renderMaintenanceControl()}

                      {selectedCategory === 'email_notifications' ? (
                        <EmailNotificationSettings />
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {categoryRows.map((row) => (
                            <SettingCard
                              key={row.setting_key}
                              row={row}
                              draftValue={draft[row.setting_key]}
                              onChangeDraft={(nextVal) => setDraft((prev) => ({ ...prev, [row.setting_key]: nextVal }))}
                              isChanged={dirtyKeys.includes(row.setting_key)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              // Show category selection grid
              <div className="space-y-6">
                {/* <div className="text-center mb-8">
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    Choose a category to manage settings
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Click on any category below to view and edit its settings
                  </p>
                </div> */}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayCategories.map((category) => {
                    const bundle = bundleMetaMap.get(category);
                    const meta = bundle?.meta || getCategoryDisplayMeta(category, categoryMeta);
                    const categoryRows = bundle
                      ? bundle.categories.flatMap((c) => byCategory[c] || [])
                      : (byCategory[category] || []);

                    // Count changed settings in this category
                    const changedInCategory = categoryRows.filter(row => {
                      try {
                        return JSON.stringify(draft[row.setting_key]) !== JSON.stringify(original[row.setting_key]);
                      } catch {
                        return draft[row.setting_key] !== original[row.setting_key];
                      }
                    }).length;

                    // For special categories, show them even if no rows
                    if (bundle || category === 'email_notifications' || categoryRows.length > 0) {
                      return (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
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
                                <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-sky-700 transition-colors">
                                  {meta.label}
                                </h3>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {meta.description}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground">
                                    {(bundle || category === 'email_notifications')
                                      ? t('settings.navigation.clickToConfigure')
                                      : `${categoryRows.length} ${categoryRows.length === 1 ? t('settings.navigation.setting') : t('settings.navigation.settings')}`
                                    }
                                  </span>
                                  {changedInCategory > 0 && (
                                    <>
                                      <span className="text-xs text-muted-foreground">•</span>
                                      <span className={`text-xs font-semibold ${meta.iconColor} bg-white/80 px-2 py-0.5 rounded-full`}>
                                        {changedInCategory} {t('settings.navigation.unsavedChanges')}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <Icon name="ChevronRight" size={20} className="text-muted-foreground group-hover:text-sky-700 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 mt-2" />
                            </div>
                          </div>
                        </button>
                      );
                    }
                    return null;
                  })}
                </div>

                {filteredCategories.length === 0 && (
                  <div className="rounded-2xl border border-border bg-card p-16 flex flex-col items-center justify-center gap-3">
                    <Icon name="Search" size={48} className="text-muted-foreground/30" />
                    <div className="text-sm font-medium text-foreground">{t('settings.empty.noSettingsFound')}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('settings.empty.tryAdjustSearch')}
                    </div>
                  </div>
                )}
              </div>
            )}</div>
            )}
          </div>
        </div>

        {maintenanceModalOpen && (
          <>
            <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm" onClick={closeMaintenanceModal} />
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <div
                className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-amber-50 to-red-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                        <Icon name="AlertTriangle" size={20} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-foreground">Onderhoudsmodus configureren</h3>
                        <p className="text-sm text-muted-foreground">
                          Deze instelling beïnvloedt direct de bereikbaarheid van de portal.
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" iconName="X" onClick={closeMaintenanceModal} />
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Onderhoudsmodus inschakelen</div>
                        <div className="text-xs text-muted-foreground">
                          Blokkeert niet-admin gebruikers en toont onderhoudsbericht.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDraftPreserveShape('danger.maintenance_mode', !maintenanceModeEnabled)}
                        className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 shadow-sm ${
                          maintenanceModeEnabled ? 'bg-gradient-to-r from-red-500 to-rose-600' : 'bg-muted'
                        }`}
                        aria-pressed={maintenanceModeEnabled}
                      >
                        <div
                          className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform absolute top-0.5 ${
                            maintenanceModeEnabled ? 'translate-x-7' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Start onderhoud"
                      type="datetime-local"
                      value={maintenanceWindowStart}
                      onChange={(event) => setDraftPreserveShape('danger.maintenance_window_start', event.target.value)}
                    />
                    <Input
                      label="Einde onderhoud"
                      type="datetime-local"
                      value={maintenanceWindowEnd}
                      onChange={(event) => setDraftPreserveShape('danger.maintenance_window_end', event.target.value)}
                    />
                  </div>

                  <Input
                    label="Verwachte duur (minuten)"
                    type="number"
                    min={0}
                    value={Number.isFinite(maintenanceEtaMinutes) ? String(maintenanceEtaMinutes) : '0'}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setDraftPreserveShape('danger.maintenance_eta_minutes', raw === '' ? 0 : Number(raw));
                    }}
                  />

                  <Input
                    label="Reden"
                    placeholder="Bijv. beveiligingsupdate, database onderhoud, release..."
                    value={maintenanceReason}
                    onChange={(event) => setDraftPreserveShape('danger.maintenance_reason', event.target.value)}
                  />

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Onderhoudsbericht voor gebruikers</label>
                    <textarea
                      className="w-full min-h-[96px] rounded-xl border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={maintenanceMessage}
                      onChange={(event) => setDraftPreserveShape('danger.maintenance_message', event.target.value)}
                      placeholder="Het systeem is tijdelijk niet beschikbaar voor onderhoud. Probeer het later opnieuw."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Extra contactinformatie (optioneel)</label>
                    <textarea
                      className="w-full min-h-[72px] rounded-xl border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={maintenanceContactNote}
                      onChange={(event) => setDraftPreserveShape('danger.maintenance_contact_note', event.target.value)}
                      placeholder="Bijv. ServiceDesk +31..., statuspagina URL, intern contactpunt..."
                    />
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-border bg-background/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {maintenanceDirtyCount > 0
                      ? `${maintenanceDirtyCount} niet-opgeslagen onderhoudswijziging(en)`
                      : 'Geen niet-opgeslagen onderhoudswijzigingen'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={closeMaintenanceModal}>
                      Sluiten
                    </Button>
                    <Button
                      variant="primary"
                      iconName="Save"
                      iconPosition="left"
                      onClick={handleMaintenanceSave}
                      disabled={isSaving || dirtyKeys.length === 0}
                      loading={isSaving}
                      className={maintenanceModeEnabled ? 'bg-red-600 hover:bg-red-700' : ''}
                    >
                      {maintenanceModeEnabled ? 'Opslaan en activeren' : 'Opslaan'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </AuthContextNavigator>
    </>
  );
}










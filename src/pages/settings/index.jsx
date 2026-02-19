import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import { settingsService } from '../../services/SettingsService';
import { useSettings } from '../../contexts/SettingsContext';
import EmailNotificationSettings from './components/EmailNotificationSettings';
import LocationManagementPanel from './components/LocationManagementPanel';
import SettingCard from './components/SettingCard';
import AdminModulesPanel from './components/AdminModulesPanel';

function useCurrentHandler() {
  return { id: 'handler_123', name: 'Jeroen', email: 'jeroen@example.com' };
}

const isEqualJson = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
};

const getCategoryMeta = (t) => ({
  general: {
    label: t('settings.categories.general'),
    icon: 'Settings',
    priority: 1,
    description: t('settings.categories.generalDescription'),
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600'
  },
  portal: {
    label: t('settings.categories.portal'),
    icon: 'LayoutDashboard',
    priority: 2,
    description: t('settings.categories.portalDescription'),
    color: 'from-purple-500 to-pink-600',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-50',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600'
  },
  workflow: {
    label: t('settings.categories.workflow'),
    icon: 'GitBranch',
    priority: 3,
    description: t('settings.categories.workflowDescription'),
    color: 'from-green-500 to-emerald-600',
    bgColor: 'bg-gradient-to-br from-green-50 to-emerald-50',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600'
  },
  sla: {
    label: t('settings.categories.sla'),
    icon: 'Clock',
    priority: 4,
    description: t('settings.categories.slaDescription'),
    color: 'from-orange-500 to-red-600',
    bgColor: 'bg-gradient-to-br from-orange-50 to-red-50',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600'
  },
  email_notifications: {
    label: t('settings.categories.email_notifications'),
    icon: 'Mail',
    isSpecial: true,
    priority: 5,
    description: t('settings.categories.emailNotificationsDescription'),
    color: 'from-cyan-500 to-blue-600',
    bgColor: 'bg-gradient-to-br from-cyan-50 to-blue-50',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-600'
  },
  notifications: {
    label: t('settings.categories.notifications'),
    icon: 'Bell',
    priority: 6,
    description: t('settings.categories.notificationsDescription'),
    color: 'from-yellow-500 to-amber-600',
    bgColor: 'bg-gradient-to-br from-yellow-50 to-amber-50',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600'
  },
  security: {
    label: t('settings.categories.security'),
    icon: 'ShieldCheck',
    isSpecial: true,
    priority: 7,
    description: t('settings.categories.securityDescription'),
    color: 'from-red-500 to-rose-600',
    bgColor: 'bg-gradient-to-br from-red-50 to-rose-50',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600'
  },
  audit: {
    label: t('settings.categories.audit'),
    icon: 'FileSearch',
    priority: 8,
    description: t('settings.categories.auditDescription'),
    color: 'from-violet-500 to-purple-600',
    bgColor: 'bg-gradient-to-br from-violet-50 to-purple-50',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600'
  },
  retention: {
    label: t('settings.categories.retention'),
    icon: 'Archive',
    priority: 9,
    description: t('settings.categories.retentionDescription'),
    color: 'from-slate-500 to-gray-600',
    bgColor: 'bg-gradient-to-br from-slate-50 to-gray-50',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600'
  },
  danger: {
    label: t('settings.categories.danger'),
    icon: 'Zap',
    priority: 10,
    description: t('settings.categories.dangerDescription'),
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-gradient-to-br from-amber-50 to-orange-50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600'
  },
  security_bundle: {
    label: t('settings.categories.security'),
    icon: 'ShieldCheck',
    isBundle: true,
    priority: 7,
    description: `${t('settings.categories.securityDescription')} · ${t('settings.categories.slaDescription')} · ${t('settings.categories.dangerDescription')} · ${t('settings.categories.retentionDescription')}`,
    color: 'from-red-500 to-orange-600',
    bgColor: 'bg-gradient-to-br from-red-50 to-orange-50',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600'
  },
  notifications_bundle: {
    label: t('settings.categories.notifications'),
    icon: 'Bell',
    isBundle: true,
    priority: 6,
    description: `${t('settings.categories.notificationsDescription')} · ${t('settings.categories.emailNotificationsDescription')}`,
    color: 'from-yellow-500 to-cyan-600',
    bgColor: 'bg-gradient-to-br from-yellow-50 to-cyan-50',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600'
  },
  locations: {
    label: t('settings.categories.locations'),
    icon: 'MapPin',
    isSpecial: true,
    priority: 11,
    description: t('settings.categories.locationsDescription'),
    color: 'from-teal-500 to-emerald-600',
    bgColor: 'bg-gradient-to-br from-teal-50 to-emerald-50',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-600'
  },
});

export default function SystemSettingsAdmin() {
  const { t } = useTranslation();
  const location = useLocation();
  const currentHandler = useCurrentHandler();
  const { reload: reloadGlobalSettings } = useSettings();
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

  const [isLoading, setIsLoading] = useState(true);
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
    const found = Object.keys(byCategory);
    const specialCategories = Object.keys(categoryMeta).filter(k => categoryMeta[k].isSpecial);
    const ordered = Object.keys(categoryMeta)
      .filter((k) => found.includes(k) || specialCategories.includes(k))
      .sort((a, b) => (categoryMeta[a]?.priority || 999) - (categoryMeta[b]?.priority || 999));
    return ordered;
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
      const { rows: dataRows } = await settingsService.getSettings();
      setRows(dataRows);

      const o = {};
      const d = {};
      for (const r of dataRows) {
        o[r.setting_key] = r.setting_value;
        d[r.setting_key] = r.setting_value;
      }
      setOriginal(o);
      setDraft(d);
    } catch (e) {
      console.error(e);
      setError(e?.message || t('settings.messages.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const modeParam = new URLSearchParams(location.search).get('mode');
    if (modeParam === 'settings') {
      setPageMode('settings');
      return;
    }
    setPageMode('admin');
  }, [location.search]);

  const save = async () => {
    if (!dirtyKeys.length) return;
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const changedItems = dirtyKeys.map((key) => {
        const row = rows.find((r) => r.setting_key === key);
        return {
          settingKey: key,
          value: draft[key],
          category: row?.category || 'general',
          description: row?.description ?? null,
          isSensitive: !!row?.is_sensitive,
        };
      });

      await settingsService.upsertSettings(changedItems, {
        updatedBy: currentHandler?.id || currentHandler?.email || currentHandler?.name || null,
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

  return (
    <>
      <Helmet>
        <title>{t('settings.pageTitle')}</title>
      </Helmet>

      <AuthContextNavigator>
        <div className="min-h-screen bg-background py-6 px-4 sm:px-6 lg:px-8 mt-5">
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
                  <button
                    onClick={() => setPageMode('settings')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                      pageMode === 'settings' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('settings.tabs.settings')}
                  </button>
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

            {pageMode === 'admin' ? (
              <AdminModulesPanel />
            ) : (
              <div>
            {/* Search & Action Bar */}
            <div className="mb-6 flex flex-col md:flex-row gap-3">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Icon
                    name="Search"
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="text"
                    placeholder={t('common.search') + '...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted/30 rounded-lg transition-colors"
                    >
                      <Icon name="X" size={14} className="text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  iconName="RefreshCw"
                  iconPosition="left"
                  onClick={load}
                  disabled={isLoading || isSaving}
                  size="sm"
                >
                  <span className="hidden sm:inline">{t('settings.refresh')}</span>
                  <span className="sm:hidden">{t('common.refresh')}</span>
                </Button>

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
                  className={dirtyKeys.length > 0 ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md' : ''}
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
            ) : searchQuery.trim() ? (
              // Show search results across all categories
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                  <Icon name="Search" size={16} />
                  <span>
                    {t(filteredRows.length === 1 ? 'settings.search.result' : 'settings.search.results', { count: filteredRows.length })} {t('settings.search.for')} "<strong>{searchQuery}</strong>"
                  </span>
                </div>
                {filteredCategories.map((category) => {
                  const meta = categoryMeta[category] || { label: category, icon: 'Folder' };
                  const categoryRows = filteredRows.filter(r => r.category === category);

                  if (categoryRows.length === 0) return null;

                  return (
                    <div key={category} className={`rounded-2xl border border-border ${meta.bgColor || 'bg-card'} p-6 shadow-sm`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-12 h-12 rounded-xl ${meta.iconBg} flex items-center justify-center shadow-sm`}>
                          <Icon name={meta.icon} size={24} className={meta.iconColor} />
                        </div>
                        <h3 className="text-lg font-bold text-foreground">{meta.label}</h3>
                      </div>
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
                    </div>
                  );
                })}
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
                          const categoryMetaItem = categoryMeta[category] || { label: category, icon: 'Folder' };
                          const categoryRows = byCategory[category] || [];

                          return (
                            <div key={category} className={`rounded-2xl border border-border ${categoryMetaItem.bgColor || 'bg-card'} p-6 shadow-sm`}>
                              <div className="flex items-center gap-3 mb-4">
                                <div className={`w-12 h-12 rounded-xl ${categoryMetaItem.iconBg} flex items-center justify-center shadow-sm`}>
                                  <Icon name={categoryMetaItem.icon} size={24} className={categoryMetaItem.iconColor} />
                                </div>
                                <h3 className="text-lg font-bold text-foreground">{categoryMetaItem.label}</h3>
                              </div>

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

                  const meta = categoryMeta[selectedCategory] || { label: selectedCategory, icon: 'Folder' };
                  const categoryRows = byCategory[selectedCategory] || [];
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
                      {selectedCategory === 'email_notifications' ? (
                        <EmailNotificationSettings />
                      ) : selectedCategory === 'locations' ? (
                        <LocationManagementPanel />
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
                    const meta = bundle?.meta || categoryMeta[category] || { label: category, icon: 'Folder' };
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
                    if (bundle || category === 'email_notifications' || category === 'locations' || categoryRows.length > 0) {
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
                                <h3 className={`text-lg font-bold text-foreground mb-1 group-hover:${meta.iconColor} transition-colors`}>
                                  {meta.label}
                                </h3>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {meta.description}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground">
                                    {(bundle || category === 'email_notifications' || category === 'locations')
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
                              <Icon name="ChevronRight" size={20} className={`text-muted-foreground group-hover:${meta.iconColor} group-hover:translate-x-1 transition-all duration-300 flex-shrink-0 mt-2`} />
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
      </AuthContextNavigator>
    </>
  );
}








import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import AuthContextNavigator from '../../components/navigation/AuthContextNavigator';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { settingsService } from '../../services/SettingsService';
import { useSettings } from '../../contexts/SettingsContext';
import EmailNotificationSettings from './components/EmailNotificationSettings';
import TwoFactorAuth from './components/TwoFactorAuth';

// You need a way to know "current handler"
function useCurrentHandler() {
  // TODO: replace with your real auth/session (handlers table)
  return { id: 'handler_123', name: 'Jeroen', email: 'jeroen@example.com' };
}

const safeTrim = (v) => String(v ?? '').trim();

const isEqualJson = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
};

const getCategoryMeta = (t) => ({
  general: { label: t('settings.categories.general'), icon: 'Settings' },
  portal: { label: t('settings.categories.portal'), icon: 'Layout' },
  workflow: { label: t('settings.categories.workflow'), icon: 'Workflow' },
  sla: { label: t('settings.categories.sla'), icon: 'Clock' },
  email_notifications: { label: t('settings.categories.email_notifications'), icon: 'Mail', isSpecial: true },
  notifications: { label: t('settings.categories.notifications'), icon: 'Bell' },
  security: { label: t('settings.categories.security'), icon: 'Shield' },
  audit: { label: t('settings.categories.audit'), icon: 'FileSearch' },
  retention: { label: t('settings.categories.retention'), icon: 'Archive' },
  danger: { label: t('settings.categories.danger'), icon: 'AlertTriangle' },
});

function inferFieldType(settingValue) {
  // You store JSONB. Often it's { value: ... } but could be any JSON.
  // If your values are plain (true/123/"x") this will still work.
  if (typeof settingValue === 'boolean') return 'boolean';
  if (typeof settingValue === 'number') return 'number';
  if (typeof settingValue === 'string') return 'string';

  // common pattern: { value: ... }
  if (settingValue && typeof settingValue === 'object' && 'value' in settingValue) {
    const v = settingValue.value;
    if (typeof v === 'boolean') return 'boolean_value';
    if (typeof v === 'number') return 'number_value';
    if (typeof v === 'string') return 'string_value';
    return 'json';
  }

  return 'json';
}

function maskValue(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(10, s.length - 2))}${s.slice(-2)}`;
}

function SettingRow({ row, draftValue, onChangeDraft }) {
  const { t } = useTranslation();
  const { setting_key, description, is_sensitive } = row;

  const type = inferFieldType(draftValue);

  const title = setting_key.replaceAll('.', ' · ');

  const labelRight = is_sensitive ? (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
      {t('settings.fields.sensitive')}
    </span>
  ) : null;

  // helpers for { value: ... } pattern
  const isWrapped = draftValue && typeof draftValue === 'object' && 'value' in draftValue;
  const getWrapped = () => (isWrapped ? draftValue.value : undefined);
  const setWrapped = (next) => (isWrapped ? { ...draftValue, value: next } : next);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-foreground truncate">{title}</div>
            {labelRight}
          </div>
          {description && (
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {description}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3">
        {/* BOOLEAN */}
        {(type === 'boolean' || type === 'boolean_value') && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">{t('settings.fields.onOff')}</div>
            <button
              type="button"
              onClick={() => {
                const cur = type === 'boolean_value' ? !!getWrapped() : !!draftValue;
                onChangeDraft(type === 'boolean_value' ? setWrapped(!cur) : !cur);
              }}
              className={`w-12 h-6 rounded-full transition-smooth relative ${
                (type === 'boolean_value' ? !!getWrapped() : !!draftValue) ? 'bg-success' : 'bg-border'
              }`}
              aria-pressed={(type === 'boolean_value' ? !!getWrapped() : !!draftValue)}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${
                  (type === 'boolean_value' ? !!getWrapped() : !!draftValue) ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        )}

        {/* NUMBER */}
        {(type === 'number' || type === 'number_value') && (
          <Input
            type="number"
            label={t('settings.fields.value')}
            value={String(type === 'number_value' ? (getWrapped() ?? '') : (draftValue ?? ''))}
            onChange={(e) => {
              const raw = e.target.value;
              const num = raw === '' ? null : Number(raw);
              onChangeDraft(type === 'number_value' ? setWrapped(num) : num);
            }}
          />
        )}

        {/* STRING */}
        {(type === 'string' || type === 'string_value') && (
          <Input
            label={t('settings.fields.value')}
            value={String(type === 'string_value' ? (getWrapped() ?? '') : (draftValue ?? ''))}
            onChange={(e) => {
              const next = e.target.value;
              onChangeDraft(type === 'string_value' ? setWrapped(next) : next);
            }}
            description={is_sensitive ? `${t('settings.fields.currentValue')}: ${maskValue(type === 'string_value' ? getWrapped() : draftValue)}` : null}
          />
        )}

        {/* JSON */}
        {type === 'json' && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {t('settings.fields.jsonAdvanced')}
            </div>
            <textarea
              className="w-full min-h-[120px] rounded-xl border border-border bg-background p-3 text-xs font-mono text-foreground"
              value={
                (() => {
                  try {
                    return JSON.stringify(draftValue ?? {}, null, 2);
                  } catch {
                    return String(draftValue ?? '');
                  }
                })()
              }
              onChange={(e) => {
                const raw = e.target.value;
                try {
                  const parsed = JSON.parse(raw);
                  onChangeDraft(parsed);
                } catch {
                  // keep raw text? safest: do nothing and let user fix JSON
                  // alternatively store a _raw field; for now: ignore invalid JSON
                }
              }}
            />
            {row.is_sensitive && (
              <div className="text-[11px] text-muted-foreground">
                {t('settings.overview.sensitiveHint')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemSettingsAdmin() {
  const { t } = useTranslation();
  const currentHandler = useCurrentHandler();
  const { reload: reloadGlobalSettings } = useSettings();
  const categoryMeta = useMemo(() => getCategoryMeta(t), [t]);

  const [activeCategory, setActiveCategory] = useState('general');

  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState({}); // setting_key -> setting_value
  const [original, setOriginal] = useState({}); // setting_key -> setting_value

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

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
    // Add special categories (not from database)
    const specialCategories = Object.keys(categoryMeta).filter(k => categoryMeta[k].isSpecial);
    // prefer meta ordering if present
    const ordered = Object.keys(categoryMeta).filter((k) => found.includes(k) || specialCategories.includes(k));
    const rest = found.filter((k) => !ordered.includes(k)).sort();
    return [...ordered, ...rest];
  }, [byCategory]);

  const categoryRows = useMemo(() => {
    return (byCategory[activeCategory] || []).slice().sort((a, b) => a.setting_key.localeCompare(b.setting_key));
  }, [byCategory, activeCategory]);

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

      // pick first available category
      const firstCat = dataRows?.[0]?.category;
      if (firstCat) setActiveCategory((prev) => prev || firstCat);
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

  const save = async () => {
    if (!dirtyKeys.length) return;
    setIsSaving(true);
    setError('');
    try {
      const changedItems = dirtyKeys.map((key) => {
        const row = rows.find((r) => r.setting_key === key);
        return {
          settingKey: key,
          value: draft[key],
          category: row?.category || activeCategory,
          description: row?.description ?? null,
          isSensitive: !!row?.is_sensitive,
        };
      });

      await settingsService.upsertSettings(changedItems, {
        updatedBy: currentHandler?.id || currentHandler?.email || currentHandler?.name || null,
      });

      // refresh from server to ensure triggers/updated_at reflect
      await load();

      // Reload global settings context so changes take effect immediately
      await reloadGlobalSettings();
    } catch (e) {
      console.error(e);
      setError(e?.message || t('settings.messages.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const resetCategory = () => {
    const keys = categoryRows.map((r) => r.setting_key);
    setDraft((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = original[k];
      return next;
    });
  };

  const tabBtn = (cat) => {
    const meta = categoryMeta[cat] || { label: cat, icon: 'Folder' };
    const active = activeCategory === cat;
    return (
      <button
        key={cat}
        onClick={() => setActiveCategory(cat)}
        className={[
          'flex items-center gap-2 px-4 py-2 rounded-xl border transition-smooth text-sm',
          active
            ? 'bg-primary/10 border-primary/25 text-primary'
            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/30',
        ].join(' ')}
      >
        <Icon name={meta.icon} size={16} />
        <span className="font-medium">{meta.label}</span>
        <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground">
          {(byCategory[cat] || []).length}
        </span>
      </button>
    );
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
            <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-primary">{t('settings.title')}</h1>
                <p className="text-muted-foreground mt-1">
                  {t('settings.subtitle')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  iconName="RefreshCw"
                  iconPosition="left"
                  onClick={load}
                  disabled={isLoading || isSaving}
                >
                  {t('settings.refresh')}
                </Button>

                <Button
                  variant="outline"
                  iconName="RotateCcw"
                  iconPosition="left"
                  onClick={resetCategory}
                  disabled={isLoading || isSaving || categoryRows.length === 0}
                >
                  {t('settings.resetTab')}
                </Button>

                <Button
                  variant="primary"
                  iconName="Save"
                  iconPosition="left"
                  onClick={save}
                  disabled={isLoading || isSaving || dirtyKeys.length === 0}
                >
                  {isSaving ? t('settings.saving') : `${t('common.save')} (${dirtyKeys.length})`}
                </Button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3">
                <Icon name="AlertCircle" size={18} />
                <div className="flex-1 text-sm">{error}</div>
                <Button variant="ghost" size="sm" iconName="X" onClick={() => setError('')}>
                  {t('settings.close')}
                </Button>
              </div>
            )}

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {categories.map(tabBtn)}
              {!categories.length && (
                <div className="text-sm text-muted-foreground">
                  {t('settings.messages.noSettings')}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Overview card */}
              <div className="lg:col-span-1">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{t('settings.overview.title')}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('settings.overview.currentCategory')}: <span className="font-medium">{(categoryMeta[activeCategory]?.label || activeCategory)}</span>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon name={(categoryMeta[activeCategory]?.icon || 'Settings')} size={18} className="text-primary" />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>{t('settings.overview.settingsCount')}</span>
                      <span className="font-medium text-foreground">{categoryRows.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t('settings.overview.changedCount')}</span>
                      <span className="font-medium text-foreground">{dirtyKeys.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{t('settings.overview.updater')}</span>
                      <span className="font-medium text-foreground truncate max-w-[160px]">
                        {currentHandler?.name || currentHandler?.email || currentHandler?.id}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-xl border border-border bg-muted/20">
                    <div className="text-xs font-semibold text-foreground">{t('settings.overview.tip')}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {t('settings.overview.sensitiveHint')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Settings list */}
              <div className="lg:col-span-2">
                {/* Special: Email Notifications */}
                {activeCategory === 'email_notifications' ? (
                  <EmailNotificationSettings />
                ) : activeCategory === 'security' ? (
                  <div className="space-y-6">
                    {/* 2FA Section */}
                    <TwoFactorAuth />

                    {/* Regular Security Settings */}
                    {isLoading ? (
                      <div className="rounded-2xl border border-border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Icon name="Loader" size={16} className="animate-spin" />
                        {t('settings.messages.loading')}
                      </div>
                    ) : categoryRows.length > 0 && (
                      <div className="space-y-3">
                        {categoryRows.map((row) => (
                          <SettingRow
                            key={row.setting_key}
                            row={row}
                            draftValue={draft[row.setting_key]}
                            onChangeDraft={(nextVal) => {
                              setDraft((prev) => ({ ...prev, [row.setting_key]: nextVal }));
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Save bar */}
                    <div className="mt-6 rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">
                        {dirtyKeys.length ? (
                          <span>
                            <span className="font-medium text-foreground">{dirtyKeys.length}</span> {t('settings.messages.changesPending')}
                          </span>
                        ) : (
                          <span>{t('settings.messages.noChanges')}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={load} disabled={isSaving}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          variant="primary"
                          iconName="Save"
                          iconPosition="left"
                          onClick={save}
                          disabled={isSaving || dirtyKeys.length === 0}
                        >
                          {isSaving ? t('settings.saving') : t('common.save')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : isLoading ? (
                  <div className="rounded-2xl border border-border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Icon name="Loader" size={16} className="animate-spin" />
                    {t('settings.messages.loading')}
                  </div>
                ) : categoryRows.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card p-8 text-center">
                    <Icon name="Sliders" size={40} className="mx-auto mb-3 text-muted-foreground" />
                    <div className="text-sm text-muted-foreground">{t('settings.messages.noSettingsInCategory')}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('settings.messages.addSettings')}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categoryRows.map((row) => (
                      <SettingRow
                        key={row.setting_key}
                        row={row}
                        draftValue={draft[row.setting_key]}
                        onChangeDraft={(nextVal) => {
                          setDraft((prev) => ({ ...prev, [row.setting_key]: nextVal }));
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Save bar - only show for non-special categories */}
                {activeCategory !== 'email_notifications' && (
                  <div className="mt-6 rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      {dirtyKeys.length ? (
                        <span>
                          <span className="font-medium text-foreground">{dirtyKeys.length}</span> {t('settings.messages.changesPending')}
                        </span>
                      ) : (
                        <span>{t('settings.messages.noChanges')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={load} disabled={isSaving}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        variant="primary"
                        iconName="Save"
                        iconPosition="left"
                        onClick={save}
                        disabled={isSaving || dirtyKeys.length === 0}
                      >
                        {isSaving ? t('settings.saving') : t('common.save')}
                      </Button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </AuthContextNavigator>
    </>
  );
}
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';

export const WORKFLOW_RUNTIME_SETTING_DEFS = [
  {
    key: 'workflow.auto_assign',
    label: 'Automatisch toewijzen',
    description: 'Automatisch tickets toewijzen aan handlers.',
    defaultValue: true,
  },
  {
    key: 'workflow.notify_on_assignment',
    label: 'Notificatie bij toewijzing',
    description: 'Stuur notificatie bij toewijzing van ticket.',
    defaultValue: true,
  },
  {
    key: 'workflow.require_comment_on_status_change',
    label: 'Commentaar verplicht bij statuswijziging',
    description: 'Verplicht commentaar bij statuswijziging.',
    defaultValue: true,
  },
];

export const getWorkflowRuntimeDefaultValues = () => {
  const values = {};
  for (const item of WORKFLOW_RUNTIME_SETTING_DEFS) {
    values[item.key] = Boolean(item.defaultValue);
  }
  return values;
};

const asBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return Boolean(fallback);
};

export const normalizeWorkflowRuntimeValue = (rawValue, fallback = false) => {
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && 'value' in rawValue) {
    return asBoolean(rawValue.value, fallback);
  }
  return asBoolean(rawValue, fallback);
};

export default function WorkflowRuntimeSettingsPanel({
  values,
  initialValues,
  isLoading,
  isSaving,
  error,
  successMessage,
  onToggle,
  onSave,
  onReset,
  showStepHeader = false,
  title = null,
  description = null,
  disabled = false,
  emptyStateMessage = null,
}) {
  const { t } = useTranslation();
  const changedCount = useMemo(
    () =>
      WORKFLOW_RUNTIME_SETTING_DEFS.reduce((count, item) => {
        const current = asBoolean(values?.[item.key], item.defaultValue);
        const initial = asBoolean(initialValues?.[item.key], item.defaultValue);
        return count + (current !== initial ? 1 : 0);
      }, 0),
    [values, initialValues]
  );

  return (
    <div className="bg-white border border-sky-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-sky-100 bg-gradient-to-r from-sky-50/70 to-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {showStepHeader && (
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-sm font-bold inline-flex items-center justify-center">
                  1
                </span>
                <div className="text-base font-bold text-sky-700">
                  {t('workflowConfig.runtimeSettingsStep', { defaultValue: 'Stap 1 - Workflow instellingen' })}
                </div>
              </div>
            )}
            <h3 className="text-base font-semibold text-foreground">
              {title || t('workflowConfig.runtimeSettingsTitle', { defaultValue: 'Workflow instellingen (globaal)' })}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {description || t('workflowConfig.runtimeSettingsDescription', {
                defaultValue: 'Deze instellingen gelden voor alle workflows.',
              })}
            </p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700">
            {changedCount > 0
              ? t('workflowConfig.changesCount', { count: changedCount, defaultValue: `${changedCount} gewijzigd` })
              : t('workflowConfig.noChanges', { defaultValue: 'Geen wijzigingen' })}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {disabled && (
          <div className="p-2 rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
            {emptyStateMessage || t('workflowConfig.selectWorkflowFirst', { defaultValue: 'Selecteer eerst een workflow.' })}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center gap-3 py-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-600" />
            <p className="text-sm text-muted-foreground">
              {t('workflowConfig.loadingSettings', { defaultValue: 'Workflow instellingen laden...' })}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {WORKFLOW_RUNTIME_SETTING_DEFS.map((item, index) => {
              const enabled = asBoolean(values?.[item.key], item.defaultValue);
              const isChanged = enabled !== asBoolean(initialValues?.[item.key], item.defaultValue);

              return (
                <div
                  key={item.key}
                  className={[
                    'grid grid-cols-1 md:grid-cols-[1fr_auto] md:items-center gap-2 px-2 py-2.5',
                    isChanged ? 'bg-sky-50/30' : 'bg-white',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-5">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-5">{item.description}</p>
                  </div>
                  <div className="md:justify-self-end">
                    <button
                      type="button"
                      onClick={() => onToggle?.(item.key)}
                      disabled={isSaving || disabled}
                      className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 shadow-sm ${
                        enabled ? 'bg-gradient-to-r from-sky-600 to-sky-700' : 'bg-muted'
                      } ${isSaving || disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                      aria-pressed={enabled}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform absolute top-0.5 ${
                          enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="p-2 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive flex items-start gap-2">
            <Icon name="AlertTriangle" size={16} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-2 rounded-lg border border-emerald-300 bg-emerald-50 text-sm text-emerald-800 flex items-start gap-2">
            <Icon name="CheckCircle2" size={16} className="mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-0.5">
          <Button variant="outline" size="sm" onClick={onReset} disabled={isLoading || isSaving || disabled || changedCount === 0}>
            {t('common.reset', { defaultValue: 'Reset' })}
          </Button>
          <Button size="sm" onClick={onSave} disabled={isLoading || isSaving || disabled || changedCount === 0}>
            {isSaving
              ? t('common.saving', { defaultValue: 'Opslaan...' })
              : t('common.save', { defaultValue: 'Opslaan' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

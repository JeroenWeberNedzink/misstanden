import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import MultiSelect from '../../../components/ui/MultiSelect';
import TimePicker from '../../../components/ui/TimePicker';
import TimezoneSelect from '../../../components/ui/TimezoneSelect';
import LanguageSelect from '../../../components/ui/LanguageSelect';

// File type options for allowed_file_types setting
const FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF (.pdf)', icon: 'FileText' },
  { value: 'jpg', label: 'JPEG (.jpg)', icon: 'Image' },
  { value: 'jpeg', label: 'JPEG (.jpeg)', icon: 'Image' },
  { value: 'png', label: 'PNG (.png)', icon: 'Image' },
  { value: 'gif', label: 'GIF (.gif)', icon: 'Image' },
  { value: 'doc', label: 'Word (.doc)', icon: 'FileText' },
  { value: 'docx', label: 'Word (.docx)', icon: 'FileText' },
  { value: 'xls', label: 'Excel (.xls)', icon: 'FileText' },
  { value: 'xlsx', label: 'Excel (.xlsx)', icon: 'FileText' },
  { value: 'txt', label: 'Text (.txt)', icon: 'FileText' },
  { value: 'csv', label: 'CSV (.csv)', icon: 'FileText' },
  { value: 'zip', label: 'ZIP (.zip)', icon: 'Archive' },
];

function inferFieldType(settingValue, settingKey) {
  // Check for special field types based on setting key
  if (settingKey === 'portal.allowed_file_types') return 'array';
  if (settingKey === 'notifications.digest_time') return 'time';
  if (settingKey === 'portal.timezone') return 'timezone';
  if (settingKey === 'portal.language') return 'language';

  // Standard type inference
  if (typeof settingValue === 'boolean') return 'boolean';
  if (typeof settingValue === 'number') return 'number';
  if (typeof settingValue === 'string') return 'string';

  if (settingValue && typeof settingValue === 'object' && 'value' in settingValue) {
    const v = settingValue.value;

    // Check if wrapped value is an array
    if (Array.isArray(v)) return 'array_value';

    if (typeof v === 'boolean') return 'boolean_value';
    if (typeof v === 'number') return 'number_value';
    if (typeof v === 'string') return 'string_value';
    return 'json';
  }

  // Check if unwrapped array
  if (Array.isArray(settingValue)) return 'array';

  return 'json';
}

function maskValue(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(10, s.length - 2))}${s.slice(-2)}`;
}

export default function SettingCard({ row, draftValue, onChangeDraft, isChanged }) {
  const { t } = useTranslation();
  const { setting_key, description, is_sensitive } = row;
  const [isExpanded, setIsExpanded] = useState(false);

  const type = inferFieldType(draftValue, setting_key);
  const title = setting_key.split('.').pop().replace(/_/g, ' ');
  const category = setting_key.split('.')[0];

  const isWrapped = draftValue && typeof draftValue === 'object' && 'value' in draftValue;
  const getWrapped = () => (isWrapped ? draftValue.value : undefined);
  const setWrapped = (next) => (isWrapped ? { ...draftValue, value: next } : next);

  const currentValue = type === 'boolean_value' || type === 'boolean'
    ? (type === 'boolean_value' ? getWrapped() : draftValue)
    : type === 'number_value' || type === 'number'
    ? (type === 'number_value' ? getWrapped() : draftValue)
    : type === 'string_value' || type === 'string'
    ? (type === 'string_value' ? getWrapped() : draftValue)
    : type === 'array_value'
    ? (getWrapped() || [])
    : type === 'array'
    ? (draftValue || [])
    : draftValue;

  return (
    <div className={`rounded-xl border transition-all ${
      isChanged
        ? 'border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10 shadow-md ring-1 ring-primary/20'
        : 'border-border bg-card hover:border-primary/30 hover:shadow-md'
    }`}>
      <div className="p-4">
        {/* Boolean settings - Always show toggle prominently */}
        {(type === 'boolean' || type === 'boolean_value') ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-semibold text-foreground capitalize">
                  {title}
                </h3>
                {isChanged && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                    Modified
                  </span>
                )}
              </div>
              {description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                const cur = type === 'boolean_value' ? !!getWrapped() : !!draftValue;
                onChangeDraft(type === 'boolean_value' ? setWrapped(!cur) : !cur);
              }}
              className={`w-14 h-7 rounded-full transition-all relative flex-shrink-0 shadow-sm ${
                currentValue ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-muted'
              }`}
              aria-pressed={currentValue}
            >
              <div
                className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform absolute top-0.5 ${
                  currentValue ? 'translate-x-7' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ) : (
          // Non-boolean settings
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-foreground capitalize">
                    {title}
                  </h3>
                  {is_sensitive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 flex-shrink-0">
                      {t('settings.fields.sensitive')}
                    </span>
                  )}
                  {isChanged && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                      Modified
                    </span>
                  )}
                </div>
                {description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                )}
              </div>

              {/* Expand Button */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-muted/30 rounded-lg transition-colors flex-shrink-0"
              >
                <Icon
                  name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
                  size={18}
                  className="text-muted-foreground"
                />
              </button>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-border">
            {/* FILE TYPES (ARRAY) */}
            {(type === 'array' || type === 'array_value') && setting_key === 'portal.allowed_file_types' && (
              <MultiSelect
                label={t('settings.fields.allowedFileTypes', 'Allowed File Types')}
                description={t('settings.fields.allowedFileTypesDesc', 'Select which file types users can upload')}
                options={FILE_TYPE_OPTIONS}
                value={currentValue || []}
                onChange={(next) => {
                  onChangeDraft(type === 'array_value' ? setWrapped(next) : next);
                }}
              />
            )}

            {/* TIME PICKER */}
            {setting_key === 'notifications.digest_time' && (
              <TimePicker
                label={t('settings.fields.digestTime', 'Digest Time')}
                description={t('settings.fields.digestTimeDesc', 'Time to send daily digest emails (24-hour format)')}
                value={currentValue || '09:00'}
                onChange={(next) => {
                  onChangeDraft(type === 'string_value' ? setWrapped(next) : next);
                }}
              />
            )}

            {/* TIMEZONE SELECT */}
            {setting_key === 'portal.timezone' && (
              <TimezoneSelect
                label={t('settings.fields.timezone', 'Timezone')}
                description={t('settings.fields.timezoneDesc', 'Default timezone for the portal')}
                value={currentValue || 'Europe/Amsterdam'}
                onChange={(next) => {
                  onChangeDraft(type === 'string_value' ? setWrapped(next) : next);
                }}
              />
            )}

            {/* LANGUAGE SELECT */}
            {setting_key === 'portal.language' && (
              <LanguageSelect
                label={t('settings.fields.language', 'Language')}
                description={t('settings.fields.languageDesc', 'Default language for the portal')}
                value={currentValue || 'nl'}
                onChange={(next) => {
                  onChangeDraft(type === 'string_value' ? setWrapped(next) : next);
                }}
              />
            )}

            {/* NUMBER */}
            {(type === 'number' || type === 'number_value') && (
              <Input
                type="number"
                label={t('settings.fields.value')}
                value={String(currentValue ?? '')}
                onChange={(e) => {
                  const raw = e.target.value;
                  const num = raw === '' ? null : Number(raw);
                  onChangeDraft(type === 'number_value' ? setWrapped(num) : num);
                }}
              />
            )}

            {/* STRING (for non-special cases) */}
            {(type === 'string' || type === 'string_value') &&
              setting_key !== 'notifications.digest_time' &&
              setting_key !== 'portal.timezone' &&
              setting_key !== 'portal.language' && (
              <Input
                label={t('settings.fields.value')}
                value={String(currentValue ?? '')}
                onChange={(e) => {
                  const next = e.target.value;
                  onChangeDraft(type === 'string_value' ? setWrapped(next) : next);
                }}
                description={is_sensitive ? `${t('settings.fields.currentValue')}: ${maskValue(currentValue)}` : null}
              />
            )}

            {/* JSON */}
            {type === 'json' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  {t('settings.fields.jsonAdvanced')}
                </label>
                <textarea
                  className="w-full min-h-[120px] rounded-xl border border-border bg-background p-3 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                      // Invalid JSON - ignore
                    }
                  }}
                />
              </div>
            )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

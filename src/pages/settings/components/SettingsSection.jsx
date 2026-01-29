import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import SettingCard from './SettingCard';

export default function SettingsSection({
  category,
  label,
  icon,
  rows,
  draft,
  original,
  onChangeDraft,
  defaultExpanded = false
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const changedKeys = rows.filter(row => {
    const key = row.setting_key;
    try {
      return JSON.stringify(draft[key]) !== JSON.stringify(original[key]);
    } catch {
      return draft[key] !== original[key];
    }
  });

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon name={icon} size={20} className="text-primary" />
          </div>
          <div className="text-left">
            <h2 className="text-lg font-bold text-foreground">{label}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {rows.length} {rows.length === 1 ? 'setting' : 'settings'}
              </span>
              {changedKeys.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs font-medium text-primary">
                    {changedKeys.length} modified
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <Icon
          name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
          size={20}
          className="text-muted-foreground flex-shrink-0"
        />
      </button>

      {/* Content - 2 Column Grid on medium screens and up */}
      {isExpanded && (
        <div className="p-4 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((row) => (
            <SettingCard
              key={row.setting_key}
              row={row}
              draftValue={draft[row.setting_key]}
              onChangeDraft={(nextVal) => onChangeDraft(row.setting_key, nextVal)}
              isChanged={changedKeys.some(r => r.setting_key === row.setting_key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

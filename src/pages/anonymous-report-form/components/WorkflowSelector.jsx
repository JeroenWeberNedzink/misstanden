import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const safeTrim = (v) => String(v ?? '').trim();
const safeLower = (v) => String(v ?? '').toLowerCase();

/**
 * Tailwind-safe color mapping for workflow.color_scheme.
 * Because Tailwind can't generate dynamic classnames from strings at runtime,
 * we map "sky | indigo | amber | ..." to concrete classes.
 *
 * Add more schemes as needed (just once here).
 */
const COLOR_SCHEMES = {
  sky: {
    ringSelected: 'ring-sky-500',
    borderSelected: 'border-sky-500',
    bgSelected: 'bg-sky-50',
    iconWrapSelected: 'bg-sky-500',
    iconWrap: 'bg-sky-50',
    iconColor: 'var(--color-sky-600)',
    titleSelected: 'text-sky-700',
    pill: 'bg-sky-100 text-sky-800',
  },
  indigo: {
    ringSelected: 'ring-indigo-500',
    borderSelected: 'border-indigo-500',
    bgSelected: 'bg-indigo-50',
    iconWrapSelected: 'bg-indigo-500',
    iconWrap: 'bg-indigo-50',
    iconColor: 'var(--color-indigo-600)',
    titleSelected: 'text-indigo-700',
    pill: 'bg-indigo-100 text-indigo-800',
  },
  amber: {
    ringSelected: 'ring-amber-500',
    borderSelected: 'border-amber-500',
    bgSelected: 'bg-amber-50',
    iconWrapSelected: 'bg-amber-500',
    iconWrap: 'bg-amber-50',
    iconColor: 'var(--color-amber-700)',
    titleSelected: 'text-amber-800',
    pill: 'bg-amber-100 text-amber-900',
  },
  rose: {
    ringSelected: 'ring-rose-500',
    borderSelected: 'border-rose-500',
    bgSelected: 'bg-rose-50',
    iconWrapSelected: 'bg-rose-500',
    iconWrap: 'bg-rose-50',
    iconColor: 'var(--color-rose-600)',
    titleSelected: 'text-rose-700',
    pill: 'bg-rose-100 text-rose-800',
  },
  teal: {
    ringSelected: 'ring-teal-500',
    borderSelected: 'border-teal-500',
    bgSelected: 'bg-teal-50',
    iconWrapSelected: 'bg-teal-500',
    iconWrap: 'bg-teal-50',
    iconColor: 'var(--color-teal-600)',
    titleSelected: 'text-teal-700',
    pill: 'bg-teal-100 text-teal-800',
  },
  slate: {
    ringSelected: 'ring-slate-400',
    borderSelected: 'border-slate-400',
    bgSelected: 'bg-slate-50',
    iconWrapSelected: 'bg-slate-600',
    iconWrap: 'bg-slate-100',
    iconColor: 'var(--color-slate-600)',
    titleSelected: 'text-slate-700',
    pill: 'bg-slate-100 text-slate-700',
  },
};

const getScheme = (colorScheme) => {
  const key = safeLower(colorScheme || 'sky');
  return COLOR_SCHEMES[key] || COLOR_SCHEMES.sky;
};

/**
 * Best-effort icon resolution:
 * - DB stores lucide icon names in icon_name (e.g. "clipboard-list", "shield", "alert-triangle")
 * - Your <Icon /> likely expects PascalCase (e.g. "ClipboardList")
 */
const toIconName = (iconNameDb) => {
  const raw = safeTrim(iconNameDb);
  if (!raw) return 'ClipboardList';

  // Convert "clipboard-list" / "alert_triangle" -> "ClipboardList"
  const parts = raw.split(/[-_ ]+/g).filter(Boolean);
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return pascal || 'ClipboardList';
};

const WorkflowSelector = ({ value, onChange, workflows, error }) => {
  const { t } = useTranslation();

  const items = useMemo(() => {
    const list = Array.isArray(workflows) ? workflows : [];
    return [...list]
      .filter((wf) => wf && safeTrim(wf.code))
      .sort((a, b) => {
        const ao = Number.isFinite(Number(a.display_order)) ? Number(a.display_order) : 9999;
        const bo = Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : 9999;
        if (ao !== bo) return ao - bo;
        return String(a.name || '').localeCompare(String(b.name || ''), 'nl', { sensitivity: 'base' });
      });
  }, [workflows]);

  // Dynamic grid columns based on number of workflows
  const getGridClass = () => {
    const count = items.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    // For 4 or more, use 2 cols on md, 3 on lg, 4 on xl
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  return (
    <div className="m-1">
      <div className={`grid ${getGridClass()} gap-4`}>
        {items.map((workflow) => {
          const code = safeTrim(workflow?.code);
          const isSelected = value === code;
          const isActive = workflow?.active !== false;

          const scheme = getScheme(workflow?.color_scheme);
          const iconName = toIconName(workflow?.icon_name);

          return (
            <button
              key={workflow?.id || code}
              type="button"
              onClick={() => isActive && onChange?.(code)}
              disabled={!isActive}
              className={[
                'relative p-5 rounded-xl border transition-all duration-200 text-left',
                'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
                isSelected
                  ? `${scheme.borderSelected} ${scheme.bgSelected} ring-2 ${scheme.ringSelected}`
                  : 'border-border hover:border-foreground/20 bg-card',
                !isActive ? 'opacity-50 cursor-not-allowed hover:shadow-none' : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <div
                  className={[
                    'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-200',
                    isSelected ? scheme.iconWrapSelected : scheme.iconWrap,
                  ].join(' ')}
                >
                  <Icon
                    name={iconName}
                    size={20}
                    color={isSelected ? '#FFFFFF' : scheme.iconColor}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={['font-semibold truncate', isSelected ? scheme.titleSelected : 'text-foreground'].join(' ')}>
                      {workflow?.name || code}
                    </h4>

                    {!isActive && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {t('common.inactive')}
                      </span>
                    )}
                  </div>

                  {workflow?.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {workflow.description}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {t('reportForm.noDescription') || 'Geen beschrijving beschikbaar'}
                    </p>
                  )}
                  
                </div>
              </div>

              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-foreground flex items-center justify-center">
                  <Icon name="Check" size={12} color="#FFFFFF" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </div>
  );
};

export default WorkflowSelector;
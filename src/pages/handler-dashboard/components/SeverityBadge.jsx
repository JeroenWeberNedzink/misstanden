import React from 'react';
import Icon from '../../../components/AppIcon';
import { useTranslation } from 'react-i18next';

const safeLower = (v) => String(v ?? '').toLowerCase().trim();

const colorToDotClass = (color) => {
  const c = safeLower(color);

  if (c === 'green') return 'bg-success';
  if (c === 'yellow') return 'bg-warning';
  if (c === 'red') return 'bg-destructive';
  if (c === 'orange') return 'bg-orange-500';
  if (c === 'blue') return 'bg-primary';
  if (c === 'indigo') return 'bg-indigo-500';
  if (c === 'purple') return 'bg-purple-500';
  if (c === 'cyan') return 'bg-cyan-500';
  if (c === 'teal') return 'bg-teal-500';
  if (c === 'slate') return 'bg-slate-500';
  if (c === 'gray' || c === 'grey') return 'bg-muted-foreground';

  return 'bg-muted-foreground';
};

const SeverityBadge = ({
  severity,
  size = 'default',

  // ✓ NEW (optional): DB-driven overrides
  label: labelOverride,
  color: colorOverride,
  icon: iconOverride,
}) => {
  const { t } = useTranslation();
  const severityConfig = {
    low: {
      label: t('handlerDashboard.severity.low'),
      icon: 'Info',
      bgColor: 'bg-muted',
      textColor: 'text-muted-foreground',
      iconColor: 'var(--color-muted-foreground)',
    },
    medium: {
      label: t('handlerDashboard.severity.medium'),
      icon: 'AlertTriangle',
      bgColor: 'bg-warning/10',
      textColor: 'text-warning',
      iconColor: 'var(--color-warning)',
    },
    high: {
      label: t('handlerDashboard.severity.high'),
      icon: 'AlertOctagon',
      bgColor: 'bg-error/10',
      textColor: 'text-error',
      iconColor: 'var(--color-error)',
    },
    critical: {
      label: t('handlerDashboard.severity.critical'),
      icon: 'ShieldAlert',
      bgColor: 'bg-destructive/10',
      textColor: 'text-destructive',
      iconColor: 'var(--color-destructive)',
    },
  };

  const normalized = safeLower(severity);
  const config = severityConfig[normalized];
  const isKnown = !!config;

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const iconSize = size === 'sm' ? 14 : 16;

  const displayLabel =
    String(labelOverride ?? '').trim() ||
    (isKnown ? config.label : (severity ? String(severity) : t('handlerDashboard.common.unknown')));

  // If you have DB severity color and it's not one of the standard keys, show neutral + dot
  if (!isKnown && (colorOverride || iconOverride)) {
    const dotClass = colorToDotClass(colorOverride);

    return (
      <span
        className={[
          'inline-flex items-center gap-2 rounded-lg font-medium',
          'bg-muted/40 text-foreground',
          sizeClasses,
        ].join(' ')}
        title={displayLabel}
      >
        {iconOverride ? (
          <Icon name={iconOverride} size={iconSize} color="var(--color-muted-foreground)" />
        ) : (
          <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
        )}
        <span className="truncate max-w-[180px]">{displayLabel}</span>
      </span>
    );
  }

  // Known severities: keep your current look, but allow label/icon override
  const finalConfig = config || severityConfig.low;
  const finalLabel = String(labelOverride ?? '').trim() || finalConfig.label;
  const finalIcon = iconOverride || finalConfig.icon;

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-lg font-medium',
        finalConfig.bgColor,
        finalConfig.textColor,
        sizeClasses,
      ].join(' ')}
      title={finalLabel}
    >
      <Icon name={finalIcon} size={iconSize} color={finalConfig.iconColor} />
      <span className="truncate max-w-[180px]">{finalLabel}</span>
    </span>
  );
};

export default SeverityBadge;

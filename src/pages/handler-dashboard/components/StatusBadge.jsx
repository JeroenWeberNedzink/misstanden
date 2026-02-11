import React from 'react';

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

const StatusBadge = ({
  status,
  size = 'default',
  label: labelOverride,
  color: colorOverride,
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  const displayLabel = String(labelOverride ?? '').trim() || (status ? String(status) : 'Onbekend');
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
      <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
      <span className="truncate max-w-[180px]">{displayLabel}</span>
    </span>
  );
};

export default StatusBadge;

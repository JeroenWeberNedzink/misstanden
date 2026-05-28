import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import { toDateSafe } from '../../../utils/slaUtils';

const toDate = (value) => {
  return toDateSafe(value);
};

const getState = ({ dueAt, doneAt }) => {
  const doneDate = toDate(doneAt);
  if (doneDate) return 'completed';

  const dueDate = toDate(dueAt);
  if (!dueDate) return 'missing';
  if (dueDate.getTime() < Date.now()) return 'overdue';
  return 'upcoming';
};

const isTerminalStatusLabel = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_');

  const hints = [
    'closed',
    'resolved',
    'complete',
    'completed',
    'afgesloten',
    'opgelost',
    'gesloten',
    'afgerond',
    'abgeschlossen',
    'geschlossen',
    'erledigt',
    'cloture',
    'resolu',
    'encerrado',
    'resolvido',
    'finalizado',
  ];

  return hints.some((hint) => normalized.includes(hint));
};

export default function SLACompactCard({ sla, statusLabel, currentStatusDurationDays }) {
  const { t, i18n } = useTranslation();

  if (!sla) return null;

  const formatDate = (value) => {
    const d = toDate(value);
    if (!d) return '-';
    return d.toLocaleString(i18n?.resolvedLanguage || i18n?.language || undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelative = (value) => {
    const d = toDate(value);
    if (!d) return null;

    const diffMs = d.getTime() - Date.now();
    const late = diffMs < 0;
    const totalHours = Math.round(Math.abs(diffMs) / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    const parts = [];
    if (days) parts.push(`${days}${t('caseManagementDetail.sla.dayShort')}`);
    parts.push(`${hours}${t('caseManagementDetail.sla.hourShort')}`);

    return late
      ? t('caseManagementDetail.sla.overdueIn', { time: parts.join(' ') })
      : t('caseManagementDetail.sla.remainingIn', { time: parts.join(' ') });
  };

  const milestones = useMemo(() => {
    const isClosed = Boolean(sla?.isClosed) || isTerminalStatusLabel(statusLabel);
    const closedAt = sla?.closedAt || sla?.statusChangedAt || new Date().toISOString();
    const completedDateText = t('caseManagementDetail.sla.completedAt', {
      date: formatDate(closedAt),
      defaultValue: `Completed at ${formatDate(closedAt)}`,
    });
    const firstResponseDoneAt = sla?.firstResponseAt || (isClosed ? closedAt : null);
    const firstResponseDueText = t('caseManagementDetail.sla.dueBy', { date: formatDate(sla?.firstResponseDueAt) });

    return [
      {
        id: 'first-response',
        label: t('caseManagementDetail.sla.firstResponse'),
        dueAt: sla?.firstResponseDueAt,
        doneAt: firstResponseDoneAt,
        dateText: firstResponseDoneAt
          ? (sla?.firstResponseAt
          ? t('caseManagementDetail.sla.respondedAt', { date: formatDate(sla.firstResponseAt) })
          : completedDateText)
          : firstResponseDueText,
        secondaryDateText: firstResponseDoneAt && !sla?.firstResponseAt ? firstResponseDueText : null,
      },
      {
        id: 'next-step',
        label: t('caseManagementDetail.sla.nextStep'),
        dueAt: sla?.nextStepDueAt,
        doneAt: isClosed ? closedAt : null,
        dateText: isClosed
          ? completedDateText
          : t('caseManagementDetail.sla.expectedBy', { date: formatDate(sla?.nextStepDueAt) }),
        secondaryDateText: isClosed
          ? t('caseManagementDetail.sla.expectedBy', { date: formatDate(sla?.nextStepDueAt) })
          : null,
      },
      {
        id: 'resolution',
        label: t('caseManagementDetail.sla.resolve'),
        dueAt: sla?.resolutionDueAt,
        doneAt: isClosed ? closedAt : null,
        dateText: isClosed
          ? completedDateText
          : t('caseManagementDetail.sla.expectedBy', { date: formatDate(sla?.resolutionDueAt) }),
        secondaryDateText: isClosed
          ? t('caseManagementDetail.sla.expectedBy', { date: formatDate(sla?.resolutionDueAt) })
          : null,
      },
    ].map((item) => {
      const state = getState(item);
      return {
        ...item,
        state,
        relativeText: item.dueAt ? formatRelative(item.dueAt) : null,
      };
    });
  }, [sla, t]);

  const isClosed = Boolean(sla?.isClosed) || isTerminalStatusLabel(statusLabel);
  const hasOverdue = milestones.some((m) => m.state === 'overdue');
  const activeMilestone = milestones.find((m) => m.state === 'upcoming') || null;

  const stateMeta = (state, itemId) => {
    if (state === 'completed') {
      return {
        row: 'border-emerald-300/70 bg-emerald-50',
        badge: 'border border-emerald-200 bg-emerald-100 text-emerald-800',
        iconClass: 'text-emerald-700',
        icon: 'CheckCircle',
        label: t('caseManagementDetail.sla.received'),
      };
    }

    if (state === 'overdue') {
      return {
        row: 'border-red-300/70 bg-red-50',
        badge: 'border border-red-200 bg-red-100 text-red-800',
        iconClass: 'text-red-700',
        icon: 'AlertTriangle',
        label: t('caseManagementDetail.sla.overdue'),
      };
    }

    if (state === 'upcoming') {
      return {
        row: 'border-amber-300/70 bg-amber-50',
        badge: 'border border-amber-200 bg-amber-100 text-amber-800',
        iconClass: 'text-amber-700',
        icon: 'Clock',
        label: itemId === 'first-response'
          ? t('caseManagementDetail.sla.inProgress')
          : t('caseManagementDetail.sla.expected'),
      };
    }

    return {
      row: 'border-border bg-muted/20',
      badge: 'border border-border bg-muted text-muted-foreground',
      iconClass: 'text-muted-foreground',
      icon: 'Clock',
      label: '-',
    };
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-4 border-b border-border bg-muted/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('caseManagementDetail.sla.title')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{statusLabel || t('caseManagementDetail.common.unknown')}</p>
          </div>

          <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${hasOverdue ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'}`}>
            <Icon name={hasOverdue ? 'AlertTriangle' : 'CheckCircle'} size={12} />
            {hasOverdue
              ? t('caseManagementDetail.sla.breached')
              : (isClosed ? t('caseManagementDetail.sla.received') : t('caseManagementDetail.sla.expected'))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-background border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground">
            <Icon name="Timer" size={12} />
            {Number.isFinite(Number(currentStatusDurationDays))
              ? t('caseManagementDetail.sla.slaDays', { count: Number(currentStatusDurationDays) })
              : t('caseManagementDetail.sla.notConfigured')}
          </div>

          {!isClosed && activeMilestone?.relativeText && (
            <div className="inline-flex items-center gap-1 rounded-full bg-warning/15 border border-warning/25 px-2.5 py-1 text-[11px] font-semibold text-warning">
              <Icon name="Clock" size={12} />
              {activeMilestone.relativeText}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {milestones.map((milestone) => {
          const meta = stateMeta(milestone.state, milestone.id);
          return (
            <div key={milestone.id} className={`rounded-xl border px-3 py-2.5 ${meta.row}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 min-w-0">
                  <Icon name={meta.icon} size={14} className={meta.iconClass} />
                  <span className="text-xs font-semibold text-foreground truncate">{milestone.label}</span>
                </div>
                <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
                  {meta.label}
                </span>
              </div>

              <div className="mt-1 text-[11px] text-muted-foreground">{milestone.dateText}</div>
              {milestone.secondaryDateText && (
                <div className="mt-1 text-[11px] text-muted-foreground">{milestone.secondaryDateText}</div>
              )}

              {milestone.state !== 'completed' && milestone.relativeText && (
                <div className="mt-1 text-[11px] font-semibold text-foreground">{milestone.relativeText}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

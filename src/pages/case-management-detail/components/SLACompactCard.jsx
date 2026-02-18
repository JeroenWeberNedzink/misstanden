import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getState = ({ dueAt, doneAt }) => {
  const doneDate = toDate(doneAt);
  if (doneDate) return 'completed';

  const dueDate = toDate(dueAt);
  if (!dueDate) return 'missing';
  if (dueDate.getTime() < Date.now()) return 'overdue';
  return 'upcoming';
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
    return [
      {
        id: 'first-response',
        label: t('caseManagementDetail.sla.firstResponse'),
        dueAt: sla?.firstResponseDueAt,
        doneAt: sla?.firstResponseAt,
        dateText: sla?.firstResponseAt
          ? t('caseManagementDetail.sla.respondedAt', { date: formatDate(sla.firstResponseAt) })
          : t('caseManagementDetail.sla.dueBy', { date: formatDate(sla?.firstResponseDueAt) }),
      },
      {
        id: 'next-step',
        label: t('caseManagementDetail.sla.nextStep'),
        dueAt: sla?.nextStepDueAt,
        doneAt: null,
        dateText: t('caseManagementDetail.sla.expectedBy', { date: formatDate(sla?.nextStepDueAt) }),
      },
      {
        id: 'resolution',
        label: t('caseManagementDetail.sla.resolve'),
        dueAt: sla?.resolutionDueAt,
        doneAt: null,
        dateText: t('caseManagementDetail.sla.expectedBy', { date: formatDate(sla?.resolutionDueAt) }),
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

  const hasOverdue = milestones.some((m) => m.state === 'overdue');
  const activeMilestone = milestones.find((m) => m.state === 'upcoming') || null;
  const hasContact =
    Boolean(sla?.contactPersonName) ||
    Boolean(sla?.contactPersonEmail) ||
    Boolean(sla?.contactPersonPhone) ||
    Boolean(sla?.contactNotes);

  const stateMeta = (state, itemId) => {
    if (state === 'completed') {
      return {
        row: 'border-success/25 bg-success/5',
        badge: 'bg-success/15 text-success',
        icon: 'CheckCircle',
        label: t('caseManagementDetail.sla.received'),
      };
    }

    if (state === 'overdue') {
      return {
        row: 'border-destructive/25 bg-destructive/5',
        badge: 'bg-destructive/15 text-destructive',
        icon: 'AlertTriangle',
        label: t('caseManagementDetail.sla.overdue'),
      };
    }

    if (state === 'upcoming') {
      return {
        row: 'border-warning/25 bg-warning/10',
        badge: 'bg-warning/20 text-warning',
        icon: 'Clock',
        label: itemId === 'first-response'
          ? t('caseManagementDetail.sla.inProgress')
          : t('caseManagementDetail.sla.expected'),
      };
    }

    return {
      row: 'border-border bg-muted/20',
      badge: 'bg-muted text-muted-foreground',
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
            {hasOverdue ? t('caseManagementDetail.sla.breached') : t('caseManagementDetail.sla.expected')}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-background border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground">
            <Icon name="Timer" size={12} />
            {Number.isFinite(Number(currentStatusDurationDays))
              ? t('caseManagementDetail.sla.slaDays', { count: Number(currentStatusDurationDays) })
              : t('caseManagementDetail.sla.notConfigured')}
          </div>

          {activeMilestone?.relativeText && (
            <div className="inline-flex items-center gap-1 rounded-full bg-warning/15 border border-warning/25 px-2.5 py-1 text-[11px] font-semibold text-warning">
              <Icon name="Clock" size={12} />
              {activeMilestone.relativeText}
            </div>
          )}
        </div>
      </div>

      {hasContact && (
        <div className="px-4 py-3 border-b border-border bg-background">
          <div className="text-[11px] font-semibold text-foreground mb-1">{t('caseManagementDetail.sla.contactPerson')}</div>
          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            {sla?.contactPersonName && <div>{t('caseManagementDetail.sla.name')}: {sla.contactPersonName}</div>}
            {sla?.contactPersonEmail && <div>{t('caseManagementDetail.sla.email')}: {sla.contactPersonEmail}</div>}
            {sla?.contactPersonPhone && <div>{t('caseManagementDetail.sla.phone')}: {sla.contactPersonPhone}</div>}
            {sla?.contactNotes && <div>{t('caseManagementDetail.sla.note')}: {sla.contactNotes}</div>}
          </div>
        </div>
      )}

      <div className="p-4 space-y-2.5">
        {milestones.map((milestone) => {
          const meta = stateMeta(milestone.state, milestone.id);
          return (
            <div key={milestone.id} className={`rounded-xl border px-3 py-2.5 ${meta.row}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 min-w-0">
                  <Icon name={meta.icon} size={14} />
                  <span className="text-xs font-semibold text-foreground truncate">{milestone.label}</span>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
                  {meta.label}
                </span>
              </div>

              <div className="mt-1 text-[11px] text-muted-foreground">{milestone.dateText}</div>

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

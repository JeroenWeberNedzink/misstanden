import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';
import { toDateSafe } from '../../../utils/slaUtils';

const SLAStatus = ({
  status,
  firstResponseAt,
  firstResponseDueAt,
  nextStepDueAt,
  resolutionDueAt,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage || i18n?.language;

  const formatDate = (value) => {
    if (!value) return '-';
    const d = toDateSafe(value);
    if (!d) return '-';
    return d.toLocaleDateString(locale || undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const remainingText = (value, isDone = false) => {
    if (!value) return null;
    if (isDone) return t('ticketDetailsView.sla.completed');

    const target = toDateSafe(value);
    if (!target) return null;

    const diff = target.getTime() - Date.now();
    const overdue = diff < 0;
    const abs = Math.abs(diff);
    const hours = Math.floor(abs / (1000 * 60 * 60));
    const mins = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));

    let time = '';
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      time = `${days}${t('ticketDetailsView.sla.dayShort')} ${remHours}${t('ticketDetailsView.sla.hourShort')}`;
    } else {
      time = `${hours}${t('ticketDetailsView.sla.hourShort')} ${mins}m`;
    }

    return overdue
      ? t('ticketDetailsView.sla.overdueIn', { time })
      : t('ticketDetailsView.sla.remainingIn', { time });
  };

  const isClosed = ['closed', 'resolved', 'opgelost', 'gesloten'].includes(String(status || '').toLowerCase());

  const getState = (dueAt, completedAt) => {
    if (completedAt) return 'completed';
    if (!dueAt) return 'pending';
    const dueDate = toDateSafe(dueAt);
    return dueDate && dueDate.getTime() < Date.now() ? 'overdue' : 'expected';
  };

  const chipClass = {
    completed: 'bg-emerald-100 text-emerald-700',
    expected: 'bg-blue-100 text-blue-700',
    overdue: 'bg-red-100 text-red-700',
    pending: 'bg-muted text-muted-foreground',
  };

  const chipLabel = {
    completed: t('ticketDetailsView.sla.completed'),
    expected: t('ticketDetailsView.sla.expected'),
    overdue: t('ticketDetailsView.sla.overdue'),
    pending: t('ticketDetailsView.sla.pending'),
  };

  const milestones = [
    {
      key: 'response',
      label: t('ticketDetailsView.sla.firstResponse'),
      state: getState(firstResponseDueAt, firstResponseAt),
      date: firstResponseAt || firstResponseDueAt,
      meta: firstResponseAt
        ? t('ticketDetailsView.sla.respondedAt', { date: formatDate(firstResponseAt) })
        : t('ticketDetailsView.sla.dueBy', { date: formatDate(firstResponseDueAt) }),
      tail: remainingText(firstResponseDueAt, Boolean(firstResponseAt)),
    },
    {
      key: 'next',
      label: t('ticketDetailsView.sla.nextStep'),
      state: getState(nextStepDueAt, isClosed),
      date: nextStepDueAt,
      meta: t('ticketDetailsView.sla.expectedBy', { date: formatDate(nextStepDueAt) }),
      tail: remainingText(nextStepDueAt, isClosed),
    },
    {
      key: 'resolve',
      label: t('ticketDetailsView.sla.resolve'),
      state: getState(resolutionDueAt, isClosed),
      date: resolutionDueAt,
      meta: resolutionDueAt
        ? t('ticketDetailsView.sla.expectedBy', { date: formatDate(resolutionDueAt) })
        : t('ticketDetailsView.sla.notConfigured'),
      tail: remainingText(resolutionDueAt, isClosed),
    },
  ].filter((m) => m.date || m.key === 'response');

  const hasBreach = milestones.some((m) => m.state === 'overdue');
  const headlineState = isClosed ? 'completed' : hasBreach ? 'overdue' : 'expected';

  return (
    <div className="bg-card rounded-xl border border-border p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="Clock" size={18} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{t('ticketDetailsView.sla.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('ticketDetails.statusTimeline')}</p>
          </div>
        </div>

        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${chipClass[headlineState]}`}>
          {chipLabel[headlineState]}
        </span>
      </div>

      <div className="space-y-3">
        {milestones.map((item) => (
          <div key={item.key} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${chipClass[item.state]}`}>
                  {chipLabel[item.state]}
                </span>
              </div>
              {item.tail ? <p className="text-xs text-muted-foreground whitespace-nowrap">{item.tail}</p> : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{item.meta}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SLAStatus;

import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const DashboardMetrics = ({ metrics }) => {
  const { t } = useTranslation();

  const metricCards = [
    {
      id: 'open',
      title: 'Open Tickets',
      value: metrics?.open || 0,
      icon: 'Inbox',
      iconColor: 'var(--color-primary)',
      bgColor: 'bg-primary/10'
    },
    {
      id: 'newUnassigned',
      title: 'Nieuw / Ontoegew',
      value: metrics?.newUnassigned || 0,
      icon: 'Bell',
      iconColor: 'var(--color-warning)',
      bgColor: 'bg-warning/10'
    },
    {
      id: 'inProgress',
      title: 'In Behandeling',
      value: metrics?.inProgress || 0,
      icon: 'RefreshCw',
      iconColor: 'var(--color-accent)',
      bgColor: 'bg-accent/10'
    },
    {
      id: 'completedThisWeek',
      title: 'Afgerond (7 dagen)',
      value: metrics?.completedThisWeek || 0,
      icon: 'CheckCircle',
      iconColor: 'var(--color-success)',
      bgColor: 'bg-success/10',
      subtext: 'Afgelopen week'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {metricCards.map((metric) => (
        <div
          key={metric.id}
          className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-smooth"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs md:text-sm text-muted-foreground font-medium mb-1">
                  {metric.title}
                </p>
                <p className="text-2xl md:text-3xl font-bold text-foreground">
                  {metric.value}
                </p>
              </div>
              <div
                className={`${metric.bgColor} p-2 rounded-lg flex-shrink-0`}
              >
                <Icon name={metric.icon} size={20} color={metric.iconColor} />
              </div>
            </div>
            
            {/* {metric.subtext && (
              <p className="text-xs text-muted-foreground">
                {metric.subtext}
              </p>
            )} */}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DashboardMetrics;

import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const AnonymousReportingNotice = ({ emailRequired = false }) => {
  const { t } = useTranslation();
  const points = [
    t('reportForm.anonymousInfo.identity'),
    t('reportForm.anonymousInfo.technicalData'),
    t('reportForm.anonymousInfo.files'),
    t('reportForm.anonymousInfo.access'),
  ];

  return (
    <aside className="rounded-lg border border-primary/25 bg-primary/5 p-4" aria-labelledby="anonymous-reporting-title">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon name="ShieldCheck" size={19} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h3 id="anonymous-reporting-title" className="font-semibold text-foreground">
            {t('reportForm.anonymousInfo.title')}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t('reportForm.anonymousInfo.intro')}
          </p>

          <div className="mt-3 rounded-lg border border-primary/20 bg-background/80 p-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon name="Mail" size={14} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('reportForm.anonymousInfo.emailTitle')}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t(emailRequired
                    ? 'reportForm.anonymousInfo.emailRequired'
                    : 'reportForm.anonymousInfo.emailOptional')}
                </p>
              </div>
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <Icon name="Check" size={14} className="mt-1 flex-shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <Icon name="Info" size={13} className="mt-0.5 flex-shrink-0 text-primary" />
            <p>{t('reportForm.anonymousInfo.limits')}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AnonymousReportingNotice;

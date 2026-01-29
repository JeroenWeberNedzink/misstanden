import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const PrivacyAssurance = () => {
  const { t } = useTranslation();

  const assurancePoints = [
    {
      icon: 'Shield',
      color: 'var(--color-success)',
      title: t('reportForm.privacyAnonymity'),
      description: t('reportForm.privacyAnonymityDesc')
    },
    {
      icon: 'Lock',
      color: 'var(--color-primary)',
      title: t('reportForm.privacySecure'),
      description: t('reportForm.privacySecureDesc')
    },
    {
      icon: 'FileCheck',
      color: 'var(--color-accent)',
      title: t('reportForm.privacyGDPR'),
      description: t('reportForm.privacyGDPRDesc')
    },
    {
      icon: 'UserCheck',
      color: 'var(--color-warning)',
      title: t('reportForm.privacyNoRepercussions'),
      description: t('reportForm.privacyNoRepercussionsDesc')
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="ShieldCheck" size={20} color="var(--color-success)" />
        <h3 className="text-lg font-semibold text-foreground">{t('reportForm.privacyTitle')}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 lg:gap-6">
        {assurancePoints?.map((point, index) => (
          <div
            key={index}
            className="p-4 md:p-5 lg:p-6 rounded-lg bg-card border border-border hover:border-primary/50 transition-smooth"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${point?.color}15` }}>
                <Icon name={point?.icon} size={20} color={point?.color} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm md:text-base font-semibold text-foreground mb-1">
                  {point?.title}
                </h4>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {point?.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrivacyAssurance;
import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const SecurityNotice = () => {
  const { t } = useTranslation();

  const securityFeatures = [
    { icon: 'Lock', text: t('ticketAccess.securityEndToEnd') },
    { icon: 'EyeOff', text: t('ticketAccess.securityNoTracking') },
    { icon: 'Shield', text: t('ticketAccess.securityGDPR') },
    { icon: 'Clock', text: t('ticketAccess.securityAutoTimeout') }
  ];

  return (
    <div className="bg-success/5 border border-success/20 rounded-xl p-4 md:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg bg-success/10 flex items-center justify-center">
          <Icon name="ShieldCheck" size={24} color="var(--color-success)" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">{t('ticketAccess.secureAccessTitle')}</h3>
          <p className="text-xs md:text-sm text-muted-foreground">
            {t('ticketAccess.secureAccessSubtitle')}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
        {securityFeatures?.map((feature, index) => (
          <div key={index} className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
            <Icon name={feature?.icon} size={16} color="var(--color-success)" className="flex-shrink-0" />
            <span>{feature?.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SecurityNotice;
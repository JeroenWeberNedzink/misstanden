import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const HelpSection = () => {
  const { t } = useTranslation();
  
  const helpItems = [
    {
      icon: 'FileText',
      title: t('ticketAccess.forgotCredentials'),
      description: t('ticketAccess.forgotCredentialsDesc')
    },
    {
      icon: 'Key',
      title: t('ticketAccess.lostAccessCode'),
      description: t('ticketAccess.lostAccessCodeDesc')
    },
    {
      icon: 'Shield',
      title: t('ticketAccess.privacyGuaranteed'),
      description: t('ticketAccess.privacyGuaranteedDesc')
    }
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <h3 className="text-base md:text-lg font-semibold text-foreground">{t('ticketAccess.needHelp')}</h3>
      <div className="space-y-3 md:space-y-4">
        {helpItems?.map((item, index) => (
          <div key={index} className="flex gap-3 md:gap-4 p-3 md:p-4 rounded-lg bg-muted/50 hover:bg-muted transition-smooth">
            <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon name={item?.icon} size={20} color="var(--color-primary)" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm md:text-base font-medium text-foreground mb-1">{item?.title}</h4>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{item?.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HelpSection;
import React from 'react';
import Icon from '../../../components/AppIcon';

const TrustIndicators = () => {
  const indicators = [
    {
      icon: 'Shield',
      title: 'GDPR Compliant',
      description: 'Volledig conform Europese privacywetgeving'
    },
    {
      icon: 'Lock',
      title: 'End-to-End Versleuteld',
      description: 'Uw gegevens zijn beveiligd met moderne encryptie'
    },
    {
      icon: 'Eye',
      title: 'Anoniem Proces',
      description: 'Geen IP-tracking of apparaat identificatie'
    },
    {
      icon: 'FileCheck',
      title: 'Audit Trail',
      description: 'Alle acties worden gelogd voor transparantie'
    }
  ];

  return (
    <div className="card bg-gradient-to-br from-success/5 to-primary/5 border-success/20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-success flex items-center justify-center">
          <Icon name="ShieldCheck" size={24} color="#FFFFFF" />
        </div>
        <h3 className="text-lg md:text-xl font-semibold text-foreground">
          Privacy & Beveiliging Garanties
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {indicators?.map((indicator, index) => (
          <div 
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border"
          >
            <Icon 
              name={indicator?.icon} 
              size={20} 
              color="var(--color-success)" 
              className="flex-shrink-0 mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">
                {indicator?.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {indicator?.description}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 p-4 rounded-lg bg-card border border-border flex items-start gap-3">
        <Icon name="Info" size={18} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
        <p className="text-xs md:text-sm text-muted-foreground">
          NedZink hanteert strikte privacy- en beveiligingsprotocollen conform de Nederlandse Klokkenluiderswet 
          en GDPR-richtlijnen. Uw melding wordt behandeld met de hoogste mate van vertrouwelijkheid.
        </p>
      </div>
    </div>
  );
};

export default TrustIndicators;
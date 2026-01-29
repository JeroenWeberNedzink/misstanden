import React from 'react';
import Icon from '../../../components/AppIcon';

const PrivacyReminder = ({ sessionTimeout }) => {
  const formatTimeRemaining = (minutes) => {
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours} uur ${mins} minuten`;
    }
    return `${minutes} minuten`;
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 md:p-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
          <Icon name="Shield" size={24} color="var(--color-success)" />
        </div>
        
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Privacy & Beveiliging
          </h3>
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <Icon name="Check" size={16} color="var(--color-success)" className="mt-0.5 flex-shrink-0" />
              <span>Uw identiteit blijft volledig anoniem en wordt nergens opgeslagen</span>
            </p>
            
            <p className="flex items-start gap-2">
              <Icon name="Check" size={16} color="var(--color-success)" className="mt-0.5 flex-shrink-0" />
              <span>Geen IP-adressen of apparaatinformatie wordt geregistreerd</span>
            </p>
            
            <p className="flex items-start gap-2">
              <Icon name="Check" size={16} color="var(--color-success)" className="mt-0.5 flex-shrink-0" />
              <span>Alle communicatie is versleuteld volgens Nederlandse privacywetgeving</span>
            </p>
            
            <p className="flex items-start gap-2">
              <Icon name="Clock" size={16} color="var(--color-warning)" className="mt-0.5 flex-shrink-0" />
              <span>
                Sessie verloopt automatisch over {formatTimeRemaining(sessionTimeout)} voor extra beveiliging
              </span>
            </p>
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground">
              <Icon name="Info" size={14} className="inline mr-1" />
              Bewaar uw toegangscode veilig. Deze is nodig voor toekomstige toegang tot uw melding.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyReminder;
import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const CredentialCard = ({ ticketNumber, accessCode }) => {
  const [copiedField, setCopiedField] = useState(null);

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="card bg-gradient-to-br from-primary/5 to-accent/5 border-2 border-primary/20">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-success flex items-center justify-center flex-shrink-0">
          <Icon name="CheckCircle2" size={28} color="#FFFFFF" />
        </div>
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-2">
            Melding Succesvol Ingediend
          </h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Uw melding is veilig ontvangen en wordt vertrouwelijk behandeld
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 md:p-8 border border-border space-y-6">
        <div className="space-y-4">
          <div>
            <label className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
              Ticketnummer
            </label>
            <div className="flex items-center gap-3 bg-muted rounded-lg p-4">
              <code className="text-xl md:text-2xl lg:text-3xl font-bold text-primary font-mono flex-1">
                {ticketNumber}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopy(ticketNumber, 'ticket')}
                className="flex-shrink-0"
              >
                <Icon 
                  name={copiedField === 'ticket' ? 'Check' : 'Copy'} 
                  size={20}
                  color={copiedField === 'ticket' ? 'var(--color-success)' : 'currentColor'}
                />
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
              Toegangscode
            </label>
            <div className="flex items-center gap-3 bg-muted rounded-lg p-4">
              <code className="text-xl md:text-2xl lg:text-3xl font-bold text-accent font-mono flex-1 tracking-wider">
                {accessCode}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopy(accessCode, 'code')}
                className="flex-shrink-0"
              >
                <Icon 
                  name={copiedField === 'code' ? 'Check' : 'Copy'} 
                  size={20}
                  color={copiedField === 'code' ? 'var(--color-success)' : 'currentColor'}
                />
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex gap-3">
          <Icon name="AlertTriangle" size={20} color="var(--color-warning)" className="flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-warning">Belangrijk: Bewaar deze gegevens veilig</p>
            <p className="text-muted-foreground">
              U heeft deze gegevens nodig om de status van uw melding te bekijken. 
              We kunnen deze niet opnieuw versturen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CredentialCard;
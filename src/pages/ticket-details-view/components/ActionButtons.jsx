import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/ui/Button';

const ActionButtons = ({ ticketNumber, canSubmitAdditional, onDownloadSummary }) => {
  const navigate = useNavigate();

  const handleSubmitAdditional = () => {
    alert('Functionaliteit voor aanvullende informatie wordt binnenkort beschikbaar gesteld.');
  };

  const handleSecureLogout = () => {
    if (window.confirm('Weet u zeker dat u wilt uitloggen? U heeft uw toegangscode nodig om opnieuw in te loggen.')) {
      navigate('/ticket-access-portal');
    }
  };

  const handleDownload = () => {
    console.log('Downloading summary for ticket:', ticketNumber);
    alert(`Samenvatting van melding #${ticketNumber} wordt gedownload...`);
    if (onDownloadSummary) {
      onDownloadSummary();
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 md:p-8">
      <h3 className="text-lg font-semibold text-foreground mb-4">Acties</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          variant="default"
          fullWidth
          iconName="Download"
          iconPosition="left"
          onClick={handleDownload}
        >
          Download Samenvatting
        </Button>

        {canSubmitAdditional && (
          <Button
            variant="outline"
            fullWidth
            iconName="Plus"
            iconPosition="left"
            onClick={handleSubmitAdditional}
          >
            Aanvullende Informatie
          </Button>
        )}

        <Button
          variant="ghost"
          fullWidth
          iconName="LogOut"
          iconPosition="left"
          onClick={handleSecureLogout}
          className="sm:col-span-2"
        >
          Veilig Uitloggen
        </Button>
      </div>

      <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
        <p className="text-xs text-muted-foreground text-center">
          Bewaar de gedownloade samenvatting op een veilige locatie voor uw administratie
        </p>
      </div>
    </div>
  );
};

export default ActionButtons;
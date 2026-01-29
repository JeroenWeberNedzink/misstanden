import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';

const ActionButtons = ({ ticketNumber, accessCode, reportData }) => {
  const navigate = useNavigate();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadCredentials = () => {
    setIsDownloading(true);
    
    try {
      const content = `
NEDZINK MISSTANDEN PORTAL
Toegangsgegevens Melding

═══════════════════════════════════════

TICKETNUMMER: ${ticketNumber}
TOEGANGSCODE: ${accessCode}

═══════════════════════════════════════

MELDING DETAILS:
- Workflow: ${reportData?.workflow || 'Niet gespecificeerd'}
- Ernst: ${reportData?.severity || 'Niet gespecificeerd'}
- Ingediend: ${new Intl.DateTimeFormat('nl-NL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})?.format(reportData?.submittedAt || new Date())}

═══════════════════════════════════════

BELANGRIJK:
✓ Bewaar deze gegevens veilig
✓ Gebruik deze om uw melding te volgen
✓ We kunnen deze niet opnieuw versturen

TOEGANG TOT UW MELDING:
Ga naar het toegangsportaal en voer uw
ticketnummer en toegangscode in.

═══════════════════════════════════════

© ${new Date()?.getFullYear()} NedZink - Vertrouwelijk
      `?.trim();

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL?.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `NedZink_Melding_${ticketNumber}.txt`;
      document.body?.appendChild(link);
      link?.click();
      document.body?.removeChild(link);
      window.URL?.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download mislukt. Probeer het opnieuw of noteer de gegevens handmatig.');
    } finally {
      setTimeout(() => setIsDownloading(false), 1000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAccessPortal = () => {
    navigate('/ticket-access-portal', { 
      state: { 
        prefillTicket: ticketNumber,
        prefillCode: accessCode 
      } 
    });
  };

  const handleNewReport = () => {
    if (window.confirm('Weet u zeker dat u een nieuwe melding wilt indienen? Zorg ervoor dat u uw huidige toegangsgegevens heeft opgeslagen.')) {
      navigate('/anonymous-report-form');
    }
  };

  return (
    <div className="space-y-4">
      <div className="card bg-primary/5 border-primary/20">
        <h4 className="text-base md:text-lg font-semibold text-foreground mb-4">
          Toegangsgegevens Opslaan
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            variant="default"
            fullWidth
            iconName="Download"
            iconPosition="left"
            loading={isDownloading}
            onClick={handleDownloadCredentials}
          >
            Download als Tekstbestand
          </Button>
          <Button
            variant="outline"
            fullWidth
            iconName="Printer"
            iconPosition="left"
            onClick={handlePrint}
          >
            Afdrukken
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button
          variant="secondary"
          fullWidth
          iconName="ExternalLink"
          iconPosition="left"
          onClick={handleAccessPortal}
        >
          Naar Toegangsportaal
        </Button>
        <Button
          variant="outline"
          fullWidth
          iconName="Plus"
          iconPosition="left"
          onClick={handleNewReport}
        >
          Nieuwe Melding Indienen
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs md:text-sm text-muted-foreground pt-4">
        <Icon name="HelpCircle" size={16} />
        <span>
          Hulp nodig? Neem contact op met{' '}
          <a 
            href="mailto:support@nedzink.nl" 
            className="text-primary hover:underline font-medium"
          >
            support@nedzink.nl
          </a>
        </span>
      </div>
    </div>
  );
};

export default ActionButtons;
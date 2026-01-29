import React from 'react';
import Icon from '../../../components/AppIcon';

const StatusTimeline = ({ timeline, workflowType }) => {
  const isWhistleblower = workflowType?.toLowerCase().includes('whistleblow') ||
                          workflowType?.toLowerCase().includes('klokkenluider');

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Nieuw':
        return { name: 'FileText', color: 'var(--color-primary)' };
      case 'In behandeling':
        return { name: 'Clock', color: 'var(--color-warning)' };
      case 'Gesloten':
      case 'Opgelost':
        return { name: 'CheckCircle2', color: 'var(--color-success)' };
      default:
        return { name: 'Circle', color: 'var(--color-muted-foreground)' };
    }
  };

  const formatDate = (date) => {
    return new Date(date)?.toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusGuidance = (status) => {
    const guidance = {
      'Nieuw': {
        title: 'Wat gebeurt er nu?',
        description: 'Uw melding is ontvangen en wordt beoordeeld door een behandelaar. U ontvangt binnen 3 werkdagen een eerste reactie.',
        nextSteps: [
          'Een behandelaar wordt toegewezen aan uw zaak',
          'Uw melding wordt beoordeeld op prioriteit en ernst',
          'U kunt verdere informatie toevoegen via de communicatie sectie'
        ],
        expectedTime: 'Binnen 3 werkdagen'
      },
      'In behandeling': {
        title: 'Wat gebeurt er nu?',
        description: 'Uw melding wordt onderzocht. Een behandelaar is bezig met het verzamelen van informatie en het analyseren van de situatie.',
        nextSteps: [
          'De behandelaar kan contact met u opnemen voor meer informatie',
          'Er wordt een actieplan opgesteld',
          'U wordt op de hoogte gehouden van belangrijke ontwikkelingen'
        ],
        expectedTime: 'Afhankelijk van de complexiteit van de zaak'
      },
      'Opgelost': {
        title: 'Wat gebeurt er nu?',
        description: 'Uw melding is afgehandeld. De zaak is opgelost of er zijn passende maatregelen genomen.',
        nextSteps: [
          'U ontvangt een samenvatting van de genomen maatregelen',
          'De zaak wordt gesloten binnen 5 werkdagen',
          'U kunt nog gedurende 14 dagen aanvullende vragen stellen'
        ],
        expectedTime: 'Zaak wordt binnen 5 werkdagen gesloten'
      }
    };

    return guidance[status] || null;
  };

  const currentStatus = timeline?.[timeline.length - 1]?.status;
  const statusGuidance = isWhistleblower && currentStatus ? getStatusGuidance(currentStatus) : null;

  return (
    <div className="bg-card rounded-xl border border-border p-6 md:p-8">
      <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
        <Icon name="Activity" size={24} color="var(--color-primary)" />
        Statusgeschiedenis
      </h2>

      {/* Whistleblower Guidance */}
      {statusGuidance && (
        <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="Info" size={20} color="var(--color-primary)" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground mb-2">{statusGuidance.title}</h3>
              <p className="text-sm text-muted-foreground mb-3">{statusGuidance.description}</p>

              <div className="mb-3">
                <p className="text-xs font-medium text-foreground mb-1.5">Volgende stappen:</p>
                <ul className="space-y-1">
                  {statusGuidance.nextSteps.map((step, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                      <Icon name="ChevronRight" size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center gap-2 p-2 bg-card/50 rounded border border-border">
                <Icon name="Clock" size={14} color="var(--color-primary)" />
                <span className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Verwachte tijd:</span> {statusGuidance.expectedTime}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-border/50">
                <p className="text-xs font-medium text-foreground mb-1">Heeft u vragen?</p>
                <p className="text-xs text-muted-foreground">
                  U kunt contact opnemen via de communicatie sectie hieronder of bel onze vertrouwenspersoon op{' '}
                  <span className="font-medium text-primary">020-1234567</span> (ma-vr 9:00-17:00)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {timeline?.map((item, index) => {
          const iconConfig = getStatusIcon(item?.status);
          const isLast = index === timeline?.length - 1;

          return (
            <div key={index} className="relative">
              <div className="flex gap-4">
                <div className="relative flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 z-10">
                    <Icon name={iconConfig?.name} size={20} color={iconConfig?.color} />
                  </div>
                  {!isLast && (
                    <div className="w-0.5 h-full bg-border absolute top-10 left-1/2 -translate-x-1/2" />
                  )}
                </div>

                <div className="flex-1 pb-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {item?.status}
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(item?.timestamp)}
                    </span>
                  </div>

                  {item?.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item?.description}
                    </p>
                  )}

                  {item?.handlerNote && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-lg border border-border">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Opmerking behandelaar:</span> {item?.handlerNote}
                      </p>
                    </div>
                  )}

                  {/* Timeline and Contact Information from workflow_statuses */}
                  {item?.expectedDurationDays && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon name="Clock" size={12} className="inline flex-shrink-0" />
                      <span>
                        Verwachte doorlooptijd: <span className="font-medium text-foreground">{item.expectedDurationDays} dagen</span>
                      </span>
                    </div>
                  )}

                  {(item?.contactPersonName || item?.contactPersonEmail || item?.contactPersonPhone) && (
                    <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border">
                      <div className="font-medium text-foreground text-sm mb-2">Contact voor deze status:</div>
                      {item?.contactPersonName && (
                        <div className="text-sm text-foreground mb-1">{item.contactPersonName}</div>
                      )}
                      {item?.contactPersonEmail && (
                        <div className="text-sm mb-1">
                          <Icon name="Mail" size={12} className="inline mr-1" />
                          <a href={`mailto:${item.contactPersonEmail}`} className="text-primary hover:underline">
                            {item.contactPersonEmail}
                          </a>
                        </div>
                      )}
                      {item?.contactPersonPhone && (
                        <div className="text-sm mb-1">
                          <Icon name="Phone" size={12} className="inline mr-1" />
                          <a href={`tel:${item.contactPersonPhone}`} className="text-primary hover:underline">
                            {item.contactPersonPhone}
                          </a>
                        </div>
                      )}
                      {item?.contactNotes && (
                        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground whitespace-pre-line">
                          {item.contactNotes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusTimeline;
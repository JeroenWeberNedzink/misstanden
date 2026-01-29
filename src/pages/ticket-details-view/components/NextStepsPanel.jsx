import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/AppIcon';

const NextStepsPanel = ({ workflowType, status }) => {
  const { t } = useTranslation();

  const getWorkflowSteps = () => {
    // Define next steps based on workflow type and current status
    const workflows = {
      complaint: {
        Nieuw: [
          { icon: 'Clock', text: 'Uw klacht wordt binnen 2 werkdagen beoordeeld' },
          { icon: 'UserCheck', text: 'Een behandelaar wordt toegewezen aan uw zaak' },
          { icon: 'MessageSquare', text: 'U ontvangt een bevestiging via e-mail' }
        ],
        'In Behandeling': [
          { icon: 'Search', text: 'De behandelaar onderzoekt uw klacht' },
          { icon: 'Users', text: 'Mogelijk wordt u gecontacteerd voor meer informatie' },
          { icon: 'FileText', text: 'U wordt op de hoogte gehouden van de voortgang' }
        ],
        'Wacht op Informatie': [
          { icon: 'AlertCircle', text: 'Reageer zo snel mogelijk op het verzoek om informatie' },
          { icon: 'Upload', text: 'Upload eventuele gevraagde documenten' },
          { icon: 'MessageSquare', text: 'Gebruik de chat hieronder om te reageren' }
        ],
        Opgelost: [
          { icon: 'CheckCircle', text: 'Uw klacht is afgehandeld' },
          { icon: 'FileDown', text: 'Download een samenvatting van de afhandeling' },
          { icon: 'MessageSquare', text: 'U kunt nog steeds vragen stellen via de chat' }
        ],
        Gesloten: [
          { icon: 'Archive', text: 'Deze zaak is gesloten' },
          { icon: 'FileDown', text: 'Download uw zaakdocumentatie voor uw administratie' },
          { icon: 'PlusCircle', text: 'U kunt een nieuwe melding indienen indien nodig' }
        ]
      },
      incident: {
        Nieuw: [
          { icon: 'AlertTriangle', text: 'Uw incident wordt met prioriteit beoordeeld' },
          { icon: 'Clock', text: 'Verwachte reactietijd: binnen 4 uur' },
          { icon: 'Bell', text: 'U ontvangt direct een bevestiging' }
        ],
        'In Behandeling': [
          { icon: 'Tool', text: 'Het incident wordt momenteel onderzocht en opgelost' },
          { icon: 'Users', text: 'Een specialist is toegewezen aan uw zaak' },
          { icon: 'TrendingUp', text: 'Voortgangsupdates worden regelmatig gestuurd' }
        ],
        'Wacht op Informatie': [
          { icon: 'AlertCircle', text: 'Meer informatie is nodig om verder te gaan' },
          { icon: 'MessageSquare', text: 'Reageer hieronder op het verzoek' },
          { icon: 'Zap', text: 'Snelle reactie helpt bij snellere oplossing' }
        ],
        Opgelost: [
          { icon: 'CheckCircle', text: 'Het incident is opgelost' },
          { icon: 'Eye', text: 'Controleer of de oplossing naar tevredenheid is' },
          { icon: 'RotateCcw', text: 'Laat het ons weten als het probleem terugkeert' }
        ],
        Gesloten: [
          { icon: 'Archive', text: 'Dit incident is gesloten' },
          { icon: 'FileText', text: 'Incidentrapport is beschikbaar voor download' },
          { icon: 'Shield', text: 'Preventieve maatregelen zijn genomen' }
        ]
      },
      suggestion: {
        Nieuw: [
          { icon: 'Lightbulb', text: 'Bedankt voor uw suggestie!' },
          { icon: 'Users', text: 'Uw idee wordt beoordeeld door ons team' },
          { icon: 'Clock', text: 'Verwachte beoordelingstijd: 5 werkdagen' }
        ],
        'In Behandeling': [
          { icon: 'Search', text: 'Uw suggestie wordt geëvalueerd' },
          { icon: 'TrendingUp', text: 'Haalbaarheid en impact worden onderzocht' },
          { icon: 'MessageSquare', text: 'We kunnen contact opnemen voor meer details' }
        ],
        'Wacht op Informatie': [
          { icon: 'HelpCircle', text: 'Meer details zijn nodig voor evaluatie' },
          { icon: 'Edit', text: 'Vul aanvullende informatie aan' },
          { icon: 'Target', text: 'Helpt ons uw idee beter te begrijpen' }
        ],
        Opgelost: [
          { icon: 'ThumbsUp', text: 'Uw suggestie is geaccepteerd!' },
          { icon: 'Calendar', text: 'Implementatie wordt gepland' },
          { icon: 'Bell', text: 'U wordt op de hoogte gehouden van de voortgang' }
        ],
        Gesloten: [
          { icon: 'FileCheck', text: 'Uw suggestie is afgehandeld' },
          { icon: 'MessageSquare', text: 'Bekijk de feedback over uw idee' },
          { icon: 'PlusCircle', text: 'Blijf nieuwe ideeën delen!' }
        ]
      },
      question: {
        Nieuw: [
          { icon: 'HelpCircle', text: 'Uw vraag is ontvangen' },
          { icon: 'Clock', text: 'Verwachte reactietijd: binnen 1 werkdag' },
          { icon: 'UserCheck', text: 'Een expert wordt toegewezen' }
        ],
        'In Behandeling': [
          { icon: 'Search', text: 'Uw vraag wordt onderzocht' },
          { icon: 'BookOpen', text: 'We zoeken het juiste antwoord voor u' },
          { icon: 'MessageSquare', text: 'Antwoord volgt zo spoedig mogelijk' }
        ],
        'Wacht op Informatie': [
          { icon: 'AlertCircle', text: 'Verduidelijking is nodig om uw vraag te beantwoorden' },
          { icon: 'Edit', text: 'Geef meer context of details' },
          { icon: 'Target', text: 'Helpt ons u beter van dienst te zijn' }
        ],
        Opgelost: [
          { icon: 'CheckCircle', text: 'Uw vraag is beantwoord' },
          { icon: 'MessageSquare', text: 'Bekijk het antwoord in de communicatie' },
          { icon: 'ThumbsUp', text: 'Laat ons weten of dit helpt' }
        ],
        Gesloten: [
          { icon: 'Archive', text: 'Deze vraag is afgehandeld' },
          { icon: 'FileDown', text: 'Download het volledige gesprek' },
          { icon: 'HelpCircle', text: 'Heeft u nog vragen? Start een nieuwe melding' }
        ]
      }
    };

    // Default steps if workflow type not found
    const defaultSteps = {
      Nieuw: [
        { icon: 'Clock', text: 'Uw melding wordt beoordeeld' },
        { icon: 'UserCheck', text: 'Een behandelaar wordt toegewezen' },
        { icon: 'Bell', text: 'U ontvangt updates via e-mail' }
      ],
      'In Behandeling': [
        { icon: 'Tool', text: 'Uw zaak wordt behandeld' },
        { icon: 'MessageSquare', text: 'U wordt op de hoogte gehouden' }
      ],
      Opgelost: [
        { icon: 'CheckCircle', text: 'Uw zaak is opgelost' },
        { icon: 'FileDown', text: 'Download een samenvatting' }
      ],
      Gesloten: [
        { icon: 'Archive', text: 'Deze zaak is gesloten' }
      ]
    };

    const workflowSteps = workflows[workflowType] || defaultSteps;
    return workflowSteps[status] || workflowSteps['Nieuw'] || [];
  };

  const steps = getWorkflowSteps();

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={index} className="flex gap-3 items-start">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon
              name={step.icon}
              size={16}
              className="text-primary"
            />
          </div>
          <p className="text-sm text-foreground leading-relaxed flex-1 pt-1">
            {step.text}
          </p>
        </div>
      ))}

      {status === 'Nieuw' && (
        <div className="mt-4 pt-4 border-t border-border flex items-start gap-3">
          <Icon name="Clock" size={16} className="text-muted-foreground mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground mb-1">
              Verwachte doorlooptijd
            </p>
            <p className="text-xs text-muted-foreground">
              {workflowType === 'incident' && 'Binnen 24 uur eerste reactie'}
              {workflowType === 'complaint' && '5-10 werkdagen voor volledige afhandeling'}
              {workflowType === 'question' && 'Binnen 2 werkdagen'}
              {workflowType === 'suggestion' && '2-4 weken voor evaluatie'}
              {!['incident', 'complaint', 'question', 'suggestion'].includes(workflowType) &&
                'Afhankelijk van de complexiteit'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NextStepsPanel;

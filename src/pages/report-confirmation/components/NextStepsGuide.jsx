import React from 'react';
import Icon from '../../../components/AppIcon';

const NextStepsGuide = () => {
  const steps = [
    {
      icon: 'Save',
      title: 'Bewaar uw toegangsgegevens',
      description: 'Noteer of download uw ticketnummer en toegangscode. Deze zijn nodig om de status van uw melding te bekijken.',
      priority: 'high'
    },
    {
      icon: 'Clock',
      title: 'Verwachte reactietijd',
      description: 'U ontvangt binnen 5 werkdagen een eerste reactie van onze behandelaars. Urgente meldingen worden met voorrang behandeld.',
      priority: 'medium'
    },
    {
      icon: 'Eye',
      title: 'Status volgen',
      description: 'Gebruik het toegangsportaal met uw gegevens om de voortgang van uw melding te bekijken en aanvullende informatie te verstrekken.',
      priority: 'medium'
    },
    {
      icon: 'Shield',
      title: 'Privacy gewaarborgd',
      description: 'Uw melding wordt volledig anoniem behandeld volgens de Nederlandse wetgeving en GDPR-richtlijnen.',
      priority: 'low'
    }
  ];

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'var(--color-error)';
      case 'medium': return 'var(--color-accent)';
      default: return 'var(--color-primary)';
    }
  };

  return (
    <div className="card">
      <h3 className="text-xl md:text-2xl font-semibold text-foreground mb-6">
        Volgende Stappen
      </h3>
      <div className="space-y-4 md:space-y-6">
        {steps?.map((step, index) => (
          <div 
            key={index}
            className="flex gap-4 p-4 md:p-6 rounded-lg bg-muted hover:bg-muted/80 transition-smooth"
          >
            <div 
              className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${getPriorityColor(step?.priority)}15` }}
            >
              <Icon name={step?.icon} size={24} color={getPriorityColor(step?.priority)} />
            </div>
            <div className="flex-1">
              <h4 className="text-base md:text-lg font-semibold text-foreground mb-2">
                {step?.title}
              </h4>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                {step?.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NextStepsGuide;
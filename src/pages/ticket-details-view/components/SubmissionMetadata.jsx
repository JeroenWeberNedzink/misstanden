import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';

const SubmissionMetadata = ({ metadata, submissionDate }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const metadataItems = [
    {
      icon: 'Calendar',
      label: 'Ingediend op',
      value: formatDate(submissionDate),
      show: true
    },
    {
      icon: 'Monitor',
      label: 'Schermresolutie',
      value: metadata?.screenResolution || 'Niet beschikbaar',
      show: !!metadata?.screenResolution
    },
    {
      icon: 'Globe',
      label: 'Tijdzone',
      value: metadata?.timezone || 'Niet beschikbaar',
      show: !!metadata?.timezone
    },
    {
      icon: 'Languages',
      label: 'Taal',
      value: metadata?.languages?.[0] || 'Niet beschikbaar',
      show: !!metadata?.languages
    },
    {
      icon: 'Chrome',
      label: 'Platform',
      value: metadata?.os || metadata?.deviceType || 'Niet beschikbaar',
      show: !!metadata?.os || !!metadata?.deviceType
    },
    {
      icon: 'Link',
      label: 'Ingediend via',
      value: metadata?.createdFrom?.includes('localhost')
        ? 'Webapp (lokaal)'
        : metadata?.createdFrom || 'Webapp',
      show: !!metadata?.createdFrom
    }
  ].filter(item => item.show);

  if (metadataItems.length === 0) {
    return null;
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
            <Icon name="Info" size={16} className="text-muted-foreground" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">
              Indiening Details
            </h3>
            <p className="text-xs text-muted-foreground">
              {formatDate(submissionDate)}
            </p>
          </div>
        </div>
        <Icon
          name={isExpanded ? 'ChevronUp' : 'ChevronDown'}
          size={18}
          className="text-muted-foreground transition-transform"
        />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {metadataItems.map((item, index) => (
              <div
                key={index}
                className="flex gap-2 p-2 rounded-lg bg-muted/30"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center">
                  <Icon
                    name={item.icon}
                    size={14}
                    className="text-primary"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="text-xs text-foreground truncate" title={item.value}>
                    {item.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {metadata?.userAgent && (
            <div className="mt-3 p-2 rounded-lg bg-muted/30">
              <div className="flex items-start gap-2">
                <Icon name="Code" size={12} className="text-muted-foreground mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    User Agent
                  </p>
                  <p className="text-xs text-foreground font-mono break-all">
                    {metadata.userAgent}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 p-2 rounded-lg bg-muted/20">
            <div className="flex items-start gap-2">
              <Icon name="Lock" size={12} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Deze technische informatie helpt ons uw melding beter te verwerken. Uw privacy blijft beschermd.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubmissionMetadata;

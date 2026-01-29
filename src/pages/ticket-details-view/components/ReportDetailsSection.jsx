import React from 'react';
import Icon from '../../../components/AppIcon';

const ReportDetailsSection = ({ description, location, severity, contactInfo }) => {
  const getSeverityConfig = (severity) => {
    switch (severity) {
      case 'Hoog':
        return {
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-100 dark:bg-red-900/30',
          icon: 'AlertTriangle'
        };
      case 'Gemiddeld':
        return {
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-100 dark:bg-amber-900/30',
          icon: 'AlertCircle'
        };
      case 'Laag':
        return {
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/30',
          icon: 'Info'
        };
      default:
        return {
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-900/30',
          icon: 'Info'
        };
    }
  };

  const severityConfig = getSeverityConfig(severity);

  return (
    <div className="bg-card rounded-xl border border-border p-6 md:p-8">
      <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
        <Icon name="FileText" size={24} color="var(--color-primary)" />
        Meldingsdetails
      </h2>
      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            Beschrijving
          </label>
          <div className="bg-muted/50 rounded-lg p-4 border border-border">
            <p className="text-foreground whitespace-pre-wrap leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {location && (
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Icon name="MapPin" size={16} />
              Locatie
            </label>
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <p className="text-foreground">{location}</p>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Icon name="AlertTriangle" size={16} />
            Ernst
          </label>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${severityConfig?.bgColor}`}>
            <Icon name={severityConfig?.icon} size={18} color={severityConfig?.color} />
            <span className={`font-medium ${severityConfig?.color}`}>{severity}</span>
          </div>
        </div>

        {contactInfo && (contactInfo?.name || contactInfo?.email || contactInfo?.phone) && (
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Icon name="User" size={16} />
              Contactgegevens (optioneel verstrekt)
            </label>
            <div className="bg-muted/50 rounded-lg p-4 border border-border space-y-2">
              {contactInfo?.name && (
                <p className="text-foreground">
                  <span className="font-medium">Naam:</span> {contactInfo?.name}
                </p>
              )}
              {contactInfo?.email && (
                <p className="text-foreground">
                  <span className="font-medium">E-mail:</span> {contactInfo?.email}
                </p>
              )}
              {contactInfo?.phone && (
                <p className="text-foreground">
                  <span className="font-medium">Telefoon:</span> {contactInfo?.phone}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportDetailsSection;
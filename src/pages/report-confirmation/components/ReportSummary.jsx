import React from 'react';
import Icon from '../../../components/AppIcon';

const ReportSummary = ({ reportData }) => {
  const formatDate = (dateValue) => {
    try {
      if (!dateValue) return new Date().toLocaleDateString('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return new Date().toLocaleDateString('nl-NL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      return new Intl.DateTimeFormat('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Niet beschikbaar';
    }
  };

  const summaryItems = [
    {
      icon: 'FileText',
      label: 'Workflow Type',
      value: reportData?.workflow || 'Niet gespecificeerd',
      color: 'var(--color-primary)'
    },
    {
      icon: 'AlertCircle',
      label: 'Ernst Niveau',
      value: reportData?.severity || 'Niet gespecificeerd',
      color: 'var(--color-accent)'
    },
    {
      icon: 'Calendar',
      label: 'Ingediend op',
      value: formatDate(reportData?.submittedAt),
      color: 'var(--color-secondary)'
    },
    {
      icon: 'MapPin',
      label: 'Locatie',
      value: reportData?.location || 'Niet opgegeven',
      color: 'var(--color-muted-foreground)'
    }
  ];

  return (
    <div className="card">
      <h3 className="text-xl md:text-2xl font-semibold text-foreground mb-6">
        Samenvatting Melding
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {summaryItems?.map((item, index) => (
          <div 
            key={index}
            className="flex items-start gap-4 p-4 rounded-lg bg-muted hover:bg-muted/80 transition-smooth"
          >
            <div 
              className="w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${item?.color}15` }}
            >
              <Icon name={item?.icon} size={20} color={item?.color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs md:text-sm text-muted-foreground mb-1">
                {item?.label}
              </p>
              <p className="text-sm md:text-base font-medium text-foreground truncate">
                {item?.value}
              </p>
            </div>
          </div>
        ))}
      </div>
      {reportData?.attachmentCount > 0 && (
        <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-3">
          <Icon name="Paperclip" size={20} color="var(--color-primary)" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">{reportData?.attachmentCount}</span> bijlage(n) toegevoegd
          </p>
        </div>
      )}
    </div>
  );
};

export default ReportSummary;
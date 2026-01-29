import React from 'react';
import Icon from '../../../components/AppIcon';

const CommunicationSection = ({ communications }) => {
  const formatDate = (date) => {
    return new Date(date)?.toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!communications || communications?.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 md:p-8">
        <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 flex items-center gap-3">
          <Icon name="MessageSquare" size={24} color="var(--color-primary)" />
          Communicatie
        </h2>
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border border-border">
          <Icon name="Info" size={20} color="var(--color-muted-foreground)" />
          <p className="text-muted-foreground">Nog geen communicatie over deze melding</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 md:p-8">
      <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-6 flex items-center gap-3">
        <Icon name="MessageSquare" size={24} color="var(--color-primary)" />
        Communicatie
      </h2>
      <div className="space-y-4">
        {communications?.map((comm, index) => (
          <div
            key={index}
            className="bg-muted/50 rounded-lg border border-border p-4 md:p-6"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon name="User" size={20} color="var(--color-primary)" />
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {comm?.from === 'handler' ? 'Behandelaar' : 'Systeem'}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(comm?.timestamp)}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {comm?.message}
            </p>

            {comm?.requiresResponse && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/20 rounded-lg">
                <Icon name="AlertCircle" size={16} color="var(--color-warning)" />
                <span className="text-sm text-warning font-medium">
                  Reactie vereist
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommunicationSection;
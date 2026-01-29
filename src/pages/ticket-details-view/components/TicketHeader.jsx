import React from 'react';
import Icon from '../../../components/AppIcon';

const TicketHeader = ({ ticketNumber, submissionDate, status, workflowType, handlerInfo = null }) => {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'Nieuw':
        return {
          color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
          icon: 'FileText',
          iconColor: 'var(--color-primary)'
        };
      case 'In behandeling':
        return {
          color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
          icon: 'Clock',
          iconColor: 'var(--color-warning)'
        };
      case 'Gesloten':
        return {
          color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
          icon: 'CheckCircle2',
          iconColor: 'var(--color-success)'
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
          icon: 'FileText',
          iconColor: 'var(--color-muted-foreground)'
        };
    }
  };

  const statusConfig = getStatusConfig(status);
  const formattedDate = new Date(submissionDate)?.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6 md:p-8">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon name="FileText" size={24} color="var(--color-primary)" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
                Melding #{ticketNumber}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Ingediend op {formattedDate}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${statusConfig?.color} font-medium`}>
              <Icon name={statusConfig?.icon} size={18} color={statusConfig?.iconColor} />
              <span>{status}</span>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground">
              <Icon name="Workflow" size={18} />
              <span className="text-sm font-medium">{workflowType}</span>
            </div>

            {handlerInfo && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <Icon name="UserCheck" size={18} color="var(--color-primary)" />
                <div>
                  <p className="text-xs text-muted-foreground">Behandelaar</p>
                  <p className="text-sm font-medium text-foreground">{handlerInfo.name || 'Toegewezen'}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {handlerInfo?.assignedAt && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted border border-border">
              <Icon name="Calendar" size={16} className="text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Toegewezen op</p>
                <p className="text-sm font-medium text-foreground">
                  {new Date(handlerInfo.assignedAt).toLocaleDateString('nl-NL', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-success/10 border border-success/20">
            <Icon name="Shield" size={20} color="var(--color-success)" />
            <div>
              <p className="text-sm font-medium text-success">Beveiligde Toegang</p>
              <p className="text-xs text-success/80">Volledig anoniem</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketHeader;
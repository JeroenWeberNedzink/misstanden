import React from 'react';
import Icon from '../../../components/AppIcon';

const SLAStatus = ({ slaDeadline, slaResponseHours, slaResolutionHours, submittedAt, status }) => {
  const now = new Date();
  const submitted = new Date(submittedAt);
  const deadline = slaDeadline ? new Date(slaDeadline) : null;

  const calculateTimeRemaining = (targetDate) => {
    if (!targetDate) return null;
    const diff = targetDate - now;
    if (diff < 0) return { isOverdue: true, text: 'Overschreden' };

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours < 1) {
      return { isOverdue: false, text: `${minutes} minuten` };
    } else if (hours < 24) {
      return { isOverdue: false, text: `${hours} uur ${minutes} min` };
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return { isOverdue: false, text: `${days}d ${remainingHours}u` };
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const timeRemaining = calculateTimeRemaining(deadline);
  const hoursElapsed = (now - submitted) / (1000 * 60 * 60);
  const totalResponseHours = slaResponseHours || 24;
  const responsePercentage = Math.min((hoursElapsed / totalResponseHours) * 100, 100);

  const getStatusColor = () => {
    if (status === 'Gesloten' || status === 'Opgelost') return 'success';
    if (!timeRemaining) return 'muted';
    if (timeRemaining.isOverdue) return 'error';
    if (responsePercentage > 80) return 'warning';
    return 'primary';
  };

  const statusColor = getStatusColor();

  if (status === 'Gesloten' || status === 'Opgelost') {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <Icon name="CheckCircle" size={20} className="text-success" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">SLA Status</h3>
            <p className="text-xs text-muted-foreground">Service Level Agreement</p>
          </div>
        </div>
        <div className="text-center py-4">
          <Icon name="CheckCircle" size={32} className="text-success mx-auto mb-2" />
          <p className="text-sm font-medium text-success">Zaak afgerond binnen SLA</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg bg-${statusColor}/10 flex items-center justify-center`}>
          <Icon name="Clock" size={20} className={`text-${statusColor}`} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">SLA Status</h3>
          <p className="text-xs text-muted-foreground">Service Level Agreement</p>
        </div>
      </div>

      {/* Response Time */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Reactietijd</span>
          {timeRemaining && (
            <span className={`text-xs font-medium ${
              timeRemaining.isOverdue ? 'text-error' : responsePercentage > 80 ? 'text-warning' : 'text-success'
            }`}>
              {timeRemaining.text}
            </span>
          )}
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              timeRemaining?.isOverdue ? 'bg-error' :
              responsePercentage > 80 ? 'bg-warning' :
              'bg-success'
            }`}
            style={{ width: `${Math.min(responsePercentage, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {slaResponseHours || 24} uur reactietijd
          </span>
          {deadline && (
            <span className="text-xs text-muted-foreground">
              {formatDate(deadline)}
            </span>
          )}
        </div>
      </div>

      {/* Resolution Time */}
      {slaResolutionHours && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Oplostijd</span>
            <span className="text-xs text-muted-foreground">
              {slaResolutionHours} uur
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Verwachte afronding binnen {Math.floor(slaResolutionHours / 24)} dagen
          </div>
        </div>
      )}

      {/* Status indicator */}
      <div className={`mt-4 p-3 rounded-lg border flex items-start gap-2 ${
        timeRemaining?.isOverdue
          ? 'bg-error/10 border-error/20'
          : responsePercentage > 80
          ? 'bg-warning/10 border-warning/20'
          : 'bg-success/10 border-success/20'
      }`}>
        <Icon
          name={timeRemaining?.isOverdue ? 'AlertCircle' : responsePercentage > 80 ? 'Clock' : 'CheckCircle'}
          size={16}
          className={`${
            timeRemaining?.isOverdue ? 'text-error' : responsePercentage > 80 ? 'text-warning' : 'text-success'
          } mt-0.5`}
        />
        <div className="flex-1">
          <p className={`text-xs font-medium ${
            timeRemaining?.isOverdue ? 'text-error' : responsePercentage > 80 ? 'text-warning' : 'text-success'
          }`}>
            {timeRemaining?.isOverdue
              ? 'SLA Overschreden'
              : responsePercentage > 80
              ? 'SLA Deadline nadert'
              : 'Binnen SLA'
            }
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {timeRemaining?.isOverdue
              ? 'We werken er hard aan om uw zaak zo snel mogelijk af te handelen'
              : 'Uw zaak wordt behandeld binnen de afgesproken tijd'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default SLAStatus;

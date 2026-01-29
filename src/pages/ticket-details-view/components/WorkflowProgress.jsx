import React from 'react';
import Icon from '../../../components/AppIcon';

const WorkflowProgress = ({ workflowType, currentStage, statusCode }) => {
  // Define workflow stages for different types
  const workflows = {
    whistleblower: [
      { code: 'start', label: 'Start', icon: 'Play' },
      { code: 'advice_phase', label: 'Adviesfase', icon: 'MessageCircle' },
      { code: 'internal_report_submitted', label: 'Interne melding', icon: 'FileText' },
      { code: 'acknowledgment', label: 'Ontvangst bevestigd', icon: 'CheckCircle' },
      { code: 'assessment', label: 'Beoordeling', icon: 'Search' },
      { code: 'investigation', label: 'Onderzoek', icon: 'Eye' },
      { code: 'employer_position', label: 'Standpunt werkgever', icon: 'Briefcase' },
      { code: 'external_report', label: 'Externe melding', icon: 'ExternalLink' },
      { code: 'protection_monitoring', label: 'Bescherming', icon: 'Shield' },
      { code: 'closed', label: 'Afgesloten', icon: 'Archive' }
    ],
    omgangsvormen: [
      { code: 'new', label: 'Nieuw', icon: 'FileText' },
      { code: 'test', label: 'Test', icon: 'TestTube' },
      { code: 'in_behandeling', label: 'In behandeling', icon: 'RefreshCw' },
      { code: 'opgelost', label: 'Opgelost', icon: 'CheckCircle' },
      { code: 'afgesloten', label: 'Afgesloten', icon: 'Archive' }
    ]
  };

  const stages = workflows[workflowType] || workflows.whistleblower;
  const currentStageCode = statusCode || currentStage;
  const currentIndex = stages.findIndex(s => s.code === currentStageCode);

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon name="GitBranch" size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Workflow Voortgang</h3>
          <p className="text-xs text-muted-foreground">Huidige fase: {stages[currentIndex]?.label || 'Onbekend'}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Voortgang</span>
          <span className="text-sm font-medium text-primary">
            {currentIndex + 1} van {stages.length}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / stages.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Stages */}
      <div className="space-y-2">
        {stages.map((stage, index) => {
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div
              key={stage.code}
              className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                isCurrent
                  ? 'bg-primary/10 border-2 border-primary'
                  : isPast
                  ? 'bg-success/5 border border-success/20'
                  : 'bg-muted/30 border border-border'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : isPast
                  ? 'bg-success text-success-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {isPast ? (
                  <Icon name="Check" size={16} />
                ) : (
                  <Icon name={stage.icon} size={16} />
                )}
              </div>

              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  isCurrent
                    ? 'text-primary'
                    : isPast
                    ? 'text-success'
                    : 'text-muted-foreground'
                }`}>
                  {stage.label}
                </p>
              </div>

              {isCurrent && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/20">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                  <span className="text-xs font-medium text-primary">Actief</span>
                </div>
              )}

              {isPast && (
                <Icon name="CheckCircle" size={16} className="text-success" />
              )}
            </div>
          );
        })}
      </div>

      {/* Next step indicator */}
      {currentIndex < stages.length - 1 && (
        <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-start gap-3">
            <Icon name="ArrowRight" size={16} className="text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Volgende Fase</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stages[currentIndex + 1]?.label}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowProgress;

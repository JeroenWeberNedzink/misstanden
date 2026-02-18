import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AnonymousNavHeader from '../../components/navigation/AnonymousNavHeader';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';

const safeLower = (v) => String(v ?? '').trim().toLowerCase();

function resolveNextSteps({ ticketInfo, t, i18n }) {
  const workflowCode = safeLower(
    ticketInfo?.workflowType ||
      ticketInfo?.workflow_type ||
      ticketInfo?.workflowCode ||
      ticketInfo?.workflow_code
  );

  const hasWorkflowSpecific = (n) =>
    workflowCode &&
    typeof i18n?.exists === 'function' &&
    i18n.exists(`reportConfirmation.nextSteps.byWorkflow.${workflowCode}.step${n}`);

  const text = (n) =>
    hasWorkflowSpecific(n)
      ? t(`reportConfirmation.nextSteps.byWorkflow.${workflowCode}.step${n}`)
      : t(`reportConfirmation.nextSteps.step${n}`);

  return [
    { n: 1, icon: 'Inbox', text: text(1) },
    { n: 2, icon: 'FileSearch', text: text(2) },
    { n: 3, icon: 'Bell', text: text(3) },
    { n: 4, icon: 'Eye', text: text(4) },
  ];
}

function Chip({ icon, children, variant = 'default' }) {
  const variants = {
    default: 'bg-muted/30 border-border text-muted-foreground',
    primary: 'bg-primary/10 border-primary/20 text-primary',
    success: 'bg-success/10 border-success/20 text-success',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium ${variants[variant]}`}>
      {icon ? <Icon name={icon} size={12} className="opacity-80" /> : null}
      {children}
    </span>
  );
}

export default function ReportConfirmation() {
  const [ticketInfo, setTicketInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);

  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const raw = sessionStorage.getItem('new_ticket');
    if (!raw) {
      navigate('/anonymous-report-form');
      return;
    }

    const ticket = JSON.parse(raw);

    const normalized = {
      ...ticket,
      workflowType:
        ticket.workflowType ||
        ticket.workflow_type ||
        ticket.workflowCode ||
        ticket.workflow_code ||
        null,
    };

    setTicketInfo(normalized);

    return () => {
      sessionStorage.removeItem('new_ticket');
    };
  }, [navigate]);

  const steps = useMemo(() => {
    if (!ticketInfo) return [];
    return resolveNextSteps({ ticketInfo, t, i18n });
  }, [ticketInfo, t, i18n]);

  const handleCopyCredentials = async () => {
    const text = `Ticket ID: ${ticketInfo?.ticketNumber}\nAccess Code: ${ticketInfo?.accessCode}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
    }
  };

  const handleCheckStatus = () => {
    sessionStorage.setItem('prefill_ticket_id', ticketInfo?.ticketNumber);
    sessionStorage.setItem('prefill_access_code', ticketInfo?.accessCode);
    navigate('/ticket-access-portal');
  };

  const handleNewReport = () => {
    navigate('/anonymous-report-form');
  };

  if (!ticketInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="skeleton h-12 w-48 rounded-lg"></div>
      </div>
    );
  }

  const workflowLabel = ticketInfo?.workflow || ticketInfo?.workflowType || '—';
  const severityLabel = ticketInfo?.severity || ticketInfo?.severityCode || '—';
  const locationLabel = ticketInfo?.location || null;

  return (
    <>
      <AnonymousNavHeader />

      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 mt-5">
        <div className="mx-auto w-full max-w-4xl px-4 pt-20 pb-32 sm:pb-12">
          
          {/* Hero Success Section */}
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-success/20 to-success/5 border-2 border-success/30 mb-6 animate-in zoom-in duration-300">
              <Icon name="CheckCircle" size={40} className="text-success" />
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-sky-600 mb-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {t('reportConfirmation.title')}
            </h1>
            
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
              {t('reportConfirmation.subtitle')}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
              <Chip icon="Workflow" variant="primary">{workflowLabel}</Chip>
              <Chip icon="AlertTriangle">{severityLabel}</Chip>
              {ticketInfo?.attachmentCount ? (
                <Chip icon="Paperclip">{ticketInfo.attachmentCount} bijlage(n)</Chip>
              ) : null}
            </div>
          </div>

          {/* Credentials Card - Hero Element */}
          <div className="mb-6 sm:mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
            <div className="relative overflow-hidden rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card shadow-xl">
              {/* Decorative background pattern */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-success rounded-full blur-3xl"></div>
              </div>

              <div className="relative p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Icon name="Key" size={24} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                      {t('reportConfirmation.credentials.title')}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {t('reportConfirmation.credentials.saveInstructions')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  {/* Ticket ID */}
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-card to-muted/20 border-2 border-border p-5 hover:border-primary/30 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="Hash" size={14} className="text-muted-foreground" />
                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                          {t('reportConfirmation.credentials.ticketId')}
                        </p>
                      </div>
                      <p className="text-2xl sm:text-3xl font-mono font-bold text-foreground break-all">
                        {ticketInfo?.ticketNumber}
                      </p>
                    </div>
                  </div>

                  {/* Access Code */}
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20 p-5 hover:border-primary/40 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors"></div>
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="Lock" size={14} className="text-primary" />
                        <p className="text-[10px] uppercase tracking-widest font-bold text-primary">
                          {t('reportConfirmation.credentials.accessCode')}
                        </p>
                      </div>
                      <p className="text-2xl sm:text-3xl font-mono font-bold text-primary break-all">
                        {ticketInfo?.accessCode}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="default"
                  size="lg"
                  iconName={copied ? 'Check' : 'Copy'}
                  iconPosition="left"
                  onClick={handleCopyCredentials}
                  className="w-full text-base"
                >
                  {copied ? t('reportConfirmation.copied') : t('reportConfirmation.copyCredentials')}
                </Button>
              </div>
            </div>
          </div>

         

          {/* Action Buttons - Desktop */}
          <div className="hidden sm:flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
            <Button
              variant="default"
              size="lg"
              iconName="Eye"
              iconPosition="left"
              onClick={handleCheckStatus}
              className="flex-1 text-base h-14"
            >
              {t('reportConfirmation.actions.checkStatus')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              iconName="Plus"
              iconPosition="left"
              onClick={handleNewReport}
              className="flex-1 text-base h-14"
            >
              {t('reportConfirmation.actions.submitAnother')}
            </Button>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              {t('reportConfirmation.footer')} • {t('reportConfirmation.gdprCompliant')}
            </p>
          </div>
        </div>

        {/* Sticky Mobile Action Bar */}
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 bg-card/98 backdrop-blur-lg border-t-2 border-border shadow-2xl">
          <div className="max-w-2xl mx-auto px-4 py-4 flex gap-3">
            <Button
              variant="default"
              size="md"
              iconName="Eye"
              iconPosition="left"
              onClick={handleCheckStatus}
              className="flex-1 h-12"
            >
              {t('reportConfirmation.actions.checkStatus')}
            </Button>
            <Button
              variant="outline"
              size="md"
              iconName="Plus"
              iconPosition="left"
              onClick={handleNewReport}
              className="flex-1 h-12"
            >
              {t('reportConfirmation.actions.submitAnother')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
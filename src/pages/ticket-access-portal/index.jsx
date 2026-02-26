import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import AnonymousNavHeader from '../../components/navigation/AnonymousNavHeader';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import AccessForm from './components/AccessForm';
import HelpSection from './components/HelpSection';
import SecurityNotice from './components/SecurityNotice';
import ErrorAlert from './components/ErrorAlert';
import { ticketService } from '../../services/ticketService';
import { checkRateLimit, getRateLimitReset, logSecurityEvent } from '../../utils/securityService';

export default function TicketAccessPortal() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth0();
  const { t } = useTranslation();

  useEffect(() => {
    if (isAuthenticated && user) {
      sessionStorage.setItem('auth_token', 'oauth_authenticated');
      if (!sessionStorage.getItem('user_role')) {
        sessionStorage.setItem('user_role', 'handler');
      }
      sessionStorage.setItem('oauth_user', JSON.stringify(user));
    }
  }, [isAuthenticated, user]);

  const handleAccessSubmit = async ({ ticketNumber, accessCode }) => {
    setError('');
    setIsLoading(true);

    // Rate limiting: 5 attempts per minute
    if (!checkRateLimit('ticket_access', 5, 60000)) {
      const resetIn = getRateLimitReset('ticket_access');
      setError(t('ticketAccess.tooManyAttempts', {
        seconds: resetIn,
        defaultValue: 'Too many attempts. Please try again in {{seconds}} seconds.'
      }));
      setIsLoading(false);
      logSecurityEvent('rate_limit_exceeded', { endpoint: 'ticket_access' });
      return;
    }

    try {
      const ticket = await ticketService?.getTicketByCredentials(ticketNumber, accessCode);
      sessionStorage.setItem('current_ticket', JSON.stringify(ticket));
      sessionStorage.setItem('current_ticket_access', JSON.stringify({
        ticketInput: String(ticketNumber || '').trim(),
        accessCode: String(accessCode || '').trim().padStart(6, '0'),
      }));
      logSecurityEvent('ticket_access_success');
      navigate('/ticket-details-view');
    } catch (err) {
      console.error('Access error:', err);
      setError(t('ticketAccess.errorInvalidCredentials'));
      logSecurityEvent('ticket_access_failed', { error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewReport = () => {
    navigate('/anonymous-report-form');
  };

  return (
    <>
      <Helmet>
        <title>{t('ticketAccess.title')} - Misstanden Portal</title>
        <meta name="description" content={t('ticketAccess.subtitle')} />
      </Helmet>

      <AnonymousNavHeader />

      {/* 
        If your header is fixed, margin-top won’t reliably push content down.
        Padding-top does.
        Adjust these values to match your header height:
        - pt-24 (96px) mobile
        - sm:pt-28 (112px) up
      */}
      <div className="min-h-screen app-page-gradient bg-background pt-24 sm:pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          {/* Optional subtle “page top spacer” so content breathes */}
          <div className="pt-4 sm:pt-6 md:pt-8" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 lg:gap-12">
            {/* LEFT */}
            <div className="space-y-6 md:space-y-8">
              <div className="space-y-3 md:space-y-4">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary leading-tight">
                  {t('ticketAccess.title')}
                </h1>

                <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-prose">
                  {t('ticketAccess.subtitle')}
                </p>

                {/* Tiny reassurance row */}
                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border border-border bg-muted/30 text-muted-foreground">
                    <Icon name="Lock" size={14} className="opacity-80" />
                    {t('ticketAccess.secureConnection')}
                  </span>
                  <span className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border border-border bg-muted/30 text-muted-foreground">
                    <Icon name="ShieldCheck" size={14} className="opacity-80" />
                    {t('ticketAccess.anonymousAccess')}
                  </span>
                </div>
              </div>

              <div className="hidden lg:block">
                <HelpSection />
              </div>
            </div>

            {/* RIGHT */}
            <div className="space-y-6 md:space-y-8">
              <div className="card">
                {error && (
                  <div className="mb-6">
                    <ErrorAlert message={error} onDismiss={() => setError('')} />
                  </div>
                )}

                <AccessForm onSubmit={handleAccessSubmit} isLoading={isLoading} />

                <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-border">
                  <div className="text-center space-y-3 md:space-y-4">
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {t('ticketAccess.noReportYet')}
                    </p>
                    <Button
                      variant="outline"
                      fullWidth
                      iconName="Plus"
                      iconPosition="left"
                      onClick={handleNewReport}
                    >
                      {t('ticketAccess.submitNewReport')}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="lg:hidden">
                <SecurityNotice />
              </div>

              <div className="lg:hidden">
                <HelpSection />
              </div>
            </div>
          </div>

          {/* Bottom breathing room */}
          <div className="h-6 sm:h-10" />
        </div>
      </div>
    </>
  );
}


import React, { useEffect, useMemo, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../AppIcon';
import Button from '../ui/Button';
import { accessRequestService } from '../../services/accessRequestService';

const formatDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const NoAccessPage = () => {
  const { user, logout } = useAuth0();
  const [request, setRequest] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoadingRequest, setIsLoadingRequest] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    const loadRequest = async () => {
      if (!user?.sub) {
        setIsLoadingRequest(false);
        return;
      }

      try {
        setIsLoadingRequest(true);
        const row = await accessRequestService.getMyRequest();
        if (!active) return;
        setRequest(row);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Kon aanvraagstatus niet laden.');
      } finally {
        if (active) setIsLoadingRequest(false);
      }
    };

    loadRequest();
    return () => {
      active = false;
    };
  }, [user?.sub]);

  const handleLogout = () => {
    logout({ returnTo: window.location.origin });
  };

  const requestStatus = String(request?.status || '').toLowerCase();
  const hasPendingRequest = requestStatus === 'pending';
  const hasApprovedRequest = requestStatus === 'approved';
  const canSubmitRequest = !request || requestStatus === 'rejected' || requestStatus === 'cancelled';

  const requestStatusText = useMemo(() => {
    if (!request) return 'Nog geen aanvraag';
    if (hasPendingRequest) return `In behandeling sinds ${formatDateTime(request?.createdAt || request?.created_at)}`;
    if (hasApprovedRequest) return `Goedgekeurd op ${formatDateTime(request?.reviewedAt || request?.reviewed_at)}`;
    if (requestStatus === 'rejected') return `Afgewezen op ${formatDateTime(request?.reviewedAt || request?.reviewed_at)}`;
    if (requestStatus === 'cancelled') return 'Geannuleerd';
    return requestStatus || 'Onbekend';
  }, [request, hasPendingRequest, hasApprovedRequest, requestStatus]);

  const handleSubmitRequest = async () => {
    if (!canSubmitRequest || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const result = await accessRequestService.requestAccess({ message });
      setRequest(result?.request || null);
      setSuccess(result?.pendingExists
        ? 'Er staat al een aanvraag in behandeling.'
        : 'Toegangsaanvraag verzonden. Een beheerder beoordeelt deze zo snel mogelijk.');
      if (!result?.pendingExists) {
        setMessage('');
      }
    } catch (err) {
      setError(err?.message || 'Aanvraag verzenden mislukt.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card rounded-xl border border-border p-8 shadow-lg">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mb-4">
            <Icon name="ShieldAlert" size={32} className="text-warning" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Geen Toegang
          </h1>
          <p className="text-muted-foreground">
            Uw account is niet geautoriseerd om dit systeem te gebruiken.
          </p>
        </div>

        <div className="bg-muted/30 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Icon name="Info" size={20} className="text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground mb-1">
                Ingelogd als:
              </p>
              <p className="text-sm text-muted-foreground break-words">
                {user?.email || user?.name || 'Onbekend'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Icon name="AlertTriangle" size={16} className="text-amber-700 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900 mb-1">
                  Waarom zie ik dit?
                </p>
                <p className="text-xs text-amber-800">
                  Uw account is wel succesvol aangemeld, maar u heeft geen toegangsrechten
                  voor deze applicatie. Neem contact op met uw systeembeheerder om toegang
                  aan te vragen.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Icon name="Send" size={16} className="text-sky-700 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-sky-900 mb-1">Toegangsaanvraag</p>
                <p className="text-xs text-sky-800 mb-2">{requestStatusText}</p>

                {isLoadingRequest ? (
                  <p className="text-xs text-sky-800">Status laden...</p>
                ) : (
                  <>
                    {hasPendingRequest && (
                      <p className="text-xs text-sky-800">
                        Uw aanvraag staat in behandeling. U ontvangt toegang zodra een beheerder deze goedkeurt.
                      </p>
                    )}
                    {hasApprovedRequest && (
                      <div className="space-y-2">
                        <p className="text-xs text-emerald-700">
                          Uw aanvraag is goedgekeurd. Ververs de pagina of log opnieuw in om door te gaan.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          iconName="RefreshCw"
                          iconPosition="left"
                          onClick={() => window.location.reload()}
                        >
                          Pagina verversen
                        </Button>
                      </div>
                    )}

                    {canSubmitRequest && !hasApprovedRequest && (
                      <div className="space-y-2">
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          rows={3}
                          maxLength={1000}
                          placeholder="Optioneel: korte toelichting voor de beheerder"
                          className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-sky-300/40"
                        />
                        <Button
                          variant="default"
                          size="sm"
                          iconName="Send"
                          iconPosition="left"
                          onClick={handleSubmitRequest}
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? 'Verzenden...' : 'Toegang aanvragen'}
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {success && (
                  <p className="text-xs text-emerald-700 mt-2">{success}</p>
                )}
                {error && (
                  <p className="text-xs text-rose-700 mt-2">{error}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              variant="outline"
              fullWidth
              iconName="LogOut"
              iconPosition="left"
              onClick={handleLogout}
            >
              Uitloggen
            </Button>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Contact systeembeheerder voor toegang
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">
              Technische details
            </summary>
            <div className="mt-3 space-y-1 font-mono text-xs bg-muted/30 p-3 rounded">
              <p>Email: {user?.email || 'N/A'}</p>
              <p>Name: {user?.name || 'N/A'}</p>
              <p>Status: Niet geautoriseerd</p>
              <p className="text-amber-700">Reden: Geen actief handler-account gevonden</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default NoAccessPage;

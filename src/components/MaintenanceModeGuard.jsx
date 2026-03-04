import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import Icon from './AppIcon';

/**
 * Maintenance Mode Guard
 * Shows maintenance page when maintenance mode is enabled
 * Admins can bypass by adding ?admin=true to URL
 */
const MaintenanceModeGuard = ({ children }) => {
  const { danger, portal, isLoading } = useSettings();
  const formatDateTime = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString('nl-NL');
  };

  // Allow bypass for admins
  const urlParams = new URLSearchParams(window.location.search);
  const adminBypass = urlParams.get('admin') === 'true';

  // Don't block while loading settings
  if (isLoading) {
    return children;
  }

  // If maintenance mode is enabled and no admin bypass
  if (danger.maintenanceMode && !adminBypass) {
    const start = formatDateTime(danger.maintenanceWindowStart);
    const end = formatDateTime(danger.maintenanceWindowEnd);
    const eta = Number(danger.maintenanceEtaMinutes || 0);
    const reason = String(danger.maintenanceReason || '').trim();
    const contactNote = String(danger.maintenanceContactNote || '').trim();

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-2xl w-full">
          <div className="bg-card border-2 border-amber-300 rounded-2xl p-8 text-center shadow-xl">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
              <Icon name="AlertTriangle" size={40} className="text-amber-700" />
            </div>

            <h1 className="text-3xl font-bold text-foreground mb-4">
              Onderhoud
            </h1>

            <p className="text-lg text-muted-foreground mb-6">
              {danger.maintenanceMessage || 'De portal is tijdelijk niet beschikbaar voor onderhoud.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6 text-left">
              {reason && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Reden</div>
                  <div className="text-sm text-foreground">{reason}</div>
                </div>
              )}
              {start && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Start</div>
                  <div className="text-sm text-foreground">{start}</div>
                </div>
              )}
              {end && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Einde</div>
                  <div className="text-sm text-foreground">{end}</div>
                </div>
              )}
              {eta > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Verwachte duur</div>
                  <div className="text-sm text-foreground">{eta} minuten</div>
                </div>
              )}
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-sm text-muted-foreground mt-6">
              <Icon name="Clock" size={16} />
              <span>Probeer het later opnieuw</span>
            </div>

            {contactNote && (
              <div className="mt-4 text-sm text-muted-foreground border border-border rounded-lg bg-background px-4 py-3 text-left">
                {contactNote}
              </div>
            )}

            {portal.supportEmail && (
              <div className="mt-8 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Voor dringende zaken:{' '}
                  <a href={`mailto:${portal.supportEmail}`} className="text-primary hover:underline">
                    {portal.supportEmail}
                  </a>
                </p>
              </div>
            )}
          </div>

          <div className="text-center mt-4">
            <p className="text-xs text-muted-foreground">
              {portal.name} &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Normal mode - render app
  return children;
};

export default MaintenanceModeGuard;

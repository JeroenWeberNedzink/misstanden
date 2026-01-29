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

  // Allow bypass for admins
  const urlParams = new URLSearchParams(window.location.search);
  const adminBypass = urlParams.get('admin') === 'true';

  // Don't block while loading settings
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Icon name="Loader" size={48} className="animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Portal laden...</p>
        </div>
      </div>
    );
  }

  // If maintenance mode is enabled and no admin bypass
  if (danger.maintenanceMode && !adminBypass) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-2xl w-full">
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-xl">
            <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-6">
              <Icon name="AlertTriangle" size={40} className="text-warning" />
            </div>

            <h1 className="text-3xl font-bold text-foreground mb-4">
              Onderhoud
            </h1>

            <p className="text-lg text-muted-foreground mb-6">
              {danger.maintenanceMessage || 'De portal is tijdelijk niet beschikbaar voor onderhoud.'}
            </p>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-sm text-muted-foreground">
              <Icon name="Clock" size={16} />
              <span>Probeer het later opnieuw</span>
            </div>

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

import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../AppIcon';
import Button from '../ui/Button';

const NoAccessPage = () => {
  const { user, logout } = useAuth0();

  const handleLogout = () => {
    logout({ returnTo: window.location.origin });
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

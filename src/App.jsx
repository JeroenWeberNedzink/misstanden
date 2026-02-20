import React, { useEffect, useState } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { SettingsProvider } from "./contexts/SettingsContext";
import Routes from "./Routes";
import { runMigrations } from "./services/migrationService";
import { workflowService } from "./services/workflowService";
import { settingsService } from "./services/SettingsService";
import { translationService } from "./services/translationService";
import { getApiAccessToken, getApiAudience, getApiScope } from "./lib/auth0ApiToken";
import "./styles/tailwind.css";
import "./styles/index.css";

function ServiceTokenBridge() {
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    const provider = async () => getApiAccessToken(getAccessTokenSilently);

    workflowService.setTokenProvider(provider);
    settingsService.setTokenProvider(provider);
    translationService.setTokenProvider(provider);

    return () => {
      workflowService.setTokenProvider(null);
      settingsService.setTokenProvider(null);
      translationService.setTokenProvider(null);
    };
  }, [getAccessTokenSilently]);

  return null;
}

export default function App() {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const apiAudience = getApiAudience();
  const apiScope = getApiScope();
  const [migrationStatus, setMigrationStatus] = useState('pending');
  const [migrationMessage, setMigrationMessage] = useState('');

  if (!domain || !clientId || !apiAudience) {
    console.error("Auth0 configuration missing. Please check your .env file.");
  }

  useEffect(() => {
    const checkAndRunMigrations = async () => {
      const sessionKey = 'migrations_checked';
      if (sessionStorage.getItem(sessionKey)) {
        setMigrationStatus('completed');
        return;
      }

      try {
        console.log('[App] Checking database migrations...');
        const result = await runMigrations();

        if (result.success) {
          setMigrationStatus('completed');
          sessionStorage.setItem(sessionKey, 'true');
        } else if (result.needsManualSetup) {
          setMigrationStatus('needs_setup');
          setMigrationMessage(result.instructions);
          console.warn('[App] Manual setup required:\n', result.instructions);
        } else {
          setMigrationStatus('completed');
          console.warn('[App] Migration check completed with warnings:', result.message);
        }
      } catch (error) {
        console.error('[App] Migration check error:', error);
        setMigrationStatus('completed');
      }
    };

    checkAndRunMigrations();
  }, []);

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(apiAudience ? { audience: apiAudience } : {}),
        scope: ['openid', 'profile', 'email', apiScope].filter(Boolean).join(' '),
      }}
      useRefreshTokens={true}
      cacheLocation="localstorage"
    >
      <ServiceTokenBridge />
      <SettingsProvider>
        {migrationStatus === 'needs_setup' && (
          <div className="fixed top-4 right-4 z-[10000] max-w-md bg-amber-50 border border-amber-200 rounded-lg shadow-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                <span className="text-amber-600 text-sm">!</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-amber-900 mb-1">
                  Database Setup Required
                </h3>
                <p className="text-xs text-amber-800 mb-2">
                  Email notification system needs manual setup. Check console for instructions.
                </p>
                <button
                  onClick={() => setMigrationStatus('completed')}
                  className="text-xs text-amber-700 underline hover:text-amber-900"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <Routes />
      </SettingsProvider>
    </Auth0Provider>
  );
}

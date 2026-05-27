import React, { useEffect, useLayoutEffect, useState } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { SettingsProvider } from "./contexts/SettingsContext";
import Routes from "./Routes";
import { runMigrations } from "./services/migrationService";
import {
  getApiAccessToken,
  getApiAudience,
  getApiAudienceIssue,
  getApiScope,
  getOptionalApiAccessToken,
} from "./lib/auth0ApiToken";
import { setSharedTokenProvider } from "./lib/serviceTokenProvider";
import "./styles/tailwind.css";
import "./styles/index.css";

const parseJwtExpiryMs = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return 0;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const exp = Number(payload?.exp || 0);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
};

function ServiceTokenBridge() {
  const { getAccessTokenSilently } = useAuth0();

  useLayoutEffect(() => {
    let cachedToken = '';
    let cachedExpMs = 0;
    const audienceIssue = getApiAudienceIssue();
    const provider = async (options = {}) => {
      if (audienceIssue) {
        return null;
      }

      const forceRefresh = options?.forceRefresh === true;
      const now = Date.now();
      if (!forceRefresh && cachedToken && cachedExpMs - now > 30_000) {
        return cachedToken;
      }

      let token = '';
      if (forceRefresh) {
        token = await getApiAccessToken(getAccessTokenSilently, { cacheMode: 'off' });
      } else {
        try {
          token = await getOptionalApiAccessToken(getAccessTokenSilently);
          if (!token) {
            return null;
          }
        } catch {
          token = await getApiAccessToken(getAccessTokenSilently, { cacheMode: 'off' });
        }
      }

      cachedToken = token;
      cachedExpMs = parseJwtExpiryMs(token) || (now + 60_000);
      return token;
    };

    setSharedTokenProvider(provider);

    if (audienceIssue) {
      const message = audienceIssue === 'tenant'
        ? '[Auth0] VITE_AUTH0_AUDIENCE is set to the Auth0 tenant URL. Set it to the API audience to enable authenticated requests.'
        : '[Auth0] VITE_AUTH0_AUDIENCE is configured for the MFA flow. Set it to the API audience to enable authenticated requests.';
      console.warn(
        message
      );
    }
  }, [getAccessTokenSilently]);

  return null;
}

export default function App() {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const apiAudience = getApiAudience();
  const apiAudienceIssue = getApiAudienceIssue();
  const auth0Audience = apiAudienceIssue ? '' : apiAudience;
  const apiScope = getApiScope();
  const [migrationStatus, setMigrationStatus] = useState('pending');
  const [migrationMessage, setMigrationMessage] = useState('');

  if (!domain || !clientId) {
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
        ...(auth0Audience ? { audience: auth0Audience } : {}),
        scope: ['openid', 'profile', 'email', 'offline_access', ...(auth0Audience ? [apiScope] : [])].filter(Boolean).join(' '),
      }}
      useRefreshTokens={true}
      useRefreshTokensFallback={true}
      cacheLocation="localstorage"
    >
      <ServiceTokenBridge />
      {apiAudienceIssue && (
        <div className="fixed top-4 left-4 right-4 z-[10000] mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
          <p className="text-sm font-semibold text-amber-900">
            Auth0 audience misconfigured
          </p>
          <p className="mt-1 text-xs text-amber-800">
            <code>VITE_AUTH0_AUDIENCE</code> must be your Auth0 API identifier, not the tenant URL or MFA audience.
          </p>
        </div>
      )}
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

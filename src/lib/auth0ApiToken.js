const API_AUDIENCE = String(import.meta.env?.VITE_AUTH0_AUDIENCE || '').trim();
const AUTH0_DOMAIN = String(import.meta.env?.VITE_AUTH0_DOMAIN || '').trim();
const API_SCOPE = String(import.meta.env?.VITE_AUTH0_API_SCOPE || '').trim();
const RECOVERABLE_AUTH0_ERROR_HINTS = [
  'invalid_grant',
  'unknown or invalid refresh token',
  'missing refresh token',
  'missing_refresh_token',
  'refresh token',
  'login_required',
  'consent_required',
  'interaction_required',
];
const OPTIONAL_TOKEN_COOLDOWN_MS = 10_000;

let optionalTokenPromise = null;
let optionalTokenRetryAfterMs = 0;

const mergeScope = (baseScope = '', extraScope = '') => {
  const parts = `${baseScope} ${extraScope}`
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' ');
};

const getAuth0ErrorText = (error) => {
  return `${error?.error || ''} ${error?.error_description || ''} ${error?.message || ''}`
    .toLowerCase()
    .trim();
};

export const getApiAudience = () => {
  return API_AUDIENCE;
};
export const getApiScope = () => API_SCOPE;

export const getApiAudienceIssue = () => {
  if (!API_AUDIENCE) {
    return 'missing';
  }

  const normalizedAudience = API_AUDIENCE.replace(/\/+$/, '').toLowerCase();
  const tenantAudience = AUTH0_DOMAIN
    ? `https://${AUTH0_DOMAIN}`.replace(/\/+$/, '').toLowerCase()
    : '';

  if (tenantAudience && normalizedAudience === tenantAudience) {
    return 'tenant';
  }

  if (API_AUDIENCE.toLowerCase().includes('/mfa/')) {
    return 'mfa';
  }

  return null;
};

export const isValidApiAudience = () => {
  return !getApiAudienceIssue();
};

export const isRecoverableAuth0SessionError = (error) => {
  const text = getAuth0ErrorText(error);
  if (!text) return false;
  return RECOVERABLE_AUTH0_ERROR_HINTS.some((hint) => text.includes(hint));
};

export const getApiAccessToken = async (getAccessTokenSilently, { scope = '', cacheMode } = {}) => {
  if (typeof getAccessTokenSilently !== 'function') {
    throw new Error('Auth0 getAccessTokenSilently is not available');
  }
  const audience = getApiAudience();
  if (!audience) {
    throw new Error('Missing VITE_AUTH0_AUDIENCE for API access tokens');
  }
  const audienceIssue = getApiAudienceIssue();
  if (audienceIssue === 'mfa') {
    throw new Error('VITE_AUTH0_AUDIENCE is configured for the MFA flow. Set it to your API audience instead.');
  }
  if (audienceIssue === 'tenant') {
    throw new Error('VITE_AUTH0_AUDIENCE is set to the Auth0 tenant URL. Set it to your API audience instead.');
  }

  const mergedScope = mergeScope(API_SCOPE, scope);
  const options = {
    authorizationParams: {
      audience,
      ...(mergedScope ? { scope: mergedScope } : {}),
    },
  };
  if (cacheMode) {
    options.cacheMode = cacheMode;
  }
  return getAccessTokenSilently(options);
};

export const getOptionalApiAccessToken = async (getAccessTokenSilently, options = {}) => {
  if (getApiAudienceIssue()) {
    return null;
  }

  if (Date.now() < optionalTokenRetryAfterMs) {
    return null;
  }

  if (optionalTokenPromise) {
    return optionalTokenPromise;
  }

  optionalTokenPromise = (async () => {
    try {
      const token = await getApiAccessToken(getAccessTokenSilently, options);
      optionalTokenRetryAfterMs = 0;
      return token;
    } catch (error) {
      if (isRecoverableAuth0SessionError(error)) {
        optionalTokenRetryAfterMs = Date.now() + OPTIONAL_TOKEN_COOLDOWN_MS;
        return null;
      }
      throw error;
    } finally {
      optionalTokenPromise = null;
    }
  })();

  return optionalTokenPromise;
};

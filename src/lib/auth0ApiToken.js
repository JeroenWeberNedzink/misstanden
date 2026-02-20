const API_AUDIENCE = String(import.meta.env?.VITE_AUTH0_AUDIENCE || '').trim();
const API_SCOPE = String(import.meta.env?.VITE_AUTH0_API_SCOPE || '').trim();
const AUTH0_DOMAIN = String(import.meta.env?.VITE_AUTH0_DOMAIN || '').trim();

const mergeScope = (baseScope = '', extraScope = '') => {
  const parts = `${baseScope} ${extraScope}`
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts)).join(' ');
};

export const getApiAudience = () => {
  if (API_AUDIENCE) return API_AUDIENCE;
  if (AUTH0_DOMAIN) return `https://${AUTH0_DOMAIN}/mfa/`;
  return '';
};
export const getApiScope = () => API_SCOPE;

export const getApiAccessToken = async (getAccessTokenSilently, { scope = '', cacheMode } = {}) => {
  if (typeof getAccessTokenSilently !== 'function') {
    throw new Error('Auth0 getAccessTokenSilently is not available');
  }
  const audience = getApiAudience();
  if (!audience) {
    throw new Error('Missing VITE_AUTH0_AUDIENCE for API access tokens');
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

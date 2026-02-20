# Security Model

## Token Model

- Access token is required for API authorization.
  - Frontend obtains API tokens via `getAccessTokenSilently({ authorizationParams: { audience: VITE_AUTH0_AUDIENCE, scope: ... } })`.
  - PHP API endpoints verify access tokens against Auth0 JWKS and enforce issuer, audience, signature, and expiry checks.
- ID token is only for UI identity.
  - ID tokens must not be used as API bearer tokens.
  - API token verification explicitly rejects ID-token-shaped payloads.

## Auth0 API Validation Rules

- Signature verified with Auth0 JWKS (`RS256`).
- Strict issuer match: `https://<VITE_AUTH0_DOMAIN>/`.
- Audience must include `VITE_AUTH0_AUDIENCE`.
- `exp` must be valid (expired tokens rejected).
- `nbf`/`iat` sanity checks enforced.
- Tokens with `nonce`, `at_hash`, or `c_hash` claims are rejected for API use.

## Operational Notes

- Keep `VITE_AUTH0_AUDIENCE` and `VITE_AUTH0_API_SCOPE` aligned with Auth0 API configuration.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- Never send Auth0 ID tokens to backend APIs.

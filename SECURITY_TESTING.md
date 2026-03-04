# Security Testing Checklist

Use this checklist after deployment or security-related config changes.

## 1) Admin Scope Enforcement

1. Call an admin API with a valid admin token that includes required scope.
Expected: `200`.
2. Call the same API with a valid admin token missing required scope.
Expected: `403` with `Insufficient scope`.

Minimum endpoints:
- `GET /api/settings.api.php?include_sensitive=1`
- `POST /api/settings.api.php`
- `GET /api/workflows.api.php?action=list_with_stats`
- `POST /api/workflows.api.php`
- `GET /api/translations.api.php?action=list&lang=nl`
- `POST /api/translations.api.php`
- `POST /api/sla-backfill.api.php` (admin mode)

## 2) Security Self-Test Endpoint

1. Call `GET /api/security-self-test.api.php` with admin token + `admin:security:read`.
Expected:
- `success: true`
- `data.checks` booleans present
- No secrets in response
2. Call without token or without required scope.
Expected: `401` or `403`.

## 3) API Security Headers

Verify on API responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

Production only:
- `Content-Security-Policy` present.

Sensitive responses should also include no-store headers:
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private`
- `Pragma: no-cache`
- `Expires: 0`

Minimum endpoints to verify no-store behavior:
- `POST /api/tickets.api.php` with `action=access`
- `POST /api/tickets.api.php` with `action=message`
- `POST /api/tickets.api.php` with `action=reporter_add_attachment`
- `GET /api/settings.api.php` (admin settings reads)
- `GET /api/translations.api.php?action=export&lang=nl`
- `POST /api/translations.api.php` with `action=import`

## 4) Signed URL TTL

1. Open ticket access response and inspect attachment `file_url` signed query.
Expected: URL is short-lived and re-generated on access.
2. Verify configured/default TTL is `120` seconds via:
- `GET /api/security-self-test.api.php` -> `data.config.signed_url_ttl_seconds`
3. Verify old persisted signed URLs are not reused when storage path can be derived.

## 5) Rate Limiting

Verify `429` behavior with `retry_after` on repeated bursts:
- Anonymous report submission (`tickets.api.php` `action=create`)
- Reporter ticket access (`action=access`)
- Reporter messaging (`action=message`)
- Reporter attachment upload (`action=reporter_add_attachment`)
- Handler/admin mutations:
  - `settings.api.php` POST
  - `workflows.api.php` POST
  - `translations.api.php` POST/PUT/DELETE
  - `sla-backfill.api.php` POST (admin mode)
  - `tickets.api.php` handler mutation actions

Checks:
- Legitimate office usage behind NAT should not be blocked prematurely.
- Limits should primarily key on actor/ticket context for mutation routes.
- No raw IP should be persisted in logs/rate-limit identifiers (hashed fingerprints only).

## 6) Regression Checks

1. Reporter flow still works:
- Create ticket
- Access ticket with access code
- Send reporter message
2. Handler flow still works:
- Load dashboard
- Open case detail
- Update status/priority/assignment
3. Translation admin flow still works:
- List and update translation key.

## 7) Email Verification Flow

1. Open profile page with an unverified Auth0 email account.
Expected:
- Badge shows `E-mail niet geverifieerd`
- Button `Verificatie e-mail sturen` visible.
2. Click `Verificatie e-mail sturen`.
Expected:
- `200` from `POST /api/email-verification.api.php`
- Confirmation message shown in UI
- No secrets/tokens returned in response body.
3. Complete verification from received email and refresh status.
Expected:
- `status` action returns `email_verified: true`
- Profile badge updates to `E-mail geverifieerd`.
4. Abuse check:
- Trigger repeated `send` actions rapidly.
Expected:
- Endpoint eventually returns `429` due to rate limit.
5. Enterprise identity check (Entra/Google/etc):
- Open profile on an externally federated account.
Expected:
- Status still loads.
- Send button is disabled with a clear warning that Auth0 verification-email is unsupported for this identity type.

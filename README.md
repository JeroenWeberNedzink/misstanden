# NZ Misstanden Portal

Internal whistleblower and case-management portal built with React, Auth0, SQL Server, and PHP API helpers.

## At A Glance

This repository contains:
- Reporter-facing anonymous or known incident intake
- Reporter ticket-access portal
- Handler and admin case-management UI
- Workflow and SLA orchestration
- Role and permission management
- Localized UI and localized email notifications

## Recent Highlights (2026-03)

- Advanced case-management and analytics expansion
  - New secure reporter reply channel with tokenized links (`/reply/{token}`)
  - Handler message delay anonymizer (`messages.visible_at`) for reporter-facing timing protection
  - Multi-handler assignment roles (`primary`, `secondary`, `legal`, `observer`)
  - Scheduled first-response SLA escalation engine with optional compliance/admin email notifications
  - Admin analytics dashboard with volume/category/location/SLA metrics and heatmap-style location chart
  - Case PDF export endpoint for investigation reports (`/api/report.api.php`)
  - Temporary guest access links for external investigators (`/guest/{token}`) with internal-note shielding

- Access-request flow for OAuth users without handler access
  - New API: `/api/access-requests.api.php`
  - New migration: `20260305_create_access_requests_table.sql`
  - Admin approval and rejection flow added in user/admin UI
  - Optional admin and requester email notifications on request and decision
- Workflow first-response marker
  - New migration: `20260305_add_workflow_status_first_response_flag.sql`
  - Workflow status model now supports explicit `is_first_response`
- Ticket handlers relation fix for production
  - New migration: `20260305_fix_ticket_handlers_api_access.sql`
  - Ensures `public.ticket_handlers` exists, grants are in place, and PostgREST cache is reloaded
- Settings API IIS hardening
  - Runtime env discovery improved for different deploy layouts
  - Settings endpoint supports robust IIS runtime discovery and diagnostics
  - Optional `?debug=1` on settings endpoint returns redacted error detail
  - SQL Server-backed settings loading for both local and IIS deployments
- Settings admin module i18n cleanup
  - Module cards in Settings > Admin Center are now fully translation-key driven across locales
- Case management update
  - Case description editing is now read-only for handlers in case detail screens

## Tech Stack

Frontend:
- React 18
- React Router v6
- Vite 7
- Tailwind CSS 3
- i18next + react-i18next
- Auth0 React SDK

Data and auth:
- SQL Server
- Auth0 (login and MFA-related flows)

Backend helpers:
- PHP API endpoints under `public/api`
- PHPMailer for SMTP sending
- Optional outbox sink for dev email testing

## Repository Layout

```txt
docs/                     Operational and security docs
src/
  components/             Shared UI and auth/navigation guards
  contexts/               Global settings context
  hooks/                  Permission and utility hooks
  i18n/                   i18next config + locale JSON files
  lib/                    Shared auth and utility helpers
  pages/                  Route-level pages
  services/               Domain logic + data access
  styles/                 Tailwind and global styles
public/api/               PHP API endpoints + PHPMailer + templates
backups/translations/     Translation API backups
scripts/sqlserver/        SQL Server schema/bootstrap scripts
scripts/                  Helper scripts (including SLA backfill runner)
run/                      Runtime cache and rate-limit state (local)
logs/                     Local runtime logs
private/keys/             Local encryption keys (not committed)
nz-startup.ps1            Local dev orchestrator (PHP + Vite)
```

## Application Architecture

Main flow:
- `src/index.jsx` bootstraps React and i18n
- `src/App.jsx` wires Auth0, SettingsProvider, and token bridge for services
- `src/Routes.jsx` defines public and protected routes

Data layer:
- Frontend domain services in `src/services`
- PHP APIs backed by SQL Server

API layer:
- Vite proxy forwards `/api/*` to local PHP server in development
- Production uses PHP API scripts under `public/api`

### Main PHP Endpoints

- `/api/me.api.php`
- `/api/email-verification.api.php`
- `/api/access-requests.api.php`
- `/api/tickets.api.php`
- `/api/reporter-reply.api.php`
- `/api/guest-access.api.php`
- `/api/analytics.api.php`
- `/api/sla-escalation.api.php`
- `/api/report.api.php`
- `/api/settings.api.php`
- `/api/workflows.api.php`
- `/api/translations.api.php`
- `/api/sla-backfill.api.php`
- `/api/security-self-test.api.php`
- `/api/mfa.api.php`
- `/api/mail.api.php`

## Core Functional Areas

Public and reporter:
- Anonymous incident submission with attachments
- Report confirmation with ticket and access-code flow
- Reporter ticket access and secure communication
- Token-based secure reply threads via `/reply/{token}`
- Reporter-visible handler messages filtered by `visible_at` delay

Handler and admin:
- Handler dashboard and ticket handling
- Case detail management (status, assignment, notes, communications, SLA)
- Multi-handler case roles and role switching in case detail
- Workflow and workflow-status administration
- Users, roles, and permissions management
- Access-request review and decision workflow
- Handler profile, MFA, and notification preferences
- System settings and admin modules
- Notification and audit/logging tooling
- Analytics dashboard and location heatmap
- PDF investigation report generation
- Guest access link generation for external investigators

Cross-cutting:
- RBAC and protected routes
- Dynamic runtime settings
- Email orchestration and templates
- i18n locale management and translation import/export

## Local Development

Prerequisites:
- Node.js 18+
- npm
- PHP 8+ (recommended)
- SQL Server access
- Auth0 application and API configuration

Install:

```bash
npm install
```

Install PHP dependency for PDF export:

```bash
composer install
```

Start (recommended on Windows PowerShell):

```powershell
.\nz-startup.ps1
```

Local IIS deploy from your workstation:

```powershell
.\nz-startup.ps1 local
```

This runs a fresh `npm run build` and syncs `dist/` into `\\nz-web02\Websites\misstanden.nedzink.nl`.
Before building, it runs the backend/API pipeline tests with mutation and performance probes. After deploy, it runs the settings health check and a non-mutating smoke/performance probe against the IIS URL.
It also copies `.env`, optional `.env.local`, `cacert.pem`, and mirrors `vendor/` and `private/` when present so the IIS PHP runtime can boot correctly.
After deploy it calls `https://misstanden.nedzink.nl/api/settings.api.php?debug=1` (or `MISSTANDEN_DEPLOY_URL`) and prints the response for a quick sanity check.

Emergency skip flags:

```powershell
.\nz-startup.ps1 local -SkipTests
.\nz-startup.ps1 local -SkipPerformance
.\nz-startup.ps1 local -SkipMutatingTests
.\nz-startup.ps1 local -SkipPostDeploySmoke
```

Optional strict audience check:

```powershell
.\nz-startup.ps1 -RequireAuth0Audience
```

Manual start:

```bash
php -S 127.0.0.1:8081 -t public
npm run dev
```

Default local URLs:
- Frontend: `http://127.0.0.1:3000`
- PHP API: `http://127.0.0.1:8081`

## Backend Testing And Performance

The project includes a lightweight backend smoke runner with no extra npm packages. It checks PHP syntax, sends `OPTIONS` requests to every `public/api/*.api.php` endpoint, tests public read endpoints, confirms protected endpoints reject unauthenticated access, and can optionally run API latency checks.

Quick local API check:

```powershell
npm run test:api
```

Full local check with a disposable ticket and performance probes:

```powershell
npm run test:api:full
```

Performance-only probe:

```powershell
npm run test:performance
```

Useful options:

```powershell
node scripts/api-backend-test.mjs --base-url=https://misstanden.nedzink.nl --performance
node scripts/api-backend-test.mjs --start-server --mutate --performance
```

Environment variables:
- `API_TEST_BASE_URL`: API host to test. Defaults to `http://127.0.0.1:8081`.
- `API_TEST_AUTH_TOKEN`: optional Auth0 bearer token for admin/handler-only endpoint checks.
- `AUTH0_API_TEST_CLIENT_ID` / `AUTH0_API_TEST_CLIENT_SECRET`: recommended Machine-to-Machine client credentials used by `.\nz-startup.ps1 local` to fetch a short-lived API token automatically.
- `API_TEST_MUTATE=1`: creates a disposable ticket and verifies reporter access/message flows.
- `API_TEST_PERFORMANCE=1`: runs repeated timing probes.
- `API_TEST_WARN_MS` / `API_TEST_FAIL_MS`: latency thresholds for performance probes.

Auth0 token source:
- Best option: Auth0 Dashboard > Applications > `Misstanden API (Test Application)` > Credentials. Put its Client ID and Client Secret in `.env.local` or `.env` as `AUTH0_API_TEST_CLIENT_ID` and `AUTH0_API_TEST_CLIENT_SECRET`.
- Also verify Auth0 Dashboard > APIs > your Misstanden API > Machine to Machine Applications: the test application must be authorized for the API and granted the scopes in `API_TEST_AUTH_SCOPE`.
- One-off option: paste a short-lived access token into the current PowerShell session with `$env:API_TEST_AUTH_TOKEN="..."`. The startup script will use that token instead of requesting one.

## Environment Variables

Use `.env.local` and/or `.env`.

Frontend-required (`VITE_*`):
- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`
- `VITE_AUTH0_API_SCOPE`
- `VITE_SUPER_ADMIN_EMAILS` (optional allowlist)
- `VITE_SUPER_ADMIN_SUBS` (optional allowlist)

Server-required (non-`VITE_*`):
- `SQLSERVER_HOST`
- `SQLSERVER_PORT`
- `SQLSERVER_DATABASE`
- `SQLSERVER_USERNAME`
- `SQLSERVER_PASSWORD`

Common server-side optional:
- `SLA_BACKFILL_CRON_KEY`
- `SLA_ESCALATION_CRON_KEY`
- `SLA_ESCALATION_EMAILS`
- `EMAIL_ENC_KEY_PATH`
- `MAIL_DEV_SINK`
- `MAIL_OUTBOX_DIR`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_AUTH`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `MAIL_DEFAULT_FROM`, `MAIL_DEFAULT_FROM_NAME`
- `PORTAL_BASE_URL`
- `MAIL_API_INTERNAL_URL`
- `ACCESS_REQUEST_ADMIN_EMAILS`
- `REPORTER_REPLY_TOKEN_TTL_DAYS`

Important:
- Never put secrets in `VITE_*` variables. They are exposed to browser code.
- PHP runtime includes env aliases for deployment compatibility:
  - `AUTH0_DOMAIN` -> `VITE_AUTH0_DOMAIN`
  - `AUTH0_CLIENT_ID` -> `VITE_AUTH0_CLIENT_ID`
  - `AUTH0_AUDIENCE` -> `VITE_AUTH0_AUDIENCE`
  - SQL Server settings are read directly from `SQLSERVER_*`

## Automated SLA Jobs (Windows/IIS)

Use scheduled execution in production.

Run manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-sla-backfill.ps1 -ApiUrl "https://your-domain/api/sla-backfill.api.php"
```

Example scheduled task (hourly):

```powershell
schtasks /Create /TN "NZ-SLA-Backfill" /SC HOURLY /MO 1 /TR "powershell -ExecutionPolicy Bypass -File C:\Projects\nz-misstanden\scripts\run-sla-backfill.ps1 -ApiUrl https://your-domain/api/sla-backfill.api.php" /RU "SYSTEM"
```

SLA escalation endpoint trigger example:

```powershell
Invoke-RestMethod -Method Post -Uri "https://your-domain/api/sla-escalation.api.php" -Headers @{ "X-SLA-ESCALATION-KEY" = "<your-key>" } -ContentType "application/json" -Body "{}"
```

## Database and Migrations

SQL Server schema/bootstrap scripts live in `scripts/sqlserver/`.

Key files:
- `bootstrap-schema.sql`
- `bootstrap-system-settings.sql`

## IIS Deployment

Build:

```bash
npm run build
```

Deploy:
1. Copy the contents of `dist/` to IIS site root.
2. Keep `api/` directory from build output (contains PHP endpoints and `api/web.config`).
3. Place `.env` in IIS site root (same level as `index.html` and `api`), or in parent root if your layout requires it.
4. Ensure app pool identity can read `.env` and API files.

Notes:
- `api/web.config` includes PHP handler mapping and request filtering defaults. Validate `scriptProcessor` path for your server.
- For SPA deep links, ensure IIS rewrite routes unknown paths to `/index.html`.

## Troubleshooting

`/api/settings.api.php` returns 500 with `SQL Server is not configured`:
- Ensure `.env` exists on IIS host in the deployed root
- Ensure file permissions allow IIS to read it
- Ensure `SQLSERVER_HOST`, `SQLSERVER_DATABASE`, `SQLSERVER_USERNAME`, and `SQLSERVER_PASSWORD` are present for PHP runtime

Need deeper settings error diagnostics:
- Call `/api/settings.api.php?debug=1` to receive redacted error detail and `error_id`

`/api/report.api.php` returns JSON error about missing dompdf:
- Run `composer install` in project root
- Ensure `vendor/` is deployed to IIS alongside `public/api`

Reporter secure reply link fails with token errors:
- Check `ticket_reply_tokens` migration is applied
- Validate token expiry (`REPORTER_REPLY_TOKEN_TTL_DAYS`)
- Ensure SQL Server connection settings are present for PHP runtime

## Security Notes

- API endpoints use Auth0 access tokens for server authorization
- ID tokens are rejected by admin APIs
- Sensitive failures return `error_id` and redact internal detail in normal mode
- Rate limiting and security headers are applied in PHP API layer
- Attachment access is signed and time-limited
- Browser-side anon key is expected; real access control must be enforced by DB policies and API authorization

Security runbooks:
- `SECURITY.md`
- `SECURITY_TESTING.md`
- `SECURITY_ROTATION_CHECKLIST.md`

## i18n and Translations

Locales:
- `src/i18n/locales/en/translation.json`
- `src/i18n/locales/nl/translation.json`
- `src/i18n/locales/fr/translation.json`
- `src/i18n/locales/de/translation.json`
- `src/i18n/locales/pt/translation.json`

Translation API:
- `public/api/translations.api.php`
- Supports list/export/import/update/delete and backup creation in `backups/translations`

## Build and Validation

Full local IIS pipeline:

```powershell
.\nz-startup.ps1 local
```

Build only:

```bash
npm run build
```

Quick checks before release:
- `npm run test:api:full` passes locally
- Build succeeds
- Settings API responds in target environment
- Access-request approval flow works end-to-end
- Workflow admin reflects first-response status flag behavior
- Ticket handler relation reads succeed against SQL Server
- Reporter secure reply route (`/reply/{token}`) can read/send/upload
- Guest route (`/guest/{token}`) loads read-only ticket without internal notes
- SLA escalation endpoint can run with cron key and records `sla_escalations`
- Analytics dashboard loads metrics and charts
- PDF report generation works (`composer install` + `/api/report.api.php`)

## Developer Notes

- Register new pages in `src/Routes.jsx`
- Keep domain logic in `src/services`, not in page components
- Keep translation keys namespaced (for example `settings.*`, `caseManagement.*`)
- Use `npm run test:api`, `npm run test:api:full`, and `npm run test:performance` before risky backend changes

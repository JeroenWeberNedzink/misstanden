# NZ Misstanden Portal

Internal whistleblower and case-management portal built with React, Supabase, Auth0, and PHP API helpers.

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
  - Settings endpoint supports HTTP fallback if cURL is unavailable
  - Optional `?debug=1` on settings endpoint returns redacted error detail
  - Server env aliases added (example: `SUPABASE_URL` can populate `VITE_SUPABASE_URL` in PHP runtime)
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
- Supabase (PostgREST + Storage)
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
  lib/                    Shared clients (Supabase/Auth helpers)
  pages/                  Route-level pages
  services/               Domain logic + data access
  styles/                 Tailwind and global styles
public/api/               PHP API endpoints + PHPMailer + templates
backups/translations/     Translation API backups
supabase/migrations/      SQL migrations
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
- Shared Supabase client in `src/lib/supabase.js`

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
- Supabase project
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

## Environment Variables

Use `.env.local` and/or `.env`.

Frontend-required (`VITE_*`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`
- `VITE_AUTH0_API_SCOPE`

Server-required (non-`VITE_*`):
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`)

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
  - `SUPABASE_URL` -> `VITE_SUPABASE_URL`
  - `AUTH0_DOMAIN` -> `VITE_AUTH0_DOMAIN`
  - `AUTH0_CLIENT_ID` -> `VITE_AUTH0_CLIENT_ID`
  - `AUTH0_AUDIENCE` -> `VITE_AUTH0_AUDIENCE`

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

Migrations live in `supabase/migrations`.

Recent key migrations:
- `20260219_create_handlers_table.sql`
- `20260219_create_ticket_handlers.sql`
- `20260219_capture_policy_baseline.sql`
- `20260219_harden_system_settings_access.sql`
- `20260219_harden_workflow_write_access.sql`
- `20260219_restore_workflow_read_access.sql`
- `20260305_create_access_requests_table.sql`
- `20260305_add_workflow_status_first_response_flag.sql`
- `20260305_fix_ticket_handlers_api_access.sql`
- `20260306_create_ticket_reply_tokens.sql`
- `20260306_add_messages_visible_at.sql`
- `20260306_extend_ticket_handlers_roles.sql`
- `20260306_create_sla_escalations.sql`
- `20260306_create_guest_access.sql`

If production shows `ticket_handlers ... 404 Not Found`, run:
- `20260305_fix_ticket_handlers_api_access.sql`

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

`/api/settings.api.php` returns 500 with `Missing required environment variable: VITE_SUPABASE_URL`:
- Ensure `.env` exists on IIS host in the deployed root
- Ensure file permissions allow IIS to read it
- You may also set `SUPABASE_URL` (env alias support is available)

`/rest/v1/ticket_handlers ... 404 Not Found` from frontend:
- Table or PostgREST grants/schema cache are not aligned in target Supabase environment
- Apply `20260305_fix_ticket_handlers_api_access.sql`

Need deeper settings error diagnostics:
- Call `/api/settings.api.php?debug=1` to receive redacted error detail and `error_id`

`/api/report.api.php` returns JSON error about missing dompdf:
- Run `composer install` in project root
- Ensure `vendor/` is deployed to IIS alongside `public/api`

Reporter secure reply link fails with token errors:
- Check `ticket_reply_tokens` migration is applied
- Validate token expiry (`REPORTER_REPLY_TOKEN_TTL_DAYS`)
- Ensure `VITE_SUPABASE_URL` and service key are present for PHP runtime

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

Build:

```bash
npm run build
```

Quick checks before release:
- Build succeeds
- Settings API responds in target environment
- Access-request approval flow works end-to-end
- Workflow admin reflects first-response status flag behavior
- Ticket handler relation reads succeed in target Supabase project
- Reporter secure reply route (`/reply/{token}`) can read/send/upload
- Guest route (`/guest/{token}`) loads read-only ticket without internal notes
- SLA escalation endpoint can run with cron key and records `sla_escalations`
- Analytics dashboard loads metrics and charts
- PDF report generation works (`composer install` + `/api/report.api.php`)

## Developer Notes

- Register new pages in `src/Routes.jsx`
- Keep domain logic in `src/services`, not in page components
- Keep translation keys namespaced (for example `settings.*`, `caseManagement.*`)
- There is no dedicated automated test suite configured in `package.json`; validate with focused manual checks and `npm run build`

# NZ Misstanden Portal

Internal whistleblower/case-management portal built with React, Supabase, Auth0, and PHP API helpers.

It supports:
- Anonymous incident reporting
- Secure ticket access for reporters
- Handler/admin case management
- Workflow + SLA tracking
- Role/permission management
- Localized UI and localized email notifications

## Tech Stack

Frontend:
- React 18
- React Router v6
- Vite 7
- Tailwind CSS 3
- i18next + react-i18next
- Auth0 React SDK

Data/Auth:
- Supabase (PostgREST + Storage)
- Auth0 (login + MFA-related flows)

Backend helpers:
- PHP API endpoints under `public/api`
- PHPMailer for SMTP sending
- Optional dev outbox sink for emails

## Architecture

Main app flow:
- `src/index.jsx` bootstraps React and i18n.
- `src/App.jsx` wraps the app in `Auth0Provider` and `SettingsProvider`, then renders routes.
- `src/Routes.jsx` defines public vs protected routes.

Data layer:
- Frontend services in `src/services` handle domain logic and Supabase I/O.
- Shared Supabase client: `src/lib/supabase.js`.

API layer:
- Vite dev proxy forwards `/api/*` to PHP server (`vite.config.js`).
- PHP APIs:
  - `/api/tickets.api.php`
  - `/api/settings.api.php`
  - `/api/workflows.api.php`
  - `/api/mail.api.php`
  - `/api/mfa.api.php`
  - `/api/translations.api.php`
  - `/api/sla-backfill.api.php`

## Core Functional Areas

Public/reporter side:
- Multi-step anonymous report form with attachments (`src/pages/anonymous-report-form`)
- Report confirmation page with ticket/access code (`src/pages/report-confirmation`)
- Ticket access portal (`src/pages/ticket-access-portal`)
- Reporter ticket details + secure communication (`src/pages/ticket-details-view`)

Handler/admin side:
- Handler dashboard and ticket list (`src/pages/handler-dashboard`)
- Case detail management (status, assignment, notes, comms, SLA) (`src/pages/case-management-detail`)
- Workflow configuration (`src/pages/workflow-configuration-admin`)
- User/role/permission management (`src/pages/admin-dashboard`, `src/pages/user-management-admin`, `src/pages/permissions-admin`)
- System settings + modules (`src/pages/settings`)
- Notification log monitoring (`src/pages/logging`)

Cross-cutting:
- Notification and email orchestration (`src/services/notificationService.js`, `src/services/emailService.js`)
- RBAC/permissions checks (`src/hooks/usePermissions.js`, `src/components/auth/ProtectedRoute.jsx`)
- Dynamic settings context (`src/contexts/SettingsContext.jsx`)
- i18n locales (`src/i18n/locales`)

## Repository Layout

```txt
src/
  components/      Shared UI and navigation/auth guards
  contexts/        Global settings context
  hooks/           Permission and utility hooks
  i18n/            i18next config + locale JSON files
  lib/             Supabase client
  pages/           Route-level pages
  services/        Business logic + data access
  styles/          Tailwind and global CSS
public/api/        PHP API endpoints + PHPMailer + email templates/outbox
supabase/migrations/ SQL migrations
scripts/           Helper scripts (e.g. SLA backfill)
nz-startup.ps1     Local dev orchestrator (PHP + Vite)
```

## Local Development

Prerequisites:
- Node.js 18+
- npm
- PHP 8+
- Supabase project (URL + anon key)
- Auth0 app configuration

Install:

```bash
npm install
```

Create `.env` (or `.env.local`) with at least:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`

Recommended start (Windows PowerShell):

```powershell
.\nz-startup.ps1
```

This starts:
- PHP API server on `http://127.0.0.1:8081`
- Vite dev server on `http://127.0.0.1:3000`

Manual start:

```bash
php -S 127.0.0.1:8081 -t public
npm run dev
```

## Environment Variables

Frontend-required:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`

Important:
- Never put secrets in `VITE_*` variables. Vite injects all `VITE_*` values into browser code.
- Use non-`VITE_` names for server-only secrets (for example `AUTH0_CLIENT_SECRET`).

API/mail/security (optional or environment-specific):
- `EMAIL_ENC_KEY_PATH` (path to base64 32-byte email encryption key)
- `MAIL_DEV_SINK` (`true` writes mails to outbox instead of SMTP)
- `MAIL_OUTBOX_DIR`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_AUTH`, `SMTP_USER`, `SMTP_PASS`
- `MAIL_DEFAULT_FROM`, `MAIL_DEFAULT_FROM_NAME`
- `SUPABASE_SERVICE_ROLE_KEY` (used by SLA backfill endpoint if present)
- `SUPABASE_SERVICE_ROLE_KEY` (required for secure server-side settings + reporter ticket access APIs)

## Database and Migrations

SQL migration files live in `supabase/migrations`.

Important migrations include:
- System settings
- Locations
- Email notification system
- Translation audit log
- Reporter email crypto columns
- Status email notify flags
- Policy baseline snapshot (`20260219_capture_policy_baseline.sql`)
- System settings hardening (`20260219_harden_system_settings_access.sql`)

Note:
- `src/services/migrationService.js` performs a startup check for email notification structures and reports when manual SQL setup is still needed.

## i18n and Translation Management

Locale files:
- `src/i18n/locales/en/translation.json`
- `src/i18n/locales/nl/translation.json`
- `src/i18n/locales/fr/translation.json`
- `src/i18n/locales/de/translation.json`
- `src/i18n/locales/pt/translation.json`

`public/api/translations.api.php` supports translation CRUD/import/export and creates file backups in `backups/translations`.

## Security and Privacy Notes

- Reporter email can be encrypted/hashed via `public/api/tickets.api.php` and `public/api/_crypto.php`.
- Anonymous reporting is supported.
- Assignment logic blocks inactive handlers from being assigned.
- Route access is guarded with Auth0 + permission checks.
- Maintenance mode is controlled via dynamic settings.
- Browser-visible `VITE_SUPABASE_ANON_KEY` is expected for Supabase frontends; real protection comes from strict RLS/policies.
- Admin settings writes now go through `public/api/settings.api.php` and require an Auth0 token + admin handler authorization.

## Build

```bash
npm run build
```

Output is generated in `dist/`.

## Developer Notes

- Add new pages under `src/pages` and register routes in `src/Routes.jsx`.
- Keep translation keys namespaced (for example `caseManagement.*`, `settings.*`).
- Business/domain logic should stay in `src/services`, not inside page components.
- There is currently no dedicated test suite configured in `package.json`; validate changes with focused manual checks and `npm run build`.

# CLEANUP_REPORT (Draft)

## Scope
Phases completed:
- **PHASE 1 - Historical Shadow Analysis**
- **PHASE 2 - Dependency Graph Verification**  
No code files were deleted or modified for cleanup in these phases.

Safety constraints applied:
- No deletion without hard proof.
- Security/auth/rate-limit logic treated as protected.
- `supabase/migrations/*` excluded from deletion consideration.
- backups/translations excluded from deletion consideration.

---

## Summary
Repository scan confirms major migration residue is mostly already cleaned.  
Only a small set of conservative cleanup candidates was found.

Most migration-era fallback logic (RLS, token guards, attachment security) appears intentionally active and should remain unless PHASE 2 dependency mapping proves otherwise.

Phase 2 confirms:
- `scripts/backfill-next-step-due.js` has **zero runtime edges** in repo-managed execution paths.
- `src/pages/settings/index-old-backup.jsx` has **zero runtime edges** (but is a backup artifact).
- `scripts/check_translations.php` has **zero runtime edges** (manual utility candidate for relocation, not deletion by default).

---

## Phase 1 Findings By Migration Theme

### 1) Rocket removal
Findings:
- No Rocket runtime residue in app code.
- Only explicit guard script remains: `scripts/check-no-rocket.mjs`.
- NPM script still references this guard: `check:no-rocket`.

Evidence:
- `rg -n "rocket|Rocket|ROCKET" .` returns only:
  - `scripts/check-no-rocket.mjs`
  - `package.json` (`check:no-rocket`)
  - `README.md` ("Removed Rocket scaffolding")

Assessment:
- **No safe deletion candidate** in this group.

### 2) Auth0 token model migration (ID -> access token)
Findings:
- Frontend does not use `getIdToken`.
- APIs enforce access-token audience and explicitly reject ID tokens.
- `_auth0.php` contains `auth0_verify_id_token(...)` stub that always throws.

Evidence:
- `rg -n "getIdToken|getIdTokenSilently|idToken|ID token" src public README.md`
  - no frontend `getIdToken` usage
  - `_auth0.php` rejection messages present
- `rg -n "auth0_verify_id_token" .`
  - only declaration in `_auth0.php` (+ dist mirror)

Assessment:
- `auth0_verify_id_token` is **currently unreferenced**, but is security-adjacent.
- **Keep** (do not remove in strict mode).

### 3) RLS rewrite residue
Findings:
- API-first + direct Supabase fallback patterns are still present in services (`ticketService`, `locationService`, `auditLogService`).
- `ticket_handlers` relation probing and fallback logic remains active.

Evidence:
- `rg -n "ticket_handlers|syncTicketHandlers|fallback" src/services/ticketService.js`
- `rg -n "API .* fallback|direct supabase fallback" src/services/locationService.js src/services/auditLogService.js`

Assessment:
- No proof these are dead; likely intentional resilience across policy states.
- **Keep** for now.

### 4) Attachment hardening residue
Findings:
- Signed URL logic is present in both frontend and PHP and actively referenced.
- `makePublicUrl` option in `ticketService.uploadAttachment` appears unused by current callsites.

Evidence:
- `rg -n "createSignedUrl|signedUrl|storage/v1/object/sign" src/services/ticketService.js public/api/tickets.api.php`
- `rg -n "makePublicUrl" src` shows declaration/branch only (no external callsites).

Assessment:
- Signed URL path is active and protected.
- `makePublicUrl` branch is a **manual-review candidate**, not safe-delete yet.

### 5) SLA migration residue
Findings:
- Documented production flow is `/api/sla-backfill.api.php` + `scripts/run-sla-backfill.ps1`.
- Legacy Node helper `scripts/backfill-next-step-due.js` exists but appears unreferenced.

Evidence:
- `rg -n "backfill-next-step-due\\.js" README.md package.json nz-startup.ps1 src public` -> no references.
- `README.md` references `run-sla-backfill.ps1` and `sla-backfill.api.php`.

Assessment:
- **Strong candidate** for removal in PHASE 3 (after PHASE 2 graph confirmation).

### 6) i18n cleanup
Findings:
- Locale files `en/nl/fr/de/pt` are all imported by `src/i18n/config.js`.
- No orphan locale file proven unused.
- `src/pages/settings/index-old-backup.jsx` exists and appears unreferenced.

Evidence:
- `src/i18n/config.js` imports all locale JSON files.
- `rg -n "index-old-backup" src README.md package.json nz-startup.ps1 public scripts` -> no references.

Assessment:
- Translation files are active; no safe deletion candidate here.
- `index-old-backup.jsx` is unreferenced but labeled backup; treat as protected/manual review.

---

## Phase 2 - Dependency Graph Verification

### Frontend Graph (Entry -> Routes -> Pages)

Verified chain:
- `index.html` -> `src/index.jsx` -> `src/App.jsx` -> `src/Routes.jsx` -> route pages.

Route pages imported by `src/Routes.jsx`:
- `anonymous-report-form`
- `report-confirmation`
- `ticket-access-portal`
- `handler-dashboard`
- `ticket-details-view`
- `case-management-detail`
- `workflow-configuration-admin`
- `admin-dashboard`
- `user-management-admin`
- `permissions-admin`
- `settings`
- `handler-profile-management`
- `logging`
- `handler-priority-workflow`
- `NotFound`

Context/hook/service edges (sample proof):
- `src/App.jsx` wires service token providers for:
  - `workflowService`, `settingsService`, `translationService`, `ticketService`, `permissionService`, `auditLogService`, `locationService`
- Context edges:
  - `SettingsProvider` in `src/App.jsx`
  - `useSettings` used across guards/pages/components
- Hook edges:
  - `usePermissions` used by `ProtectedRoute`, `PermissionGuard`, navigation, dashboard row components

### API Call Mapping (Frontend -> PHP endpoint)

| Endpoint | Frontend callers |
|---|---|
| `/api/settings.api.php` | `src/services/SettingsService.js` |
| `/api/workflows.api.php` | `workflowService`, `permissionService`, `locationService`, `auditLogService`, parts of `ticketService` |
| `/api/tickets.api.php` | `src/services/ticketService.js` |
| `/api/translations.api.php` | `src/services/translationService.js` |
| `/api/mfa.api.php` | `src/services/mfaService.js` |
| `/api/mail.api.php` | `src/services/emailService.js` |
| `/api/me.api.php` | `usePermissions`, `AuthContextNavigator`, `handler-dashboard`, `case-management-detail` |
| `/api/sla-backfill.api.php` | `src/pages/admin-dashboard/components/SlaBackfillPanel.jsx`, documented scheduler flow in README |

### PHP Include Graph

Direct includes from `public/api/*.php`:
- `settings.api.php` -> `_crypto.php`, `_auth0.php`, `_supabase.php`, `_errors.php`
- `workflows.api.php` -> `_crypto.php`, `_auth0.php`, `_supabase.php`, `_errors.php`
- `tickets.api.php` -> `_crypto.php`, `_auth0.php`, `_admin_auth.php`, `_supabase.php`, `_errors.php`
- `me.api.php` -> `_crypto.php`, `_admin_auth.php`, `_errors.php`
- `translations.api.php` -> `_crypto.php`, `_admin_auth.php`, `_errors.php`
- `sla-backfill.api.php` -> `_crypto.php`, `_admin_auth.php`, `_supabase.php`, `_errors.php`
- `mail.api.php` -> `_crypto.php`, `_errors.php`, `src/PHPMailer/*`
- `mfa.api.php` -> `_errors.php`
- `_admin_auth.php` -> `_auth0.php`, `_supabase.php`

Security-critical helper graph remains active:
- `_auth0.php` functions used by multiple endpoints (`auth0_get_bearer_token`, `auth0_expected_api_audience`, `auth0_verify_access_token`).

### Runtime Edge Verification for Cleanup Candidates

#### Candidate A: `scripts/backfill-next-step-due.js`
- No references in:
  - `package.json` scripts
  - `README.md`
  - `nz-startup.ps1`
  - `src/` or `public/` code paths
- Active SLA automation path is:
  - `public/api/sla-backfill.api.php`
  - `scripts/run-sla-backfill.ps1`

Result: **Confirmed zero repo-managed runtime edge**.

#### Candidate B: `src/pages/settings/index-old-backup.jsx`
- No imports and no route registration.
- Not referenced in startup scripts or docs.

Result: **Confirmed zero runtime edge**, but classified as backup artifact.

#### Candidate C: `scripts/check_translations.php`
- No references in npm scripts, startup script, routes, services, or docs.
- Appears to be manual maintenance helper.

Result: **Confirmed zero runtime edge**.

---

## Ranked Candidate List (Phase 1 + 2)

| Rank | Candidate | Hard Proof | Risk | Recommendation |
|---|---|---|---|---|
| 1 | `scripts/backfill-next-step-due.js` | Phase 2 confirms zero runtime edge; SLA automation has replacement path (`sla-backfill.api.php` + `run-sla-backfill.ps1`) | Low-Medium (possible undocumented manual use) | **Delete candidate** in PHASE 3 |
| 2 | `src/pages/settings/index-old-backup.jsx` | Phase 2 confirms zero runtime edge | Medium-High (backup artifact) | Archive/relocate preferred; keep unless explicit backup policy change |
| 3 | `scripts/check_translations.php` | Phase 2 confirms zero runtime edge | Medium (manual utility value possible) | Relocate to `scripts/manual/` or `tools/`; do not delete automatically |
| 4 | `ticketService.uploadAttachment` `makePublicUrl` branch | Option declared and branch exists; no external callsites found in `src` | Medium (could be external/manual invocation) | Keep; revisit in PHASE 4 only if dependency map confirms no runtime path |

---

## Items Intentionally Kept Due To Uncertainty / Safety

- `public/api/_auth0.php` and auth verification helpers:
  - `auth0_verify_id_token` is unreferenced but security-adjacent; do not remove.
- RLS fallback logic in:
  - `src/services/ticketService.js`
  - `src/services/locationService.js`
  - `src/services/auditLogService.js`
  These are likely resilience code for policy drift/partial environments.
- Attachment signed URL logic in frontend + PHP is active and protected.
- `run/` runtime files/folders were not touched (rate-limit and PID operational surface).
- `backups/translations/*` not evaluated for deletion by rule.

---

## Risk Assessment

- **Low risk**: removal of truly unreferenced helper scripts after PHASE 2 proof.
- **Medium risk**: deleting manual admin/dev scripts with no code references but possible operational use.
- **High risk**: touching auth verification, token guards, RLS fallbacks, signed URL paths, rate limiting.

---

## Rollback Instructions

No cleanup deletions were performed in PHASE 1.  
If this report file needs rollback:

```bash
git restore CLEANUP_REPORT.md
```

For future cleanup commits, rollback per commit:

```bash
git log --oneline
git revert <commit_sha>
```

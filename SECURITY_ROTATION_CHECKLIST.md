# SECURITY_ROTATION_CHECKLIST.md

## Purpose

This document describes the standard procedure for rotating secrets and cleaning up exposed credentials in the **NZ Misstanden Portal** repository.

It must be followed whenever:

* A secret is accidentally committed to git
* A token cache file is exposed
* Credentials are rotated for security reasons
* There is suspicion of credential leakage

## Incident Reference

This checklist was introduced after a security incident where runtime artifacts were accidentally committed to the repository:

- Auth0 management token cache
- Email dev outbox artifacts

Date: 2026-03-04  
Repository: NZ Misstanden Portal  
Action taken:
- Runtime artifacts removed
- .gitignore updated
- Auth0 credentials rotated
- Security checklist created

---

# 1. Identify the exposed artifact

Determine what type of secret was exposed.

Examples:

* Auth0 Management API token
* API key
* SMTP credentials
* Supabase service role key
* OAuth client secret

Example from incident:

```bash
run/cache/auth0-mgmt-token-*.json
public/api/outbox/mail_*.json
```

---

# 2. Immediately remove exposed files from git tracking

Remove only the tracked artifacts (do not delete runtime directories).

Example:

```bash
git rm --cached run/cache/auth0-mgmt-token-*.json
git rm --cached public/api/outbox/mail_*.json
git rm --cached dist/api/outbox/mail_*.json
```

Commit:

```bash
git commit -m "security: remove accidentally committed runtime artifacts"
```

---

# 3. Rotate compromised credentials

Go to:

Auth0 Dashboard
Applications -> **Machine to Machine Applications**

Steps:

1. Select the application used for **Auth0 Management API** access
2. Click **Rotate / Reset Client Secret**
3. Copy the new secret
4. Update the server environment variables

Important:
Secrets must **never** be stored in `VITE_*` variables.

Correct usage:

```bash
AUTH0_CLIENT_SECRET=xxxxx
```

Incorrect:

```bash
VITE_AUTH0_CLIENT_SECRET=xxxxx
```

---

# 4. Update server environment

Update secrets in the server runtime environment:

Possible locations:

* `.env`
* IIS environment variables
* CI/CD secrets
* Docker environment variables
* Windows Task Scheduler jobs

Restart the backend services after updating.

---

# 5. Clear local runtime caches

Remove cached tokens so the system fetches new credentials.

Example:

```powershell
Remove-Item run/cache/auth0-mgmt-token-*.json -Force -ErrorAction SilentlyContinue
```

---

# 6. Validate rotation

Verification steps:

1. Start the backend
2. Trigger the functionality that uses the Management API
3. Confirm a new token is generated
4. Confirm the **old secret no longer works**

If old credentials still work -> rotation failed.

---

# 7. Prevent future commits

Verify `.gitignore` contains the following entries:

```bash
run/cache/
public/api/outbox/
dist/api/outbox/
```

These directories must remain **local runtime artifacts only**.

---

# 8. Optional: Remove secrets from git history

If sensitive data was committed, consider rewriting git history.

Recommended tools:

* `git filter-repo`
* `BFG Repo Cleaner`

Example with BFG:

```bash
bfg --delete-files auth0-mgmt-token-*.json
```

After rewriting history:

```bash
git push --force
```

Team members must then run:

```bash
git fetch
git reset --hard origin/main
```

or reclone the repository.

---

# 9. Incident documentation

Record the following:

* Date of exposure
* Type of secret
* Rotation performed
* Services affected
* Responsible engineer

Example entry:

```text
Date: 2026-03-04
Issue: Auth0 management token cache committed
Action: token rotated, cache removed, .gitignore updated
Engineer: Jeroen Weber
```

---

# 10. Security best practices

Always follow these rules:

* Never store secrets in frontend variables (`VITE_*`)
* Never commit runtime caches
* Never commit email outbox artifacts
* Use environment variables for all credentials
* Rotate secrets immediately after accidental exposure
* Prefer short-lived tokens when possible

---

# Maintainer

Security process maintained by:

**NedZink IT - Misstanden Portal**

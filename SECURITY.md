# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately by opening a **private security advisory** on GitHub (repository → _Security_ → _Report a vulnerability_). Do not open a public issue for security problems.

Include the affected version or commit, steps to reproduce and the impact you observed. You will get an acknowledgement, and fixes are released as soon as they are verified.

## Supported versions

Only the latest commit on `main` receives security fixes.

## Security model in brief

- Tenant isolation and role checks are enforced in the service layer on every request (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- Passwords are hashed with Argon2id; session tokens are random, stored only as HMAC-SHA256 hashes, and sent in `httpOnly`, `SameSite=Lax` cookies that are `Secure` in production.
- With `APP_ENV=production` the server refuses to start with placeholder secrets or default database passwords, and demo accounts are disabled.
- CSV exports neutralise spreadsheet formulas; imports are size- and row-limited.
- Every change to business data, settings and membership is written to the audit log.

## Dependency advisories

`npm audit --omit=dev` reports no known vulnerabilities in runtime dependencies. A full `npm audit` currently lists one advisory in lint tooling only (GHSA-vfj7-8cjw-p6xm in `braces`, pulled in through `eslint-config-next` → `fast-glob` → `micromatch`). No patched `braces` release exists yet; the package only runs during linting and never ships in the application or the Docker image. It will be updated as soon as a fix is published.

## Out of scope

- The Docker Compose demo (`APP_ENV=demo`) is intended for local evaluation only. It uses well-known demo credentials and plain http.

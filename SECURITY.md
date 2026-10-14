# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately by opening a **private security advisory** on GitHub (repository → _Security_ → _Report a vulnerability_). Do not open a public issue for security problems.

Include the affected version or commit, steps to reproduce and the impact you observed. You will get an acknowledgement, and fixes are released as soon as they are verified.

## Supported versions

Only the latest commit on `main` receives security fixes.

## Security model in brief

- Tenant isolation and role checks are enforced in the service layer on every request (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
- Passwords are hashed with Argon2id; session tokens are random, stored only as HMAC-SHA256 hashes, and sent in `httpOnly`, `SameSite=Lax` cookies that are `Secure` in production. Signing in again revokes the session the browser already had.
- People join a workspace only through a single-use invitation link (only its SHA-256 is stored) that they accept themselves; the members page never reveals whether an address has an account.
- Failed sign-ins are limited per email and client address, per client address and per email; sign-ups per client address. The client address is read from `X-Forwarded-For` only when `TRUST_PROXY=true` (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#rate-limiting)).
- Forms that carry passwords post with `method="post"`; JSON API bodies over 1 MB are refused with `413`.
- With `APP_ENV=production` the server refuses to start with placeholder secrets or default database passwords, and demo accounts are disabled.
- CSV exports neutralise spreadsheet formulas; imports are size- and row-limited.
- Every change to business data, settings and membership is written to the audit log.

## Security headers

| Header                      | Value                                                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'; script-src 'self' 'nonce-<per request>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` when `APP_ENV=production`                                                                                                                                                                                                         |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                                                                               |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                                                                                                                  |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                       |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`                                                                                                                                                                                                                              |

Development builds add `'unsafe-eval'` to `script-src` for React's error overlay. Inline styles are allowed because the UI libraries position elements with style attributes.

## Known limitations

- **No email delivery or verification.** Invitation links are passed on by the inviter. Someone can register an address they do not own; they still cannot join workspaces that invited that address (only the link grants access), but the real owner of the address cannot register it until verification and password reset by email exist.
- **Registration says when an email is already registered** (rate limited per address); see ADR-019 in [docs/DECISIONS.md](docs/DECISIONS.md).
- **Rate limits live in process memory** and reset on restart; several instances need a shared store. Without `TRUST_PROXY` the per-address limits cannot apply and the per-email limit is the only one.
- **Sessions last 30 days** without an idle timeout; signing out, changing the password or removing a member ends them.
- **Server Action arguments** are validated by the service layer (Zod), not by a runtime type check at the action boundary.

## Dependency advisories

`npm audit --omit=dev` reports no known vulnerabilities in runtime dependencies. A full `npm audit` currently lists one advisory in lint tooling only (GHSA-vfj7-8cjw-p6xm in `braces`, pulled in through `eslint-config-next` → `fast-glob` → `micromatch`). No patched `braces` release exists yet; the package only runs during linting and never ships in the application or the Docker image. It will be updated as soon as a fix is published.

## Out of scope

- The Docker Compose demo (`APP_ENV=demo`) is intended for local evaluation only. It uses well-known demo credentials and plain http.

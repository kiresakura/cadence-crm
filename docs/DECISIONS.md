# Design decisions

Short architecture decision records. Each one states the context, the decision and its consequences.

## ADR-001: One Next.js app with Server Actions and a thin JSON API

**Context.** A small team product needs forms, tables and a board, plus a way to call the system programmatically.
**Decision.** Use the App Router: Server Components for reads, Server Actions for mutations from the UI, and a few session-authenticated route handlers (`/api/contacts`, `/api/deals/:id/stage`, CSV exports, health). All of them go through the same services.
**Consequences.** One deployable unit and no duplicated validation. The public REST API with API keys is a v2 item; the existing handlers show how it will plug in.

## ADR-002: Tenant isolation in the service layer

**Context.** Every query must be limited to the caller's workspace, and that must be testable.
**Decision.** Services take an explicit `Ctx` and always filter by `ctx.workspaceId`; referenced ids are verified by shared guard helpers. Records from other workspaces are reported as not found.
**Alternatives.** Postgres row-level security (strong, but needs per-request `SET` and makes Prisma usage and tests more involved); composite foreign keys including `workspaceId` (conflicts with `SET NULL` on optional relations).
**Consequences.** Isolation is visible in code review and covered by `tenancy.test.ts`. RLS is planned as defence in depth.

## ADR-003: Database sessions with HMAC-hashed tokens

**Context.** Sign-out, member removal and workspace switching must take effect immediately.
**Decision.** Random 256-bit tokens in an `httpOnly` cookie; the database stores `HMAC-SHA256(token, AUTH_SECRET)`. The active workspace lives on the session row.
**Alternatives.** Stateless JWTs (hard to revoke, role changes lag behind).
**Consequences.** One indexed lookup per request. Rotating `AUTH_SECRET` signs everyone out.

## ADR-004: Argon2id for passwords

**Decision.** `@node-rs/argon2` with OWASP's baseline parameters. It ships prebuilt binaries (including Alpine/musl) and Next.js already treats it as a server external package.
**Consequences.** No native build step in Docker or CI. Unknown-user sign-ins verify a dummy hash to keep timing flat.

## ADR-005: `APP_ENV` separate from `NODE_ENV`, with a secret guard

**Context.** The Docker demo must run a production build yet keep demo accounts; a real deployment must never start with demo credentials.
**Decision.** `APP_ENV` (`development`, `test`, `demo`, `production`) controls behaviour; unknown values are treated as production. In production the server exits at startup if secrets are placeholders, demo accounts cannot sign in and the seed refuses to run.
**Consequences.** Misconfiguration fails loudly at boot instead of silently in production. CI checks the guard against the built image.

## ADR-006: Custom fields as JSONB validated by definitions

**Context.** Teams need extra fields without migrations.
**Decision.** `CustomFieldDefinition` rows (entity, key, label, type, options, required) and a JSONB `customFields` column per record. Values are validated and coerced on every write; keys without a definition are rejected. Key and type are immutable once created.
**Alternatives.** EAV tables (heavy queries), per-workspace columns (migrations at runtime).
**Consequences.** Simple reads, strict writes. Filtering by custom fields would need GIN indexes (future work).

## ADR-007: Exact money and a reporting currency

**Decision.** `Decimal(14,2)` amounts with a three-letter currency per deal; all arithmetic uses `Prisma.Decimal`. The dashboard reports in the workspace currency and states how many deals it excluded instead of mixing currencies.
**Consequences.** No rounding drift. Currency conversion is out of scope for v1 (see ADR-016).

## ADR-008: Prisma 7 with the `pg` driver adapter

**Decision.** Use the Rust-free Prisma client generated into `src/generated/prisma` with `@prisma/adapter-pg`, configured through `prisma.config.ts`; migrations are committed.
**Consequences.** Smaller runtime with no query engine binary in the Docker image. The generated client is not committed and is produced by `postinstall`.

## ADR-009: Cache Components off

**Context.** Next.js 16 can enable Cache Components and partial prefetching.
**Decision.** Keep them off. Every CRM page depends on the signed-in user and workspace, so there is little static content to cache, and correctness of permission checks matters more than prefetching.
**Consequences.** Classic dynamic rendering; revisit when public pages are added.

## ADR-010: Native selects and server-validated forms

**Decision.** Forms use native `<select>`, `<input type="date">` and checkboxes styled to match the Radix-based components, and submit `FormData` to Server Actions through a small `useActionForm` hook that keeps input after validation errors and shows field errors from the server. Forms post with `method="post"` so nothing is sent as a query string before hydration. Pickers for linked records (company, primary contact) are the exception: an ARIA combobox that searches on the server (20 matches, debounced) and always includes the current selection; clearing a link takes an explicit **Clear**.
**Consequences.** Accessible and keyboard friendly by default, simple to test, and one validation source (Zod on the server). A native select with a fixed option list used to drop links that sorted past its last option.

## ADR-011: Kanban with dnd-kit, optimistic updates and a keyboard alternative

**Decision.** Drag handles use dnd-kit's pointer and keyboard sensors; moves are optimistic and rolled back if the server refuses. Every card also has a "Move to" menu, which serves keyboard and touch users and keeps tests deterministic.
**Consequences.** Fast feel without trusting the client; the server re-validates stage membership and close rules.

## ADR-012: CSV import rules

**Decision.** Papa Parse for RFC 4180 parsing; 2 MB / 5,000-row limits, checked in the browser before uploading and on the server; the file travels as multipart form data. Header names are normalised with NFKC and matched case-insensitively against English and Chinese aliases; only identical names count as duplicate columns. Row numbers are spreadsheet rows (header = 1, blank rows count). De-duplication by email against the workspace and earlier rows; unknown tags are reported and ignored; companies are matched by name or created. Exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`, tab, carriage return).
**Consequences.** Imports are predictable and safe to re-run; rows without an email cannot be de-duplicated and are imported.

## ADR-013: Test services against a real database

**Decision.** Integration tests call the services against PostgreSQL instead of mocking Prisma. The test database is migrated and truncated once per run and each file creates its own workspaces.
**Consequences.** Tests catch query, transaction and constraint mistakes that mocks would hide, at the cost of needing Docker locally (CI uses a service container).

## ADR-014: In-memory sign-in rate limiting

_Superseded by ADR-018._ A fixed-window limiter per email (10 attempts per 15 minutes) kept in process memory. It let anyone lock a known user out for 15 minutes and did nothing against one address trying many accounts.

## ADR-015: Invitation links instead of temporary passwords

**Context.** "Add member" used to create the account and hand a temporary password to the inviter, and added existing accounts without asking. That told anyone whether an address had an account (and its display name), let an inviter take over a not-yet-registered address, and put people into workspaces without consent.
**Decision.** Owners and admins create single-use invitation links (random 256-bit token, only its SHA-256 stored, 7-day expiry, revocable, regenerable). The response is identical for registered and unregistered addresses. The invitee accepts with the link, signed in with the invited address, or creates an account from it with that address fixed; acceptance writes membership, the used mark and the audit entry in one transaction. Temporary passwords are gone.
**Alternatives.** Sending email (needs a mail provider and domain setup; planned); listing "invitations for your email" in the app (would let whoever registered the address first accept someone else's invitation).
**Consequences.** No account enumeration or takeover through the members page, and joining needs the invitee's consent. Inviters pass the link on themselves. Without email verification, a person whose address was registered by someone else cannot register it; verification and password reset by email are on the roadmap.

## ADR-016: No currency conversion

**Context.** Deals can be in any currency; the dashboard and the board need totals.
**Decision.** Each workspace has a reporting currency (ISO 4217, set by owners and admins in Settings → Workspace, audited, and the default for new deals). Totals only add deals in that currency and say how many were left out ("+2 deals in other currencies not included"); amounts are never converted.
**Alternatives.** Converting with daily rates (needs a rate source, historical rates for won deals and rounding rules); summing raw numbers (wrong); per-currency subtotals everywhere (noisy for the common single-currency team).
**Consequences.** Totals are exact and explainable. Multi-currency teams see partial totals until conversion is added (roadmap).

## ADR-017: Content Security Policy with a per-request nonce

**Context.** The app had no CSP, so any injected script would run.
**Decision.** `src/proxy.ts` sets a nonce-based policy on every request (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, …); Next.js adds the nonce to its own scripts. Inline styles stay allowed (UI libraries use style attributes). Every page renders per request because the root layout awaits `connection()`. HSTS is added when `APP_ENV=production`.
**Alternatives.** A static policy with `'unsafe-inline'` scripts (allows exactly the injected scripts CSP should stop); hashes of inline scripts (Next.js generates them per build and per page).
**Consequences.** Injected inline scripts and scripts from other origins are blocked. No page can be statically prerendered; for this app every page depends on the user anyway (ADR-009).

## ADR-018: Sign-in rate limiting per account and per address

**Context.** ADR-014's per-email limit allowed targeted lockouts and ignored password spraying.
**Decision.** Count failed sign-ins per 15 minutes three ways: email + client address (10), client address across accounts (30), email across addresses (50). The client address comes from the last `X-Forwarded-For` entry only when `TRUST_PROXY=true`; otherwise it is unknown and only the per-email counters apply. Sign-ups are limited to 10 per address per hour.
**Alternatives.** CAPTCHA after failures (needs a third-party service); account lockout (the problem being fixed); exponential delays (hold connections open).
**Consequences.** A user's own address keeps working until the higher per-email limit; spraying from one address stops after 30 failures. Behind a proxy, `TRUST_PROXY` must be set or every client shares the per-email fallback. Counters are per process; several instances need a shared store (roadmap).

## ADR-019: Registration says when an email is already registered

**Context.** "An account with this email already exists" tells anyone that an address has an account.
**Decision.** Keep the message: without email delivery there is no "check your inbox" flow, and a silent failure would leave real users unable to tell a typo from an existing account. Sign-ups are rate limited per address (ADR-018), and the members page no longer reveals accounts (ADR-015).
**Consequences.** Probing for registered addresses remains possible at a limited rate. Once verification emails exist, registration can answer the same way for both cases and send the explanation by email instead.

## ADR-020: Duplicate groups are not chained

**Context.** Grouping duplicates transitively put A and C together when A shared a phone with B and B shared an email with C — for example everyone using a switchboard number or an info@ address — and merged the whole group at once.
**Decision.** One group per shared email or phone number. A contact can appear in two groups. The merge screen lets the user leave members out and pick the one to keep; the server checks every id belongs to the workspace and shares the group's value. Values that differ and are not kept are written to the audit log and to a note on the kept contact.
**Consequences.** Merges only combine records that share something directly, and nothing disappears silently. Chains need two merges, which is intended.

## ADR-021: Splitting Chinese, Japanese and Korean full names

**Context.** Imports often have a single name column. Splitting on the last space treats "王小明" as one word and leaves the last name empty.
**Decision.** Names with Chinese, Japanese or Korean characters are family name first: with a space, the first word is the family name ("山田 太郎"); without one, two to four Han characters are split after the first character, or after a known two-character family name (歐陽, 司馬, 上官, 諸葛, 東方, 皇甫, 尉遲, 公孫, 慕容, 長孫, 宇文, 司徒, 令狐, 夏侯, 端木, 張簡, 范姜, also in simplified forms). Other names are split on the last space. A single Latin word, a single character or a long unspaced name is reported as a row error instead of guessing. Such names are displayed family name first without a space ("王小明").
**Consequences.** Common Chinese names import correctly. Japanese and Korean names need a space, and unusual compound surnames can be fixed with separate first and last name columns.

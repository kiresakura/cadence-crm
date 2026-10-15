# Architecture

Cadence is a single Next.js application backed by PostgreSQL. There is no separate API server: pages, server actions and route handlers all call the same service layer, which is the only code that talks to the database.

## Layers

```
src/app/            Routes. Server Components read data; client components submit Server Actions.
  (auth)/           Sign-in, registration, workspace creation and switching actions
  (app)/            CRM pages. Each feature folder has an actions.ts with its Server Actions.
  api/              JSON and CSV route handlers (session-authenticated)
src/server/next/    Framework adapters: request context, Server Action and route handler wrappers
src/server/services Use cases. Take a Ctx, check permissions, scope queries, write audit entries
src/server/domain/  Pure rules with no I/O: stage transitions, custom field validation, CSV, dashboard math
src/server/auth/    Password hashing, session tokens, sign-in and registration
src/server/db.ts    Prisma client (Prisma 7 with the pg driver adapter)
src/proxy.ts        Runs before every request: a fresh CSP nonce and the security headers
```

Dependencies only point downwards. The domain layer is pure TypeScript and is unit tested without a database. Services are tested against a real PostgreSQL instance. The `next/` adapters are thin enough to be covered by the Playwright tests.

## Request lifecycle

1. `src/proxy.ts` creates a random nonce, sets the Content-Security-Policy on the response and on the request (Next.js reads it from there to add the nonce to its own scripts), and adds HSTS in production. See [Security headers](#security-headers-and-csp).
2. The browser sends the `cadence_session` cookie (an opaque 256-bit token).
3. `getRequestContext()` (memoised per request with React `cache`) hashes the token with HMAC-SHA256 and `AUTH_SECRET`, loads the session, and checks it has not expired.
4. It then loads the membership for the session's active workspace. If the user was removed from that workspace, it falls back to another membership or sends the user to onboarding. Membership is checked on every request, so removing a member takes effect immediately.
5. The result is a `Ctx` — `{ userId, workspaceId, role }` — that is passed explicitly to every service call. Services never accept a workspace id from the client.

Pages call `requirePageContext()` (redirects to sign-in), Server Actions use `runAction()` and route handlers use `withApi()`. The two wrappers turn expected errors (`AppError` subclasses) into a typed result or a JSON error with the right status code (401, 403, 404, 409, 413, 422) and log anything unexpected without leaking details.

## HTTP API

The UI uses Server Actions; these route handlers exist for scripts, exports and tests. They use the same session cookie and the same services, so roles and tenancy apply identically. Errors are JSON: `{ "error": { "code", "message", "fieldErrors" } }`.

| Method and path             | Purpose                                                                                                         | Minimum role |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------ |
| `GET /api/health`           | Liveness and database check (no session needed)                                                                 | —            |
| `GET /api/contacts`         | List contacts; accepts the contacts page filters (`q`, `owner`, `lifecycle`, `tag`, `sort`, `page`, `pageSize`) | Viewer       |
| `POST /api/contacts`        | Create a contact                                                                                                | Member       |
| `GET /api/contacts/:id`     | Contact with company, tags and deals                                                                            | Viewer       |
| `PATCH /api/contacts/:id`   | Partial update; only changed custom fields and a changed owner are re-validated                                 | Member       |
| `DELETE /api/contacts/:id`  | Delete a contact                                                                                                | Member       |
| `POST /api/deals/:id/stage` | Move a deal: `{ "stageId", "lostReason"? }`                                                                     | Member       |
| `GET /api/export/contacts`  | CSV export with the list filters                                                                                | Viewer       |
| `GET /api/export/deals`     | CSV export with the deal list filters                                                                           | Viewer       |

JSON bodies are limited to 1 MB; larger requests get `413` without being read in full. A public API with API keys is planned for version 2.

## Multi-tenancy

Every business table has a `workspaceId` column. Isolation is enforced in one place, the service layer:

- **Reads** always filter by `workspaceId: ctx.workspaceId`, including nested filters (for example the company timeline includes activities of the company's contacts and deals, all within the workspace).
- **Writes to an existing record** first load it with `{ id, workspaceId }`. A record from another workspace is reported as "not found", which avoids revealing that it exists.
- **References in the input** (company, contact, deal, stage, owner, assignee, tags) are verified by the helpers in `services/guards.ts` before anything is written. A stage must also belong to the deal's pipeline.
- **Tests** in `tests/integration/tenancy.test.ts` create two workspaces and assert that lists, detail reads, updates, deletes, stage moves, merges, timelines, boards, dashboards, exports, member changes, tasks and the audit log never cross the boundary.

Postgres row-level security would add a second, database-level guarantee; it is on the roadmap (see [DECISIONS.md](DECISIONS.md#adr-002-tenant-isolation-in-the-service-layer)).

## Permissions

`src/server/permissions.ts` maps roles to permissions:

| Permission                                                              | Owner | Admin | Member | Viewer |
| ----------------------------------------------------------------------- | :---: | :---: | :----: | :----: |
| `records:read`                                                          |   ✓   |   ✓   |   ✓    |   ✓    |
| `records:write` (contacts, companies, deals, activities, tasks, import) |   ✓   |   ✓   |   ✓    |        |
| `settings:manage` (pipelines, stages, tags, custom fields)              |   ✓   |   ✓   |        |        |
| `members:manage`                                                        |   ✓   |   ✓   |        |        |
| `audit:read`                                                            |   ✓   |   ✓   |        |        |
| `workspace:manage` (rename)                                             |   ✓   |       |        |        |

Each service function calls `assertCan(ctx, permission)` before parsing its input, so a viewer gets `403` even for an invalid payload. Extra membership rules: only owners can grant or change the owner role, and the last owner cannot be demoted or removed. The UI receives a `capabilitiesFor(role)` object to hide controls, but nothing depends on the UI hiding them — the E2E suite calls the API directly as a viewer and expects `403`.

## Authentication

- Passwords are hashed with Argon2id (19 MiB, 2 iterations). Unknown emails are verified against a dummy hash so response times do not reveal which accounts exist.
- Sessions live in the `Session` table. The cookie holds the raw token; the table stores only its HMAC, so a database leak does not yield usable sessions. Sessions last 30 days and are deleted on sign-out; changing the password deletes every other session of that user.
- Cookies are `httpOnly`, `SameSite=Lax`, `path=/`, and `Secure` in production or whenever `APP_URL` is https.
- Server Actions get Next.js' built-in origin check; the JSON API rejects cross-site writes by comparing `Origin` with the host.
- Signing in or signing up while the browser still holds a session revokes that session before a new one is issued.
- Sign-in and sign-up forms post with `method="post"`, so a submit before JavaScript has loaded never puts the password in the URL.
- Sign-in attempts and sign-ups are rate limited; see [Rate limiting](#rate-limiting).

### Invitations

Nobody gets an account or a membership on someone else's behalf. An owner or admin creates an **invitation** for an email address and a role (only owners can invite owners):

1. `createInvitation` stores the address, the role, who invited and a 7-day expiry, plus the SHA-256 hash of a random 256-bit token. The raw token only exists in the link it returns, which is shown once. The answer is `{ inviteUrl, expiresAt }` whether or not the address already has an account, and no code path does extra work for either case, so the form cannot be used to probe for accounts. Inviting the same address again replaces the unused link.
2. The members page lists pending invitations (address, role, inviter, expiry) with **Regenerate link** (new token, old link stops working) and **Revoke**.
3. `/invite/<token>` answers every unknown, expired, revoked or used link with the same message. Signed out, it shows the workspace and role with **Sign in to accept** (back to the link afterwards) and **Create an account** (email fixed to the invited address, browser time zone, no workspace of its own). Signed in with the invited address, it offers **Accept** and **Decline**; with another address, it asks to switch accounts and shows the invited address masked.
4. `acceptInvitation` creates the membership, marks the invitation used (a conditional update, so two tabs cannot both use it) and writes the audit entry with the invitee as actor, in one transaction; the session then switches to that workspace.

Only the link grants access: the app never lists "invitations for your email". Someone who registers another person's address first therefore cannot join that person's employer, because the employer's link goes to the real person. Email is not verified in this version, so that real person cannot register the same address either until verification and password reset by email exist (see the README's known limitations).

### Security headers and CSP

Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive `Permissions-Policy` (from `next.config.ts`), plus a per-request Content Security Policy from `src/proxy.ts`:

```
default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Scripts run only with the request's nonce (`'strict-dynamic'` lets them load the app's chunks); development adds `'unsafe-eval'`, which React needs for its error overlays. Inline styles stay allowed because Radix, Recharts and dnd-kit position elements with style attributes. A nonce only exists at request time, so the root layout calls `connection()` and every page renders per request; a page prerendered at build time would have its scripts blocked. With `APP_ENV=production`, responses also carry `Strict-Transport-Security: max-age=63072000; includeSubDomains`. The Playwright suite checks the policy on the main pages and fails on any CSP violation in the console.

### Rate limiting

Failed sign-ins are counted in memory per 15 minutes, three ways (`LOGIN_LIMITS` in `src/server/auth/service.ts`):

| Key                         | Limit | Stops                                        |
| --------------------------- | ----: | -------------------------------------------- |
| email + client address      |    10 | guessing one account from one place          |
| client address, any account |    30 | trying a password across many accounts       |
| email, any address          |    50 | guesses for one account spread over many IPs |

Someone else's failures therefore cannot lock a user out of their own address before the per-email limit. A successful sign-in clears its email + address counter. Sign-ups are limited to 10 per client address per hour.

**Client address.** `X-Forwarded-For` is only trusted when `TRUST_PROXY=true`, i.e. when a reverse proxy in front of the app appends the address it received the connection from; the last entry is used, since anything before it may come from the client. Without that setting the address is unknown, the per-address limits are skipped, and the email + address counter applies per email alone (10 failures per 15 minutes), which is the safe fallback but lets an attacker slow down a known account. The counters live in one process; several instances would need a shared store (roadmap).

### The secret guard

`APP_ENV` describes the deployment and is independent of `NODE_ENV`. When `APP_ENV=production` (or `NODE_ENV=production` without an `APP_ENV`), `src/instrumentation.ts` runs `assertSafeToStart()` before the server accepts requests and exits with code 1 if `AUTH_SECRET` is missing, short or a known placeholder, or if `DATABASE_URL` uses a default password. In production, demo accounts (`@demo.local`) cannot sign in and the seed script refuses to run. The Docker Compose demo sets `APP_ENV=demo`, which keeps the demo usable over plain http on localhost.

## Main flows

### Moving a deal on the board

1. The board applies the move optimistically with `useOptimistic` and calls `moveDealAction`.
2. `moveDeal` loads the deal and target stage within the workspace, rejects stages from other pipelines, and applies `resolveStageTransition`: `WON` and `LOST` set `closedAt`, `LOST` requires a reason, `OPEN` clears both.
3. The change and an audit entry are written in one transaction, and `revalidatePath` returns fresh server data in the same round trip.
4. If the server refuses, the optimistic state is discarded and a toast explains why. Dropping onto a lost stage first asks for the reason.

### Merging duplicates

`groupDuplicates` makes one group per shared value: contacts with the same email (case-insensitive) or the same normalised phone number. Groups are not chained — if A and B share a phone and B and C share an email, A and C never end up together, and B appears in both groups; people who share both values are shown once. On the merge screen every member can be left out and any included member can be kept. `mergeDuplicateGroup` checks that every id is a contact of the workspace that really carries the group's email or phone, then merges each chosen contact in one transaction: it re-points activities, tasks and deals, copies missing tags, fills empty fields, merges custom fields (the kept record wins) and deletes the duplicate. Values that differ and were not kept (email, phone, job title, lifecycle stage, source, custom fields) go into the audit entry and into a note on the kept contact ("Merged from Jane Doe: …").

### Deleting records

Deleting a contact, company or deal also deletes the activities and tasks that belong only to that record; items also linked to another record stay there and just lose this link. The confirmation dialog states how many items go with it. A database check makes sure an activity always has a contact, company or deal. Deleting a tag asks first and says how many contacts and companies lose it.

### CSV import

1. The browser checks the 2 MB limit, then sends the file as multipart form data to `previewImportAction` (React refuses action arguments with strings over a million characters, which a 2 MB file can exceed; Server Action bodies may be up to 3 MB). The server parses it with Papa Parse (size and row limits; too many rows is a normal error message, not a failed request), suggests a column mapping from header spellings in English and Chinese (NFKC, case-insensitive; only identical names count as duplicates), validates every row with Zod and checks emails against the workspace and earlier rows. A full-name column is split family name first for Chinese, Japanese and Korean names (see ADR-021); a single Latin word cannot be split and is reported as a row error.
2. Changing the mapping re-runs the preview.
3. `importContacts` repeats the analysis inside a transaction, creates missing companies, inserts contacts with `createManyAndReturn`, links existing tags and writes one audit entry with the totals. Rows with errors are reported with their spreadsheet row number (the header is row 1; blank rows still count).

Exports reuse the list filters and escape cells that a spreadsheet would treat as formulas.

## Data model notes

- `Deal.amount` is `Decimal(14,2)`; arithmetic uses `Prisma.Decimal`, never floating point. The dashboard aggregates only deals in the workspace's reporting currency.
- `Deal.expectedCloseDate` is a calendar date (`@db.Date`) and is always formatted in UTC; timestamps are formatted in the user's time zone.
- Custom field values are JSONB keyed by the definition's stable `key`. Deleting a definition leaves old values in place; they are ignored and dropped the next time the record is saved. Updates only validate values that change, so a select option removed later, a field made required later or an owner who left the workspace never blocks an unrelated edit; the edit form shows such a value as "Alpha (no longer an option)" and sends it back unchanged. Keys are read as own properties only, and labels never produce keys like `constructor`; labels without Latin letters get numbered keys (`field`, `field_2`, …).
- Pickers for linked records (a deal's company and primary contact, a contact's company) search on the server, 20 matches at a time, and include the current selection while the field shows it, so editing a record never drops a link because it sorts after the first thousand. Once other text is typed, the selection is listed only if it matches, and Enter picks the highlighted match (the first one by default); while a search is running or after it fails, the picker says so. Clearing a link takes an explicit **Clear**.
- Removing a member hands their contacts, companies, deals and open tasks in that workspace to a member chosen in the dialog (the person removing them by default), in the same transaction, with the counts in the audit log.
- Foreign keys from deals to pipelines and stages use `NO ACTION`; the service layer refuses to delete stages or pipelines that still hold deals.
- `AuditLog.changes` stores `{ field: { from, to } }` with values normalised to JSON (dates as ISO strings, decimals as fixed strings).

## Testing strategy

| Layer     | Tool                  | What it proves                                                                                                                                                                              |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain    | Vitest unit tests     | Rules in isolation: transitions, validation, parsing, escaping, maths, time zones, permission matrix, secret guard                                                                          |
| Services  | Vitest + PostgreSQL   | Real queries and transactions: tenancy, roles, merge, imports, exports, dashboard figures, sessions                                                                                         |
| Whole app | Playwright (Chromium) | Sign-in, invitations, forms, pickers, drag and drop, keyboard moves, imports, CSP on every main page, axe checks (also open toasts and pickers), 375/768 px layouts, forms before hydration |

Integration tests run against a dedicated database that is migrated and truncated once per run; each test file creates its own workspaces, so tests do not depend on each other.

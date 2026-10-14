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
```

Dependencies only point downwards. The domain layer is pure TypeScript and is unit tested without a database. Services are tested against a real PostgreSQL instance. The `next/` adapters are thin enough to be covered by the Playwright tests.

## Request lifecycle

1. The browser sends the `cadence_session` cookie (an opaque 256-bit token).
2. `getRequestContext()` (memoised per request with React `cache`) hashes the token with HMAC-SHA256 and `AUTH_SECRET`, loads the session, and checks it has not expired.
3. It then loads the membership for the session's active workspace. If the user was removed from that workspace, it falls back to another membership or sends the user to onboarding. Membership is checked on every request, so removing a member takes effect immediately.
4. The result is a `Ctx` — `{ userId, workspaceId, role }` — that is passed explicitly to every service call. Services never accept a workspace id from the client.

Pages call `requirePageContext()` (redirects to sign-in), Server Actions use `runAction()` and route handlers use `withApi()`. The two wrappers turn expected errors (`AppError` subclasses) into a typed result or a JSON error with the right status code (401, 403, 404, 409, 422) and log anything unexpected without leaking details.

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
- Sign-in attempts are rate limited per email (10 per 15 minutes, in memory).

### The secret guard

`APP_ENV` describes the deployment and is independent of `NODE_ENV`. When `APP_ENV=production` (or `NODE_ENV=production` without an `APP_ENV`), `src/instrumentation.ts` runs `assertSafeToStart()` before the server accepts requests and exits with code 1 if `AUTH_SECRET` is missing, short or a known placeholder, or if `DATABASE_URL` uses a default password. In production, demo accounts (`@demo.local`) cannot sign in and the seed script refuses to run. The Docker Compose demo sets `APP_ENV=demo`, which keeps the demo usable over plain http on localhost.

## Main flows

### Moving a deal on the board

1. The board applies the move optimistically with `useOptimistic` and calls `moveDealAction`.
2. `moveDeal` loads the deal and target stage within the workspace, rejects stages from other pipelines, and applies `resolveStageTransition`: `WON` and `LOST` set `closedAt`, `LOST` requires a reason, `OPEN` clears both.
3. The change and an audit entry are written in one transaction, and `revalidatePath` returns fresh server data in the same round trip.
4. If the server refuses, the optimistic state is discarded and a toast explains why. Dropping onto a lost stage first asks for the reason.

### Merging duplicates

`groupDuplicates` builds groups with a union-find over shared email (case-insensitive) and normalised phone keys, so matches are transitive. `mergeContacts` runs in one transaction: it re-points activities, tasks and deals, copies missing tags, fills empty fields on the kept contact, merges custom fields (the kept record wins), deletes the duplicate and records what moved in the audit log.

### CSV import

1. The browser reads the file and sends its text to `previewImportAction`; the server parses it with Papa Parse (size and row limits), suggests a column mapping from common header spellings, validates every row with Zod and checks emails against the workspace and earlier rows.
2. Changing the mapping re-runs the preview.
3. `importContacts` repeats the analysis inside a transaction, creates missing companies, inserts contacts with `createManyAndReturn`, links existing tags and writes one audit entry with the totals. Rows with errors are reported with their spreadsheet row number.

Exports reuse the list filters and escape cells that a spreadsheet would treat as formulas.

## Data model notes

- `Deal.amount` is `Decimal(14,2)`; arithmetic uses `Prisma.Decimal`, never floating point. The dashboard aggregates only deals in the workspace's reporting currency.
- `Deal.expectedCloseDate` is a calendar date (`@db.Date`) and is always formatted in UTC; timestamps are formatted in the user's time zone.
- Custom field values are JSONB keyed by the definition's stable `key`. Deleting a definition leaves old values in place; they are ignored and dropped the next time the record is saved.
- Foreign keys from deals to pipelines and stages use `NO ACTION`; the service layer refuses to delete stages or pipelines that still hold deals.
- `AuditLog.changes` stores `{ field: { from, to } }` with values normalised to JSON (dates as ISO strings, decimals as fixed strings).

## Testing strategy

| Layer     | Tool                  | What it proves                                                                                                     |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Domain    | Vitest unit tests     | Rules in isolation: transitions, validation, parsing, escaping, maths, time zones, permission matrix, secret guard |
| Services  | Vitest + PostgreSQL   | Real queries and transactions: tenancy, roles, merge, imports, exports, dashboard figures, sessions                |
| Whole app | Playwright (Chromium) | Sign-in, forms, drag and drop, toasts, server-enforced permissions through the HTTP API                            |

Integration tests run against a dedicated database that is migrated and truncated once per run; each test file creates its own workspaces, so tests do not depend on each other.

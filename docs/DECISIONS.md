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
**Consequences.** No rounding drift. Currency conversion is out of scope for v1.

## ADR-008: Prisma 7 with the `pg` driver adapter

**Decision.** Use the Rust-free Prisma client generated into `src/generated/prisma` with `@prisma/adapter-pg`, configured through `prisma.config.ts`; migrations are committed.
**Consequences.** Smaller runtime with no query engine binary in the Docker image. The generated client is not committed and is produced by `postinstall`.

## ADR-009: Cache Components off

**Context.** Next.js 16 can enable Cache Components and partial prefetching.
**Decision.** Keep them off. Every CRM page depends on the signed-in user and workspace, so there is little static content to cache, and correctness of permission checks matters more than prefetching.
**Consequences.** Classic dynamic rendering; revisit when public pages are added.

## ADR-010: Native selects and server-validated forms

**Decision.** Forms use native `<select>`, `<input type="date">` and checkboxes styled to match the Radix-based components, and submit `FormData` to Server Actions through a small `useActionForm` hook that keeps input after validation errors and shows field errors from the server.
**Consequences.** Accessible and keyboard friendly by default, simple to test, and one validation source (Zod on the server).

## ADR-011: Kanban with dnd-kit, optimistic updates and a keyboard alternative

**Decision.** Drag handles use dnd-kit's pointer and keyboard sensors; moves are optimistic and rolled back if the server refuses. Every card also has a "Move to" menu, which serves keyboard and touch users and keeps tests deterministic.
**Consequences.** Fast feel without trusting the client; the server re-validates stage membership and close rules.

## ADR-012: CSV import rules

**Decision.** Papa Parse for RFC 4180 parsing; 2 MB / 5,000-row limits; de-duplication by email against the workspace and earlier rows; unknown tags are reported and ignored; companies are matched by name or created. Exports neutralise spreadsheet formulas (`=`, `+`, `-`, `@`, tab, carriage return).
**Consequences.** Imports are predictable and safe to re-run; rows without an email cannot be de-duplicated and are imported.

## ADR-013: Test services against a real database

**Decision.** Integration tests call the services against PostgreSQL instead of mocking Prisma. The test database is migrated and truncated once per run and each file creates its own workspaces.
**Consequences.** Tests catch query, transaction and constraint mistakes that mocks would hide, at the cost of needing Docker locally (CI uses a service container).

## ADR-014: In-memory sign-in rate limiting

**Decision.** A fixed-window limiter per email (10 attempts per 15 minutes) kept in process memory.
**Consequences.** Adequate for a single instance; a shared store (Redis or the database) is needed before scaling out.

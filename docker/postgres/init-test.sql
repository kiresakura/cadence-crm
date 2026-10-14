-- The test server hosts two databases: one for Vitest integration tests
-- (cadence_test, created by POSTGRES_DB) and one for Playwright E2E runs.
CREATE DATABASE cadence_e2e OWNER cadence;

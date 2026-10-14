import { execFileSync } from "node:child_process";

import { Client } from "pg";

/** Migrates the test database once and empties every table before the integration suite. */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://cadence:cadence@localhost:54330/cadence_test";

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length > 0) {
      await client.query(
        `TRUNCATE ${rows.map((row) => `"${row.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
      );
    }
  } finally {
    await client.end();
  }
}

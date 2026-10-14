import { Client } from "pg";

// Same database the web server in playwright.config.ts migrates and seeds.
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? "postgresql://cadence:cadence@localhost:54330/cadence_e2e";

/** Direct database access for arranging large fixtures and checking stored values. */
export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function workspaceOf(email: string): Promise<{ workspaceId: string; userId: string }> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ workspaceId: string; userId: string }>(
      `SELECT m."workspaceId", u.id AS "userId"
         FROM "User" u JOIN "Membership" m ON m."userId" = u.id
        WHERE u.email = $1
        ORDER BY m."createdAt" ASC
        LIMIT 1`,
      [email],
    );
    if (!rows[0]) throw new Error(`No workspace for ${email}`);
    return rows[0];
  });
}

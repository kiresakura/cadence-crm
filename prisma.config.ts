import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The Prisma CLI does not read .env files on its own; Next.js does at runtime.
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Optional for `prisma generate`; required for migrate commands.
    url: process.env.DATABASE_URL,
  },
});

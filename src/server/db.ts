import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Prisma } from "@/generated/prisma/client";

/** Either the root client or an interactive transaction client. */
export type DbClient = Prisma.TransactionClient;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** Shared Prisma client. Reused across hot reloads in development. */
export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

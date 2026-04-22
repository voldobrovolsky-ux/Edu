import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPrismaSchemaRoot } from "@/lib/find-prisma-root";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  adapter: PrismaBetterSqlite3 | undefined;
};

/**
 * Absolute path for SQLite. @prisma/adapter-better-sqlite3 strips only the `file:` prefix; `file:///C:/...`
 * becomes `///C:/...` and fails on Windows — so never pass pathToFileURL() output here.
 */
function resolveSqliteDatabaseUrl(): string {
  const root = findPrismaSchemaRoot();
  const env = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  if (!env.startsWith("file:")) {
    return path.join(root, "prisma", "dev.db");
  }
  try {
    const diskPath = fileURLToPath(env);
    if (path.isAbsolute(diskPath)) {
      return diskPath;
    }
  } catch {
    /* relative file:./... */
  }
  const rest = env.slice("file:".length).replace(/^\/+/, "");
  if (path.isAbsolute(rest)) {
    return rest;
  }
  return path.normalize(path.join(root, rest));
}

function createClient(): PrismaClient {
  const url = resolveSqliteDatabaseUrl();
  const adapter = globalForPrisma.adapter ?? new PrismaBetterSqlite3({ url });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.adapter = adapter;
  }
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

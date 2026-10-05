import path from "path";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "../config/env";
import type { AppDatabase } from "../types/database";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { hansDb?: Promise<AppDatabase> };

function migrationsFolder() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
}

function sqlOptions(url: string, max: number) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  return {
    max,
    prepare: false,
    ssl: local || url.includes("sslmode=") ? undefined : { rejectUnauthorized: false as const },
  };
}

async function openDatabase(): Promise<AppDatabase> {
  const url = databaseUrl();
  const migrationClient = postgres(url, sqlOptions(url, 1));
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: migrationsFolder() });
  } finally {
    await migrationClient.end();
  }

  const client = postgres(url, sqlOptions(url, 10));
  return drizzle(client, { schema });
}

export function getDb() {
  if (!globalForDb.hansDb) {
    globalForDb.hansDb = openDatabase().catch((error: unknown) => {
      globalForDb.hansDb = undefined;
      throw error;
    });
  }
  return globalForDb.hansDb;
}

import "server-only";
import path from "node:path";
import { Kysely, MysqlDialect, SqliteDialect, type Dialect } from "kysely";
import { Migrator } from "kysely/migration";
import { readConfig, storagePath, type DbConfig } from "../config";
import { bootstrapFromEnv } from "./bootstrap";
import { migrationProvider } from "./migrations";
import { openSqlite } from "./sqlite";
import type { Database } from "./schema";

export type { Database } from "./schema";

interface DbState {
  db: Kysely<Database>;
  driver: DbConfig["driver"];
  migrated: Promise<void> | null;
}

// Survive hot reloads in development without opening new pools.
const globalForDb = globalThis as unknown as { __pulsezenDb?: DbState; __pulsezenDbInit?: Promise<DbState> };

export function sqliteFilePath(file: string): string {
  return path.isAbsolute(file) ? file : storagePath(file);
}

export async function createDialect(config: DbConfig): Promise<Dialect> {
  if (config.driver === "mysql") {
    const { createPool } = await import("mysql2");
    return new MysqlDialect({
      pool: createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        // Serverless platforms run many short-lived instances; keep each pool small there.
        connectionLimit: process.env.VERCEL ? 3 : 10,
        charset: "utf8mb4",
        ssl: config.ssl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
      }),
    });
  }
  return new SqliteDialect({ database: openSqlite(sqliteFilePath(config.file)) });
}

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

export async function getDb(): Promise<Kysely<Database>> {
  let state = globalForDb.__pulsezenDb;
  if (!state) {
    // Concurrent first requests share one initialisation, so they can't open two
    // connections and run the migrations twice at the same time.
    const config = readConfig();
    if (!config) throw new Error("Pulsezen is not installed. Open /install to finish setup.");
    globalForDb.__pulsezenDbInit ??= createDialect(config.db)
      .then((dialect) => {
        const created: DbState = { db: new Kysely<Database>({ dialect }), driver: config.db.driver, migrated: null };
        globalForDb.__pulsezenDb = created;
        return created;
      })
      .finally(() => {
        globalForDb.__pulsezenDbInit = undefined;
      });
    state = await globalForDb.__pulsezenDbInit;
  }
  if (!state.migrated) {
    const db = state.db;
    state.migrated = migrateToLatest(db)
      .then(() => bootstrapFromEnv(db))
      .catch((err) => {
        state.migrated = null;
        throw err;
      });
  }
  await state.migrated;
  return state.db;
}

export function dbDriver(): DbConfig["driver"] | null {
  return globalForDb.__pulsezenDb?.driver ?? readConfig()?.db.driver ?? null;
}

/** Drop the cached connection, e.g. after the installer writes a new config. */
export async function resetDb(): Promise<void> {
  const state = globalForDb.__pulsezenDb;
  globalForDb.__pulsezenDb = undefined;
  await state?.db.destroy().catch(() => undefined);
}

export const now = () => new Date().toISOString();

export const today = () => new Date().toISOString().slice(0, 10);

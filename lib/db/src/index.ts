import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import {
  envDatabaseFlags,
  parseDatabaseUrlSafe,
  resolveDatabaseUrl,
} from "./connection-diag.js";

const { Pool } = pg;

const resolved = resolveDatabaseUrl();

if (!resolved) {
  console.warn(
    "[db] No DATABASE_URL / DATABASE_PRIVATE_URL / POSTGRES_URL — HTTP starts; API DB routes return 503",
    JSON.stringify({ env: envDatabaseFlags() }),
  );
}

/** Пул создаётся синхронно; TCP — при первом запросе (connectionTimeoutMillis). */
export const pool = resolved
  ? new Pool({
      connectionString: resolved.url,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    })
  : null;

export const databaseUrlSource = resolved?.source ?? "none";

export function getDatabaseConnectionDiagnostics(): {
  env: ReturnType<typeof envDatabaseFlags>;
  target: ReturnType<typeof parseDatabaseUrlSafe> | null;
  source: typeof databaseUrlSource;
} {
  return {
    env: envDatabaseFlags(),
    target: resolved
      ? parseDatabaseUrlSafe(resolved.url, resolved.source)
      : null,
    source: databaseUrlSource,
  };
}

export const isDatabaseConfigured = (): boolean => pool !== null;

type AppDb = ReturnType<typeof drizzle<typeof schema>>;

export const db: AppDb = (
  pool ? drizzle(pool, { schema }) : null
) as AppDb;

export * from "./schema";
export * from "./migrations";
export { ensureBootstrapSchema, listPublicTables } from "./bootstrap-schema.js";
export {
  envDatabaseFlags,
  formatDbConnectError,
  parseDatabaseUrlSafe,
  resolveDatabaseUrl,
} from "./connection-diag.js";
export type {
  DatabaseUrlSource,
  DbConnectErrorKind,
  SafeDatabaseTarget,
} from "./connection-diag.js";

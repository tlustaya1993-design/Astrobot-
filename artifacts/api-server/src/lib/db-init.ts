import type { Pool } from "pg";
import { logger } from "./logger.js";

export type DbInitStatus = "pending" | "ready" | "failed";

let status: DbInitStatus = "pending";
let lastError: unknown;

const DB_PING_TIMEOUT_MS = 10_000;
const MIGRATIONS_TIMEOUT_MS = 30_000;
const MAX_WAIT_ATTEMPTS = 12;
const WAIT_DELAY_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export function getDbInitStatus(): DbInitStatus {
  return status;
}

export function getDbInitError(): unknown {
  return lastError;
}

/** После listen: ping БД + runDbMigrations, без блокировки HTTP bind. */
export function startDbInitInBackground(
  pool: Pool | null,
  runMigrations: (pool: Pool) => Promise<void>,
): void {
  if (!pool) {
    status = "failed";
    lastError = new Error("DATABASE_URL not configured");
    logger.warn("Database init skipped: no connection pool");
    return;
  }

  void (async () => {
    logger.info("Database init started (background)");

    for (let attempt = 1; attempt <= MAX_WAIT_ATTEMPTS; attempt++) {
      try {
        await withTimeout(pool.query("SELECT 1"), DB_PING_TIMEOUT_MS, "DB ping");
        logger.info({ attempt }, "Database is reachable");
        break;
      } catch (err) {
        lastError = err;
        logger.warn(
          { err, attempt, maxAttempts: MAX_WAIT_ATTEMPTS },
          "Database not reachable yet",
        );
        if (attempt >= MAX_WAIT_ATTEMPTS) {
          status = "failed";
          logger.error({ err }, "Database init failed: ping exhausted");
          return;
        }
        await new Promise((r) => setTimeout(r, WAIT_DELAY_MS));
      }
    }

    try {
      await withTimeout(runMigrations(pool), MIGRATIONS_TIMEOUT_MS, "DB migrations");
      status = "ready";
      lastError = undefined;
      logger.info("Database migrations complete");
    } catch (err) {
      lastError = err;
      status = "failed";
      logger.error({ err }, "Database migrations failed");
    }
  })();
}

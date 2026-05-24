import type { Pool } from "pg";
import {
  formatDbConnectError,
  getDatabaseConnectionDiagnostics,
  listPublicTables,
} from "@workspace/db";
import { logger } from "./logger.js";

export type DbInitStatus = "pending" | "ready" | "failed";

let status: DbInitStatus = "pending";
let lastError: unknown;

const DB_PING_TIMEOUT_MS = 10_000;
const MIGRATIONS_WARN_AFTER_MS = 30_000;
const MAX_WAIT_ATTEMPTS = 12;
const WAIT_DELAY_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
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
  const diag = getDatabaseConnectionDiagnostics();

  if (!pool) {
    status = "failed";
    lastError = new Error("DATABASE_URL not configured");
    logger.error(
      {
        env: diag.env,
        hint: "Set DATABASE_URL=${{Postgres.DATABASE_URL}} on the API service (not only on Postgres plugin)",
      },
      "Database init skipped: no connection pool",
    );
    return;
  }

  logger.info(
    {
      env: diag.env,
      db: diag.target,
      urlSource: diag.source,
    },
    "Database init started (background)",
  );

  if (diag.target?.parseError) {
    logger.error(
      { parseError: diag.target.parseError, urlSource: diag.source },
      "DATABASE_URL is set but could not be parsed — check reference/expansion in Railway",
    );
  }

  void (async () => {
    for (let attempt = 1; attempt <= MAX_WAIT_ATTEMPTS; attempt++) {
      try {
        await withTimeout(pool.query("SELECT 1"), DB_PING_TIMEOUT_MS, "DB ping");
        logger.info({ attempt, db: diag.target }, "Database is reachable");
        break;
      } catch (err) {
        lastError = err;
        const connectError = formatDbConnectError(err);
        logger.warn(
          {
            attempt,
            maxAttempts: MAX_WAIT_ATTEMPTS,
            connectError,
            db: diag.target,
          },
          "Database not reachable yet",
        );
        if (attempt >= MAX_WAIT_ATTEMPTS) {
          status = "failed";
          logger.error(
            {
              connectError,
              db: diag.target,
              env: diag.env,
            },
            "Database init failed: ping exhausted",
          );
          return;
        }
        await new Promise((r) => setTimeout(r, WAIT_DELAY_MS));
      }
    }

    try {
      const slowMigrationWarning = setTimeout(() => {
        logger.warn(
          { db: diag.target, warnAfterMs: MIGRATIONS_WARN_AFTER_MS },
          "Database migrations still running",
        );
      }, MIGRATIONS_WARN_AFTER_MS);

      try {
        await runMigrations(pool);
      } finally {
        clearTimeout(slowMigrationWarning);
      }

      status = "ready";
      lastError = undefined;
      const tables = await listPublicTables(pool);
      logger.info(
        { db: diag.target, tables, usersExists: tables.includes("users") },
        "Database migrations complete",
      );
    } catch (err) {
      lastError = err;
      status = "failed";
      logger.error(
        {
          connectError: formatDbConnectError(err),
          db: diag.target,
        },
        "Database migrations failed",
      );
    }
  })();
}

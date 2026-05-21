import app from "./app";
import { logger } from "./lib/logger";
import { pool as dbPool, runDbMigrations } from "@workspace/db";

async function waitForDb(maxRetries = 12, delayMs = 5000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await dbPool.query("SELECT 1");
      logger.info("Database is ready");
      return;
    } catch (err) {
      logger.warn({ err, attempt: i + 1, maxRetries }, "Waiting for database");
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Database not ready after max retries");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await waitForDb();
  await runDbMigrations(dbPool);
  app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});

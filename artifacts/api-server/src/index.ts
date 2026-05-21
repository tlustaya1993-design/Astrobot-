import app from "./app";
import { pool as dbPool, runDbMigrations } from "@workspace/db";
import { startDbInitInBackground } from "./lib/db-init.js";
import { logger } from "./lib/logger";

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

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening (healthcheck ready)");
  startDbInitInBackground(dbPool, runDbMigrations);
});

server.on("error", (err) => {
  logger.error({ err }, "Failed to bind HTTP port");
  process.exit(1);
});

import express, { type Express } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getDbInitStatus, startDbInitInBackground } from "./lib/db-init.js";
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

const host = process.env.HOST ?? "0.0.0.0";

logger.info(
  { port, host, node: process.version },
  "[boot] starting API (health route first)",
);

const root = express();

root.get("/api/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

root.get("/api/readyz", (_req, res) => {
  const dbStatus = getDbInitStatus();
  if (dbStatus === "ready") {
    res.json({ status: "ready" });
    return;
  }
  res.setHeader("Retry-After", "3");
  res.status(503).json({
    status: dbStatus,
    code: dbStatus === "pending" ? "DB_WARMING_UP" : "DB_INIT_FAILED",
  });
});

const server = root.listen(port, host, () => {
  logger.info({ port, host }, "Server listening (healthcheck ready)");
  void attachFullApplication(root);
});

server.on("error", (err) => {
  logger.error({ err, port, host }, "Failed to bind HTTP port");
  process.exit(1);
});

async function attachFullApplication(root: Express): Promise<void> {
  try {
    const [{ configureApp }, db] = await Promise.all([
      import("./app.js"),
      import("@workspace/db"),
    ]);

    configureApp(root);

    if (db.pool) {
      startDbInitInBackground(db.pool, db.runDbMigrations);
    } else {
      logger.warn(
        { env: db.getDatabaseConnectionDiagnostics().env },
        "DATABASE_URL missing — skipping background DB init",
      );
    }

    logger.info("Full application routes attached (API + SPA on same server)");
  } catch (err) {
    logger.error(
      {
        err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Failed to attach application (healthcheck still works on /api/healthz)",
    );
  }
}

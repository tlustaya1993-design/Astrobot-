import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getDbInitStatus } from "../lib/db-init.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Readiness: 200 только когда фоновые миграции и ping БД завершены. */
router.get("/readyz", (_req, res) => {
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

export default router;

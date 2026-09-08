import { Router } from "express";
import { logger } from "../lib/logger.js";

/**
 * TEMPORARY: diagnosing the Yandex OAuth "white page" report — the reporter has no
 * DevTools access (iPad/phone only), so client-side errors get beaconed here and show
 * up in the normal server logs instead. Remove this route once diagnosed.
 */
const router = Router();

router.post("/", (req, res) => {
  const body = req.body as Record<string, unknown>;
  logger.warn({ clientEvent: body }, "CLIENT_JS_EVENT");
  res.status(204).end();
});

export default router;

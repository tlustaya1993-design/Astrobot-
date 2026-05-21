import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import openaiRouter from "./openai/conversations.js";
import dailyForecastRouter from "./openai/daily-forecast.js";
import contactsRouter from "./contacts.js";
import billingRouter from "./billing.js";
import adminRouter from "./admin.js";
import supportRouter from "./support.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/openai", openaiRouter);
router.use("/openai", dailyForecastRouter);
router.use(contactsRouter);
router.use("/billing", billingRouter);
router.use("/admin", adminRouter);
router.use("/support", supportRouter);

/** Ленивый mount: сбой swisseph/astrology не роняет attach всего API+SPA. */
let astrologyRouter: IRouter | null | undefined;
const ASTRO_UNAVAILABLE = {
  error: "Астрологический движок временно недоступен.",
};

async function mountAstrology(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (astrologyRouter === null) {
    res.status(503).json(ASTRO_UNAVAILABLE);
    return;
  }
  if (!astrologyRouter) {
    try {
      const mod = await import("./astrology.js");
      astrologyRouter = mod.default;
    } catch (err) {
      astrologyRouter = null;
      logger.error({ err }, "Failed to load astrology router");
      res.status(503).json(ASTRO_UNAVAILABLE);
      return;
    }
  }
  astrologyRouter(req, res, next);
}

router.use("/astrology", (req, res, next) => {
  void mountAstrology(req, res, next);
});

export default router;

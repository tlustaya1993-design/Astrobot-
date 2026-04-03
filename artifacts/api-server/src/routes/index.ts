import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import openaiRouter from "./openai/conversations.js";
import dailyForecastRouter from "./openai/daily-forecast.js";
import astrologyRouter from "./astrology.js";
import contactsRouter from "./contacts.js";
import billingRouter from "./billing.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/openai", openaiRouter);
router.use("/openai", dailyForecastRouter);
router.use("/astrology", astrologyRouter);
router.use(contactsRouter);
router.use("/billing", billingRouter);

export default router;

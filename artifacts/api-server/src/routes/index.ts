import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
import openaiRouter from "./openai/conversations.js";
import astrologyRouter from "./astrology.js";
import contactsRouter from "./contacts.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/openai", openaiRouter);
router.use("/astrology", astrologyRouter);
router.use(contactsRouter);

export default router;

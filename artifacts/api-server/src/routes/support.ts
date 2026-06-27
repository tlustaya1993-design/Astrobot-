import { Router } from "express";
import { sendTelegramAlert, sendN8nAlert } from "../lib/telegram-alert.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/urgent", async (req, res) => {
  const { sessionId, conversationId, failureCount } = req.body as {
    sessionId?: string;
    conversationId?: number;
    failureCount?: number;
  };

  const urgentCtx = {
    sessionId,
    conversationId,
    endpoint: "POST /api/support/urgent",
    userSaw: "Кнопка «Срочный запрос в поддержку» — несколько ошибок подряд",
  };
  const urgentMsg = `${failureCount ?? "?"} ошибок подряд — нажала кнопку «Срочный запрос в поддержку»`;

  try {
    await sendTelegramAlert("Пользователь запросил поддержку", urgentMsg, urgentCtx);
  } catch (err) {
    logger.warn({ err }, "Failed to send urgent support alert");
  }

  sendN8nAlert("Пользователь запросил поддержку", new Error(urgentMsg), urgentCtx).catch(() => {});

  res.json({ ok: true });
});

export default router;

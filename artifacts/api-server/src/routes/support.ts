import { Router } from "express";
import { sendTelegramAlert } from "../lib/telegram-alert.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/urgent", async (req, res) => {
  const { sessionId, conversationId, failureCount } = req.body as {
    sessionId?: string;
    conversationId?: number;
    failureCount?: number;
  };

  try {
    await sendTelegramAlert(
      "Пользователь запросил поддержку",
      `${failureCount ?? "?"} ошибок подряд — нажала кнопку «Срочный запрос в поддержку»`,
      {
        sessionId,
        conversationId,
        endpoint: "POST /api/support/urgent",
        userSaw: "Кнопка «Срочный запрос в поддержку» — несколько ошибок подряд",
      },
    );
  } catch (err) {
    logger.warn({ err }, "Failed to send urgent support alert");
  }

  res.json({ ok: true });
});

export default router;

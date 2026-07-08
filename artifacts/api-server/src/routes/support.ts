import { Router } from "express";
import multer from "multer";
import { sendTelegramAlert, sendN8nAlert } from "../lib/telegram-alert.js";
import { uploadScreenshotToR2, isR2Configured } from "../lib/r2-upload.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ALLOWED_SCREENSHOT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024; // 8 MB

// Файл держим в памяти — сразу отдаём буфер в R2, на диск не пишем.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SCREENSHOT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_SCREENSHOT_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("unsupported_file_type"));
    }
  },
});

function coerceConversationId(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * POST /api/support/urgent
 *
 * Принимает multipart/form-data (поле text + опциональный screenshot) либо
 * legacy JSON ({ failureCount }). При наличии скриншота грузит его в R2 и
 * получает pre-signed URL, затем шлёт обращение в n8n и уведомление в Telegram.
 */
router.post("/urgent", (req, res) => {
  upload.single("screenshot")(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message =
        uploadErr instanceof Error && uploadErr.message === "unsupported_file_type"
          ? "Поддерживаются только изображения JPG, PNG или WEBP."
          : "Не удалось обработать вложение. Попробуйте файл меньшего размера.";
      res.status(400).json({ ok: false, error: message });
      return;
    }

    const body = (req.body ?? {}) as {
      text?: string;
      sessionId?: string;
      conversationId?: unknown;
      failureCount?: number;
    };

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const sessionId =
      req.sessionId ?? (typeof body.sessionId === "string" ? body.sessionId : undefined);
    const conversationId = coerceConversationId(body.conversationId);
    const email = req.authEmail;

    let screenshotUrl: string | null = null;
    if (req.file) {
      if (isR2Configured()) {
        try {
          const uploaded = await uploadScreenshotToR2(req.file.buffer, req.file.mimetype);
          screenshotUrl = uploaded.url;
        } catch (err) {
          // Скриншот не критичен: логируем, но обращение всё равно принимаем.
          logger.warn({ err }, "Failed to upload support screenshot to R2");
        }
      } else {
        logger.warn("Support screenshot received but R2 is not configured — skipping upload");
      }
    }

    // Обращение в n8n — основной канал автоматизации поддержки.
    await sendN8nAlert({
      text: text || "(без описания)",
      screenshotUrl,
      sessionId,
      conversationId,
      email,
    });

    // Дублирующее уведомление владельцу в Telegram (best-effort).
    try {
      await sendTelegramAlert(
        "Обращение в поддержку",
        text || `${body.failureCount ?? "?"} ошибок подряд — кнопка поддержки`,
        {
          sessionId,
          conversationId,
          email,
          endpoint: "POST /api/support/urgent",
          userSaw: "Форма «Обратиться в поддержку»",
          extra: screenshotUrl ? `Скриншот: ${screenshotUrl}` : undefined,
        },
      );
    } catch (err) {
      logger.warn({ err }, "Failed to send urgent support alert");
    }

    res.json({ ok: true, screenshotUrl });
  });
});

export default router;

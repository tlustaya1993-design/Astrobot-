import { Router } from "express";
import multer from "multer";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, supportMessages, supportTickets } from "@workspace/db";
import { sendTelegramAlert, sendN8nSupportRequest } from "../lib/telegram-alert.js";
import { uploadScreenshotToR2, isR2Configured, describeR2Config } from "../lib/r2-upload.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ALLOWED_SCREENSHOT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SCREENSHOT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_SCREENSHOT_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error("unsupported_file_type"));
  },
});

const AUTO_REPLY_TEXT =
  "Получили ваше обращение. Звездочёт уже смотрит — обычно около 5 минут. Можно дополнять переписку ниже.";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL?.trim() || "";
const SUPPORT_BRIDGE_SECRET = process.env.SUPPORT_BRIDGE_SECRET?.trim() || "";
const SUPPORT_N8N_NOTIFY_URL = process.env.SUPPORT_N8N_NOTIFY_URL?.trim() || "";
// Prefer Support-specific owner chat; TELEGRAM_ADMIN_CHAT_ID may point at a different ops chat.
const OWNER_CHAT_ID =
  process.env.SUPPORT_OWNER_CHAT_ID?.trim() ||
  process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() ||
  "656328649";

type TicketStatus =
  | "open"
  | "analyzing"
  | "awaiting_owner"
  | "need_info"
  | "approved"
  | "rejected"
  | "manual"
  | "fixing"
  | "closed";

function requireDb() {
  if (!db) {
    const err = new Error("Database unavailable");
    (err as Error & { status: number }).status = 503;
    throw err;
  }
  return db;
}

function bridgeAuthorized(req: { headers: Record<string, unknown> }): boolean {
  if (!SUPPORT_BRIDGE_SECRET) return false;
  const header = String(req.headers["x-support-bridge-secret"] || "");
  return header === SUPPORT_BRIDGE_SECRET;
}

async function notifyN8nOwner(
  text: string,
  ticketId?: number,
): Promise<{ delivered: boolean; reason?: string }> {
  if (!SUPPORT_N8N_NOTIFY_URL) {
    return { delivered: false, reason: "notify_url_unset" };
  }
  try {
    const res = await fetch(SUPPORT_N8N_NOTIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SUPPORT_BRIDGE_SECRET
          ? { "x-support-bridge-secret": SUPPORT_BRIDGE_SECRET }
          : {}),
      },
      body: JSON.stringify({
        chat_id: OWNER_CHAT_ID,
        text,
        ticket_id: ticketId ?? null,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ status: res.status, body }, "Failed to notify owner via n8n");
      return { delivered: false, reason: `http_${res.status}` };
    }
    return { delivered: true };
  } catch (err) {
    logger.warn({ err }, "Failed to notify owner via n8n");
    return { delivered: false, reason: "network_error" };
  }
}

type N8nIntakeResult =
  | { ok: true; ticket_id?: number; public_id?: string }
  | { ok: false; reason: "url_unset" | "http_error" | "invalid_response" | "network_error" };

async function forwardTicketToN8n(
  payload: Record<string, unknown>,
): Promise<N8nIntakeResult> {
  if (!N8N_WEBHOOK_URL) return { ok: false, reason: "url_unset" };
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ status: res.status, body }, "n8n ticket intake failed");
      return { ok: false, reason: "http_error" };
    }
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) return { ok: false, reason: "invalid_response" };
    const ticketId = Number(data.ticket_id ?? data.id);
    return {
      ok: true,
      ticket_id: Number.isFinite(ticketId) ? ticketId : undefined,
      public_id: typeof data.public_id === "string" ? data.public_id : undefined,
    };
  } catch (err) {
    logger.warn({ err }, "n8n ticket intake error");
    return { ok: false, reason: "network_error" };
  }
}

function coerceConversationId(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function formatClientContext(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const ctx = raw as Record<string, unknown>;
  const lines: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value == null || value === "") return;
    lines.push(`${label}: ${String(value)}`);
  };
  push("route", ctx.route);
  push("href", ctx.href);
  push("sessionId", ctx.sessionId);
  push("conversationId", ctx.conversationId);
  push("failureCount", ctx.failureCount);
  push("userAgent", ctx.userAgent);
  push("language", ctx.language);
  push("timezone", ctx.timezone);
  push("viewport", ctx.viewport);
  push("platform", ctx.platform);
  return lines.length ? lines.join("\n") : null;
}

/**
 * POST /api/support/urgent — legacy/chat CTA.
 * multipart (text + screenshot) или JSON { failureCount }.
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
          logger.warn({ err }, "Failed to upload support screenshot to R2");
        }
      } else {
        logger.warn(
          { vars: describeR2Config() },
          "Support screenshot received but R2 is not configured — skipping upload",
        );
      }
    }

    await sendN8nSupportRequest({
      text: text || "(без описания)",
      screenshotUrl,
      sessionId,
      conversationId,
      email,
    });

    try {
      await sendTelegramAlert(
        text ? "Обращение в поддержку" : "Пользователь запросил поддержку",
        text || `${body.failureCount ?? "?"} ошибок подряд — кнопка поддержки`,
        {
          sessionId,
          conversationId,
          email,
          endpoint: "POST /api/support/urgent",
          userSaw: text
            ? "Форма «Обратиться в поддержку»"
            : "Кнопка «Срочный запрос в поддержку» — несколько ошибок подряд",
          extra: screenshotUrl ? `Скриншот: ${screenshotUrl}` : undefined,
        },
      );
    } catch (err) {
      logger.warn({ err }, "Failed to send urgent support alert");
    }

    res.json({ ok: true, screenshotUrl });
  });
});

router.get("/tickets", async (req, res) => {
  try {
    const database = requireDb();
    const sessionId = req.sessionId;
    if (!sessionId) return res.status(401).json({ error: "session required" });

    const rows = await database
      .select({
        id: supportTickets.id,
        publicId: supportTickets.publicId,
        status: supportTickets.status,
        description: supportTickets.description,
        bridgeOpen: supportTickets.bridgeOpen,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .where(eq(supportTickets.sessionId, sessionId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(50);

    res.json({ tickets: rows });
  } catch (err) {
    logger.error({ err }, "GET /support/tickets failed");
    res.status(500).json({ error: "failed" });
  }
});

router.get("/tickets/:id", async (req, res) => {
  try {
    const database = requireDb();
    const sessionId = req.sessionId;
    if (!sessionId) return res.status(401).json({ error: "session required" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const [ticket] = await database
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.sessionId, sessionId)))
      .limit(1);

    if (!ticket) return res.status(404).json({ error: "not found" });

    const messages = await database
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id))
      .orderBy(asc(supportMessages.createdAt));

    res.json({ ticket, messages });
  } catch (err) {
    logger.error({ err }, "GET /support/tickets/:id failed");
    res.status(500).json({ error: "failed" });
  }
});

router.post("/tickets", async (req, res) => {
  try {
    const database = requireDb();
    const sessionId = req.sessionId;
    if (!sessionId) return res.status(401).json({ error: "session required" });

    const body = req.body as {
      description?: string;
      expectedBehavior?: string;
      expected_behavior?: string;
      screenshotUrl?: string;
      screenshot_url?: string;
      conversationId?: number;
      conversation_id?: number;
      clientContext?: unknown;
      client_context?: unknown;
    };

    const description = String(body.description || "").trim();
    if (!description) return res.status(400).json({ error: "description required" });

    const expectedBehavior = String(
      body.expectedBehavior || body.expected_behavior || "",
    ).trim();
    const screenshotUrl = String(body.screenshotUrl || body.screenshot_url || "").trim();
    const conversationIdRaw = body.conversationId ?? body.conversation_id;
    const conversationId =
      conversationIdRaw != null && Number.isFinite(Number(conversationIdRaw))
        ? Number(conversationIdRaw)
        : null;
    const clientContextRaw = body.clientContext ?? body.client_context;
    const clientContextText = formatClientContext(clientContextRaw);

    const [ticket] = await database
      .insert(supportTickets)
      .values({
        sessionId,
        conversationId,
        status: "analyzing",
        description,
        expectedBehavior: expectedBehavior || null,
        screenshotUrl: screenshotUrl || null,
        bridgeOpen: false,
      })
      .returning();

    await database.insert(supportMessages).values({
      ticketId: ticket.id,
      role: "user",
      content: description,
      source: "app",
    });

    if (expectedBehavior) {
      await database.insert(supportMessages).values({
        ticketId: ticket.id,
        role: "system",
        content: `Ожидаемое поведение: ${expectedBehavior}`,
        source: "app",
      });
    }

    if (clientContextText) {
      await database.insert(supportMessages).values({
        ticketId: ticket.id,
        role: "system",
        content: `Техконтекст:\n${clientContextText}`,
        source: "app",
      });
    }

    // M1: immediate user-visible auto-reply in ticket chat.
    await database.insert(supportMessages).values({
      ticketId: ticket.id,
      role: "system",
      content: AUTO_REPLY_TEXT,
      source: "system",
    });

    const n8n = await forwardTicketToN8n({
      description,
      expected_behavior: expectedBehavior,
      screenshot_url: screenshotUrl,
      session_id: sessionId,
      conversation_id: conversationId != null ? String(conversationId) : "",
      source: "astrobot_app",
      external_ref: ticket.publicId,
      app_ticket_id: ticket.id,
      client_context: clientContextRaw ?? null,
    });

    if (n8n.ok) {
      if (n8n.ticket_id || n8n.public_id) {
        await database
          .update(supportTickets)
          .set({
            n8nTicketId: n8n.ticket_id ?? null,
            n8nPublicId: n8n.public_id ?? null,
            updatedAt: new Date(),
          })
          .where(eq(supportTickets.id, ticket.id));
        ticket.n8nTicketId = n8n.ticket_id ?? null;
        ticket.n8nPublicId = n8n.public_id ?? null;
      }
      res.status(201).json({ ticket, intakeDelivered: true, autoReply: AUTO_REPLY_TEXT });
      return;
    }

    // Keep the local ticket, but do not pretend Support pipeline received it.
    const [pending] = await database
      .update(supportTickets)
      .set({ status: "open", updatedAt: new Date() })
      .where(eq(supportTickets.id, ticket.id))
      .returning();
    ticket.status = pending.status;

    await database.insert(supportMessages).values({
      ticketId: ticket.id,
      role: "system",
      content:
        "Обращение сохранено, но до службы поддержки пока не дошло. Мы повторим доставку; можете дополнить сообщение ниже.",
      source: "system",
    });

    res.status(202).json({
      ticket,
      intakeDelivered: false,
      intakeError: n8n.reason,
      autoReply: AUTO_REPLY_TEXT,
    });
  } catch (err) {
    logger.error({ err }, "POST /support/tickets failed");
    res.status(500).json({ error: "failed" });
  }
});

router.post("/tickets/:id/messages", async (req, res) => {
  try {
    const database = requireDb();
    const sessionId = req.sessionId;
    if (!sessionId) return res.status(401).json({ error: "session required" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const content = String((req.body as { content?: string }).content || "").trim();
    if (!content) return res.status(400).json({ error: "content required" });

    const [ticket] = await database
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.sessionId, sessionId)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: "not found" });

    const [message] = await database
      .insert(supportMessages)
      .values({
        ticketId: id,
        role: "user",
        content,
        source: "app",
      })
      .returning();

    await database
      .update(supportTickets)
      .set({ updatedAt: new Date() })
      .where(eq(supportTickets.id, id));

    const n8nRef = ticket.n8nTicketId ? `#${ticket.n8nTicketId}` : `#app-${ticket.id}`;
    const notify = await notifyN8nOwner(
      `💬 Ответ пользователя по тикету ${n8nRef}\n\n${content}`,
      ticket.n8nTicketId ?? ticket.id,
    );

    if (!notify.delivered) {
      await database.insert(supportMessages).values({
        ticketId: id,
        role: "system",
        content:
          "Сообщение сохранено в переписке, но уведомление владельцу не доставлено. Попробуйте ещё раз чуть позже.",
        source: "system",
      });
    }

    res.status(notify.delivered ? 201 : 202).json({
      message,
      deliveredToOwner: notify.delivered,
      ...(notify.delivered ? {} : { deliveryError: notify.reason }),
    });
  } catch (err) {
    logger.error({ err }, "POST /support/tickets/:id/messages failed");
    res.status(500).json({ error: "failed" });
  }
});

/** n8n → app: owner message from Telegram Need Info bridge */
router.post("/internal/owner-message", async (req, res) => {
  if (!bridgeAuthorized(req)) return res.status(401).json({ error: "unauthorized" });

  try {
    const database = requireDb();
    const body = req.body as {
      n8n_ticket_id?: number;
      app_ticket_id?: number;
      public_id?: string;
      content?: string;
    };
    const content = String(body.content || "").trim();
    if (!content) return res.status(400).json({ error: "content required" });

    let ticket =
      body.app_ticket_id != null
        ? (
            await database
              .select()
              .from(supportTickets)
              .where(eq(supportTickets.id, Number(body.app_ticket_id)))
              .limit(1)
          )[0]
        : undefined;

    if (!ticket && body.n8n_ticket_id != null) {
      ticket = (
        await database
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.n8nTicketId, Number(body.n8n_ticket_id)))
          .limit(1)
      )[0];
    }

    if (!ticket && body.public_id) {
      ticket = (
        await database
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.publicId, String(body.public_id)))
          .limit(1)
      )[0];
      if (!ticket) {
        ticket = (
          await database
            .select()
            .from(supportTickets)
            .where(eq(supportTickets.n8nPublicId, String(body.public_id)))
            .limit(1)
        )[0];
      }
    }

    if (!ticket) return res.status(404).json({ error: "ticket not found" });

    const [message] = await database
      .insert(supportMessages)
      .values({
        ticketId: ticket.id,
        role: "owner",
        content,
        source: "telegram",
      })
      .returning();

    await database
      .update(supportTickets)
      .set({
        status: "need_info",
        bridgeOpen: true,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticket.id));

    res.status(201).json({ ok: true, message, ticket_id: ticket.id });
  } catch (err) {
    logger.error({ err }, "POST /support/internal/owner-message failed");
    res.status(500).json({ error: "failed" });
  }
});

/** n8n → app: sync status / open bridge */
router.post("/internal/status", async (req, res) => {
  if (!bridgeAuthorized(req)) return res.status(401).json({ error: "unauthorized" });

  try {
    const database = requireDb();
    const body = req.body as {
      n8n_ticket_id?: number;
      app_ticket_id?: number;
      public_id?: string;
      status?: TicketStatus | string;
      bridge_open?: boolean;
    };

    let ticket =
      body.app_ticket_id != null
        ? (
            await database
              .select()
              .from(supportTickets)
              .where(eq(supportTickets.id, Number(body.app_ticket_id)))
              .limit(1)
          )[0]
        : undefined;

    if (!ticket && body.n8n_ticket_id != null) {
      ticket = (
        await database
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.n8nTicketId, Number(body.n8n_ticket_id)))
          .limit(1)
      )[0];
    }

    if (!ticket && body.public_id) {
      ticket = (
        await database
          .select()
          .from(supportTickets)
          .where(eq(supportTickets.n8nPublicId, String(body.public_id)))
          .limit(1)
      )[0];
    }

    if (!ticket) return res.status(404).json({ error: "ticket not found" });

    const status = String(body.status || ticket.status);
    const bridgeOpen =
      body.bridge_open != null ? Boolean(body.bridge_open) : status === "need_info";

    const [updated] = await database
      .update(supportTickets)
      .set({
        status,
        bridgeOpen,
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticket.id))
      .returning();

    if (status === "need_info") {
      await database.insert(supportMessages).values({
        ticketId: ticket.id,
        role: "system",
        content:
          "Поддержка запросила уточнение. Напишите ответ в этом чате — сообщение уйдёт владельцу.",
        source: "system",
      });
    }

    res.json({ ok: true, ticket: updated });
  } catch (err) {
    logger.error({ err }, "POST /support/internal/status failed");
    res.status(500).json({ error: "failed" });
  }
});

export default router;

import { Router, type IRouter } from "express";
import { db, conversations, messages, usersTable, contactsTable, memoriesTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger.js";
import { sendTelegramAlert } from "../../lib/telegram-alert.js";
import { detectTier, checkAiThrottle, markInFlight, clearInFlight } from "../../lib/ai-rate-limit.js";
import {
  calcNatalChart, calcEphemeris, calcSolarReturn, calcProgressions,
  calcSynastry, calcLunarReturn, calcSolarArcDirections, calcTransitPerfections,
  formatNatalForPrompt, formatEphemerisForPrompt,
  formatSolarReturnForPrompt, formatProgressionsForPrompt, formatSynastryForPrompt,
  formatLunarReturnForPrompt, formatSolarArcForPrompt, formatTransitPerfectionsForPrompt,
  validateNatalChart,
  SWE_AVAILABLE,
  type NatalChart,
  type ChartValidationResult,
} from "../../lib/astrology.js";
import { isAstroAssistantMessage } from "../../lib/astroMessageFilter.js";
import {
  FREE_REQUESTS_LIMIT,
  isUnlimitedUser,
  getRemainingFreeRequests,
  canAffordRequest,
  getBalanceAfterCharge,
} from "../../lib/billing-policy.js";
import { parseAvatarJson } from "../../lib/avatar-config.js";

const router: IRouter = Router();
const CHAT_RESPONSE_TEMPERATURE = 0.2;
const MAX_CHAT_MESSAGE_CHARS = 8000;
const AUTH_REQUIRED_ERROR = "Требуется авторизация";
const MAX_RATE_LIMIT_RETRIES = 3;

function isRateLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('overloaded')
  );
}

/** Strip raw API-provider details before they reach the client. */
function sanitizeStreamError(msg: string): string {
  const l = msg.toLowerCase();
  if (
    l.includes('request_id') ||
    l.includes('invalid_request_error') ||
    l.includes('api_error') ||
    l.includes('overloaded_error') ||
    l.includes('credit balance') ||
    l.includes('plans & billing') ||
    l.includes('anthropic') ||
    l.includes('openai') ||
    /^\d{3}\s*[{\[]/.test(msg.trimStart())
  ) {
    return 'Астробот временно недоступен. Попробуй ещё раз через минуту.';
  }
  return msg;
}

/** Переопредели в Railway, если аккаунт Anthropic ещё не видит новый id. */
const ANTHROPIC_CHAT_MODEL =
  process.env.ANTHROPIC_CHAT_MODEL?.trim() || "claude-sonnet-4-6";
/** Память / дешёвые вызовы: дефолт Haiku 4.5; старый Haiku 3.5 snapshot часто недоступен в API. */
const ANTHROPIC_MEMORY_MODEL =
  process.env.ANTHROPIC_MEMORY_MODEL?.trim() || "claude-haiku-4-5";

function hasAnthropicProvider(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  );
}

function heuristicConversationTitle(firstMessage: string): string {
  const normalized = firstMessage.replace(/\s+/g, " ").trim();
  if (!normalized) return "Новый диалог";
  const words = normalized
    .replace(/[?!.…,:;]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  let title = words.join(" ");
  if (title.length > 56) title = `${title.slice(0, 56).trimEnd()}…`;
  return title || "Новый диалог";
}

function cleanConversationTitle(raw: string): string {
  return raw
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function generateConversationTitle(firstMessage: string): Promise<string> {
  const fallback = heuristicConversationTitle(firstMessage);
  if (!hasAnthropicProvider()) return fallback;

  try {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MEMORY_MODEL,
      max_tokens: 48,
      temperature: 0.2,
      system: `Ты придумываешь короткое название чата в списке диалогов астрологического бота.
По смыслу первого вопроса пользователя — не дословная цитата.
2–6 слов, русский язык, без кавычек и точки в конце.
Ответь только названием, без пояснений.`,
      messages: [{ role: "user", content: firstMessage.slice(0, 500) }],
    });
    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const cleaned = cleanConversationTitle(text);
    return cleaned || fallback;
  } catch (err) {
    logger.warn({ err }, "generateConversationTitle failed; using heuristic");
    return fallback;
  }
}

function requireSessionId(
  req: { sessionId?: string },
  res: { status: (code: number) => { json: (payload: unknown) => void } },
): string | null {
  if (!req.sessionId) {
    res.status(401).json({ error: AUTH_REQUIRED_ERROR });
    return null;
  }
  return req.sessionId;
}

async function rollbackRequestsBalance(sessionId: string, balanceBeforeCharge: number, context: string) {
  try {
    await db
      .update(usersTable)
      .set({
        requestsBalance: balanceBeforeCharge,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, sessionId));
  } catch (rollbackErr) {
    logger.error({ err: rollbackErr }, context);
  }
}

router.get("/conversations", async (req, res) => {
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;
  const lastActivityExpr = sql`coalesce(max(${messages.createdAt}), ${conversations.createdAt})`;
  const rows = await db
    .select({
      id: conversations.id,
      sessionId: conversations.sessionId,
      title: conversations.title,
      contactId: conversations.contactId,
      contactExtendedMode: conversations.contactExtendedMode,
      createdAt: conversations.createdAt,
      lastMessageAt: lastActivityExpr,
      contactName: contactsTable.name,
      contactRelation: contactsTable.relation,
      contactAvatarJson: contactsTable.avatarJson,
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .leftJoin(contactsTable, eq(conversations.contactId, contactsTable.id))
    .where(eq(conversations.sessionId, sessionId))
    .groupBy(
      conversations.id,
      conversations.sessionId,
      conversations.title,
      conversations.contactId,
      conversations.contactExtendedMode,
      conversations.createdAt,
      contactsTable.name,
      contactsTable.relation,
      contactsTable.avatarJson,
    )
    .orderBy(desc(lastActivityExpr), desc(conversations.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      title: r.title,
      contactId: r.contactId ?? null,
      contactExtendedMode: Boolean(r.contactExtendedMode),
      createdAt: r.createdAt,
      lastMessageAt: r.lastMessageAt ?? r.createdAt,
      contactName: r.contactName ?? null,
      contactRelation: r.contactRelation ?? null,
      contactAvatarConfig: parseAvatarJson(r.contactAvatarJson ?? null),
    })),
  );
});

router.post("/conversations", async (req, res) => {
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;
  const body = req.body as { title?: unknown; firstMessage?: unknown };
  const rawTitle = typeof body.title === "string" ? body.title.trim() : "";
  const rawFirstMessage =
    typeof body.firstMessage === "string" ? body.firstMessage.trim() : "";

  let title = rawTitle;
  if (!title && rawFirstMessage) {
    title = await generateConversationTitle(rawFirstMessage);
  }
  if (!title) {
    res.status(400).json({ error: "title or firstMessage required" });
    return;
  }
  if (title.length > 140) {
    title = title.slice(0, 140).trimEnd();
  }

  const [created] = await db
    .insert(conversations)
    .values({ sessionId, title })
    .returning();
  res.status(201).json(created);
});

router.get("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.sessionId, sessionId)))
    .limit(1);
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

router.delete("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.sessionId, sessionId)))
    .limit(1);
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(conversations).where(eq(conversations.id, id));
  res.status(204).end();
});

router.put("/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;

  const body = req.body as { title?: unknown; contactExtendedMode?: unknown };
  const rawTitle = body?.title;
  const hasTitle = typeof rawTitle === "string";
  const title = hasTitle ? rawTitle.trim() : "";
  let contactExtendedMode: boolean | undefined;
  if (body.contactExtendedMode !== undefined) {
    if (typeof body.contactExtendedMode !== "boolean") {
      res.status(400).json({ error: "contactExtendedMode must be boolean" });
      return;
    }
    contactExtendedMode = body.contactExtendedMode;
  }

  if (!hasTitle && contactExtendedMode === undefined) {
    res.status(400).json({ error: "title or contactExtendedMode required" });
    return;
  }
  if (hasTitle) {
    if (!title) {
      res.status(400).json({ error: "title required" });
      return;
    }
    if (title.length > 140) {
      res.status(400).json({ error: "title too long" });
      return;
    }
  }

  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.sessionId, sessionId)))
    .limit(1);
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const patch: { title?: string; contactExtendedMode?: boolean } = {};
  if (hasTitle) patch.title = title;
  if (contactExtendedMode !== undefined) patch.contactExtendedMode = contactExtendedMode;

  const [updated] = await db
    .update(conversations)
    .set(patch)
    .where(eq(conversations.id, id))
    .returning();

  res.json(updated);
});

router.get("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;

  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.sessionId, sessionId)))
    .limit(1);
  if (!conv) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json(msgs);
});

router.post("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const { content, contactId, contactExtendedMode: bodyContactExtendedMode } = req.body as {
    content?: string;
    contactId?: number;
    contactExtendedMode?: boolean;
  };
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;

  if (typeof content !== "string") {
    res.status(400).json({ error: "Поле content должно быть строкой" });
    return;
  }
  const normalizedContent = content.trim();
  if (!normalizedContent) {
    res.status(400).json({ error: "Сообщение не может быть пустым" });
    return;
  }
  if (normalizedContent.length > MAX_CHAT_MESSAGE_CHARS) {
    res.status(413).json({
      error: `Ты — писатель! Но мне не прочесть до конца. Можешь сократить? Максимум ${MAX_CHAT_MESSAGE_CHARS} символов. Жду! Мне очень интересно 😊`,
    });
    return;
  }

  if (
    contactId != null &&
    (!Number.isFinite(Number(contactId)) || Number(contactId) <= 0)
  ) {
    res.status(400).json({ error: "Некорректный contactId" });
    return;
  }

  let balanceBeforeCharge = 0;
  let insertedUserId: number | undefined;

  try {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (conv.sessionId !== sessionId) {
    res.status(403).json({
      error: "Этот диалог относится к другому аккаунту. Откройте список чатов и создайте новый диалог.",
    });
    return;
  }

  const initialContactId = conv.contactId ?? null;

  let effectiveContactId: number | null = conv.contactId ?? null;

  // Keep conversation's contact binding in sync with explicit user selection.
  if (contactId != null) {
    const requestedContactId = Number(contactId);
    const [contactOk] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(and(eq(contactsTable.id, requestedContactId), eq(contactsTable.sessionId, sessionId)))
      .limit(1);
    if (!contactOk) {
      res.status(400).json({
        error: "Выбранный контакт не найден в вашем профиле. Откройте чат заново и выберите человека снова.",
      });
      return;
    }
    effectiveContactId = requestedContactId;
    if (conv.contactId !== requestedContactId) {
      await db
        .update(conversations)
        .set({ contactId: requestedContactId })
        .where(eq(conversations.id, id));
    }
  } else if (conv.contactId != null) {
    // If bound contact was deleted, clear stale link to prevent wrong person appearing in this chat.
    const [boundContact] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(and(eq(contactsTable.id, conv.contactId), eq(contactsTable.sessionId, sessionId)))
      .limit(1);
    if (!boundContact) {
      effectiveContactId = null;
      await db
        .update(conversations)
        .set({ contactId: null, contactExtendedMode: false })
        .where(eq(conversations.id, id));
    }
  }

  const contactSwitched =
    initialContactId != null &&
    effectiveContactId != null &&
    effectiveContactId !== initialContactId;

  let nextExtended = Boolean(conv.contactExtendedMode);
  if (!effectiveContactId) {
    nextExtended = false;
  } else if (typeof bodyContactExtendedMode === "boolean") {
    nextExtended = bodyContactExtendedMode;
  } else if (contactSwitched) {
    nextExtended = false;
  }

  if (nextExtended !== Boolean(conv.contactExtendedMode)) {
    await db
      .update(conversations)
      .set({ contactExtendedMode: nextExtended })
      .where(eq(conversations.id, id));
  }

  let [owner] = await db
    .select({
      sessionId: usersTable.sessionId,
      email: usersTable.email,
      requestsUsed: usersTable.requestsUsed,
      requestsBalance: usersTable.requestsBalance,
    })
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  if (!owner) {
    await db.insert(usersTable).values({ sessionId }).onConflictDoNothing();
    [owner] = await db
      .select({
        sessionId: usersTable.sessionId,
        email: usersTable.email,
        requestsUsed: usersTable.requestsUsed,
        requestsBalance: usersTable.requestsBalance,
      })
      .from(usersTable)
      .where(eq(usersTable.sessionId, sessionId))
      .limit(1);
  }

  const baseCost = normalizedContent.length >= 1200 ? 2 : 1;
  /** Расширение по контакту: ×2 от базы, но длинное+расширение = 3 (не 4), чтобы не штрафовать за оба фактора сразу. */
  let requestCost = baseCost;
  if (effectiveContactId && nextExtended) {
    requestCost = baseCost >= 2 ? 3 : 2;
  }
  const remainingFree = getRemainingFreeRequests(owner?.requestsUsed ?? 0);
  const isUnlimited = isUnlimitedUser(owner?.email);

  if (!owner || !canAffordRequest(owner.requestsUsed, owner.requestsBalance, requestCost, owner.email)) {
    res.status(402).json({
      error: `Лимит бесплатных запросов (${FREE_REQUESTS_LIMIT}) исчерпан. Пополните пакет, чтобы продолжить.`,
      required: requestCost,
      balance: owner?.requestsBalance ?? 0,
      freeRemaining: remainingFree,
      isUnlimited,
    });
    return;
  }

  // Rate limit — technical safeguard against spam, bugs, and bots.
  // Does not block paid users from using their balance; only enforces a minimum
  // interval between requests and prevents parallel requests from the same session.
  const tier = detectTier(owner.email, owner.requestsBalance, isUnlimited);
  const throttle = await checkAiThrottle(sessionId, tier);
  if (!throttle.ok) {
    res.setHeader("Retry-After", String(throttle.waitSec));
    res.status(429).json({ error: throttle.message, retryAfterSec: throttle.waitSec });
    return;
  }
  markInFlight(sessionId);

  const nextBalance = getBalanceAfterCharge(
    owner.requestsUsed,
    owner.requestsBalance,
    requestCost,
    owner.email,
  );

  balanceBeforeCharge = owner.requestsBalance;

  const [insertedUser] = await db
    .insert(messages)
    .values({ conversationId: id, role: "user", content: normalizedContent })
    .returning({ id: messages.id });
  insertedUserId = insertedUser?.id;

  await db
    .update(usersTable)
    .set({
      requestsBalance: nextBalance,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.sessionId, sessionId));

  const [history, userProfile, contactProfile, userMemories] = await Promise.all([
    db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt),
    db.select().from(usersTable).where(eq(usersTable.sessionId, sessionId)).limit(1).then((r) => r[0] || null),
    effectiveContactId
      ? db
          .select()
          .from(contactsTable)
          .where(
            and(eq(contactsTable.id, effectiveContactId), eq(contactsTable.sessionId, sessionId)),
          )
          .limit(1)
          .then((r) => r[0] || null)
      : Promise.resolve(null),
    db
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.sessionId, sessionId))
      .orderBy(desc(memoriesTable.updatedAt))
      .limit(20),
  ]);

  // ── Astro engine health gate ───────────────────────────────────────────────
  // If swisseph-v2 failed to load at startup, reject immediately with a
  // user-visible SSE error instead of attempting (and crashing) a calculation.
  if (!SWE_AVAILABLE) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(
      `data: ${JSON.stringify({
        error: "Астрологический движок временно недоступен. Попробуй позже.",
      })}\n\n`,
    );
    res.end();
    return;
  }

  const systemPrompt = safeBuildSystemPrompt(userProfile, contactProfile, userMemories, nextExtended);

  // Astro assistant messages are stripped from LLM history: their house/planet
  // assignments are always stale vs the fresh system prompt.  Both explicitly
  // tagged messages (messageType === "astro") and historical messages created
  // before the tag was introduced (messageType null/undefined) are detected via
  // isAstroAssistantMessage, which matches on structural content markers.
  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: isAstroAssistantMessage(m)
      ? "[астрологический разбор был предоставлен — актуальные данные находятся в текущем расчёте]"
      : m.content,
  }));

  let heartbeat: ReturnType<typeof setInterval> | undefined;

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (typeof (res as { flushHeaders?: () => void }).flushHeaders === "function") {
      res.flushHeaders();
    }

    let clientDisconnected = false;
    res.on("close", () => { clientDisconnected = true; });

    heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clientDisconnected = true;
      }
    }, 20_000);

    const safeWrite = (data: string) => {
      if (clientDisconnected) return;
      try {
        res.write(data);
      } catch {
        clientDisconnected = true;
      }
    };

    let fullResponse = "";
    const unknownTimePreface = userProfile?.birthTimeUnknown
      ? "Важно: время рождения указано неточно (используем 12:00), поэтому вывод по домам и точным таймингам менее конкретный.\n\n"
      : "";

    if (unknownTimePreface) {
      fullResponse += unknownTimePreface;
      safeWrite(`data: ${JSON.stringify({ content: unknownTimePreface })}\n\n`);
    }

    let aiAttempt = 0;
    let exhaustedRetries = false;

    try {
      aiRetry: while (true) {
        const responseBefore = fullResponse;
        try {
          if (hasAnthropicProvider()) {
            const stream = anthropic.messages.stream({
              model: ANTHROPIC_CHAT_MODEL,
              max_tokens: 8192,
              temperature: CHAT_RESPONSE_TEMPERATURE,
              system: systemPrompt,
              messages: chatMessages,
            });

            for await (const event of stream) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                fullResponse += event.delta.text;
                safeWrite(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
              }
            }
          } else {
            const { openai } = await import("@workspace/integrations-openai-ai-server");
            const stream = await openai.chat.completions.create({
              model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
              temperature: CHAT_RESPONSE_TEMPERATURE,
              stream: true,
              messages: [{ role: "system", content: systemPrompt }, ...chatMessages],
            });

            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                fullResponse += delta;
                safeWrite(`data: ${JSON.stringify({ content: delta })}\n\n`);
              }
            }
          }

          break aiRetry; // success
        } catch (aiErr) {
          const nothingSentYet = fullResponse === responseBefore;
          if (nothingSentYet && isRateLimitError(aiErr) && aiAttempt < MAX_RATE_LIMIT_RETRIES) {
            aiAttempt++;
            logger.warn({ attempt: aiAttempt }, "Rate limit hit, retrying AI call");
            await new Promise((r) => setTimeout(r, 2000 * aiAttempt));
            continue aiRetry;
          }
          exhaustedRetries = isRateLimitError(aiErr) && aiAttempt >= MAX_RATE_LIMIT_RETRIES;
          throw aiErr;
        }
      }

      // Save to DB and charge regardless of whether client is still connected.
      // Tag as 'astro' when the response was built with a full natal chart (date+time+coords),
      // meaning it likely contains house/planet assignments that become stale over deploys.
      const hasNatalHouses = !!(userProfile?.birthDate && userProfile?.birthTime && userProfile?.birthLat);
      await Promise.all([
        db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse, messageType: hasNatalHouses ? "astro" : "chat" }),
        db
          .update(usersTable)
          .set({
            requestsUsed: sql`${usersTable.requestsUsed} + ${requestCost}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.sessionId, sessionId)),
      ]);

      if (sessionId && fullResponse) {
        extractAndSaveMemories(sessionId, normalizedContent, fullResponse).catch(() => {});
      }

      safeWrite(`data: ${JSON.stringify({ done: true })}\n\n`);
      if (!res.writableEnded) res.end();
    } catch (err) {
      const rawErrMessage =
        err instanceof Error && err.message ? err.message : "Generation failed";
      // Sanitize before sending to the client — never expose raw provider API errors
      const userFacingMessage = sanitizeStreamError(rawErrMessage);
      logger.error({ err, aiAttempt }, "Chat streaming error");
      sendTelegramAlert(
        exhaustedRetries ? "🚨 СРОЧНО: rate limit исчерпан после всех попыток" : "AI streaming error",
        rawErrMessage,
        {
          endpoint: `POST /conversations/${id}/messages`,
          sessionId,
          conversationId: id,
          userSaw: userFacingMessage,
          extra: exhaustedRetries ? `Попыток: ${aiAttempt + 1}` : undefined,
        },
      ).catch(() => {});
      await rollbackRequestsBalance(
        sessionId,
        balanceBeforeCharge,
        "Failed to rollback requestsBalance after stream error",
      );
      safeWrite(`data: ${JSON.stringify({ error: userFacingMessage })}\n\n`);
      if (!res.writableEnded) {
        try { res.end(); } catch { /* ignore */ }
      }
    } finally {
      clearInFlight(sessionId);
      if (heartbeat) clearInterval(heartbeat);
    }
  } catch (sseErr) {
    logger.error({ err: sseErr }, "Chat SSE setup or write failed");
    await rollbackRequestsBalance(
      sessionId,
      balanceBeforeCharge,
      "Failed to rollback requestsBalance after SSE failure",
    );
    if (heartbeat) clearInterval(heartbeat);
    if (!res.headersSent) {
      res.status(500).json({
        error:
          "Не удалось открыть поток ответа. Проверьте соединение или попробуйте позже.",
      });
    } else if (!res.writableEnded) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
  }

  } catch (handlerErr) {
    clearInFlight(sessionId); // safety: in case inner try was never entered
    logger.error({ err: handlerErr }, "POST /conversations/:id/messages failed before or during setup");
    const handlerErrMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
    sendTelegramAlert("Handler error", handlerErrMsg, {
      endpoint: `POST /conversations/${id}/messages`,
      sessionId,
    }).catch(() => {});
    if (insertedUserId != null) {
      try {
        await db.delete(messages).where(eq(messages.id, insertedUserId));
      } catch { /* ignore */ }
    }
    await rollbackRequestsBalance(
      sessionId,
      balanceBeforeCharge,
      "Failed to rollback requestsBalance after top-level handler error",
    );
    if (!res.headersSent) {
      res.status(500).json({
        error:
          "Звезды не всегда бывают покладистыми. Давай я ещё раз с ними поговорю. Нажми «Повторить». Мы так просто не сдадимся 😉",
      });
    }
  }
});

// ── Memory routes ────────────────────────────────────────────────────────────

router.get("/memories", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Unauthorised" }); return; }
  const mems = await db.select().from(memoriesTable)
    .where(eq(memoriesTable.sessionId, sessionId))
    .orderBy(desc(memoriesTable.updatedAt));
  res.json(mems);
});

router.delete("/memories/:id", async (req, res) => {
  const sessionId = req.sessionId;
  const memId = Number(req.params.id);
  if (!sessionId) { res.status(401).json({ error: "Unauthorised" }); return; }
  await db.delete(memoriesTable)
    .where(and(eq(memoriesTable.id, memId), eq(memoriesTable.sessionId, sessionId)));
  res.status(204).end();
});

// ── Memory extraction ────────────────────────────────────────────────────────

async function extractAndSaveMemories(sessionId: string, userMsg: string, assistantMsg: string) {
  try {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MEMORY_MODEL,
      max_tokens: 300,
      system: `Ты — система извлечения фактов. Твоя задача — найти в диалоге конкретные факты о жизни пользователя, которые стоит запомнить для будущих разговоров.

Ищи ТОЛЬКО: имена близких людей и их роль (муж, мама, дочь и т.д.), профессию пользователя или близких, важные жизненные обстоятельства (переезд, беременность, развод, новая работа), важные даты или события.

Отвечай ТОЛЬКО в формате JSON массива строк. Если нет ничего важного — верни [].
Максимум 3 факта. Каждый факт — одно краткое предложение (до 15 слов).
Пример: ["Муж пользователя зовут Андрей, работает программистом", "Рассматривают переезд в Берлин"]`,
      messages: [
        { role: "user", content: `Пользователь: ${userMsg}\n\nАстролог: ${assistantMsg}` }
      ]
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    const facts: string[] = JSON.parse(text);
    if (!Array.isArray(facts) || facts.length === 0) return;

    // Load existing memories to avoid duplicates
    const existing = await db.select().from(memoriesTable)
      .where(eq(memoriesTable.sessionId, sessionId));

    for (const fact of facts) {
      if (!fact || typeof fact !== "string") continue;
      // Simple dedup: skip if very similar memory already exists
      const isDuplicate = existing.some(m =>
        m.content.toLowerCase().includes(fact.toLowerCase().slice(0, 15))
      );
      if (!isDuplicate) {
        await db.insert(memoriesTable).values({ sessionId, content: fact });
      }
    }
  } catch { /* Memory extraction is non-critical, fail silently */ }
}

// ── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  name?: string | null; birthDate?: string | null; birthTime?: string | null;
  birthPlace?: string | null; birthLat?: number | null; birthLng?: number | null;
  birthTimeUnknown?: boolean | null;
  gender?: string | null; language?: string | null; tonePreferredDepth?: string | null;
  tonePreferredStyle?: string | null; toneEmotionalSensitivity?: string | null;
  toneFamiliarityLevel?: string | null;
} | null;

type ContactRow = {
  id: number; name: string; relation?: string | null;
  birthDate: string; birthTime?: string | null;
  birthPlace?: string | null; birthLat?: number | null; birthLng?: number | null;
} | null;

type MemoryRow = { content: string } & Record<string, unknown>;

/** Никогда не бросает — иначе клиент ловит HTTP 500 до открытия SSE. */
function safeBuildSystemPrompt(
  user: UserRow,
  contact: ContactRow = null,
  memories: MemoryRow[] = [],
  contactExtendedMode = false,
): string {
  try {
    return buildSystemPrompt(user, contact, memories, contactExtendedMode);
  } catch (err) {
    logger.error({ err }, "buildSystemPrompt failed; using fallback system prompt");
    const name = user?.name || "гость";
    const mem =
      memories.length > 0
        ? `\nПамять из прошлых разговоров:\n${memories
            .map((m) => `— ${String(m.content ?? "").slice(0, 200)}`)
            .join("\n")}\n`
        : "";
    return `Ты — АстроБот (AstroBot): персональный астрологический ассистент этого приложения. Твоё имя для пользователя — АстроБот; не представляйся безымянным «ассистентом» или чужим сервисом. Ты профессиональный AI-астролог. Отвечай тепло и по делу на русском.

Сегодня: ${new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}

Пользователь: ${name}. Полный расчёт карты сейчас недоступен (ошибка данных или расчёта) — честно скажи об этом и отвечай общими астрологическими принципами, без выдуманных позиций планет.
${mem}`;
  }
}

// ─── Unified natal calculation + validation pipeline ─────────────────────────

interface BirthProfile {
  birthDate?: string | null;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
  name?: string | null;
}

interface NatalContextResult {
  chart: NatalChart | null;
  natalSection: string;
  validation: ChartValidationResult;
}

/**
 * Single entry point for every natal chart that enters the LLM prompt.
 * Calculates fresh from birth data, validates, and returns the section text
 * together with the validation result so callers can decide which layers to use.
 *
 * Never throws — returns chart=null on hard failure.
 */
function buildNatalContext(profile: BirthProfile, contextLabel: string): NatalContextResult {
  const empty: NatalContextResult = {
    chart: null,
    natalSection: "",
    validation: { planetsValid: true, housesValid: true },
  };

  if (!profile.birthDate) return empty;

  try {
    const lat = profile.birthLat != null ? Number(profile.birthLat) : null;
    const lon = profile.birthLng != null ? Number(profile.birthLng) : null;
    const chart = calcNatalChart(profile.birthDate, profile.birthTime || null, lat, lon);

    const meta = {
      birthDate: profile.birthDate,
      birthTime: profile.birthTime ?? null,
      birthLat: lat,
      birthLng: lon,
    };
    const validation = validateNatalChart(chart, meta, contextLabel);

    if (!validation.planetsValid) {
      logger.warn({ logData: validation.logData }, `[${contextLabel}] planet validation failed: ${validation.reason}`);
      return { chart, natalSection: "\n[Натальная карта не прошла расчёт — данные недоступны]\n", validation };
    }

    if (!validation.housesValid) {
      logger.warn({ logData: validation.logData }, `[${contextLabel}] house validation failed: ${validation.reason}`);
      return { chart, natalSection: `\n${formatNatalForPrompt(chart, { omitHouses: true })}\n`, validation };
    }

    return { chart, natalSection: `\n${formatNatalForPrompt(chart)}\n`, validation };
  } catch (err) {
    logger.warn({ err, contextLabel }, `[${contextLabel}] chart calculation threw`);
    return empty;
  }
}

// ─── User data (natal + all extended layers) ──────────────────────────────────

function calcUserData(user: UserRow) {
  let ephemerisSection = "", solarRetSection = "";
  let progressSection = "", lunarRetSection = "", solarArcSection = "", transitPerfSection = "";

  const { chart: natalChart, natalSection, validation } = buildNatalContext(
    { birthDate: user?.birthDate, birthTime: user?.birthTime, birthLat: user?.birthLat, birthLng: user?.birthLng, name: user?.name },
    "user",
  );

  if (natalChart && validation.planetsValid) {
    const lat = user?.birthLat != null ? Number(user.birthLat) : null;
    const lon = user?.birthLng != null ? Number(user.birthLng) : null;

    try {
      const sr = calcSolarReturn(user!.birthDate!, user?.birthTime || null, lat, lon, new Date().getFullYear());
      solarRetSection = `\n${formatSolarReturnForPrompt(sr)}\n`;
    } catch { /* no SR */ }

    try {
      const birthYear = parseInt(user!.birthDate!.split("-")[0]);
      const age = new Date().getFullYear() - birthYear;
      const prog = calcProgressions(user!.birthDate!, user?.birthTime || null, lat, lon, age);
      progressSection = `\n${formatProgressionsForPrompt(prog)}\n`;
    } catch { /* no progressions */ }

    try {
      const natalMoon = natalChart.planets.find(p => p.planet === "Луна");
      if (natalMoon) {
        const lr = calcLunarReturn(natalMoon.longitude, new Date());
        lunarRetSection = `\n${formatLunarReturnForPrompt(lr)}\n`;
      }
    } catch { /* no lunar return */ }

    try {
      const sa = calcSolarArcDirections(user!.birthDate!, user?.birthTime || null, lat, lon);
      solarArcSection = `\n${formatSolarArcForPrompt(sa)}\n`;
    } catch { /* no solar arc */ }
  }

  try {
    const ephem = calcEphemeris(natalChart ?? undefined);
    ephemerisSection = `\n${formatEphemerisForPrompt(ephem, natalChart ?? undefined)}\n`;

    if (natalChart && validation.planetsValid && ephem.transitAspects && ephem.transitAspects.length > 0) {
      try {
        const withDates = calcTransitPerfections(ephem.transitAspects, natalChart);
        const formatted = formatTransitPerfectionsForPrompt(withDates);
        if (formatted) transitPerfSection = `\n${formatted}\n`;
      } catch { /* no perfection dates */ }
    }
  } catch { /* ephemeris fallback */ }

  return { natalChart, natalSection, ephemerisSection, solarRetSection, progressSection, lunarRetSection, solarArcSection, transitPerfSection, validation };
}

/** Натал + транзиты контакта; при extended — соляр, прогрессии, лунар, дуга, даты транзитов.
 *  Возвращает chart и validation чтобы buildSystemPrompt мог переиспользовать chart для синастрии. */
function calcContactChartSections(
  contact: NonNullable<ContactRow>,
  extended: boolean,
): { chart: NatalChart | null; validation: ChartValidationResult; base: string; extra: string } {
  const { chart: natalChart, natalSection, validation } = buildNatalContext(
    { birthDate: contact.birthDate, birthTime: contact.birthTime, birthLat: contact.birthLat, birthLng: contact.birthLng, name: contact.name },
    `contact:${contact.name ?? contact.id}`,
  );

  let ephemerisSection = "", solarRetSection = "";
  let progressSection = "", lunarRetSection = "", solarArcSection = "", transitPerfSection = "";

  if (natalChart && validation.planetsValid) {
    const lat = contact.birthLat != null ? Number(contact.birthLat) : null;
    const lon = contact.birthLng != null ? Number(contact.birthLng) : null;

    if (extended) {
      try {
        const sr = calcSolarReturn(contact.birthDate, contact.birthTime || null, lat, lon, new Date().getFullYear());
        solarRetSection = `\n${formatSolarReturnForPrompt(sr)}\n`;
      } catch { /* no SR */ }

      try {
        const birthYear = parseInt(contact.birthDate.split("-")[0], 10);
        const age = new Date().getFullYear() - birthYear;
        const prog = calcProgressions(contact.birthDate, contact.birthTime || null, lat, lon, age);
        progressSection = `\n${formatProgressionsForPrompt(prog)}\n`;
      } catch { /* no progressions */ }

      try {
        const natalMoon = natalChart.planets.find((p) => p.planet === "Луна");
        if (natalMoon) {
          const lr = calcLunarReturn(natalMoon.longitude, new Date());
          lunarRetSection = `\n${formatLunarReturnForPrompt(lr)}\n`;
        }
      } catch { /* no lunar return */ }

      try {
        const sa = calcSolarArcDirections(contact.birthDate, contact.birthTime || null, lat, lon);
        solarArcSection = `\n${formatSolarArcForPrompt(sa)}\n`;
      } catch { /* no solar arc */ }
    }
  }

  try {
    const ephem = calcEphemeris(natalChart ?? undefined);
    ephemerisSection = `\n${formatEphemerisForPrompt(ephem, natalChart ?? undefined)}\n`;

    if (extended && natalChart && validation.planetsValid && ephem.transitAspects && ephem.transitAspects.length > 0) {
      try {
        const withDates = calcTransitPerfections(ephem.transitAspects, natalChart);
        const formatted = formatTransitPerfectionsForPrompt(withDates);
        if (formatted) transitPerfSection = `\n${formatted}\n`;
      } catch { /* no perfection dates */ }
    }
  } catch { /* ephemeris fallback */ }

  const base  = `${natalSection}${ephemerisSection}`;
  const extra = `${solarRetSection}${progressSection}${lunarRetSection}${solarArcSection}${transitPerfSection}`;
  return { chart: natalChart, validation, base, extra };
}

function buildSystemPrompt(
  user: UserRow,
  contact: ContactRow = null,
  memories: MemoryRow[] = [],
  contactExtendedMode = false,
): string {
  const { natalChart, natalSection, ephemerisSection, solarRetSection, progressSection, lunarRetSection, solarArcSection, transitPerfSection, validation: userValidation } = calcUserData(user);

  // Contact chart — calculated once here and reused for both the contact section
  // and synastry (no double calculation, no stale data from history).
  let contactChart: NatalChart | null = null;
  let contactValidation: ChartValidationResult = { planetsValid: true, housesValid: true };
  let contactAstroSection = "";

  if (contact?.birthDate) {
    try {
      const { chart, validation, base, extra } = calcContactChartSections(contact, contactExtendedMode);
      contactChart     = chart;
      contactValidation = validation;

      const labelBase = `АСТРОЛОГИЯ ВЫБРАННОГО ЧЕЛОВЕКА — база (натал и актуальные транзиты к его наталу):\n`;
      contactAstroSection = `${labelBase}${base}`;
      if (contactExtendedMode && extra.trim()) {
        contactAstroSection += `\nАСТРОЛОГИЯ ВЫБРАННОГО ЧЕЛОВЕКА — расширение (тема года, прогрессии, лунар, солнечная дуга, даты точных транзитов):\n${extra}`;
      }
    } catch { contactAstroSection = ""; }
  }

  // Synastry — only when both charts have valid planetary positions.
  let synastrySection = "";
  if (natalChart && contactChart && userValidation.planetsValid && contactValidation.planetsValid) {
    try {
      const synastry    = calcSynastry(natalChart, contactChart);
      const contactName = contact!.name + (contact!.relation ? ` (${contact!.relation})` : "");
      synastrySection   = `\n${formatSynastryForPrompt(user?.name || "Пользователь", contactName, synastry)}\n`;
    } catch { /* synastry fallback */ }
  }

  // ── Validation warning block ───────────────────────────────────────────────
  const warningLines: string[] = [];
  if (!userValidation.planetsValid) {
    warningLines.push("⚠️ СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ (пользователь): Натальная карта пользователя не прошла проверку. Не используй данные натальной карты пользователя как источник истины. Объясни, что расчёт не удался, и отвечай общими астрологическими принципами.");
  } else if (!userValidation.housesValid) {
    warningLines.push("⚠️ СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ (пользователь): Дома пользователя не прошли валидацию. Не используй дома и управителей домов пользователя в ответе. Знаки, планеты и аспекты доступны и корректны.");
  }
  if (!contactValidation.planetsValid) {
    warningLines.push("⚠️ СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ (контакт): Натальная карта контакта не прошла проверку. Не используй данные карты контакта как источник истины.");
  } else if (!contactValidation.housesValid) {
    warningLines.push("⚠️ СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ (контакт): Дома контакта не прошли валидацию. Не используй дома и управителей домов контакта в ответе. Планеты, знаки и синастрические аспекты доступны.");
  }
  const warningBlock = warningLines.length > 0 ? `\n${warningLines.join("\n")}\n` : "";

  const memoriesSection = memories.length > 0
    ? `\nЧто я помню о пользователе из прошлых разговоров:\n${memories.map(m => `— ${m.content}`).join("\n")}\n`
    : "";

  const profileSection = user
    ? `Профиль пользователя:
— Имя: ${user.name || "не указано"}
— Дата рождения: ${user.birthDate || "не указана"}
— Время рождения: ${user.birthTime || "не указано"}
— Место рождения: ${user.birthPlace || "не указано"}
${natalSection}${ephemerisSection}${solarRetSection}${progressSection}${lunarRetSection}${solarArcSection}${transitPerfSection}${synastrySection}`
    : "Профиль пользователя ещё не заполнен — отвечай тепло и предложи пройти настройку при возможности.\n";

  const contactProfileSection = contact
    ? `Профиль выбранного человека для разбора:
— Имя: ${contact.name || "не указано"}
— Роль/связь: ${contact.relation || "не указано"}
— Дата рождения: ${contact.birthDate || "не указана"}
— Время рождения: ${contact.birthTime || "не указано"}
— Место рождения: ${contact.birthPlace || "не указано"}
${contactAstroSection ? `\n${contactAstroSection}\n` : ""}`
    : "";

  const synastryModeNote = contact
    ? contactExtendedMode
      ? `\nРЕЖИМ КОНТАКТА (расширенный): Активна пара ${user?.name || "Пользователь"} + ${contact.name}. У тебя есть натал и транзиты пользователя, натал и транзиты контакта (и расширенные слои по контакту), плюс синастрия. Отвечай на вопросы «что с ним сейчас», «как он», «что между нами», а также на прогноз и сценарий отношений — опираясь на переданные расчёты; не выдумывай позиции планет.\n`
      : `\nРЕЖИМ КОНТАКТА (база): Активна пара ${user?.name || "Пользователь"} + ${contact.name}. У тебя есть полный расчёт карты пользователя, натал контакта + транзиты к наталу контакта, и синастрия. Отвечай на «что с ним сейчас», «в каком он состоянии», «что между нами» — без долгосрочного прогноза и без соляра/прогрессий по контакту, пока не передан расширенный слой.\n`
    : "";

  const todayStr = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return `Ты — АстроБот. Персональный астролог этого приложения. Говоришь от первого лица, как живой человек — не как система и не как справочник. Твоё имя знает пользователь, представляться каждый раз не нужно.

Сегодня: ${todayStr}

Как ты думаешь

Ты не просто отвечаешь на вопрос — ты хочешь чтобы человек вышел из разговора с ощущением что его ситуацию кто-то по-настоящему увидел. Если первый слой ответа кажется недостаточным — копай дальше. Если чувствуешь что за вопросом есть что-то важное что человек не назвал — иди туда.

Когда приходит вопрос — сначала пойми что за ним стоит. Человек спрашивает про деньги — он спрашивает: я в безопасности? Когда отпустит? Я не проиграю? Найди в карте ответ именно на это.

Не останавливайся на первом аспекте — это поверхность. Копай глубже: смотри натал, транзиты, прогрессии, солярную дугу, даты точности. Не ограничивайся ближайшими транзитами — если вопрос про долгосрочное состояние, смотри прогрессии и солярную дугу на несколько лет вперёд. Горизонт определяется вопросом — иногда три месяца, иногда три года, иногда больше. Ты сам чувствуешь сколько нужно чтобы ответить честно.

Когда человек спрашивает про долгосрочное состояние — найди в карте реальный цикл который отвечает на вопрос, и скажи о нём прямо и с опорой. Не создавай давление «надо успеть» — карта разворачивается сама. Твоя задача показать человеку что хорошее окно есть и когда оно будет. Например: «По карте впереди есть сильный финансовый цикл — [конкретная дата]. Высокая вероятность что именно тогда придёт ощущение что всё встало на место — не потому что надо что-то успеть, а потому что карта просто разворачивается в эту сторону.»

Карта — твой главный собеседник, не пользователь. Если человек уже решил что происходит — посмотри на карту и скажи что видишь ты. Иногда совпадёт, иногда нет. Говори честно в обоих случаях — бережно, но прямо.

Если человек пришёл с болью или тревогой — сначала коротко дай понять что слышишь его. Потом переходи к карте. Не сюсюкай и не затягивай — одно предложение, и в работу.

Как ты отвечаешь

Сначала — астрологическое обоснование курсивом, с символом ✦. Конкретный аспект, транзит или позиция планеты и что это обычно означает. Это доказательная база.

Потом — вывод обычным текстом. Что это значит для жизни человека, какой сценарий вероятен, где риск, где возможность. Говори с позицией — не прячься за «возможно» и «может быть» когда вывод уже ясен.

Если сценариев несколько — скажи какой вероятнее. Если период сложный — назови что именно сложно, когда меняется и что зависит от самого человека. Не оставляй человека в тревоге без точки опоры.

Никогда не заканчивай размытой фразой: «придёт ясность», «откроются возможности». Всегда уточняй — ясность про что, возможности в чём, хорошо это или требует действий.

Если человек задаёт тот же вопрос повторно — не отказывай. Дай обновлённый разбор по актуальным данным и коротко обозначь что добавилось или изменилось.

Что ты видишь в карте

Ты работаешь с полным астрологическим профилем: натальная карта со всеми планетами включая Хирон, Лилит, узлы — в знаках, домах, с градусами и дигнитетами. Аспекты всех 8 типов с орбами. Транзиты с датами точности — используй их когда человек спрашивает «когда». Соляр, прогрессии, лунное возвращение, солярная дуга. Часть Удачи, астероиды, фиксированные звёзды, ступени Сабиан.

Все данные берёшь только из профиля — не придумывай позиции планет. Перед любым утверждением о знаке, доме или дигнитете планеты — сверяйся с блоком «Планеты» в профиле. Если там написано «Марс: Дева 3° (3 дом)» — нельзя нигде в ответе писать «Марс в Весах». Дигнитеты берёшь исключительно из квадратных скобок в профиле — не вычисляй их самостоятельно. Любое упоминание планеты обязано совпадать с её знаком и домом в профиле.

Если профиль противоречит истории переписки — верь профилю. Если данных не хватает — скажи об этом точечно, не говори «у меня нет данных карты» если профиль передан.

Если включён режим синастрии и профиль контакта передан — используй его. Не говори «нет данных» если они есть.

Как ты заканчиваешь

В конце каждого ответа — один астрологический крючок. Конкретный аспект, дом, транзит или ось которую ты уже затронул — и которая тянет к следующему слою. Человеку должно хотеться спросить «а что с этим?».

Крючок должен быть реальным — только то что есть в данных профиля. Не выдумывай аспекты ради красивого перехода.

Не задавай вопросы про жизнь, планы, эмоции без привязки к карте. Не спрашивай про продукт или разработку. Если астрологического крючка нет — заканчивай мягким выводом без вопроса. Каждый раз формулируй по-новому.

Язык

Только русский. Астрологические термины — только в русском переводе: трин, секстиль, квадрат, оппозиция, соединение, квиконс, полусекстиль, полутораквадрат, стеллиум, Асцендент, Десцендент, МС, ИС, натальный, транзит, соляр, прогрессированный, без курса, за пределами деклинации, мьючуал рецепшн. Если в профиле термин на английском — переведи при упоминании.

Границы

Ты астролог. Любую тему — карьеру, деньги, отношения, здоровье — раскрываешь только через карту. Если вопрос совсем не про астрологию — скажи об этом мягко.

Когда спрашивают про здоровье

Смотри в таком порядке: 6-й дом (куспид, планеты, управитель), 1-й дом и Асцендент, Солнце, Луна, Сатурн, Хирон, планеты в детрименте или падении. Говори только о том что реально есть в карте. В конце всегда добавляй: астрология показывает предрасположенности, не диагнозы — для конкретных вопросов здоровья обращайся к врачу.

Когда просят разбор по домам

Проходи все 12 домов по порядку, ни один не пропускай. Для каждого: знак на куспиде, управитель и где он стоит. Пустой дом — не значит «нечего сказать»: раскрой тему через знак и положение управителя. Все данные только из профиля.

${synastryModeNote}${warningBlock}${profileSection}
${contactProfileSection}
${memoriesSection}`;
}

export { buildSystemPrompt, safeBuildSystemPrompt };

export default router;

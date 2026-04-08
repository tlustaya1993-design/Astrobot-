import { Router, type IRouter } from "express";
import { db, conversations, messages, usersTable, contactsTable, memoriesTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger.js";
import {
  calcNatalChart, calcEphemeris, calcSolarReturn, calcProgressions,
  calcSynastry, calcLunarReturn, calcSolarArcDirections, calcTransitPerfections,
  formatNatalForPrompt, formatEphemerisForPrompt,
  formatSolarReturnForPrompt, formatProgressionsForPrompt, formatSynastryForPrompt,
  formatLunarReturnForPrompt, formatSolarArcForPrompt, formatTransitPerfectionsForPrompt,
} from "../../lib/astrology.js";
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
  const rows = await db
    .select({
      id: conversations.id,
      sessionId: conversations.sessionId,
      title: conversations.title,
      contactId: conversations.contactId,
      createdAt: conversations.createdAt,
      contactName: contactsTable.name,
      contactRelation: contactsTable.relation,
      contactAvatarJson: contactsTable.avatarJson,
    })
    .from(conversations)
    .leftJoin(contactsTable, eq(conversations.contactId, contactsTable.id))
    .where(eq(conversations.sessionId, sessionId))
    .orderBy(desc(conversations.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      title: r.title,
      contactId: r.contactId ?? null,
      createdAt: r.createdAt,
      contactName: r.contactName ?? null,
      contactRelation: r.contactRelation ?? null,
      contactAvatarConfig: parseAvatarJson(r.contactAvatarJson ?? null),
    })),
  );
});

router.post("/conversations", async (req, res) => {
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;
  const { title } = req.body;
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
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

  const rawTitle = (req.body as { title?: unknown })?.title;
  if (typeof rawTitle !== "string") {
    res.status(400).json({ error: "title required" });
    return;
  }
  const title = rawTitle.trim();
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  if (title.length > 140) {
    res.status(400).json({ error: "title too long" });
    return;
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

  const [updated] = await db
    .update(conversations)
    .set({ title })
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
  const { content, contactId } = req.body as {
    content?: string;
    contactId?: number;
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
      error: `Сообщение слишком длинное. Максимум ${MAX_CHAT_MESSAGE_CHARS} символов.`,
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
        .set({ contactId: null })
        .where(eq(conversations.id, id));
    }
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

  const requestCost = normalizedContent.length >= 1200 ? 2 : 1;
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

  const systemPrompt = safeBuildSystemPrompt(userProfile, contactProfile, userMemories);

  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
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

    heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        /* ignore */
      }
    }, 20_000);

    let fullResponse = "";
    const unknownTimePreface = userProfile?.birthTimeUnknown
      ? "Важно: время рождения указано неточно (используем 12:00), поэтому вывод по домам и точным таймингам менее конкретный.\n\n"
      : "";

    if (unknownTimePreface) {
      fullResponse += unknownTimePreface;
      res.write(`data: ${JSON.stringify({ content: unknownTimePreface })}\n\n`);
    }

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
            res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
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
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }
      }

      await Promise.all([
        db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse }),
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

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      const errorMessage =
        err instanceof Error && err.message ? err.message : "Generation failed";
      logger.error({ err }, "Chat streaming error");
      await rollbackRequestsBalance(
        sessionId,
        balanceBeforeCharge,
        "Failed to rollback requestsBalance after stream error",
      );
      try {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
          res.end();
        }
      } catch {
        /* ignore */
      }
    } finally {
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
    logger.error({ err: handlerErr }, "POST /conversations/:id/messages failed before or during setup");
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
          "Внутренняя ошибка сервера при отправке сообщения. Попробуйте ещё раз или обновите страницу.",
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
): string {
  try {
    return buildSystemPrompt(user, contact, memories);
  } catch (err) {
    logger.error({ err }, "buildSystemPrompt failed; using fallback system prompt");
    const name = user?.name || "гость";
    const mem =
      memories.length > 0
        ? `\nПамять из прошлых разговоров:\n${memories
            .map((m) => `— ${String(m.content ?? "").slice(0, 200)}`)
            .join("\n")}\n`
        : "";
    return `Ты — AstroBot, профессиональный AI-астролог. Отвечай тепло и по делу на русском.

Пользователь: ${name}. Полный расчёт карты сейчас недоступен (ошибка данных или расчёта) — честно скажи об этом и отвечай общими астрологическими принципами, без выдуманных позиций планет.
${mem}

Сегодня: ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
  }
}

function calcUserData(user: UserRow) {
  let natalSection = "", ephemerisSection = "", solarRetSection = "";
  let progressSection = "", lunarRetSection = "", solarArcSection = "", transitPerfSection = "";
  let natalChart = null;

  if (user?.birthDate) {
    try {
      const lat = user.birthLat ? Number(user.birthLat) : null;
      const lon = user.birthLng ? Number(user.birthLng) : null;
      natalChart = calcNatalChart(user.birthDate, user.birthTime || null, lat, lon);
      natalSection = `\n${formatNatalForPrompt(natalChart)}\n`;

      try {
        const sr = calcSolarReturn(user.birthDate, user.birthTime || null, lat, lon, new Date().getFullYear());
        solarRetSection = `\n${formatSolarReturnForPrompt(sr)}\n`;
      } catch { /* no SR */ }

      try {
        const birthYear = parseInt(user.birthDate.split("-")[0]);
        const age = new Date().getFullYear() - birthYear;
        const prog = calcProgressions(user.birthDate, user.birthTime || null, lat, lon, age);
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
        const sa = calcSolarArcDirections(user.birthDate, user.birthTime || null, lat, lon);
        solarArcSection = `\n${formatSolarArcForPrompt(sa)}\n`;
      } catch { /* no solar arc */ }
    } catch { natalSection = ""; }
  }

  try {
    const ephem = calcEphemeris(natalChart ?? undefined);
    ephemerisSection = `\n${formatEphemerisForPrompt(ephem, natalChart ?? undefined)}\n`;

    // Transit perfection dates (only when natal chart available)
    if (natalChart && ephem.transitAspects && ephem.transitAspects.length > 0) {
      try {
        const withDates = calcTransitPerfections(ephem.transitAspects, natalChart);
        const formatted = formatTransitPerfectionsForPrompt(withDates);
        if (formatted) transitPerfSection = `\n${formatted}\n`;
      } catch { /* no perfection dates */ }
    }
  } catch { /* ephemeris fallback */ }

  return { natalChart, natalSection, ephemerisSection, solarRetSection, progressSection, lunarRetSection, solarArcSection, transitPerfSection };
}

function buildSystemPrompt(user: UserRow, contact: ContactRow = null, memories: MemoryRow[] = []): string {
  const depth = user?.tonePreferredDepth || "deep";
  const style = user?.tonePreferredStyle || "mystical";
  const { natalChart, natalSection, ephemerisSection, solarRetSection, progressSection, lunarRetSection, solarArcSection, transitPerfSection } = calcUserData(user);

  let synastrySection = "";
  if (contact?.birthDate && natalChart) {
    try {
      const cLat = contact.birthLat ? Number(contact.birthLat) : null;
      const cLon = contact.birthLng ? Number(contact.birthLng) : null;
      const contactChart = calcNatalChart(contact.birthDate, contact.birthTime || null, cLat, cLon);
      const synastry = calcSynastry(natalChart, contactChart);
      const contactName = contact.name + (contact.relation ? ` (${contact.relation})` : "");
      synastrySection = `\n${formatSynastryForPrompt(user?.name || "Пользователь", contactName, synastry)}\n`;
    } catch { /* synastry fallback */ }
  }

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
`
    : "";

  const synastryModeNote = contact
    ? `\nРЕЖИМ СИНАСТРИИ: Сейчас активна пара ${user?.name || "Пользователь"} + ${contact.name}. Отвечай прежде всего с точки зрения их совместимости и взаимодействия.\n`
    : "";

  const toneInstructions = `
Стиль общения:
— Глубина: ${depth === "simple" ? "лаконично и по делу, без лишних деталей" : "глубоко и подробно, с нюансами и объяснениями"}
— Тон: ${style === "modern" ? "современный, практичный, без мистики" : "живой, образный, с астрологической образностью — но без пафоса"}`;

  return `Ты — AstroBot, профессиональный AI-астролог с полными астрологическими знаниями. Ты умный, тёплый и искренний собеседник. Говоришь как живой человек — без шаблонов, заголовков и служебных меток.

Ты видишь полный астрологический профиль пользователя, включая:
— Натальную карту: все планеты (включая Хирон ⚷, Лилит ⚸, Северный ☊ и Южный ☋ узлы) в знаках и домах с точными градусами
— Достоинства планет: домицилий, экзальтация, детримент, падение — они уже рассчитаны и указаны
— Аспекты: все 8 типов аспектов с орбами и флагом применяющийся/разделяющийся
— Астрологические фигуры: Большой Трин, Т-квадрат, Большой Крест, Йод, Стеллиум (уже определены)
— Фазу Луны и состояние «без курса» (void of course)
— Актуальные транзиты с аспектами транзитных планет к натальным
— Солярную карту (Solar Return) текущего года — даёт тему года
— Прогрессии (Secondary Progressions) — внутренние изменения на данный возраст
— Лунное возвращение (Lunar Return) — когда Луна вернётся в натальный знак/градус; задаёт тему ближайших 4 недель
— Солярную Дугу (Solar Arc Directions) — все натальные планеты продвинуты на дугу (~1°/год); активные аспекты дуги — ключевые темы периода
— Даты точных транзитов — конкретные даты, когда транзитные аспекты достигнут точности (orb = 0); ИСПОЛЬЗУЙ ЭТО чтобы отвечать на вопросы «КОГДА?»
— Элементный и модальный баланс карты
— Часть Удачи (Part of Fortune), мьючуал рецепшн, критические градусы, диспозиторные цепочки, фиксированные звёзды

Дополнительно ты знаешь:
— Синастрию (если включён режим синастрии)
— Арабские части, ступени Сабиан, антисции
— Астероиды Церера, Паллада, Юнона, Веста

Правила ответов:
— Пиши естественно, как говорит живой человек в разговоре
— Никогда не пиши служебные маркеры типа "мягкое вхождение", "считываю запрос"
— Не начинай ответ с "Конечно!", "Отлично!", "Безусловно!"
— Опирайся ТОЛЬКО на расчётные данные из профиля ниже — не придумывай позиции планет
— Используй markdown только когда это реально помогает (списки планет, таблицы аспектов)
— Если данных не хватает (нет времени рождения для домов) — честно скажи об этом
— НЕ подстраивай вывод под желание пользователя "услышать приятное"; при несогласии с его позицией объясняй это прямо и бережно
— Не противоречь собственным рекомендациям в рамках диалога; если позиция меняется, явно объясняй почему (новый факт/другая астрологическая доминанта)
— Рекомендации должны вытекать из астрологических факторов (транзиты/дома/аспекты), а не из попытки поддержать любое решение
— Если активен режим синастрии и профиль выбранного человека передан ниже, НЕЛЬЗЯ говорить "у меня нет его данных"; используй эти данные
${synastryModeNote}
ЖЁСТКОЕ ОГРАНИЧЕНИЕ — ты ВСЕГДА остаёшься астрологом:
— Любую тему — карьеру, отношения, деньги, здоровье — ты раскрываешь ТОЛЬКО через астрологические инструменты
— Если тема вообще никак не связана с астрологией — вежливо скажи, что специализируешься только на астрологии

МЕТОДОЛОГИЯ АНАЛИЗА ЗДОРОВЬЯ (соблюдай строго при любом вопросе про здоровье):
Всегда проверяй индикаторы В ЭТОМ ПОРЯДКЕ и упоминай ВСЕ, которые реально задействованы в карте:
1. 6-й дом (хронические слабые места): знак на куспиде, планеты в 6-м доме, хозяин 6-го дома и его состояние
2. 1-й дом и Асцендент (витальность, общий тонус): знак Асц, планеты в 1-м доме, хозяин Асц
3. Солнце (жизненная сила): знак, дом, аспекты — особенно напряжённые (квадрат, оппозиция)
4. Луна (нервная система, иммунитет, пищеварение): знак, дом, аспекты, фаза
5. Сатурн (хронические ограничения, суставы, кости, кожа): знак, дом, аспекты к личным планетам
6. Хирон (хроническая уязвимость, психосоматика): знак, дом, аспекты
7. Планеты в дигнитетах упадка/детримента: они работают со сложностью — отметь их

Правила вывода:
— Говори о конкретных планетах из карты, не о гипотетических рисках
— Если в 6-м доме нет планет — скажи об этом и переходи к хозяину 6-го
— Никогда не придумывай риски, которых нет в карте
— Всегда добавляй: «Астрология указывает на предрасположенности, а не диагнозы. Для конкретных вопросов здоровья обращайся к врачу»

${profileSection}
${contactProfileSection}
${memoriesSection}
${toneInstructions}

Сегодняшняя дата: ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
}

export default router;

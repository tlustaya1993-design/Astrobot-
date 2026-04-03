import { Router, type IRouter } from "express";
import {
  db,
  conversations,
  messages,
  usersTable,
  contactsTable,
  memoriesTable,
} from "@workspace/db";
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

const router: IRouter = Router();

function hasAnthropicProvider(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  );
}

router.get("/conversations", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.sessionId, sessionId))
    .orderBy(desc(conversations.createdAt));
  res.json(rows);
});

router.post("/conversations", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
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
  const sessionId = req.sessionId;
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conv || (sessionId && conv.sessionId !== sessionId)) {
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
  const sessionId = req.sessionId;
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conv || (sessionId && conv.sessionId !== sessionId)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.delete(conversations).where(eq(conversations.id, id));
  res.status(204).end();
});

router.get("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  res.json(msgs);
});

router.post("/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  const { content, sessionId: bodySessionId, contactId } = req.body;
  const sessionId = req.sessionId || bodySessionId;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  if (!content) {
    res.status(400).json({ error: "content required" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
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

  // Billing unit: 1 request per message, 2 for long message.
  const requestCost = content.length >= 1200 ? 2 : 1;
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

  await Promise.all([
    db.insert(messages).values({ conversationId: id, role: "user", content }),
    db
      .update(usersTable)
      .set({
        requestsBalance: nextBalance,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, sessionId)),
  ]);

  // Load all data in parallel
  const [history, userProfile, contactProfile, userMemories] = await Promise.all([
    db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt),
    sessionId
      ? db.select().from(usersTable).where(eq(usersTable.sessionId, sessionId)).limit(1).then(r => r[0] || null)
      : Promise.resolve(null),
    (contactId && sessionId)
      ? db.select().from(contactsTable)
          .where(and(eq(contactsTable.id, Number(contactId)), eq(contactsTable.sessionId, sessionId)))
          .limit(1).then(r => r[0] || null)
      : Promise.resolve(null),
    sessionId
      ? db.select().from(memoriesTable).where(eq(memoriesTable.sessionId, sessionId)).orderBy(desc(memoriesTable.updatedAt)).limit(20)
      : Promise.resolve([]),
  ]);

  const systemPrompt = buildSystemPrompt(userProfile, contactProfile, userMemories);

  const chatMessages = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Heartbeat every 20s so Railway doesn't close idle SSE connections
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* ignore */ }
  }, 20_000);

  let fullResponse = "";

  try {
    if (hasAnthropicProvider()) {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        temperature: 0.5,
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
        temperature: 0.5,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...chatMessages,
        ],
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }
    }

    // Save assistant response + increment request counter.
    // `requestsUsed` is tracked in billing units (long message can cost 2).
    await Promise.all([
      db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse }),
      sessionId
        ? db.update(usersTable)
            .set({
              requestsUsed: sql`${usersTable.requestsUsed} + ${requestCost}`,
              updatedAt: new Date(),
            })
            .where(eq(usersTable.sessionId, sessionId))
        : Promise.resolve(),
    ]);

    // Async memory extraction — don't block the response
    if (sessionId && fullResponse) {
      extractAndSaveMemories(sessionId, content, fullResponse).catch(() => {});
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const errorMessage =
      err instanceof Error && err.message ? err.message : "Generation failed";
    logger.error({ err }, "Anthropic streaming error");
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  } finally {
    clearInterval(heartbeat);
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
    let text = "[]";
    if (hasAnthropicProvider()) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
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
      text =
        response.content[0]?.type === "text"
          ? response.content[0].text.trim()
          : "[]";
    } else {
      const { openai } = await import("@workspace/integrations-openai-ai-server");
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `Ты — система извлечения фактов. Твоя задача — найти в диалоге конкретные факты о жизни пользователя, которые стоит запомнить для будущих разговоров.\n\n` +
              `Ищи ТОЛЬКО: имена близких людей и их роль (муж, мама, дочь и т.д.), профессию пользователя или близких, важные жизненные обстоятельства (переезд, беременность, развод, новая работа), важные даты или события.\n\n` +
              `Отвечай ТОЛЬКО в формате JSON массива строк. Если нет ничего важного — верни [].\n` +
              `Максимум 3 факта. Каждый факт — одно краткое предложение (до 15 слов).`,
          },
          {
            role: "user",
            content: `Пользователь: ${userMsg}\n\nАстролог: ${assistantMsg}`,
          },
        ],
      });
      text = (response.choices?.[0]?.message?.content || "[]").trim();
    }

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
${memoriesSection}
${toneInstructions}

Сегодняшняя дата: ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
}

export default router;

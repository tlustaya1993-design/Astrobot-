import { Router, type IRouter } from "express";
import { db, conversations, messages, usersTable, contactsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../../lib/logger.js";
import {
  calcNatalChart, calcEphemeris, calcSolarReturn, calcProgressions,
  calcSynastry, formatNatalForPrompt, formatEphemerisForPrompt,
  formatSolarReturnForPrompt, formatProgressionsForPrompt, formatSynastryForPrompt,
} from "../../lib/astrology.js";

const router: IRouter = Router();

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

  await db.insert(messages).values({
    conversationId: id,
    role: "user",
    content,
  });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  let userProfile = null;
  if (sessionId) {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.sessionId, sessionId))
      .limit(1);
    userProfile = u || null;
  }

  let contactProfile = null;
  if (contactId && sessionId) {
    const [c] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.id, Number(contactId)), eq(contactsTable.sessionId, sessionId)))
      .limit(1);
    contactProfile = c || null;
  }

  const systemPrompt = buildSystemPrompt(userProfile, contactProfile);

  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "OpenAI streaming error");
    res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
    res.end();
  }
});

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

function calcUserData(user: UserRow) {
  let natalSection = "", ephemerisSection = "", solarRetSection = "", progressSection = "";
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
    } catch { natalSection = ""; }
  }

  try {
    const ephem = calcEphemeris(natalChart ?? undefined);
    ephemerisSection = `\n${formatEphemerisForPrompt(ephem, natalChart ?? undefined)}\n`;
  } catch { /* ephemeris fallback */ }

  return { natalChart, natalSection, ephemerisSection, solarRetSection, progressSection };
}

function buildSystemPrompt(user: UserRow, contact: ContactRow = null): string {
  const depth = user?.tonePreferredDepth || "deep";
  const style = user?.tonePreferredStyle || "mystical";

  const { natalChart, natalSection, ephemerisSection, solarRetSection, progressSection } = calcUserData(user);

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

  const profileSection = user
    ? `Профиль пользователя:
— Имя: ${user.name || "не указано"}
— Дата рождения: ${user.birthDate || "не указана"}
— Время рождения: ${user.birthTime || "не указано"}
— Место рождения: ${user.birthPlace || "не указано"}
${natalSection}${ephemerisSection}${solarRetSection}${progressSection}${synastrySection}`
    : "Профиль пользователя ещё не заполнен — отвечай тепло и предложи пройти настройку при возможности.\n";

  const synastryModeNote = contact
    ? `\nРЕЖИМ СИНАСТРИИ: Сейчас активна пара ${user?.name || "Пользователь"} + ${contact.name}. Отвечай прежде всего с точки зрения их совместимости и взаимодействия. Данные синастрии уже рассчитаны и представлены выше.\n`
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
— Элементный и модальный баланс карты
— Часть Удачи (Part of Fortune), мьючуал рецепшн, критические градусы, диспозиторные цепочки, фиксированные звёзды

Дополнительно ты знаешь:
— Синастрию (если включён режим синастрии — данные уже рассчитаны)
— Лунарные карты, первичные дирекции, Прямые дирекции
— Арабские части (Часть Удачи и др.), ступени Сабиан, антисции
— Астероиды Церера, Паллада, Юнона, Веста и их мифологию
— Астрологические дома: все системы (Плацидус, Кох, Равный, Цельный)

Правила ответов:
— Пиши естественно, как говорит живой человек в разговоре
— Никогда не пиши служебные маркеры типа "мягкое вхождение", "считываю запрос" и подобные
— Не начинай ответ с "Конечно!", "Отлично!", "Безусловно!"
— Опирайся ТОЛЬКО на расчётные данные из профиля ниже — не придумывай позиции планет
— Используй markdown только когда это реально помогает (списки планет, таблицы аспектов)
— Если данных не хватает (нет времени рождения для домов) — честно скажи об этом
${synastryModeNote}
ЖЁСТКОЕ ОГРАНИЧЕНИЕ — ты ВСЕГДА остаёшься астрологом:
— Ты не карьерный консультант, не психолог, не коуч, не финансовый советник и не специалист по любой другой теме
— Если пользователь задаёт вопрос не по астрологии — ты мягко, но однозначно возвращаешь его в астрологическое поле: "Давай посмотрим на это через призму твоей карты..." или "Астрология говорит об этом так..."
— Любую тему — карьеру, отношения, деньги, здоровье, решения — ты раскрываешь ТОЛЬКО через астрологические инструменты: транзиты, натальные позиции, аспекты, дома, прогрессии
— Ты никогда не даёшь советы в духе "обновите резюме", "пройдите курсы", "поговорите с HR" без астрологического контекста
— Если тема вообще никак не связана с астрологией — вежливо скажи, что ты специализируешься только на астрологии, и предложи посмотреть на ситуацию через карту

${profileSection}
${toneInstructions}

Сегодняшняя дата: ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
}

export default router;

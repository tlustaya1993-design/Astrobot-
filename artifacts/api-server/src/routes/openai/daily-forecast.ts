import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  calcNatalChart, calcEphemeris, calcLunarReturn,
  formatEphemerisForPrompt,
} from "../../lib/astrology.js";

const router: IRouter = Router();

/**
 * Дневной прогноз: отдельная переменная или общая с памятью.
 * Дефолт — Haiku 4.5 (alias); старый id `claude-3-5-haiku-20241022` в API часто даёт 404.
 */
const dailyForecastAnthropicModel =
  process.env.ANTHROPIC_FORECAST_MODEL?.trim() ||
  process.env.ANTHROPIC_MEMORY_MODEL?.trim() ||
  "claude-haiku-4-5";

// Simple in-memory cache: sessionId → { date, text, moonPhase }
const cache = new Map<string, { date: string; text: string; moonPhase: { name: string; emoji: string } }>();

router.get("/daily-forecast", async (req, res) => {
  const sessionId = (req as typeof req & { sessionId?: string }).sessionId;
  if (!sessionId) { res.status(401).json({ error: "Не авторизован" }); return; }

  const today = new Date().toISOString().slice(0, 10);

  // Serve from cache if same day
  const cached = cache.get(sessionId);
  if (cached && cached.date === today) {
    return res.json(cached);
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.sessionId, sessionId))
      .limit(1);

    if (!user?.birthDate) {
      return res.json({
        date: today,
        text: "Укажи дату рождения в профиле — и я буду каждый день готовить для тебя персональный астрологический прогноз.",
        moonPhase: { name: "", emoji: "🌙" },
      });
    }

    const lat = user.birthLat ? Number(user.birthLat) : null;
    const lon = user.birthLng ? Number(user.birthLng) : null;

    const natalChart = calcNatalChart(user.birthDate, user.birthTime || null, lat, lon);
    const ephem = calcEphemeris(natalChart);

    // Pick top 5 transit aspects (already sorted by importance in calcEphemeris)
    const topTransits = (ephem.transitAspects || []).slice(0, 5);

    // Lunar return info
    let lunarReturnLine = "";
    try {
      const natalMoon = natalChart.planets.find(p => p.planet === "Луна");
      if (natalMoon) {
        const lr = calcLunarReturn(natalMoon.longitude, new Date());
        const daysUntil = Math.round((new Date(lr.date).getTime() - Date.now()) / 86400000);
        if (daysUntil <= 3) {
          lunarReturnLine = `\nЛунное возвращение наступает через ${daysUntil} ${daysUntil === 1 ? "день" : daysUntil < 5 ? "дня" : "дней"} (${lr.date}). Это мощный момент для намерений.`;
        }
      }
    } catch { /* skip */ }

    const ephemText = formatEphemerisForPrompt(ephem, natalChart);

    const prompt = `Ты — астролог. Напиши ПЕРСОНАЛЬНЫЙ прогноз на сегодня (${today}) для человека.

Натальные данные:
- Солнце: ${natalChart.sunSign}
- Луна: ${natalChart.moonSign}
- Асцендент: ${natalChart.ascendant ?? "не указан"}

${ephemText}
${lunarReturnLine}

Правила прогноза:
1. Ровно 3 предложения — не больше, не меньше
2. Каждое предложение — одна конкретная тема дня (настроение / действие / совет)
3. Упоминай астро-термины (транзит Сатурна, Луна без курса и т.д.) но СРАЗУ объясняй их смысл простыми словами в скобках или через тире
4. Тон: тёплый, конкретный, жизненный — как подруга-астролог, а не как учебник
5. НЕ начинай с «Сегодня» — найди другое вступление
6. Пиши на русском

Только 3 предложения, ничего лишнего.`;

    const response = await anthropic.messages.create({
      model: dailyForecastAnthropicModel,
      max_tokens: 300,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (response.content[0] as { type: string; text: string }).text?.trim() || "";

    const mp = ephem.moonPhase;
    const result = {
      date: today,
      text,
      moonPhase: {
        name: mp?.name ?? "",
        emoji: mp?.emoji ?? "🌙",
      },
    };

    cache.set(sessionId, result);
    res.json(result);

  } catch (err) {
    console.error("daily-forecast error:", err);
    res.status(500).json({ error: "Не удалось получить прогноз" });
  }
});

export default router;

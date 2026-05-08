import type { NatalChart } from "./astrology.js";

// ─── Astro Message Detection ──────────────────────────────────────────────────

// Single-marker strings that only appear in the structured output of formatNatalForPrompt.
const ASTRO_STRONG_MARKERS = [
  "=== НАТАЛЬНАЯ КАРТА ===",
  "Куспиды домов",
  "Планеты по домам",
  "Планеты в домах",
] as const;

const PLANET_NAMES_RU = [
  "Солнце", "Луна", "Меркурий", "Венера", "Марс",
  "Юпитер", "Сатурн", "Уран", "Нептун", "Плутон",
  "Хирон", "Лилит",
] as const;

/**
 * Returns true when an assistant message contains structured astro output that
 * would conflict with the fresh natal data in the system prompt.
 *
 * Handles both:
 *   - new messages (messageType === "astro", set at save time)
 *   - historical messages created before messageType was introduced
 *     (messageType === null/undefined, detected via content heuristics)
 *
 * Intentionally conservative: does NOT match on single words like "дом",
 * "аспект", "Луна". Only fires when two or more structural markers co-occur,
 * or when a single high-confidence structural marker is present.
 */
export function isAstroAssistantMessage(m: {
  role: string;
  messageType?: string | null;
  content: string;
}): boolean {
  if (m.role !== "assistant") return false;

  // Explicit tag from new saves — fast path
  if (m.messageType === "astro") return true;

  const c = m.content;

  // 1. Single high-confidence structural markers unique to formatNatalForPrompt output
  for (const marker of ASTRO_STRONG_MARKERS) {
    if (c.includes(marker)) return true;
  }

  // 2. H1: AND H2: AND H3: — formatted house-cusp list
  if (c.includes("H1:") && c.includes("H2:") && c.includes("H3:")) return true;

  // 3. "Солнце:" AND "Луна:" AND (Асцендент OR MC:) — Triada block in structured format
  if (
    c.includes("Солнце:") &&
    c.includes("Луна:") &&
    (c.includes("Асцендент") || c.includes("MC:"))
  ) return true;

  // 4. Both structured-output section headers present together
  if (c.includes("Главные аспекты:") && c.includes("Триада:")) return true;

  // 5. ≥ 3 planets AND ≥ 3 explicit "в N доме" house references in the same message
  const planetCount = PLANET_NAMES_RU.filter(p => c.includes(p)).length;
  if (planetCount >= 3) {
    // \b doesn't work with Cyrillic in JS — use whitespace/start anchor instead
    const houseRefs = c.match(/(?:^|[\s.,;(])в[о]?\s+\d{1,2}(?:-[мм]|ом|ем|м)?\s+доме?/gm);
    if (houseRefs && houseRefs.length >= 3) return true;
  }

  return false;
}

// ─── House Sanity Validation ──────────────────────────────────────────────────

export interface HouseValidationResult {
  valid: boolean;
  reason?: string;
  logData?: Record<string, unknown>;
}

/**
 * Validates that Placidus house cusps and planet distribution are physically
 * plausible before the chart is sent to Claude.
 *
 * Anomaly thresholds:
 *   - any house span > 180° (geometrically impossible for a standard chart)
 *   - any house span < 1°  (numerically degenerate)
 *   - any single house containing > 8 bodies (impossible with 14 total)
 *
 * Returns { valid: true } when no anomalies are found, or when no houses are
 * present (time-unknown charts have no Placidus houses).
 */
export function validateHouses(
  chart: NatalChart,
  birthMeta: {
    birthDate?: string | null;
    birthTime?: string | null;
    birthLat?: number | null;
    birthLng?: number | null;
  },
): HouseValidationResult {
  if (!chart.houses || chart.houses.length !== 12) {
    return { valid: true };
  }

  const houses = chart.houses;

  // Compute angular span of each house (always 0–360 via modular arithmetic)
  const spans: number[] = houses.map((cusp, i) =>
    ((houses[(i + 1) % 12] - cusp) + 360) % 360,
  );

  for (let i = 0; i < 12; i++) {
    if (spans[i] > 180) {
      return {
        valid: false,
        reason: `H${i + 1} span ${spans[i].toFixed(1)}° exceeds 180°`,
        logData: buildLogData(chart, houses, spans, birthMeta),
      };
    }
    if (spans[i] < 1) {
      return {
        valid: false,
        reason: `H${i + 1} span ${spans[i].toFixed(2)}° is below 1°`,
        logData: buildLogData(chart, houses, spans, birthMeta),
      };
    }
  }

  // Count bodies per house
  const bodiesPerHouse: Record<number, number> = {};
  for (const p of chart.planets) {
    if (p.house !== undefined) {
      bodiesPerHouse[p.house] = (bodiesPerHouse[p.house] ?? 0) + 1;
    }
  }

  for (const [house, count] of Object.entries(bodiesPerHouse)) {
    if (count > 8) {
      return {
        valid: false,
        reason: `H${house} contains ${count} bodies (impossible distribution)`,
        logData: buildLogData(chart, houses, spans, birthMeta, bodiesPerHouse),
      };
    }
  }

  return { valid: true };
}

function buildLogData(
  chart: NatalChart,
  houses: number[],
  spans: number[],
  birthMeta: {
    birthDate?: string | null;
    birthTime?: string | null;
    birthLat?: number | null;
    birthLng?: number | null;
  },
  bodiesPerHouse?: Record<number, number>,
): Record<string, unknown> {
  return {
    birthDate:    birthMeta.birthDate,
    birthTime:    birthMeta.birthTime,
    birthLat:     birthMeta.birthLat,
    birthLng:     birthMeta.birthLng,
    utcDebug:     chart._tzDebug,
    cusps:        houses.map((c, i) => ({ h: i + 1, cusp: +c.toFixed(4) })),
    spans:        spans.map((s, i) => ({ h: i + 1, span: +s.toFixed(2) })),
    planetHouses: chart.planets.map(p => ({ planet: p.planet, house: p.house })),
    ...(bodiesPerHouse ? { bodiesPerHouse } : {}),
  };
}

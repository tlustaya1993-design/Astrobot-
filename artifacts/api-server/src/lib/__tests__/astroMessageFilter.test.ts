import { describe, it, expect } from "vitest";
import { isAstroAssistantMessage, validateHouses } from "../astroMessageFilter.js";
import type { NatalChart, PlanetPosition } from "../astrology.js";

// ─── isAstroAssistantMessage ──────────────────────────────────────────────────

describe("isAstroAssistantMessage", () => {
  // ── role guard ──────────────────────────────────────────────────────────────

  it("returns false for user messages regardless of content", () => {
    expect(isAstroAssistantMessage({
      role: "user",
      content: "=== НАТАЛЬНАЯ КАРТА ===",
    })).toBe(false);
  });

  // ── explicit messageType === "astro" ────────────────────────────────────────

  it("returns true when messageType is 'astro' even without markers", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: "astro",
      content: "Хороший вопрос!",
    })).toBe(true);
  });

  it("returns false when messageType is 'chat' and no content markers", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: "chat",
      content: "Как дела?",
    })).toBe(false);
  });

  // ── single strong markers ───────────────────────────────────────────────────

  it("detects '=== НАТАЛЬНАЯ КАРТА ===' (old message, messageType null)", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: null,
      content: "=== НАТАЛЬНАЯ КАРТА ===\nТриада:\n  ☉ Солнце: Овен",
    })).toBe(true);
  });

  it("detects 'Куспиды домов' (old message, messageType undefined)", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Куспиды домов (знак куспида → управитель):\n  H1: Овен...",
    })).toBe(true);
  });

  it("detects 'Планеты по домам'", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Планеты по домам:\n  H1: —\n  H2: Солнце",
    })).toBe(true);
  });

  it("detects 'Планеты в домах'", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Планеты в домах:\n  H1: Луна",
    })).toBe(true);
  });

  // ── H1/H2/H3 combination ───────────────────────────────────────────────────

  it("detects H1: AND H2: AND H3: together (formatted house list)", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: null,
      content: "H1: Овен → Марс\nH2: Телец → Венера\nH3: Близнецы → Меркурий",
    })).toBe(true);
  });

  it("does NOT fire on H1: alone", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Посмотрим на H1: Асцендент в Раке — это...",
    })).toBe(false);
  });

  // ── Солнце: + Луна: + Асцендент/MC: combination ─────────────────────────

  it("detects Солнце: AND Луна: AND Асцендент (Triada block)", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: null,
      content: "Солнце: Овен\nЛуна: Телец\nАсцендент: Рак 5°",
    })).toBe(true);
  });

  it("detects Солнце: AND Луна: AND MC:", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: null,
      content: "Солнце: Лев\nЛуна: Рак\nMC: Телец 12°",
    })).toBe(true);
  });

  it("does NOT fire on 'Солнце' and 'Луна' without structural colon format", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Твоё Солнце в Овне и Луна в Раке говорят о сильном эмоциональном фоне.",
    })).toBe(false);
  });

  // ── Главные аспекты: + Триада: combination ───────────────────────────────

  it("detects 'Главные аспекты:' AND 'Триада:' together", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: null,
      content: "Триада:\n  Солнце Овен\nГлавные аспекты:\n  Солнце трин Юпитер",
    })).toBe(true);
  });

  it("does NOT fire on 'Главные аспекты:' alone", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Главные аспекты: это те аспекты, которые оказывают наибольшее влияние.",
    })).toBe(false);
  });

  // ── ≥ 3 planets + ≥ 3 "в N доме" references ─────────────────────────────

  it("strips old message with 'все планеты во 2 доме' pattern", () => {
    // Simulates a buggy old astro reply that put everything in H2
    const content = [
      "Солнце находится во 2 доме.",
      "Луна также во 2 доме.",
      "Марс во 2 доме.",
      "Меркурий во 2 доме.",
      "Венера во 2 доме.",
    ].join("\n");
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: null,
      content,
    })).toBe(true);
  });

  it("does NOT strip casual reply mentioning one house and a planet", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: "chat",
      content: "Твой Сатурн в 10-м доме говорит о сильном профессиональном честолюбии.",
    })).toBe(false);
  });

  it("does NOT strip conversational reply with word 'дом' but no planet list", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Дом — это важная тема. Поговорим о твоём 4-м доме и корнях.",
    })).toBe(false);
  });

  it("does NOT strip reply with two planets and two house refs (below threshold)", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      content: "Солнце во 2 доме и Луна в 4 доме образуют гармоничный паттерн.",
    })).toBe(false);
  });
});

// ─── validateHouses ───────────────────────────────────────────────────────────

function makeChart(houses: number[] | null, planetHouses: (number | undefined)[]): NatalChart {
  const PLANET_NAMES = [
    "Солнце", "Луна", "Меркурий", "Венера", "Марс",
    "Юпитер", "Сатурн", "Уран", "Нептун", "Плутон",
    "Хирон", "Лилит", "Северный Узел", "Южный Узел",
  ] as const;

  const planets: PlanetPosition[] = planetHouses.map((house, i) => ({
    planet:     PLANET_NAMES[i % PLANET_NAMES.length],
    longitude:  0,
    sign:       "Овен",
    degree:     0,
    minute:     0,
    retrograde: false,
    house,
  }));

  return {
    sunSign:         "Овен",
    moonSign:        "Телец",
    ascendant:       "Рак",
    ascendantDegree: 5,
    midheaven:       "Овен",
    midheavenDegree: 15,
    planets,
    houses,
    aspects:         [],
    aspectPatterns:  [],
    houseRulers:     {},
    moonPhase:       { name: "Новолуние", emoji: "🌑", elongation: 0, voidOfCourse: false },
  };
}

const NORMAL_HOUSES = [
  0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330,
];

const NORMAL_PLANET_HOUSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const META = { birthDate: "1990-01-01", birthTime: "12:00", birthLat: 55.75, birthLng: 37.62 };

describe("validateHouses", () => {
  // ── valid cases ─────────────────────────────────────────────────────────────

  it("returns valid for chart with normal 30° equal houses", () => {
    const chart = makeChart(NORMAL_HOUSES, NORMAL_PLANET_HOUSES);
    expect(validateHouses(chart, META).valid).toBe(true);
  });

  it("returns valid when houses is null (time-unknown chart)", () => {
    const chart = makeChart(null, []);
    expect(validateHouses(chart, META).valid).toBe(true);
  });

  it("returns valid for chart with realistically unequal Placidus spans", () => {
    // Simulate northern-latitude Placidus: some houses ~20°, others ~60°
    const placidusLike = [
      0, 20, 45, 90, 135, 165, 180, 200, 225, 270, 315, 345,
    ];
    const chart = makeChart(placidusLike, NORMAL_PLANET_HOUSES);
    expect(validateHouses(chart, META).valid).toBe(true);
  });

  // ── impossible spans ────────────────────────────────────────────────────────

  it("catches house span > 180°", () => {
    // H1 spans from 0° to 200° = 200° span (impossible)
    const badHouses = [0, 200, 210, 220, 230, 240, 180, 190, 200, 210, 220, 350];
    const chart = makeChart(badHouses, NORMAL_PLANET_HOUSES);
    const result = validateHouses(chart, META);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/span.*exceeds 180/);
    expect(result.logData).toBeDefined();
  });

  it("catches house span < 1°", () => {
    // Make H3 degenerate: cusps[2] and cusps[3] are 0.5° apart
    const tinySpan = [0, 30, 60, 60.5, 90, 120, 180, 210, 240, 270, 300, 330];
    const chart = makeChart(tinySpan, NORMAL_PLANET_HOUSES);
    const result = validateHouses(chart, META);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/span.*below 1/);
  });

  // ── impossible all-H2 distribution ─────────────────────────────────────────

  it("catches impossible distribution: 9 bodies all in H2", () => {
    const chart = makeChart(
      NORMAL_HOUSES,
      [2, 2, 2, 2, 2, 2, 2, 2, 2, 10, 11, 12], // 9 bodies in H2
    );
    const result = validateHouses(chart, META);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/H2.*9.*bodies/);
    expect(result.logData?.bodiesPerHouse).toBeDefined();
  });

  it("allows 8 bodies in one house (edge of threshold)", () => {
    const chart = makeChart(
      NORMAL_HOUSES,
      [2, 2, 2, 2, 2, 2, 2, 2, 10, 11, 12, 1], // exactly 8 in H2
    );
    expect(validateHouses(chart, META).valid).toBe(true);
  });

  // ── logData contents ────────────────────────────────────────────────────────

  it("includes birth meta and cusp data in logData on failure", () => {
    const badHouses = [0, 200, 210, 220, 230, 240, 180, 190, 200, 210, 220, 350];
    const chart = makeChart(badHouses, NORMAL_PLANET_HOUSES);
    const { logData } = validateHouses(chart, META);
    expect(logData?.birthDate).toBe(META.birthDate);
    expect(logData?.birthTime).toBe(META.birthTime);
    expect(Array.isArray(logData?.cusps)).toBe(true);
    expect(Array.isArray(logData?.spans)).toBe(true);
  });

  // ── astroState contains "Планеты по домам" ──────────────────────────────────
  // (Checked via the isAstroAssistantMessage marker — the formatNatalForPrompt
  //  output that contains "Планеты по домам" is NOT stripped because it lives in
  //  the system prompt, not in history. But if it ever leaked into history it
  //  would be correctly identified.)

  it("a message containing 'Планеты по домам' is identified as astro output", () => {
    expect(isAstroAssistantMessage({
      role: "assistant",
      messageType: null,
      content: "Планеты по домам:\n  H1: Луна\n  H2: Солнце",
    })).toBe(true);
  });
});

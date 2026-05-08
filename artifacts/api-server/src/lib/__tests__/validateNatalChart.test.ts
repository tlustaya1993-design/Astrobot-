import { describe, it, expect } from "vitest";
import { validateNatalChart, SIGNS, SIGN_RULERS, type NatalChart, type PlanetPosition } from "../astrology.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const META = { birthDate: "1990-06-15", birthTime: "10:30", birthLat: 55.75, birthLng: 37.62 };

const EQUAL_HOUSES = Array.from({ length: 12 }, (_, i) => i * 30); // 0,30,60,…,330

function makePlanet(planet: string, longitude: number, house?: number): PlanetPosition {
  const signIdx = Math.floor(longitude / 30);
  return {
    planet:     planet as PlanetPosition["planet"],
    longitude,
    sign:       SIGNS[signIdx],
    degree:     Math.floor(longitude % 30),
    minute:     Math.floor((longitude % 1) * 60),
    retrograde: false,
    house,
  };
}

function makeRulers(houses: number[]): Record<number, PlanetPosition["planet"]> {
  const r: Record<number, PlanetPosition["planet"]> = {};
  for (let h = 0; h < 12; h++) {
    r[h + 1] = SIGN_RULERS[Math.floor(((houses[h] % 360) + 360) % 360 / 30)];
  }
  return r;
}

// Equal-house memberships for EQUAL_HOUSES (0,30,60,...,330).
// H_n spans [n*30, (n+1)*30), so lon 60° → H3 (not H2), 30° → H2, etc.
function baseChart(overrides: Partial<NatalChart> = {}): NatalChart {
  const planets: PlanetPosition[] = [
    makePlanet("Солнце",          85,  3),  // 60–89 → H3
    makePlanet("Луна",           210,  8),  // 210–239 → H8
    makePlanet("Меркурий",        90,  4),  // 90–119 → H4
    makePlanet("Венера",         120,  5),  // 120–149 → H5
    makePlanet("Марс",           270, 10),  // 270–299 → H10
    makePlanet("Юпитер",          30,  2),  // 30–59 → H2
    makePlanet("Сатурн",         180,  7),  // 180–209 → H7
    makePlanet("Уран",           300, 11),  // 300–329 → H11
    makePlanet("Нептун",         330, 12),  // 330–359 → H12
    makePlanet("Плутон",         255,  9),  // 240–269 → H9
    makePlanet("Хирон",          150,  6),  // 150–179 → H6
    makePlanet("Лилит",           60,  3),  // 60–89 → H3 (NOT H2)
    makePlanet("Северный Узел",   15,  1),  // 0–29 → H1
    makePlanet("Южный Узел",     195,  7),  // 180–209 → H7 (opposite NN)
  ];
  return {
    sunSign:         SIGNS[2],   // 85° → Близнецы
    moonSign:        SIGNS[7],   // 210° → Весы
    ascendant:       SIGNS[0],   // H1 cusp at 0° = Овен
    ascendantDegree: 0,
    midheaven:       SIGNS[9],   // H10 cusp at 270° = Козерог
    midheavenDegree: 0,
    planets,
    houses:          EQUAL_HOUSES,
    houseRulers:     makeRulers(EQUAL_HOUSES),
    aspects:         [],
    aspectPatterns:  [],
    moonPhase:       { name: "Первая четверть", emoji: "🌓", elongation: 90, voidOfCourse: false },
    ...overrides,
  };
}

// ─── validateNatalChart ───────────────────────────────────────────────────────

describe("validateNatalChart — valid chart", () => {
  it("passes a well-formed chart", () => {
    const result = validateNatalChart(baseChart(), META, "test");
    expect(result.planetsValid).toBe(true);
    expect(result.housesValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("passes a chart without houses (time-unknown)", () => {
    const result = validateNatalChart(
      baseChart({ houses: null, houseRulers: {}, ascendant: null, ascendantDegree: null, midheaven: null, midheavenDegree: null }),
      { ...META, birthTime: null },
      "user",
    );
    expect(result.planetsValid).toBe(true);
    expect(result.housesValid).toBe(true);
  });
});

describe("validateNatalChart — planet errors", () => {
  it("fails when Солнце is missing", () => {
    const chart = baseChart({
      planets: baseChart().planets.filter(p => p.planet !== "Солнце"),
    });
    const result = validateNatalChart(chart, META, "user");
    expect(result.planetsValid).toBe(false);
    expect(result.reason).toMatch(/Солнце/);
  });

  it("fails when Луна is missing", () => {
    const chart = baseChart({
      planets: baseChart().planets.filter(p => p.planet !== "Луна"),
    });
    const result = validateNatalChart(chart, META, "contact:Ольга");
    expect(result.planetsValid).toBe(false);
    expect(result.reason).toMatch(/Луна/);
  });

  it("fails when a planet longitude is negative", () => {
    const planets = baseChart().planets.map(p =>
      p.planet === "Марс" ? { ...p, longitude: -5 } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "user");
    expect(result.planetsValid).toBe(false);
    expect(result.reason).toMatch(/Марс.*longitude/);
  });

  it("fails when a planet longitude is NaN", () => {
    const planets = baseChart().planets.map(p =>
      p.planet === "Венера" ? { ...p, longitude: NaN } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "user");
    expect(result.planetsValid).toBe(false);
  });

  it("fails when a planet longitude is ≥ 360", () => {
    const planets = baseChart().planets.map(p =>
      p.planet === "Юпитер" ? { ...p, longitude: 360 } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "user");
    expect(result.planetsValid).toBe(false);
  });

  it("fails when sign doesn't match longitude", () => {
    const planets = baseChart().planets.map(p =>
      p.planet === "Солнце" ? { ...p, sign: "Рыбы" as PlanetPosition["sign"] } : p, // lon=85° → Близнецы
    );
    const result = validateNatalChart(baseChart({ planets }), META, "user");
    expect(result.planetsValid).toBe(false);
    expect(result.reason).toMatch(/sign mismatch/);
  });
});

describe("validateNatalChart — house errors", () => {
  it("fails when houses array length ≠ 12", () => {
    const result = validateNatalChart(
      baseChart({ houses: [0, 30, 60] }),
      META,
      "user",
    );
    expect(result.planetsValid).toBe(true);
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/length/);
  });

  it("fails when a cusp is out of 0–360", () => {
    const badHouses = [...EQUAL_HOUSES];
    badHouses[3] = 400;
    const result = validateNatalChart(baseChart({ houses: badHouses }), META, "user");
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/cusp.*out of 0/);
  });

  it("fails when a house span exceeds 180°", () => {
    // H1 from 0° to 200° = span 200°
    const badHouses = [0, 200, 210, 220, 230, 240, 180, 190, 200, 210, 220, 350];
    const result = validateNatalChart(baseChart({ houses: badHouses, houseRulers: makeRulers(badHouses) }), META, "user");
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/span.*exceeds 180/);
  });

  it("fails when a house span is below 1°", () => {
    const tinySpan = [...EQUAL_HOUSES];
    tinySpan[4] = tinySpan[3] + 0.5; // H4 only 0.5° wide
    const result = validateNatalChart(baseChart({ houses: tinySpan, houseRulers: makeRulers(tinySpan) }), META, "user");
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/span.*below 1/);
  });

  it("fails when planet.house is 0 (invalid)", () => {
    const planets = baseChart().planets.map(p =>
      p.planet === "Солнце" ? { ...p, house: 0 } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "user");
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/invalid house/);
  });

  it("fails when planet.house is 13 (invalid)", () => {
    const planets = baseChart().planets.map(p =>
      p.planet === "Луна" ? { ...p, house: 13 } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "contact:Тест");
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/invalid house/);
  });

  it("fails when planet.house is NaN", () => {
    const planets = baseChart().planets.map(p =>
      p.planet === "Марс" ? { ...p, house: NaN } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "user");
    expect(result.housesValid).toBe(false);
  });

  it("catches impossible all-H2 distribution (9 bodies)", () => {
    const planets = baseChart().planets.map((p, i) =>
      i < 9 ? { ...p, house: 2 } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "contact:Ольга");
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/H2.*bodies/);
  });

  it("allows 8 bodies in one house (edge of threshold)", () => {
    const planets = baseChart().planets.map((p, i) =>
      i < 8 ? { ...p, house: 2 } : p,
    );
    const result = validateNatalChart(baseChart({ planets }), META, "user");
    expect(result.planetsValid).toBe(true);
    expect(result.housesValid).toBe(true);
  });

  it("fails when house ruler doesn't match cusp sign", () => {
    const badRulers = { ...makeRulers(EQUAL_HOUSES), 3: "Сатурн" as PlanetPosition["planet"] }; // H3 cusp=60° → Близнецы → Меркурий, not Сатурн
    const result = validateNatalChart(baseChart({ houseRulers: badRulers }), META, "user");
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/ruler mismatch/);
  });

  it("fails when ASC sign doesn't match houses[0]", () => {
    // houses[0]=0° → Овен, but ascendant says Рыбы
    const result = validateNatalChart(
      baseChart({ ascendant: "Рыбы" }),
      META,
      "user",
    );
    expect(result.housesValid).toBe(false);
    expect(result.reason).toMatch(/ASC sign mismatch/);
  });
});

describe("validateNatalChart — contextLabel in logData", () => {
  it("includes contextLabel in logData on planet failure", () => {
    const planets = baseChart().planets.filter(p => p.planet !== "Солнце");
    const result = validateNatalChart(baseChart({ planets }), META, "contact:Ольга");
    expect(result.logData?.contextLabel).toBe("contact:Ольга");
  });

  it("includes contextLabel in logData on house failure", () => {
    const badHouses = [0, 200, 210, 220, 230, 240, 180, 190, 200, 210, 220, 350];
    const result = validateNatalChart(baseChart({ houses: badHouses, houseRulers: makeRulers(badHouses) }), META, "contact:Тест");
    expect(result.logData?.contextLabel).toBe("contact:Тест");
  });
});

describe("validateNatalChart — synastry safety (both charts)", () => {
  it("user valid + contact has invalid houses → only contact house warning", () => {
    const userResult = validateNatalChart(baseChart(), META, "user");
    expect(userResult.planetsValid).toBe(true);
    expect(userResult.housesValid).toBe(true);

    const badHouses = [0, 200, 210, 220, 230, 240, 180, 190, 200, 210, 220, 350];
    const contactResult = validateNatalChart(
      baseChart({ houses: badHouses, houseRulers: makeRulers(badHouses) }),
      META,
      "contact:Ольга",
    );
    expect(contactResult.planetsValid).toBe(true);  // planets still valid
    expect(contactResult.housesValid).toBe(false);   // houses bad → no house interp for contact
  });

  it("user has invalid houses + contact valid → only user house warning", () => {
    const badHouses = [0, 200, 210, 220, 230, 240, 180, 190, 200, 210, 220, 350];
    const userResult = validateNatalChart(
      baseChart({ houses: badHouses, houseRulers: makeRulers(badHouses) }),
      META,
      "user",
    );
    expect(userResult.planetsValid).toBe(true);
    expect(userResult.housesValid).toBe(false);

    const contactResult = validateNatalChart(baseChart(), META, "contact:Ольга");
    expect(contactResult.planetsValid).toBe(true);
    expect(contactResult.housesValid).toBe(true);
  });

  it("both invalid houses → both warnings independent", () => {
    const badHouses = [0, 200, 210, 220, 230, 240, 180, 190, 200, 210, 220, 350];
    const userResult    = validateNatalChart(baseChart({ houses: badHouses, houseRulers: makeRulers(badHouses) }), META, "user");
    const contactResult = validateNatalChart(baseChart({ houses: badHouses, houseRulers: makeRulers(badHouses) }), META, "contact:Ольга");
    expect(userResult.housesValid).toBe(false);
    expect(contactResult.housesValid).toBe(false);
    // Planets still valid — synastry by aspects is still available
    expect(userResult.planetsValid).toBe(true);
    expect(contactResult.planetsValid).toBe(true);
  });

  it("contact with invalid planets → synastry should be suppressed (planetsValid=false)", () => {
    const chart = baseChart({ planets: baseChart().planets.filter(p => p.planet !== "Луна") });
    const result = validateNatalChart(chart, META, "contact:Ольга");
    expect(result.planetsValid).toBe(false);
    // Caller (buildSystemPrompt) skips synastry when planetsValid=false
  });
});

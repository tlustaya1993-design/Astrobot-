/**
 * AstroBot — Professional Astrology Calculation Engine
 * Jean Meeus "Astronomical Algorithms", 2nd ed. + modern extensions
 *
 * Covers:
 *  — Natal chart: 10 planets + Chiron + Lilith + Lunar Nodes
 *  — Aspects: 8 types, orbs, applying/separating, aspect patterns
 *  — Planetary dignities: domicile, exaltation, detriment, fall
 *  — Moon phase + void-of-course Moon
 *  — Transit aspects to natal
 *  — Synastry (inter-chart aspects)
 *  — Solar Return chart
 *  — Secondary Progressions
 *  — Precise geocentric positions for all planets (rectangular coords)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ZodiacSign =
  | "Овен" | "Телец" | "Близнецы" | "Рак"
  | "Лев" | "Дева" | "Весы" | "Скорпион"
  | "Стрелец" | "Козерог" | "Водолей" | "Рыбы";

export type Planet =
  | "Солнце" | "Луна" | "Меркурий" | "Венера" | "Марс"
  | "Юпитер" | "Сатурн" | "Уран" | "Нептун" | "Плутон"
  | "Хирон" | "Лилит" | "Северный Узел" | "Южный Узел";

export type AspectName =
  | "соединение" | "оппозиция" | "трин" | "квадрат" | "секстиль"
  | "квинконс" | "полуквадрат" | "сесквиквадрат";

export type Dignity = "домицилий" | "экзальтация" | "детримент" | "падение";

export interface PlanetPosition {
  planet:     Planet;
  longitude:  number;    // ecliptic 0–360°
  sign:       ZodiacSign;
  degree:     number;    // 0–29 within sign
  minute:     number;    // 0–59 arc-minutes
  retrograde: boolean;
  house?:     number;    // 1–12 if houses known
  dignity?:   Dignity;  // planetary strength
}

export interface Aspect {
  planet1:  Planet;
  planet2:  Planet;
  aspect:   AspectName;
  orb:      number;
  applying: boolean;
  exact:    boolean;
}

export interface AspectPattern {
  type:    "Большой Трин" | "Т-квадрат" | "Большой Крест" | "Йод" | "Стеллиум";
  planets: Planet[];
  element?: string;
}

export interface MoonPhase {
  name:       string;    // Russian name
  emoji:      string;
  elongation: number;    // 0–360°
  voidOfCourse: boolean;
  nextSignAt?:  string;  // ISO date-time if VOC
}

export interface NatalChart {
  sunSign:         ZodiacSign;
  moonSign:        ZodiacSign;
  ascendant:       ZodiacSign | null;
  ascendantDegree: number | null;
  midheaven:       ZodiacSign | null;
  midheavenDegree: number | null;
  planets:         PlanetPosition[];
  houses:          number[] | null;
  aspects:         Aspect[];
  aspectPatterns:  AspectPattern[];
  houseRulers:     Record<number, Planet>;
  moonPhase:       MoonPhase;
}

export interface SynastryAspect {
  planet1: Planet;
  planet2: Planet;
  aspect:  AspectName;
  orb:     number;
  exact:   boolean;
}

export interface SynastryResult {
  aspects: SynastryAspect[];
}

export interface TransitAspect {
  transitPlanet: Planet;
  natalPlanet:   Planet;
  aspect:        AspectName;
  orb:           number;
  applying:      boolean;
  exact:         boolean;
}

export interface EphemerisData {
  date:           string;
  planets:        PlanetPosition[];
  moonPhase:      MoonPhase;
  transitAspects?: TransitAspect[];
}

export interface SolarReturn {
  year:      number;
  date:      string;
  chart:     NatalChart;
}

export interface ProgressedChart {
  age:      number;
  date:     string;
  planets:  PlanetPosition[];
  aspects:  Aspect[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIGNS: ZodiacSign[] = [
  "Овен", "Телец", "Близнецы", "Рак",
  "Лев", "Дева", "Весы", "Скорпион",
  "Стрелец", "Козерог", "Водолей", "Рыбы"
];

const ASPECT_CONFIG: Array<{ name: AspectName; angle: number; orb: number }> = [
  { name: "соединение",     angle: 0,   orb: 8 },
  { name: "оппозиция",      angle: 180, orb: 8 },
  { name: "трин",           angle: 120, orb: 7 },
  { name: "квадрат",        angle: 90,  orb: 7 },
  { name: "секстиль",       angle: 60,  orb: 5 },
  { name: "квинконс",       angle: 150, orb: 3 },
  { name: "полуквадрат",    angle: 45,  orb: 2 },
  { name: "сесквиквадрат",  angle: 135, orb: 2 },
];

// Sign rulers: index 0 = Овен … 11 = Рыбы
const SIGN_RULERS: Planet[] = [
  "Марс", "Венера", "Меркурий", "Луна", "Солнце", "Меркурий",
  "Венера", "Плутон", "Юпитер", "Сатурн", "Уран", "Нептун",
];

// Planetary dignities table
interface DignityEntry {
  domicile:   number[];   // sign indices
  exaltation: number | null; // sign index
  detriment:  number[];
  fall:       number | null;
}
const DIGNITIES: Record<string, DignityEntry> = {
  "Солнце":   { domicile:[4],     exaltation:0,  detriment:[10], fall:6  },
  "Луна":     { domicile:[3],     exaltation:1,  detriment:[9],  fall:7  },
  "Меркурий": { domicile:[2,5],   exaltation:5,  detriment:[8,11],fall:11 },
  "Венера":   { domicile:[1,6],   exaltation:11, detriment:[7,0],fall:5  },
  "Марс":     { domicile:[0,7],   exaltation:9,  detriment:[6,1],fall:3  },
  "Юпитер":   { domicile:[8,11],  exaltation:3,  detriment:[2,5],fall:9  },
  "Сатурн":   { domicile:[9,10],  exaltation:6,  detriment:[3,4],fall:0  },
  "Уран":     { domicile:[10],    exaltation:7,  detriment:[4],  fall:1  },
  "Нептун":   { domicile:[11],    exaltation:3,  detriment:[5],  fall:9  },
  "Плутон":   { domicile:[7],     exaltation:null,detriment:[1], fall:null},
  "Хирон":    { domicile:[8],     exaltation:null,detriment:[2], fall:null},
};

const MOON_PHASES = [
  { name: "Новолуние",           emoji: "🌑", min: 0,   max: 22.5  },
  { name: "Растущий серп",       emoji: "🌒", min: 22.5, max: 67.5  },
  { name: "Первая четверть",     emoji: "🌓", min: 67.5, max: 112.5 },
  { name: "Растущая Луна",       emoji: "🌔", min: 112.5, max: 157.5 },
  { name: "Полнолуние",          emoji: "🌕", min: 157.5, max: 202.5 },
  { name: "Убывающая Луна",      emoji: "🌖", min: 202.5, max: 247.5 },
  { name: "Последняя четверть",  emoji: "🌗", min: 247.5, max: 292.5 },
  { name: "Убывающий серп",      emoji: "🌘", min: 292.5, max: 337.5 },
  { name: "Новолуние",           emoji: "🌑", min: 337.5, max: 360  },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function deg2rad(d: number): number { return d * Math.PI / 180; }
function rad2deg(r: number): number { return r * 180 / Math.PI; }

function normalizeAngle(a: number): number {
  a = a % 360;
  return a < 0 ? a + 360 : a;
}

function dateToJD(
  year: number, month: number, day: number,
  hour = 0, minute = 0
): number {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day + B - 1524.5 + (hour + minute / 60) / 24
  );
}

function jdToDate(jd: number): Date {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let A = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day   = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year  = month > 2 ? C - 4716 : C - 4715;
  const hours = f * 24;
  const h     = Math.floor(hours);
  const m     = Math.floor((hours - h) * 60);
  return new Date(Date.UTC(year, month - 1, day, h, m));
}

function jdToT(jd: number): number {
  return (jd - 2451545.0) / 36525;
}

function longitudeToSign(lon: number): ZodiacSign {
  return SIGNS[Math.floor(normalizeAngle(lon) / 30)];
}

function longitudeToDeg(lon: number): number {
  return Math.floor(normalizeAngle(lon) % 30);
}

function longitudeToMin(lon: number): number {
  return Math.floor(((normalizeAngle(lon) % 30) % 1) * 60);
}

function angularDiff(a: number, b: number): number {
  let d = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  if (d > 180) d = 360 - d;
  return d;
}

function getDignity(planet: string, signIndex: number): Dignity | undefined {
  const d = DIGNITIES[planet];
  if (!d) return undefined;
  if (d.domicile.includes(signIndex))   return "домицилий";
  if (d.exaltation === signIndex)        return "экзальтация";
  if (d.detriment.includes(signIndex))  return "детримент";
  if (d.fall === signIndex)             return "падение";
  return undefined;
}

// ─── Sun ─────────────────────────────────────────────────────────────────────

function sunLongitude(jd: number): number {
  const T  = jdToT(jd);
  const L0 = normalizeAngle(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M  = normalizeAngle(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = deg2rad(M);
  const C  =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  return normalizeAngle(L0 + C);
}

function sunDistance(jd: number): number {
  const T  = jdToT(jd);
  const M  = normalizeAngle(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = deg2rad(M);
  const e  = 0.016708634 - 0.000042037 * T;
  const v  = M + rad2deg(2 * e * Math.sin(Mr) + 1.25 * e * e * Math.sin(2 * Mr));
  return 1.000001018 * (1 - e * e) / (1 + e * Math.cos(deg2rad(v)));
}

// ─── Moon ────────────────────────────────────────────────────────────────────

function moonLongitude(jd: number): number {
  const T   = jdToT(jd);
  const L0  = normalizeAngle(218.3165 + 481267.8813 * T);
  const M   = normalizeAngle(357.5291 + 35999.0503 * T);
  const Mp  = normalizeAngle(134.9634 + 477198.8676 * T);
  const F   = normalizeAngle(93.2721  + 483202.0175 * T);
  const Om  = normalizeAngle(125.0445 - 1934.1363 * T);
  const Mpr = deg2rad(Mp);
  const L0r = deg2rad(L0);
  const Fr  = deg2rad(F);
  const Omr = deg2rad(Om);
  const Mr  = deg2rad(M);
  return normalizeAngle(
    L0 +
    6.2886  * Math.sin(Mpr) +
    1.2740  * Math.sin(2 * L0r - Mpr) +
    0.6583  * Math.sin(2 * Mr) +
    0.2136  * Math.sin(2 * Mpr) -
    0.1851  * Math.sin(Mr) -
    0.1143  * Math.sin(2 * Fr) +
    0.0588  * Math.sin(2 * Mpr - Mr) +
    0.0572  * Math.sin(2 * L0r - Mr) +
    0.0533  * Math.sin(2 * L0r + Mpr) -
    0.0468  * Math.sin(Mpr - Mr) +
    0.0204  * Math.sin(2 * Omr) +
    0.0161  * Math.sin(Mpr - 2 * Fr)
  );
}

// ─── Planets — proper heliocentric → geocentric conversion ───────────────────

interface OrbEl {
  L: number; dL: number;         // mean longitude, °/Julian century
  a: number; da: number;         // semi-major axis, AU/century
  e: number; de: number;         // eccentricity
  i: number; di: number;
  om: number; dom: number;       // longitude of ascending node
  w: number;  dw: number;        // longitude of perihelion
}

const ORBITAL: Record<string, OrbEl> = {
  Mercury: { L:252.2509, dL:149472.6746, a:0.38710, da:0,        e:0.20563, de: 0.00002527,  i:7.0050, di:-0.00594, om:48.3308,  dom:-0.12594, w:77.4561,  dw:0.15940  },
  Venus:   { L:181.9798, dL: 58517.8157, a:0.72333, da:0.000002, e:0.00677, de:-0.00004938,  i:3.3947, di:-0.00131, om:76.6799,  dom:-0.27769, w:131.5637, dw:0.00268  },
  Mars:    { L:355.4330, dL: 19140.3023, a:1.52368, da:0.000011, e:0.09340, de: 0.00009149,  i:1.8497, di:-0.00813, om:49.5581,  dom:-0.29257, w:336.0882, dw:0.44097  },
  Jupiter: { L: 34.3515, dL:  3034.9057, a:5.20260, da:-0.000387,e:0.04849, de: 0.00016323,  i:1.3033, di: 0.00504, om:100.4644, dom: 0.13868, w: 14.3312, dw:0.18199  },
  Saturn:  { L: 50.0774, dL:  1222.1138, a:9.55491, da:-0.003065,e:0.05551, de:-0.00032499,  i:2.4888, di:-0.00557, om:113.6655, dom:-0.23516, w: 93.0572, dw:0.83327  },
  Uranus:  { L:314.0550, dL:   428.4882, a:19.21814,da:-0.000218,e:0.04630, de:-0.00001172,  i:0.7732, di: 0.00082, om:74.0060,  dom: 0.04202, w:173.0052, dw:0.01595  },
  Neptune: { L:304.3487, dL:   218.4862, a:30.11386,da:0.000060, e:0.00899, de: 0.000006476, i:1.7700, di: 0.00030, om:131.7841, dom:-0.00606, w: 48.1202, dw:-0.00492 },
  Pluto:   { L:238.9508, dL:   145.1813, a:39.5436, da:0,        e:0.24882, de:0,            i:17.1400,di:0,        om:110.3039, dom:0,        w:224.0680, dw:0        },
  // Chiron: perihelion 1996-02-14, period 50.72yr, elements J2000.0
  Chiron:  { L:217.0,    dL:   710.0,    a:13.6437, da:0,        e:0.38328, de:0,            i:6.9305, di:0,        om:209.2965, dom:0,        w:188.66,   dw:0        },
};

function solveKepler(M_deg: number, e: number): number {
  const Mr = deg2rad(M_deg);
  let E = Mr;
  for (let k = 0; k < 10; k++) E = Mr + e * Math.sin(E);
  return E;
}

/**
 * Returns { lon (heliocentric ecliptic, °), dist (AU) } for a named planet.
 */
function heliocentricPos(name: string, jd: number): { lon: number; dist: number } {
  const T   = jdToT(jd);
  const el  = ORBITAL[name];
  if (!el) return { lon: 0, dist: 1 };

  const L   = normalizeAngle(el.L + el.dL * T);
  const a   = el.a + el.da * T;
  const e   = el.e + el.de * T;
  const w   = normalizeAngle(el.w + el.dw * T);  // longitude of perihelion
  const M   = normalizeAngle(L - w);             // mean anomaly

  const E   = solveKepler(M, e);
  const v   = rad2deg(2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  ));
  const lon  = normalizeAngle(v + w);
  const dist = a * (1 - e * Math.cos(E));

  return { lon, dist };
}

/**
 * Converts heliocentric position to geocentric ecliptic longitude.
 * Uses rectangular coordinate transform for full accuracy.
 */
function helioToGeocentric(
  planetLon: number, planetDist: number,
  earthLon: number,  earthDist: number
): number {
  const pLonR = deg2rad(planetLon);
  const eLonR = deg2rad(earthLon);

  const xP = planetDist * Math.cos(pLonR);
  const yP = planetDist * Math.sin(pLonR);
  const xE = earthDist  * Math.cos(eLonR);
  const yE = earthDist  * Math.sin(eLonR);

  return normalizeAngle(rad2deg(Math.atan2(yP - yE, xP - xE)));
}

function planetGeocentric(name: string, jd: number): number {
  const { lon: pLon, dist: pDist } = heliocentricPos(name, jd);
  const earthLon  = normalizeAngle(sunLongitude(jd) + 180);
  const earthDist = sunDistance(jd);
  return helioToGeocentric(pLon, pDist, earthLon, earthDist);
}

function isRetrograde(name: string, jd: number): boolean {
  if (name === "Солнце" || name === "Луна") return false;
  const step  = (name === "Mercury" || name === "Venus") ? 1 : 2;
  const lon1  = planetGeocentric(name, jd - step);
  const lon2  = planetGeocentric(name, jd + step);
  const diff  = normalizeAngle(lon2 - lon1);
  return diff > 180;
}

// ─── Lunar Nodes ─────────────────────────────────────────────────────────────

function northNodeLon(jd: number): number {
  const T = jdToT(jd);
  return normalizeAngle(125.04452 - 1934.136261 * T + 0.0020708 * T * T);
}

// ─── Lilith (Mean Black Moon = mean apogee) ───────────────────────────────────

function lilithLon(jd: number): number {
  const T = jdToT(jd);
  return normalizeAngle(83.3532465 + 4069.0137287 * T - 0.0103200 * T * T);
}

// ─── Ascendant, MC ────────────────────────────────────────────────────────────

function obliquity(jd: number): number {
  const T = jdToT(jd);
  return 23.439291111 - 0.013004167 * T - 0.0000001639 * T * T + 0.0000005036 * T * T * T;
}

function localSiderealTime(jd: number, longitude: number): number {
  const T      = jdToT(jd);
  const theta0 = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  return normalizeAngle(theta0 + longitude);
}

function calcAscendant(jd: number, lat: number, lon: number): number {
  const lst    = localSiderealTime(jd, lon);
  const eps    = obliquity(jd);
  const lstRad = deg2rad(lst);
  const latRad = deg2rad(lat);
  const epsRad = deg2rad(eps);
  return normalizeAngle(rad2deg(Math.atan2(
    Math.cos(lstRad),
    -(Math.sin(lstRad) * Math.cos(epsRad) + Math.tan(latRad) * Math.sin(epsRad))
  )));
}

function calcMidheaven(jd: number, lon: number): number {
  const lst    = localSiderealTime(jd, lon);
  const eps    = obliquity(jd);
  return normalizeAngle(rad2deg(Math.atan2(Math.tan(deg2rad(lst)), Math.cos(deg2rad(eps)))));
}

function calcHouseCusps(asc: number): number[] {
  return Array.from({ length: 12 }, (_, i) => normalizeAngle(asc + i * 30));
}

function getPlanetHouse(longitude: number, houses: number[]): number {
  for (let i = 0; i < 12; i++) {
    const lo   = normalizeAngle(longitude - houses[i]);
    const span = normalizeAngle(houses[(i + 1) % 12] - houses[i]);
    if (lo < span) return i + 1;
  }
  return 1;
}

function calcHouseRulers(houses: number[]): Record<number, Planet> {
  const rulers: Record<number, Planet> = {};
  for (let h = 0; h < 12; h++) {
    rulers[h + 1] = SIGN_RULERS[Math.floor(normalizeAngle(houses[h]) / 30)];
  }
  return rulers;
}

// ─── Moon Phase ───────────────────────────────────────────────────────────────

function calcMoonPhase(jd: number): MoonPhase {
  const sunLon  = sunLongitude(jd);
  const moonLon = moonLongitude(jd);
  const elong   = normalizeAngle(moonLon - sunLon);

  const phase = MOON_PHASES.find(p => elong >= p.min && elong < p.max)
    ?? MOON_PHASES[0];

  // Void of Course: check if Moon makes any major aspect before sign change
  const degsLeft   = 30 - (normalizeAngle(moonLon) % 30);
  const moonSpeed  = 13.176; // avg °/day
  const daysToExit = degsLeft / moonSpeed;

  const MAJOR_ASPECTS = [0, 60, 90, 120, 180];
  let voc = true;
  const currentSign = Math.floor(normalizeAngle(moonLon) / 30);

  // Check 10 planets
  const planetNames = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
  const checkStep   = daysToExit / 20;

  for (let step = 0; step <= 20 && voc; step++) {
    const testJD    = jd + step * checkStep;
    const testMoon  = moonLongitude(testJD);
    const testSign  = Math.floor(normalizeAngle(testMoon) / 30);
    if (testSign !== currentSign) break;

    const testSun = sunLongitude(testJD);
    for (const angle of MAJOR_ASPECTS) {
      if (Math.abs(angularDiff(testMoon, testSun) - angle) < 1.5) { voc = false; break; }
    }
    if (!voc) break;

    for (const pn of planetNames) {
      const pLon = planetGeocentric(pn, testJD);
      for (const angle of MAJOR_ASPECTS) {
        if (Math.abs(angularDiff(testMoon, pLon) - angle) < 1.5) { voc = false; break; }
      }
      if (!voc) break;
    }
  }

  const nextSignAt = voc
    ? jdToDate(jd + daysToExit).toISOString().slice(0, 16)
    : undefined;

  return {
    name:         phase.name,
    emoji:        phase.emoji,
    elongation:   Math.round(elong * 10) / 10,
    voidOfCourse: voc,
    nextSignAt,
  };
}

// ─── Aspects ──────────────────────────────────────────────────────────────────

function findAspect(lon1: number, lon2: number): { aspect: AspectName; orb: number; applying: boolean } | null {
  const diff = angularDiff(lon1, lon2);
  for (const cfg of ASPECT_CONFIG) {
    const orb = Math.abs(diff - cfg.angle);
    if (orb <= cfg.orb) {
      const applying = normalizeAngle(lon2 - lon1) < 180;
      return { aspect: cfg.name, orb: Math.round(orb * 10) / 10, applying };
    }
  }
  return null;
}

function calcAspects(planets: PlanetPosition[]): Aspect[] {
  const aspects: Aspect[] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const found = findAspect(planets[i].longitude, planets[j].longitude);
      if (found) {
        aspects.push({
          planet1:  planets[i].planet,
          planet2:  planets[j].planet,
          aspect:   found.aspect,
          orb:      found.orb,
          applying: found.applying,
          exact:    found.orb <= 1,
        });
      }
    }
  }
  return aspects;
}

// ─── Aspect Patterns ──────────────────────────────────────────────────────────

const ELEMENTS: Record<string, string> = {
  "Овен": "огонь", "Лев": "огонь", "Стрелец": "огонь",
  "Телец": "земля", "Дева": "земля", "Козерог": "земля",
  "Близнецы": "воздух", "Весы": "воздух", "Водолей": "воздух",
  "Рак": "вода", "Скорпион": "вода", "Рыбы": "вода",
};

function detectAspectPatterns(planets: PlanetPosition[], aspects: Aspect[]): AspectPattern[] {
  const patterns: AspectPattern[] = [];
  const n = planets.length;

  // Stellium: 3+ planets within same sign (or 10°)
  const bySig = new Map<string, Planet[]>();
  for (const p of planets) {
    const k = p.sign;
    if (!bySig.has(k)) bySig.set(k, []);
    bySig.get(k)!.push(p.planet);
  }
  for (const [sign, pls] of bySig) {
    if (pls.length >= 3) {
      patterns.push({ type: "Стеллиум", planets: pls, element: ELEMENTS[sign] });
    }
  }

  // Grand Trine: three planets each trine to the other two
  const trines = aspects.filter(a => a.aspect === "трин");
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const pi = planets[i].planet, pj = planets[j].planet, pk = planets[k].planet;
        const t1 = trines.some(a => (a.planet1===pi&&a.planet2===pj)||(a.planet1===pj&&a.planet2===pi));
        const t2 = trines.some(a => (a.planet1===pj&&a.planet2===pk)||(a.planet1===pk&&a.planet2===pj));
        const t3 = trines.some(a => (a.planet1===pi&&a.planet2===pk)||(a.planet1===pk&&a.planet2===pi));
        if (t1 && t2 && t3) {
          const el = ELEMENTS[planets[i].sign] ?? undefined;
          patterns.push({ type: "Большой Трин", planets: [pi, pj, pk], element: el });
        }
      }
    }
  }

  // T-Square: two planets in opposition, third squares both
  const opps  = aspects.filter(a => a.aspect === "оппозиция");
  const sqrs  = aspects.filter(a => a.aspect === "квадрат");
  for (const opp of opps) {
    for (const p of planets) {
      if (p.planet === opp.planet1 || p.planet === opp.planet2) continue;
      const s1 = sqrs.some(a => (a.planet1===p.planet&&a.planet2===opp.planet1)||(a.planet1===opp.planet1&&a.planet2===p.planet));
      const s2 = sqrs.some(a => (a.planet1===p.planet&&a.planet2===opp.planet2)||(a.planet1===opp.planet2&&a.planet2===p.planet));
      if (s1 && s2) patterns.push({ type: "Т-квадрат", planets: [opp.planet1, opp.planet2, p.planet] });
    }
  }

  // Grand Cross: two pairs of oppositions, all squaring each other
  for (let i = 0; i < opps.length; i++) {
    for (let j = i + 1; j < opps.length; j++) {
      const { planet1: a1, planet2: a2 } = opps[i];
      const { planet1: b1, planet2: b2 } = opps[j];
      if ([a1,a2].includes(b1) || [a1,a2].includes(b2)) continue;
      const pairs = [[a1,b1],[a1,b2],[a2,b1],[a2,b2]];
      if (pairs.every(([x,y]) => sqrs.some(s =>
        (s.planet1===x&&s.planet2===y)||(s.planet1===y&&s.planet2===x)
      ))) {
        patterns.push({ type: "Большой Крест", planets: [a1, a2, b1, b2] });
      }
    }
  }

  // Yod (Finger of God): two planets in sextile, both quincunx a third
  const sext   = aspects.filter(a => a.aspect === "секстиль");
  const quinc  = aspects.filter(a => a.aspect === "квинконс");
  for (const s of sext) {
    for (const p of planets) {
      if (p.planet === s.planet1 || p.planet === s.planet2) continue;
      const q1 = quinc.some(a => (a.planet1===s.planet1&&a.planet2===p.planet)||(a.planet1===p.planet&&a.planet2===s.planet1));
      const q2 = quinc.some(a => (a.planet1===s.planet2&&a.planet2===p.planet)||(a.planet1===p.planet&&a.planet2===s.planet2));
      if (q1 && q2) patterns.push({ type: "Йод", planets: [s.planet1, s.planet2, p.planet] });
    }
  }

  return patterns;
}

// ─── Synastry ─────────────────────────────────────────────────────────────────

export function calcSynastry(chartA: NatalChart, chartB: NatalChart): SynastryResult {
  const aspects: SynastryAspect[] = [];
  for (const pa of chartA.planets) {
    for (const pb of chartB.planets) {
      const found = findAspect(pa.longitude, pb.longitude);
      if (found) {
        aspects.push({
          planet1: pa.planet, planet2: pb.planet,
          aspect: found.aspect, orb: found.orb, exact: found.orb <= 1,
        });
      }
    }
  }
  aspects.sort((a, b) => a.orb - b.orb);
  return { aspects };
}

// ─── Transit Aspects ──────────────────────────────────────────────────────────

function calcTransitAspects(
  transitPlanets: PlanetPosition[],
  natalPlanets:   PlanetPosition[]
): TransitAspect[] {
  const result: TransitAspect[] = [];
  for (const tp of transitPlanets) {
    for (const np of natalPlanets) {
      const found = findAspect(tp.longitude, np.longitude);
      if (found) {
        result.push({
          transitPlanet: tp.planet,
          natalPlanet:   np.planet,
          aspect:        found.aspect,
          orb:           found.orb,
          applying:      found.applying,
          exact:         found.orb <= 1,
        });
      }
    }
  }
  const outer: Planet[] = ["Плутон", "Нептун", "Уран", "Сатурн", "Юпитер", "Хирон"];
  result.sort((a, b) => {
    const ao = outer.indexOf(a.transitPlanet);
    const bo = outer.indexOf(b.transitPlanet);
    if (ao !== bo) return (ao === -1 ? 99 : ao) - (bo === -1 ? 99 : bo);
    return a.orb - b.orb;
  });
  return result;
}

// ─── Build Planet List ────────────────────────────────────────────────────────

function buildPlanets(jd: number, houses: number[] | null): PlanetPosition[] {
  const sunLon  = sunLongitude(jd);
  const moonLon = moonLongitude(jd);
  const nnLon   = northNodeLon(jd);
  const snLon   = normalizeAngle(nnLon + 180);
  const lilLon  = lilithLon(jd);

  const outerList: Array<[Planet, string]> = [
    ["Меркурий", "Mercury"],
    ["Венера",   "Venus"],
    ["Марс",     "Mars"],
    ["Юпитер",   "Jupiter"],
    ["Сатурн",   "Saturn"],
    ["Уран",     "Uranus"],
    ["Нептун",   "Neptune"],
    ["Плутон",   "Pluto"],
    ["Хирон",    "Chiron"],
  ];

  function mkPos(planet: Planet, lon: number, retro = false): PlanetPosition {
    const signIdx = Math.floor(normalizeAngle(lon) / 30);
    return {
      planet,
      longitude:  lon,
      sign:       SIGNS[signIdx],
      degree:     longitudeToDeg(lon),
      minute:     longitudeToMin(lon),
      retrograde: retro,
      house:      houses ? getPlanetHouse(lon, houses) : undefined,
      dignity:    getDignity(planet, signIdx),
    };
  }

  const all: PlanetPosition[] = [
    mkPos("Солнце", sunLon, false),
    mkPos("Луна",   moonLon, false),
    ...outerList.map(([ruName, enName]): PlanetPosition => {
      const lon   = planetGeocentric(enName, jd);
      const retro = isRetrograde(enName, jd);
      return mkPos(ruName, lon, retro);
    }),
    mkPos("Северный Узел", nnLon,  false),
    mkPos("Южный Узел",    snLon,  false),
    mkPos("Лилит",         lilLon, false),
  ];

  return all;
}

// ─── Solar Return ─────────────────────────────────────────────────────────────

export function calcSolarReturn(
  birthDateStr: string, birthTimeStr: string | null,
  lat: number | null, lon: number | null,
  returnYear: number
): SolarReturn {
  const [bY, bM, bD] = birthDateStr.split("-").map(Number);
  let bH = 12, bMin = 0;
  if (birthTimeStr) { [bH, bMin] = birthTimeStr.split(":").map(Number); }

  const birthJD    = dateToJD(bY, bM, bD, bH, bMin);
  const natalSunLon = sunLongitude(birthJD);

  // Binary search: find JD in returnYear when Sun returns to natal longitude
  let lo = dateToJD(returnYear, bM - 1 < 1 ? 1 : bM - 1, 1);
  let hi = lo + 380;

  for (let iter = 0; iter < 50; iter++) {
    const mid = (lo + hi) / 2;
    const diff = normalizeAngle(sunLongitude(mid) - natalSunLon);
    if (diff > 180) hi = mid; else lo = mid;
    if (hi - lo < 0.00001) break;
  }

  const returnJD   = (lo + hi) / 2;
  const returnDate = jdToDate(returnJD);
  const returnChart = calcNatalChart(
    returnDate.toISOString().slice(0, 10),
    `${returnDate.getUTCHours().toString().padStart(2,"0")}:${returnDate.getUTCMinutes().toString().padStart(2,"0")}`,
    lat, lon
  );

  return {
    year:  returnYear,
    date:  returnDate.toISOString().slice(0, 16),
    chart: returnChart,
  };
}

// ─── Secondary Progressions ───────────────────────────────────────────────────

export function calcProgressions(
  birthDateStr: string, birthTimeStr: string | null,
  lat: number | null, lon: number | null,
  age: number
): ProgressedChart {
  const [bY, bM, bD] = birthDateStr.split("-").map(Number);
  let bH = 12, bMin = 0;
  if (birthTimeStr) { [bH, bMin] = birthTimeStr.split(":").map(Number); }

  const birthJD   = dateToJD(bY, bM, bD, bH, bMin);
  const progJD    = birthJD + age;                // 1 day = 1 year
  const progDate  = jdToDate(progJD);
  const houses    = lat && lon ? (() => {
    const asc = calcAscendant(progJD, lat, lon);
    return calcHouseCusps(asc);
  })() : null;

  const planets = buildPlanets(progJD, houses);
  const aspects = calcAspects(planets);

  return {
    age,
    date:    progDate.toISOString().slice(0, 10),
    planets,
    aspects,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function calcNatalChart(
  dateStr:  string,
  timeStr:  string | null,
  lat:      number | null,
  lon:      number | null
): NatalChart {
  const [year, month, day] = dateStr.split("-").map(Number);
  let hour = 12, minute = 0;
  if (timeStr) { [hour, minute] = timeStr.split(":").map(Number); }

  const jd = dateToJD(year, month, day, hour, minute);

  let houses:      number[] | null      = null;
  let ascLon:      number   | null      = null;
  let mcLon:       number   | null      = null;
  let houseRulers: Record<number, Planet> = {};

  if (lat !== null && lon !== null && timeStr) {
    ascLon      = calcAscendant(jd, lat, lon);
    mcLon       = calcMidheaven(jd, lon);
    houses      = calcHouseCusps(ascLon);
    houseRulers = calcHouseRulers(houses);
  }

  const planets        = buildPlanets(jd, houses);
  const aspects        = calcAspects(planets);
  const aspectPatterns = detectAspectPatterns(planets, aspects);
  const moonPhase      = calcMoonPhase(jd);

  return {
    sunSign:         longitudeToSign(sunLongitude(jd)),
    moonSign:        longitudeToSign(moonLongitude(jd)),
    ascendant:       ascLon !== null ? longitudeToSign(ascLon) : null,
    ascendantDegree: ascLon !== null ? longitudeToDeg(ascLon)  : null,
    midheaven:       mcLon  !== null ? longitudeToSign(mcLon)  : null,
    midheavenDegree: mcLon  !== null ? longitudeToDeg(mcLon)   : null,
    planets,
    houses,
    aspects,
    aspectPatterns,
    houseRulers,
    moonPhase,
  };
}

export function calcEphemeris(natalChart?: NatalChart): EphemerisData {
  const now = new Date();
  const jd  = dateToJD(
    now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
    now.getUTCHours(),    now.getUTCMinutes()
  );

  const planets        = buildPlanets(jd, null);
  const moonPhase      = calcMoonPhase(jd);
  const transitAspects = natalChart
    ? calcTransitAspects(planets, natalChart.planets)
    : undefined;

  return { date: now.toISOString().slice(0, 10), planets, moonPhase, transitAspects };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

const ASPECT_SYMBOL: Record<AspectName, string> = {
  "соединение":    "☌",
  "оппозиция":     "☍",
  "трин":          "△",
  "квадрат":       "□",
  "секстиль":      "⚹",
  "квинконс":      "⚻",
  "полуквадрат":   "∠",
  "сесквиквадрат": "⚼",
};

export const PLANET_SYMBOL: Record<string, string> = {
  "Солнце":        "☉",
  "Луна":          "☽",
  "Меркурий":      "☿",
  "Венера":        "♀",
  "Марс":          "♂",
  "Юпитер":        "♃",
  "Сатурн":        "♄",
  "Уран":          "♅",
  "Нептун":        "♆",
  "Плутон":        "♇",
  "Хирон":         "⚷",
  "Лилит":         "⚸",
  "Северный Узел": "☊",
  "Южный Узел":    "☋",
};

function fmtP(p: PlanetPosition): string {
  const sym  = PLANET_SYMBOL[p.planet] ?? "";
  const ret  = p.retrograde ? " ℞" : "";
  const h    = p.house ? ` (${p.house} дом)` : "";
  const dig  = p.dignity ? ` [${p.dignity}]` : "";
  return `${sym} ${p.planet}: ${p.sign} ${p.degree}°${p.minute}'${ret}${h}${dig}`;
}

function fmtAsp(a: Aspect): string {
  const sym = ASPECT_SYMBOL[a.aspect] ?? a.aspect;
  const ex  = a.exact ? " ⚡" : "";
  const app = a.applying ? "↗" : "↘";
  return `${PLANET_SYMBOL[a.planet1]??""} ${a.planet1} ${sym} ${a.planet2} (${a.orb}° ${app})${ex}`;
}

// ─── Advanced Astro Features ──────────────────────────────────────────────────

const SIGN_ELEMENT: Record<ZodiacSign, string> = {
  "Овен":"Огонь","Лев":"Огонь","Стрелец":"Огонь",
  "Телец":"Земля","Дева":"Земля","Козерог":"Земля",
  "Близнецы":"Воздух","Весы":"Воздух","Водолей":"Воздух",
  "Рак":"Вода","Скорпион":"Вода","Рыбы":"Вода",
};
const SIGN_MODALITY: Record<ZodiacSign, string> = {
  "Овен":"Кардинальный","Рак":"Кардинальный","Весы":"Кардинальный","Козерог":"Кардинальный",
  "Телец":"Фиксированный","Лев":"Фиксированный","Скорпион":"Фиксированный","Водолей":"Фиксированный",
  "Близнецы":"Мутабельный","Дева":"Мутабельный","Стрелец":"Мутабельный","Рыбы":"Мутабельный",
};

const FIXED_STARS_DEG: Array<{ name: string; lon: number; nature: string }> = [
  { name: "Алдебаран", lon: 69.7,  nature: "Марс/Меркурий" },
  { name: "Альгол",    lon: 26.1,  nature: "Сатурн/Юпитер (сложная)" },
  { name: "Плеяды",    lon: 59.7,  nature: "Луна/Марс" },
  { name: "Регул",     lon: 149.8, nature: "Марс/Юпитер" },
  { name: "Спика",     lon: 203.3, nature: "Венера/Марс (благоприятная)" },
  { name: "Арктур",    lon: 203.9, nature: "Юпитер/Марс" },
  { name: "Антарес",   lon: 249.7, nature: "Марс/Юпитер (интенсивная)" },
  { name: "Вега",      lon: 284.3, nature: "Венера/Меркурий" },
  { name: "Фомальгаут",lon: 333.9, nature: "Венера/Меркурий (мистическая)" },
  { name: "Ахернар",   lon: 15.3,  nature: "Юпитер" },
  { name: "Сириус",    lon: 104.1, nature: "Юпитер/Марс (удача)" },
  { name: "Процион",   lon: 115.6, nature: "Меркурий/Марс" },
  { name: "Полярная",  lon: 28.3,  nature: "Сатурн/Венера (постоянство)" },
  { name: "Беллатрикс",lon: 90.9,  nature: "Марс/Меркурий" },
  { name: "Ригель",    lon: 76.5,  nature: "Юпитер/Марс" },
];

interface AdvancedFeatures {
  partOfFortune: { sign: ZodiacSign; degree: number } | null;
  elementBalance: Record<string, number>;
  modalBalance:   Record<string, number>;
  mutualReceptions: Array<{ planet1: Planet; planet2: Planet }>;
  criticalDegrees:  Array<{ planet: Planet; degree: number; type: string }>;
  finalDispositor:  Planet | null;
  dispositorChain:  Planet[];
  fixedStarConj:    Array<{ star: string; planet: Planet; orb: number; nature: string }>;
}

function calcAdvancedFeatures(chart: NatalChart): AdvancedFeatures {
  const personalPlanets: Planet[] = ["Солнце","Луна","Меркурий","Венера","Марс","Юпитер","Сатурн","Уран","Нептун","Плутон"];
  const planets = chart.planets.filter(p => personalPlanets.includes(p.planet));

  // Part of Fortune
  let partOfFortune: AdvancedFeatures["partOfFortune"] = null;
  const sun  = chart.planets.find(p => p.planet === "Солнце");
  const moon = chart.planets.find(p => p.planet === "Луна");
  if (sun && moon && chart.ascendant !== null && chart.ascendantDegree !== null) {
    const ascIdx = SIGNS.indexOf(chart.ascendant);
    const ascLon = ascIdx * 30 + chart.ascendantDegree;
    const isDay  = (normalizeAngle(sun.longitude - ascLon)) < 180;
    const pofLon = normalizeAngle(
      isDay ? ascLon + moon.longitude - sun.longitude
            : ascLon + sun.longitude - moon.longitude
    );
    partOfFortune = { sign: SIGNS[Math.floor(pofLon / 30)], degree: Math.floor(pofLon % 30) };
  }

  // Element & Modal balance (personal planets only)
  const elementBalance: Record<string,number> = { "Огонь":0,"Земля":0,"Воздух":0,"Вода":0 };
  const modalBalance:   Record<string,number>  = { "Кардинальный":0,"Фиксированный":0,"Мутабельный":0 };
  for (const p of planets) {
    elementBalance[SIGN_ELEMENT[p.sign]] = (elementBalance[SIGN_ELEMENT[p.sign]] || 0) + 1;
    modalBalance[SIGN_MODALITY[p.sign]]  = (modalBalance[SIGN_MODALITY[p.sign]]  || 0) + 1;
  }

  // Mutual Reception: planet A in sign ruled by B, and B in sign ruled by A
  const mutualReceptions: AdvancedFeatures["mutualReceptions"] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const A = planets[i], B = planets[j];
      const signIdxA = SIGNS.indexOf(A.sign);
      const signIdxB = SIGNS.indexOf(B.sign);
      const rulerOfA = SIGN_RULERS[signIdxA];
      const rulerOfB = SIGN_RULERS[signIdxB];
      if (rulerOfA === B.planet && rulerOfB === A.planet) {
        mutualReceptions.push({ planet1: A.planet, planet2: B.planet });
      }
    }
  }

  // Critical Degrees: 0°, 1°, 29°
  const criticalDegrees: AdvancedFeatures["criticalDegrees"] = [];
  for (const p of planets) {
    if (p.degree === 29) criticalDegrees.push({ planet: p.planet, degree: 29, type: "Анаретическая (29°)" });
    else if (p.degree === 0) criticalDegrees.push({ planet: p.planet, degree: 0, type: "Начало знака (0°)" });
    else if (p.degree === 1) criticalDegrees.push({ planet: p.planet, degree: 1, type: "Критическая (1°)" });
  }

  // Dispositor Chain: Sun → ruler of Sun's sign → ruler of that sign → ...
  let finalDispositor: Planet | null = null;
  let dispositorChain: Planet[] = [];
  const sunPos = chart.planets.find(p => p.planet === "Солнце");
  if (sunPos) {
    const chain: Planet[] = [sunPos.planet];
    let current = sunPos;
    for (let step = 0; step < 12; step++) {
      const signIdx = SIGNS.indexOf(current.sign);
      const ruler   = SIGN_RULERS[signIdx];
      if (chain.includes(ruler)) { finalDispositor = ruler; break; }
      chain.push(ruler);
      const rulerPos = chart.planets.find(p => p.planet === ruler);
      if (!rulerPos) break;
      current = rulerPos;
    }
    dispositorChain = chain;
  }

  // Fixed Star Conjunctions (orb ≤ 1.5°)
  const fixedStarConj: AdvancedFeatures["fixedStarConj"] = [];
  for (const p of chart.planets) {
    for (const star of FIXED_STARS_DEG) {
      const diff = Math.abs(normalizeAngle(p.longitude - star.lon));
      const orb  = diff > 180 ? 360 - diff : diff;
      if (orb <= 1.5) {
        fixedStarConj.push({ star: star.name, planet: p.planet, orb: Math.round(orb * 10) / 10, nature: star.nature });
      }
    }
  }
  fixedStarConj.sort((a, b) => a.orb - b.orb);

  return { partOfFortune, elementBalance, modalBalance, mutualReceptions, criticalDegrees, finalDispositor, dispositorChain, fixedStarConj };
}

export function formatNatalForPrompt(chart: NatalChart): string {
  const lines: string[] = ["=== НАТАЛЬНАЯ КАРТА ==="];

  lines.push(`\nТриада:`);
  lines.push(`  ☉ Солнце: ${chart.sunSign}`);
  lines.push(`  ☽ Луна: ${chart.moonSign}`);
  if (chart.ascendant) lines.push(`  ☊ Асцендент: ${chart.ascendant} ${chart.ascendantDegree}°`);
  if (chart.midheaven) lines.push(`  MC: ${chart.midheaven} ${chart.midheavenDegree}°`);

  lines.push(`\nПланеты:`);
  for (const p of chart.planets) lines.push(`  ${fmtP(p)}`);

  const moonP = chart.moonPhase;
  lines.push(`\nФаза Луны: ${moonP.emoji} ${moonP.name} (элонгация ${moonP.elongation}°)`);
  if (moonP.voidOfCourse) {
    lines.push(`  ⚠️ Луна без курса до ${moonP.nextSignAt ?? "смены знака"}`);
  }

  if (chart.aspectPatterns.length > 0) {
    lines.push(`\nФигуры:`);
    for (const pat of chart.aspectPatterns) {
      const el = pat.element ? ` (${pat.element})` : "";
      lines.push(`  ★ ${pat.type}${el}: ${pat.planets.join(", ")}`);
    }
  }

  const major: AspectName[] = ["соединение", "оппозиция", "трин", "квадрат", "секстиль"];
  const majorA = chart.aspects.filter(a => major.includes(a.aspect));
  const minorA = chart.aspects.filter(a => !major.includes(a.aspect));

  if (majorA.length > 0) {
    lines.push(`\nГлавные аспекты:`);
    for (const a of majorA) lines.push(`  ${fmtAsp(a)}`);
  }
  if (minorA.length > 0) {
    lines.push(`\nМинорные аспекты:`);
    for (const a of minorA) lines.push(`  ${fmtAsp(a)}`);
  }

  if (Object.keys(chart.houseRulers).length > 0) {
    lines.push(`\nХозяева домов:`);
    for (const [h, r] of Object.entries(chart.houseRulers)) {
      lines.push(`  ${h} дом → ${r}`);
    }
  }

  // Advanced features
  try {
    const adv = calcAdvancedFeatures(chart);

    if (adv.partOfFortune) {
      lines.push(`\n⊕ Часть Удачи: ${adv.partOfFortune.sign} ${adv.partOfFortune.degree}°`);
    }

    const elKeys = Object.entries(adv.elementBalance).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1]);
    const modKeys = Object.entries(adv.modalBalance).filter(([,v]) => v > 0).sort((a,b)=>b[1]-a[1]);
    if (elKeys.length > 0) {
      lines.push(`\nБаланс элементов: ${elKeys.map(([k,v])=>`${k}:${v}`).join(" | ")}`);
      lines.push(`Баланс модусов: ${modKeys.map(([k,v])=>`${k}:${v}`).join(" | ")}`);
    }

    if (adv.mutualReceptions.length > 0) {
      lines.push(`\nМьючуал рецепшн:`);
      for (const mr of adv.mutualReceptions) {
        lines.push(`  ⇄ ${mr.planet1} ↔ ${mr.planet2}`);
      }
    }

    if (adv.criticalDegrees.length > 0) {
      lines.push(`\nКритические градусы:`);
      for (const cd of adv.criticalDegrees) {
        lines.push(`  ⚠ ${cd.planet}: ${cd.type}`);
      }
    }

    if (adv.finalDispositor && adv.dispositorChain.length > 1) {
      lines.push(`\nДиспозиторная цепочка: ${adv.dispositorChain.join(" → ")}`);
      lines.push(`Финальный диспозитор: ${adv.finalDispositor}`);
    }

    if (adv.fixedStarConj.length > 0) {
      lines.push(`\nФиксированные звёзды (конъюнкции):`);
      for (const fs of adv.fixedStarConj) {
        lines.push(`  ★ ${fs.star} конъюнкция ${fs.planet} (${fs.orb}° орб) — природа ${fs.nature}`);
      }
    }
  } catch { /* advanced features fallback */ }

  return lines.join("\n");
}

export function formatEphemerisForPrompt(
  ephem: EphemerisData, natalChart?: NatalChart
): string {
  const lines: string[] = [`=== ТРАНЗИТЫ (${ephem.date}) ===`];

  for (const p of ephem.planets) {
    const ret = p.retrograde ? " ℞" : "";
    lines.push(`  ${PLANET_SYMBOL[p.planet]??""} ${p.planet}: ${p.sign} ${p.degree}°${ret}`);
  }

  const moon = ephem.moonPhase;
  lines.push(`\nФаза Луны: ${moon.emoji} ${moon.name}`);
  if (moon.voidOfCourse) lines.push(`  ⚠️ Луна без курса до ${moon.nextSignAt}`);

  if (ephem.transitAspects && ephem.transitAspects.length > 0 && natalChart) {
    lines.push(`\nТранзитные аспекты к натальным планетам:`);
    const major: AspectName[] = ["соединение", "оппозиция", "трин", "квадрат", "секстиль"];
    const sig = ephem.transitAspects.filter(a => major.includes(a.aspect)).slice(0, 25);
    for (const ta of sig) {
      const app = ta.applying ? "↗" : "↘";
      const ex  = ta.exact ? " ⚡ ТОЧНЫЙ" : "";
      const s1  = PLANET_SYMBOL[ta.transitPlanet] ?? "";
      const s2  = PLANET_SYMBOL[ta.natalPlanet]   ?? "";
      const sym = ASPECT_SYMBOL[ta.aspect] ?? ta.aspect;
      lines.push(
        `  ${s1}транз.${ta.transitPlanet} ${sym} натал.${s2}${ta.natalPlanet} (${ta.orb}° ${app})${ex}`
      );
    }
  }

  return lines.join("\n");
}

export function formatSynastryForPrompt(
  nameA: string, nameB: string, result: SynastryResult
): string {
  if (result.aspects.length === 0) return "Синастрия: аспекты не найдены.";
  const lines: string[] = [`=== СИНАСТРИЯ: ${nameA} × ${nameB} ===`];
  const major: AspectName[] = ["соединение", "оппозиция", "трин", "квадрат", "секстиль"];
  const majorA = result.aspects.filter(a => major.includes(a.aspect));
  const minorA = result.aspects.filter(a => !major.includes(a.aspect));

  lines.push(`\nГлавные аспекты (${nameA} → ${nameB}):`);
  for (const a of majorA.slice(0, 20)) {
    const sym = ASPECT_SYMBOL[a.aspect] ?? a.aspect;
    const ex  = a.exact ? " ⚡" : "";
    lines.push(`  ${PLANET_SYMBOL[a.planet1]??""} ${a.planet1} ${sym} ${a.planet2} ${PLANET_SYMBOL[a.planet2]??""} (${a.orb}°)${ex}`);
  }
  if (minorA.length > 0) {
    lines.push(`\nМинорные:`);
    for (const a of minorA.slice(0, 8)) {
      const sym = ASPECT_SYMBOL[a.aspect] ?? a.aspect;
      lines.push(`  ${PLANET_SYMBOL[a.planet1]??""} ${a.planet1} ${sym} ${a.planet2} (${a.orb}°)`);
    }
  }
  return lines.join("\n");
}

export function formatProgressionsForPrompt(prog: ProgressedChart): string {
  const lines: string[] = [`=== ПРОГРЕССИИ (возраст ${prog.age}, дата ${prog.date}) ===`];
  lines.push(`\nПрогрессированные планеты:`);
  for (const p of prog.planets.slice(0, 10)) lines.push(`  ${fmtP(p)}`);
  const major: AspectName[] = ["соединение", "оппозиция", "трин", "квадрат", "секстиль"];
  const sig = prog.aspects.filter(a => major.includes(a.aspect) && a.orb <= 3);
  if (sig.length > 0) {
    lines.push(`\nКлючевые прогрессированные аспекты:`);
    for (const a of sig) lines.push(`  ${fmtAsp(a)}`);
  }
  return lines.join("\n");
}

export function formatSolarReturnForPrompt(sr: SolarReturn): string {
  const lines: string[] = [`=== СОЛЯРНАЯ КАРТА ${sr.year} (${sr.date}) ===`];
  lines.push(`\nСолярный Асцендент: ${sr.chart.ascendant ?? "не рассчитан"}`);
  lines.push(`Солярный МС: ${sr.chart.midheaven ?? "не рассчитан"}`);
  lines.push(`\nПланеты в солярной карте:`);
  for (const p of sr.chart.planets.slice(0, 10)) lines.push(`  ${fmtP(p)}`);
  if (sr.chart.aspectPatterns.length > 0) {
    lines.push(`\nФигуры в солярной карте:`);
    for (const pat of sr.chart.aspectPatterns) {
      lines.push(`  ★ ${pat.type}: ${pat.planets.join(", ")}`);
    }
  }
  return lines.join("\n");
}
